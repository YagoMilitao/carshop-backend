# CARSHOP-107 — Endurecer queries Mongo de comentários contra NoSQL injection

## Status

Ready

## Source

Notion Task:
CARSHOP-107

## Context

`MongoCommentRepository` (`src/infra/repositories/mongo-comment.repository.ts`)
builds Mongo query filters and update documents directly from
caller-supplied identifiers and payloads:

- `findById` calls `CommentModel.findOne({ id })`.
- `update` calls `CommentModel.findOneAndUpdate({ id }, input, { new: true })`,
  passing the received `input` object straight to Mongoose.
- `deleteById` calls `CommentModel.deleteOne({ id })`.

HTTP-layer validation (Zod schemas, `requireStringRouteParam`) reduces the
practical risk today, but the persistence adapter itself does not enforce
that `id` is a plain string, and the `update` method forwards the raw
input object to `findOneAndUpdate` without rebuilding it into an explicit
allowlist. This leaves the comment persistence layer without its own
defense-in-depth against Mongo query-selector injection (e.g. operator
keys such as `$ne`, `$where`) and prototype-pollution-style keys (e.g.
`__proto__`, `constructor`, `prototype`, or dotted keys) reaching the
database driver, should an upstream validation layer ever be bypassed,
weakened, or extended incorrectly in the future.

A comparable hardening precedent already exists in this repository:
`src/infra/repositories/mongo-work.repository.ts` validates identifiers
explicitly and applies Mongoose's built-in `sanitizeFilter` before
querying. This specification does not mandate reusing that exact
mechanism, but establishes it as known prior art in the codebase.

Separately, the currently installed Mongoose version is affected by a
prototype-pollution advisory. Per the Notion task, a dependency version
bump may proceed in parallel but is not required to satisfy this task's
own acceptance criteria, and is treated as out of scope for this
specification.

## Objective

Ensure that `MongoCommentRepository` cannot be used to pass an
unvalidated, caller-controlled object or Mongo operator key into a query
filter or update document, regardless of what has already been validated
upstream, by validating identifiers as plain strings, sanitizing
input-controlled filters, and rebuilding updates into an explicit
allowlisted `$set` operation before any query or mutation reaches
MongoDB.

## Functional Requirements

- FR-001: Before executing any query or mutation, `MongoCommentRepository`
  must validate that the `id` identifier used to build a filter (`findById`,
  `update`, `deleteById`) is a plain, non-empty string. If it is not (e.g.
  an object, array, or a string containing characters/structure consistent
  with an intended operator injection), the repository must reject the
  call without executing any query against MongoDB.
- FR-002: Any filter built from a caller-controlled identifier must be
  passed through sanitization supported by Mongoose (e.g. equivalent to
  `sanitizeFilter`) before being used in a `find`, `findOne`,
  `findOneAndUpdate`, or `deleteOne` call, so that Mongo operator keys
  (`$ne`, `$where`, `$gt`, etc.) present in the identifier value cannot
  alter the intended query semantics.
- FR-003: The `update` method must never pass the caller-supplied update
  object directly to a Mongoose model method. It must instead construct a
  new update document containing only an explicit allowlist of known,
  supported comment fields (`authorName`, `content`, `status`), applied
  via `$set`, with any property not on the allowlist discarded rather than
  forwarded.
- FR-004: When the caller-supplied update payload contains a key that is
  a Mongo operator (starting with `$`, e.g. `$ne`, `$where`, `$set`,
  `$unset`), a dotted key (e.g. `content.$ne`, `a.b`), or a
  prototype-pollution-sensitive key (`__proto__`, `constructor`,
  `prototype`), the repository must reject the update before it reaches
  `findOneAndUpdate`, and must not merge, coerce, or partially apply any
  part of that payload.
- FR-005: When the caller-supplied `id` used for `findById`, `update`, or
  `deleteById` contains a Mongo operator key, a dotted key, or a
  prototype-pollution-sensitive key (as described in FR-004), the
  repository must reject the call before executing any query, and must
  not execute a partial or best-effort query.
- FR-006: Rejections described in FR-001, FR-004, and FR-005 must result
  in the caller (use case / controller) being able to surface an HTTP 400
  response for the corresponding admin comment endpoints, consistent with
  the existing error-handling contract (`HttpError` and the central error
  middleware), without any write or read having reached MongoDB for the
  rejected portion of the request.
- FR-007: The existing observable behavior for valid, well-formed requests
  (`createPending`, `listApprovedByWorkId`, `findById`, `update`,
  `deleteById`) must remain unchanged: same return shapes, same HTTP
  status codes, same success responses as before this change.

## Non-Functional Requirements

- NFR-001 (Security): No Mongo filter or update document built by
  `MongoCommentRepository` may accept a caller-controlled object or
  operator key without sanitization or allowlisting, for any of its
  public methods (`createPending`, `listApprovedByWorkId`, `findById`,
  `update`, `deleteById`).
- NFR-002 (Maintainability): The sanitization/allowlist mechanism must
  follow the architectural direction already defined in
  `.claude/rules/architecture.md` and `.claude/rules/persistence.md`:
  Mongoose/query-shaping details remain inside the infrastructure
  adapter (`src/infra/repositories`), and must not leak into use cases,
  controllers, or domain types.
- NFR-003 (Compatibility): The public shape of `CommentRepositoryPort`
  (`createPending`, `listApprovedByWorkId`, `findById`, `update`,
  `deleteById`) must not change as part of this hardening; callers
  (use cases) continue to interact with the same port contract.
- NFR-004 (Reliability): Rejected/malicious payloads must fail
  deterministically and consistently (same class of error/response) for
  equivalent malicious inputs, rather than depending on database state or
  timing.

## Acceptance Criteria

- AC-001: Given a non-string or structurally invalid `id` reaches
  `MongoCommentRepository.findById`, `update`, or `deleteById`, when the
  method is invoked, then no query is executed against `CommentModel` and
  the call results in a rejection that the calling layer can map to an
  HTTP 400 response.
- AC-002: Given an update payload containing a `$`-prefixed operator key
  (e.g. `{ "content": { "$ne": null } }` or `{ "$where": "..." }`), when
  `MongoCommentRepository.update` is invoked with that payload, then
  `findOneAndUpdate` is not called with that operator key present, and the
  call results in a rejection.
- AC-003: Given an update payload containing a dotted key (e.g.
  `{ "content.nested": "x" }`) or a prototype-pollution-sensitive key
  (`__proto__`, `constructor`, or `prototype`), when
  `MongoCommentRepository.update` is invoked with that payload, then the
  update is rejected before any database call, and no document is
  mutated.
- AC-004: Given a well-formed update payload containing only allowed
  fields (`authorName`, `content`, `status`), when
  `MongoCommentRepository.update` is invoked, then the resulting Mongo
  update operation applies only an allowlisted `$set` with those fields,
  and the existing document is updated and returned as before.
- AC-005: Given a well-formed `id` and a well-formed update/find/delete
  call, when `findById`, `update`, or `deleteById` is invoked, then the
  existing success behavior (return values, `Comment` shape, `undefined`
  on not-found) is preserved unchanged.
- AC-006: Unit tests exist and pass for `MongoCommentRepository` covering,
  at minimum: `findById` with a valid id, `findById` with an
  operator/prototype-polluting id, `update` with a valid allowlisted
  payload, `update` with an operator-key payload, `update` with a dotted-
  key payload, `update` with a `__proto__`/`constructor`/`prototype` key
  payload, `deleteById` with a valid id, and `deleteById` with a
  malicious id.
- AC-007: An E2E test against an admin comment-moderation endpoint (e.g.
  `PATCH`/`PUT` used by the update flow) sends a malicious payload
  containing an operator key, a dotted key, or a prototype-pollution key
  and confirms: (a) the response status is `400`, and (b) the targeted
  comment document is unchanged in the database after the request
  (no persisted mutation occurred).

## Constraints

- No new architectural pattern, module, or product feature may be
  introduced; scope is limited to `src/infra/repositories/mongo-comment.repository.ts`,
  its direct collaborators strictly required to satisfy these
  requirements (e.g. a shared sanitization helper if one already exists
  or is introduced consistently with existing patterns), and the
  associated unit/E2E tests.
- The exact sanitization/allowlist mechanism (e.g. reuse of Mongoose's
  `sanitizeFilter`, a shared validation helper, or an equivalent
  approach) is an implementation detail owned by the architect/developer,
  not fixed by this specification. The Notion guidance mentioning
  "sanitização suportada pelo Mongoose" is non-binding implementation
  guidance.
- Must comply with `.claude/rules/architecture.md`,
  `.claude/rules/persistence.md`, `.claude/rules/security.md`,
  `.claude/rules/typescript.md`, `.claude/rules/testing.md`, and
  `.claude/rules/spec-security.md`.
- `CommentRepositoryPort`'s public method signatures must not change
  (NFR-003); any new internal validation/sanitization must be additive,
  not a breaking contract change.
- No secrets, credentials, tokens, or real environment/database values
  may be introduced into version-controlled files (including this spec)
  as part of this change.
- Bumping the installed Mongoose version to address the separate
  prototype-pollution advisory is out of scope for this specification's
  own acceptance criteria (see Out of Scope).

## Dependencies

- Existing `CommentRepositoryPort` contract
  (`src/core/domain/repositories/comment.repository.ts`) and its
  consumers (`update-comment.use-case.ts`, `approve-comment.use-case.ts`,
  `delete-comment.use-case.ts`, `create-comment.use-case.ts`).
- Existing HTTP-layer validation (`update-comment.schema.ts`,
  `requireStringRouteParam`) remains in place; this task adds
  defense-in-depth at the persistence layer and must not remove or weaken
  the existing HTTP-layer validation.
- Existing precedent in `src/infra/repositories/mongo-work.repository.ts`
  (identifier validation + `sanitizeFilter`) may be consulted as prior art
  during implementation but is not mandated verbatim by this
  specification.

## Out of Scope

- Bumping the installed Mongoose version to remediate the separate
  prototype-pollution advisory noted in the Notion task. That may proceed
  as an independent, parallel change but is not required to satisfy this
  specification's acceptance criteria.
- Changes to `WorkRepositoryPort` implementations, `mongo-work.repository.ts`,
  or any other repository not related to comments.
- Changes to the public HTTP contract (routes, status codes for
  successful flows, response shapes) of the comment/admin-comment
  endpoints beyond the new 400 rejection behavior for malicious payloads
  described in FR-006/AC-007.
- Introducing a general-purpose, reusable sanitization library across the
  whole codebase; scope is limited to the comment persistence flow unless
  the architect determines that reusing/extending an existing shared
  helper is the least-duplicative approach consistent with
  `.claude/rules/architecture.md`.

## Risks

- The Sonar "no corresponding finding" clause in the Notion Definition of
  Done is an external gate not independently verifiable by the
  spec-writer or by static repository inspection; it must be confirmed
  downstream (CI/Sonar) rather than assumed satisfied by this spec.
- Overly aggressive input rejection (e.g. rejecting legitimate values that
  happen to contain a `.` or `$` in unrelated contexts) could produce
  false positives; the acceptance criteria are scoped to operator-prefixed
  keys, dotted keys, and the specific prototype-pollution-sensitive key
  names, not free-form string content, to reduce this risk.
- Because HTTP-layer validation (Zod) already blocks many malformed
  shapes today, it may be difficult to reach the repository layer with a
  raw malicious payload through the full HTTP stack; the E2E test (AC-007)
  must exercise the real endpoint end-to-end to confirm the defense holds
  even if it is technically redundant with existing HTTP validation, and
  unit tests (AC-006) must exercise the repository directly to prove the
  persistence-layer control functions independently of the HTTP layer.
- The Notion Definition of Done states "ambos os controles precisam estar
  completos" (both controls — repository hardening and the Mongoose
  version upgrade — must be completed), while the Dependencies note only
  says the version bump "pode ser feito em paralelo." Read literally, the
  DoD could be interpreted as requiring the Mongoose upgrade to be done
  before this task is considered fully complete, even though this
  specification scopes the upgrade out of its own acceptance criteria
  (see Constraints and Out of Scope). This specification does not resolve
  that tension by deciding whether the upgrade must land in this same
  change; it flags it explicitly (see Open Questions) rather than
  silently contradicting the DoD.

## Open Questions

### Blocking

None.

### Non-blocking

- Whether the sanitization/allowlist helper introduced for comments
  should be shared with `mongo-work.repository.ts` (reducing duplication)
  or kept local to the comment repository is left to architect judgment,
  provided it does not weaken either repository's existing behavior.
- The exact wording of the 400 error message for rejected malicious
  payloads is left to architect/developer judgment, provided it does not
  leak internal implementation details (consistent with
  `.claude/rules/security.md`).
- Whether the Mongoose version upgrade (prototype-pollution advisory) is
  in scope for this same task/branch, or must ship as a separate task, is
  not specified by Notion — the Dependencies note allows it to proceed
  "in parallel" while the DoD phrasing implies both controls must be
  completed before the work is considered fully done. This specification
  treats the repository hardening (FR-001–FR-007) as the complete,
  independently testable and verifiable scope of CARSHOP-107 itself; the
  upgrade's target version, scheduling, and whether it belongs to this
  task or a separate one is left for the architect to determine (per the
  Notion task's own "Missing Information (non-blocking)" note) and is not
  assumed here.

## Traceability

FR-001 → AC-001, AC-006
FR-002 → AC-001, AC-006
FR-003 → AC-004, AC-005, AC-006
FR-004 → AC-002, AC-003, AC-006, AC-007
FR-005 → AC-001, AC-006, AC-007
FR-006 → AC-001, AC-002, AC-003, AC-007
FR-007 → AC-005
