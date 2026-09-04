# CARSHOP-107 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-107/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Harden `MongoCommentRepository` so it never forwards a caller-controlled
`id` or `update` object directly into a Mongo query/update, independent of
upstream (Zod/route-param) validation. Concretely satisfy
FR-001–FR-007/AC-001–AC-007 in `specs/CARSHOP-107/spec.md`. The public port
shape (`CommentRepositoryPort`) and existing success-path behavior must not
change (NFR-003, FR-007, AC-005).

## Current Architecture

`MongoCommentRepository` builds Mongo query filters and update documents
directly from caller-supplied identifiers and payloads:

- `findById` calls `CommentModel.findOne({ id })`.
- `update` calls `CommentModel.findOneAndUpdate({ id }, input, { new: true })`,
  passing the received `input` object straight to Mongoose.
- `deleteById` calls `CommentModel.deleteOne({ id })`.

HTTP-layer validation (Zod schemas, `requireStringRouteParam`) reduces the
practical risk today, but the persistence adapter itself does not enforce
that `id` is a plain string, and `update` forwards the raw input object to
`findOneAndUpdate` without rebuilding it into an explicit allowlist. This
leaves the comment persistence layer without its own defense-in-depth
against Mongo query-selector injection (e.g. `$ne`, `$where`) and
prototype-pollution-style keys (`__proto__`, `constructor`, `prototype`, or
dotted keys).

Relevant precedent, verified against current code:

- `mongo-work.repository.ts` has a private `assertStringIdentifier` method
  (lines 81–87) plus `sanitizeFilter` usage (line 2, 152–155), matching the
  Obsidian note "Repository-Boundary Identifier Validation Before Building a
  Mongo Filter" (CARSHOP-89), which documents this guard as kept private
  per-repository unless a second repository needs the identical shape. This
  is still current/compatible.
- ADR-005 (image validation) shows a bias against adding a new dependency
  for a narrow, auditable check — consistent with reusing Mongoose's
  built-in `sanitizeFilter` rather than a new sanitization package.
- CARSHOP-109 troubleshooting note: tightening a validation boundary can
  break existing fixtures relying on old looseness. Confirmed applicable
  here: the existing unit test `'deve atualizar comentário'`
  (`test/unit/infra/repositories/mongo-comment.repository.spec.ts:85-108`)
  asserts `findOneAndUpdate` is called with the raw `{ content: 'Atualizado' }`
  object and an unsanitized `{ id: 'comment-1' }` filter. This assertion
  will break under the new implementation and must be updated as part of
  this task (expected, in-scope).
- No Obsidian note covers prototype-pollution-key rejection or allowlisted
  `$set` construction — confirmed by reading the current
  `mongo-comment.repository.ts`, which has no such logic today. This is new
  hardening surface for this plan.

### Shared helper vs. local guard

The spec's Out of Scope section explicitly excludes changes to
`mongo-work.repository.ts`. This resolves the spec's own non-blocking open
question: extracting a shared helper is not viable without touching that
file. Per `.claude/rules/architecture.md` (avoid premature abstraction),
the plan implements a small, local, private guard inside
`MongoCommentRepository`, mirroring `mongo-work.repository.ts`'s
style/naming/error shape without extracting it into a shared module.

### FR-001 vs NFR-001 scope note

FR-001/AC-006 scope mandatory hardening to `findById`, `update`,
`deleteById`. NFR-001 more broadly names all five public methods, including
`createPending`/`listApprovedByWorkId`. The plan adds the same string-type
guard to these two methods as a defense-in-depth completeness item, beyond
AC-006's stated minimum, not blocking.

## Proposed Solution

All changes are confined to
`src/infra/repositories/mongo-comment.repository.ts` (infrastructure
adapter) — `CommentRepositoryPort`, use cases, controllers, routes, and
Swagger fragments are untouched.

Add imports:

```ts
import { sanitizeFilter } from 'mongoose';
import { HttpError } from '../../core/domain/application/ApplicationError/http-error';
```

Add private methods:

- `assertStringIdentifier(value: unknown, fieldName: string): string` —
  throws `HttpError(400, '${fieldName} deve ser uma string válida.')` if not
  a non-empty string. Same shape/message style as
  `mongo-work.repository.ts`.
- `buildSanitizedIdFilter(id: unknown): Record<string, unknown>` —
  validates via `assertStringIdentifier`, then returns
  `sanitizeFilter({ id: validatedId })`. Used by `findById`, `update`,
  `deleteById`.
- `isDangerousKey(key: string): boolean` —
  `key.startsWith('$') || key.includes('.') || ['__proto__', 'constructor', 'prototype'].includes(key)`.
- `assertPlainString(value: unknown, fieldName: string): string` — throws
  `HttpError(400, ...)` if not `typeof === 'string'`.
- `buildAllowlistedUpdate(input: UpdateCommentRepositoryInput): { $set: Record<string, string> }`:
  1. Reject if `input` is null/non-object/array →
     `HttpError(400, 'Dados de atualização inválidos.')`.
  2. Scan `Object.keys(input)`; if any key is dangerous per
     `isDangerousKey`, reject the entire call (no partial merge) →
     `HttpError(400, 'Dados de atualização contêm campos não permitidos.')`.
  3. For each of `authorName`, `content` (if present): validate via
     `assertPlainString`; for `status` (if present): validate it is exactly
     `'PENDING'` or `'APPROVED'`. This also catches AC-002's
     operator-shaped value case (e.g. `{ content: { $ne: null } }`) —
     `assertPlainString` rejects it because it isn't a string, whole call
     rejected, no coercion.
  4. Any key not in the allowlist that is not dangerous is silently
     discarded per FR-003 — only fields explicitly copied into `$set`
     survive.
  5. If the resulting `$set` is empty, reject
     (`HttpError(400, 'Nenhum campo válido informado para atualização.')`).

Method bodies updated as follows:

- `findById(id)`: `CommentModel.findOne(this.buildSanitizedIdFilter(id)).lean()`.
- `update(id, input)`: `CommentModel.findOneAndUpdate(this.buildSanitizedIdFilter(id), this.buildAllowlistedUpdate(input), { new: true }).lean()`.
- `deleteById(id)`: `CommentModel.deleteOne(this.buildSanitizedIdFilter(id))`.
- `createPending(input)`: validate `workId`, `authorName`, `content` via
  `assertPlainString` before building the
  `CommentModel.create({...})` call (values remain individually assigned,
  no spread — unchanged structurally).
- `listApprovedByWorkId(workId)`: validate via `assertStringIdentifier`,
  build filter via `sanitizeFilter({ workId: validated, status: 'APPROVED' })`.

No changes to `toComment`, return shapes, or method signatures
(NFR-003/FR-007 preserved).

No changes to `src/core/domain/repositories/comment.repository.ts` (port),
`src/infra/repositories/mongo-work.repository.ts`, controllers, routes, use
cases, or Swagger fragments. `PATCH /admin/comments/{commentId}` already
documents a 400 ("Payload inválido.") in
`src/infra/docs/admin-comments.swagger.ts:129` — the new rejection causes
are additional triggers of an already-documented status/response shape,
not a new contract element. `approve`/`delete` endpoints receive
`commentId` only via Express route params (always strings) — the
id-based 400 path is not realistically HTTP-reachable there, so no new
documented behavior for those two operations.

## Technical Decisions

### Decision

Implement a small, local, private guard inside `MongoCommentRepository`
(not a shared cross-repository helper), mirroring
`mongo-work.repository.ts`'s `assertStringIdentifier` style/naming/error
shape.

### Reason

The spec's Out of Scope section excludes changes to
`mongo-work.repository.ts`, so a shared helper is not viable without
touching that file. `.claude/rules/architecture.md` cautions against
premature abstraction.

### Alternatives Considered

Extract a shared cross-repository sanitization/identifier-validation
helper reusable by both `mongo-comment.repository.ts` and
`mongo-work.repository.ts`.

### Trade-offs

A shared helper would reduce duplication but requires touching a file
explicitly out of scope for this task and was not requested by the spec;
kept local, consistent with the existing per-repository pattern already
used by `mongo-work.repository.ts`.

---

### Decision

Use Mongoose's built-in `sanitizeFilter` (already a direct dependency) for
identifier-based filters, rather than introducing a new sanitization
package.

### Reason

Consistent with ADR-005's bias against adding a new dependency for a
narrow, auditable check, and with FR-002's explicit requirement.

### Alternatives Considered

Introduce a dedicated sanitization npm package (e.g. `mongo-sanitize`).

### Trade-offs

A dedicated package adds no meaningful capability beyond what
`sanitizeFilter` plus `assertStringIdentifier` already provide for this
narrow use case, while adding a new dependency to maintain.

---

### Decision

Rebuild the `update` payload into an explicit allowlisted `$set` object
(`authorName`, `content`, `status`) with hard rejection (no partial
merge/coercion) of any dangerous key, and silent discard of unknown-but-safe
keys, rather than a generic recursive sanitize-in-place transform.

### Reason

FR-003 requires an explicit allowlisted document instead of forwarding raw
input; FR-004 requires rejecting the entire payload (not partial
sanitization) when a dangerous key is present. No prior art exists in the
codebase for this exact mechanism, so this is new ground scoped narrowly to
`mongo-comment.repository.ts`.

### Alternatives Considered

A generic recursive sanitizer that strips dangerous keys/values in place
rather than rejecting the whole payload.

### Trade-offs

A generic sanitizer would silently strip rather than reject malicious
payloads, which is weaker than FR-004's explicit reject-the-whole-payload
requirement; the allowlist approach is simpler to reason about and test for
the fixed, small set of comment update fields.

---

### Decision

Use distinct, but still generic and internals-free, error messages for the
three `buildAllowlistedUpdate` rejection branches (`'Dados de atualização
inválidos.'`, `'Dados de atualização contêm campos não permitidos.'`,
`'Nenhum campo válido informado para atualização.'`), and reuse the
existing work-repository wording pattern (`'${fieldName} deve ser uma
string válida.'`) for identifier rejections.

### Reason

Each message describes only the general shape of the problem (invalid
shape / disallowed fields / no valid fields), without echoing input values,
key names, or internal validation structure, consistent with
`.claude/rules/security.md`.

### Alternatives Considered

A single fully generic message for all update-payload rejection branches.

### Trade-offs

Distinct-but-generic messages slightly aid legitimate-client debugging
without leaking sensitive structural detail; the spec's own Open Questions
section leaves exact wording to architect/developer judgment provided no
internal details are leaked.

---

### Decision

Scope this task to the repository-hardening control only (FR-001–FR-007);
the Mongoose version bump for the separate prototype-pollution advisory is
treated as a separate, parallel task and is not folded into this
implementation.

### Reason

The spec's Constraints and Out of Scope sections explicitly exclude the
Mongoose version bump from this specification's own acceptance criteria,
while flagging (non-blocking) that the Notion DoD wording ("ambos os
controles precisam estar completos") could be read as requiring both
controls before the task is considered fully done.

### Alternatives Considered

Bundle the Mongoose version bump into this same implementation to fully
satisfy the DoD wording literally.

### Trade-offs

Bundling would resolve the DoD tension immediately but would expand scope
beyond what the spec authorizes and beyond what this plan was asked to
cover; deferred instead, with an explicit flag for the coordinator/
task-manager to surface when closing CARSHOP-107 so the "both controls" DoD
wording isn't silently treated as satisfied.

## Execution Flow

1. Add `assertStringIdentifier`, `buildSanitizedIdFilter`, `isDangerousKey`,
   `assertPlainString`, and `buildAllowlistedUpdate` private helpers to
   `MongoCommentRepository`.
2. Import `sanitizeFilter` from `mongoose` and `HttpError` from
   `../../core/domain/application/ApplicationError/http-error`.
3. Apply `buildSanitizedIdFilter` to `findById`, `update`, `deleteById`.
4. Apply `buildAllowlistedUpdate` to `update`, replacing the raw `input`
   forward with `{ $set: ... }`.
5. Apply `assertPlainString`/`assertStringIdentifier` validation to
   `createPending` and `listApprovedByWorkId`.
6. Update the existing unit test file
   `test/unit/infra/repositories/mongo-comment.repository.spec.ts`,
   including rewriting the `'deve atualizar comentário'` assertion for the
   new `$set` call shape, and adding the new rejection-path cases.
7. Create the new E2E test file
   `test/e2e/admin-comment-update-security.e2e-spec.ts`.
8. Run validation commands (see Testing Strategy).

## Files

### Files to Create

- `test/e2e/admin-comment-update-security.e2e-spec.ts`

### Files to Modify

- `src/infra/repositories/mongo-comment.repository.ts`
- `test/unit/infra/repositories/mongo-comment.repository.spec.ts`

Files verified/referenced but not modified:

- `src/infra/repositories/mongo-work.repository.ts` (reference only)
- `src/core/domain/repositories/comment.repository.ts` (port, unchanged)
- `src/infra/docs/admin-comments.swagger.ts` (verified, no change needed)

## Contract Impact

No HTTP contract change (status codes, response shapes, headers
unaffected). `PATCH /admin/comments/{commentId}` already documents a 400
("Payload inválido.") in `src/infra/docs/admin-comments.swagger.ts:129` —
the new rejection causes are additional triggers of an already-documented
status/response shape, not a new contract element. `approve`/`delete`
endpoints receive `commentId` only via Express route params (always
strings), so the id-based 400 path is not realistically HTTP-reachable
there.

## Persistence Impact

No Mongoose schema change. Internal Mongo update-document shape changes
from raw passthrough to `{ $set: {...} }` — an internal persistence detail,
not part of the public contract. Filters for `findById`, `update`,
`deleteById`, and `listApprovedByWorkId` are built only from a validated
primitive string identifier and passed through `sanitizeFilter`.

## Security Impact

- Adds defense-in-depth against Mongo query-selector injection (e.g.
  `$ne`, `$where`) and prototype-pollution-style keys (`__proto__`,
  `constructor`, `prototype`, dotted keys) at the persistence-adapter
  layer for the comment repository, independent of upstream HTTP-layer
  Zod validation.
- Error messages are generic, consistent with `mongo-work.repository.ts`'s
  style, and do not leak internal details, key names, or input values.
- Mongoose version bump for the separate prototype-pollution advisory
  remains explicitly out of scope for this task (see Risks).

## Swagger Impact

None. No endpoint, payload, response, status code, authentication
requirement, cookie, or header changes as a result of this plan; the `400`
response for invalid bodies is already documented for `PATCH
/admin/comments/{commentId}`.

## Testing Strategy

**Unit tests**
(`test/unit/infra/repositories/mongo-comment.repository.spec.ts`, updating
the existing file):

- `findById`: valid id (existing, keep); malicious id (object `{ $ne: null }`
  cast via `as unknown as string`, array, empty string) →
  `CommentModel.findOne` not called, rejection is `HttpError` with
  `statusCode` 400.
- `update`: valid allowlisted payload (rewrite the existing test for the new
  `$set` call shape); payload with a benign extra field alongside valid
  fields → extra field discarded, `$set` contains only known fields;
  top-level operator key (`$where`) → rejected, `findOneAndUpdate` not
  called; allowlisted field with operator-object value
  (`{ content: { $ne: null } }`) → rejected; dotted key
  (`'content.nested'`) → rejected; each of `__proto__`, `constructor`,
  `prototype` as top-level keys → rejected; malicious id → rejected before
  `findOneAndUpdate`.
- `deleteById`: valid id (existing, keep); malicious id → `CommentModel.deleteOne`
  not called, `HttpError` 400.
- (NFR-001 completeness) `createPending`/`listApprovedByWorkId` with a
  non-string field cast maliciously → rejected before hitting
  `CommentModel`.
- All rejection assertions must check both: (a) the underlying Mongoose
  method is NOT called, and (b) the thrown error is `HttpError` with
  `statusCode === 400` — following the pattern in
  `test/unit/infra/repositories/mongo-work.repository.spec.ts` (lines
  ~415–502).

**E2E test** (new file
`test/e2e/admin-comment-update-security.e2e-spec.ts`, mirroring
`test/e2e/admin-comment-hard-delete.e2e-spec.ts`'s setup/helpers):

- Log in as admin, create a work, create + approve a comment, capture its
  content.
- Send `PATCH /admin/comments/:commentId` with each of: an operator-key-only
  body, a dotted-key-only body, a `__proto__`-only body — assert `400` for
  each.
- Re-fetch via `GET /works/:workId/comments` and assert the comment's
  content is unchanged from the captured baseline (AC-007's "no persisted
  mutation").

**Coverage target and exception rationale** (architect's rationale,
preserved verbatim in scope and intent): all new/changed lines are in
`mongo-comment.repository.ts` and fully unit-testable without a real DB
connection (existing mock pattern) — the `>= 80%` new/changed-code
unit-test coverage target defined in `.claude/rules/testing.md` should be
met directly; no exception is anticipated. Run `npm test` and
`npm run build` after the change; run `npm run test:e2e` given
routes/persistence-adjacent behavior is touched.

Validation commands:

```bash
npx jest test/unit/infra/repositories/mongo-comment.repository.spec.ts
npm test
npm run build
npm run test:e2e
```

## Risks

- Test breakage (expected, in-scope): the existing `'deve atualizar
  comentário'` unit test assertion must be rewritten to expect
  `findOneAndUpdate(sanitizeFilter({ id: 'comment-1' }), { $set: { content: 'Atualizado' } }, { new: true })`.
  Since `sanitizeFilter({ id: 'comment-1' })` returns an equal plain object
  for benign input, `toEqual({ id: 'comment-1' })` remains valid.
- `'deve deletar comentário'` test: the assertion on the `deleteOne`
  argument should still pass since `sanitizeFilter` is a no-op for benign
  filters, but must be re-verified.
- E2E reachability limits (documented, not a defect): because Zod already
  rejects non-string `content`/`authorName` and route params are always
  strings, several AC-002/AC-003 attack shapes can only be proven via
  direct repository unit tests (AC-006), not a full HTTP round trip. The
  spec's own Risks section anticipates this; the E2E test only needs to
  confirm end-to-end `400` + no mutation for a malicious payload reaching
  the real endpoint, regardless of whether the `400` originates in Zod or
  the new repository guard.
- Security: error messages are generic and consistent with
  `mongo-work.repository.ts`'s style, no internal details leaked.
- Mongoose version bump: explicitly excluded from this plan, per the
  spec's Out of Scope. The DoD phrase "ambos os controles precisam estar
  completos" creates a documented tension the spec flags as non-blocking,
  deferred to architect/coordinator. Decision recorded: this plan
  implements only the repository-hardening control (FR-001–FR-007); the
  Mongoose version bump remains a separate, parallel task and is not
  folded into this implementation. Coordinator/task-manager should surface
  this explicitly when closing CARSHOP-107 so the "both controls" DoD
  wording isn't silently treated as satisfied.

## Implementation Steps

1. Add `assertStringIdentifier`, `buildSanitizedIdFilter`, `isDangerousKey`,
   `assertPlainString`, and `buildAllowlistedUpdate` private helpers to
   `MongoCommentRepository`; import `sanitizeFilter` from `mongoose` and
   `HttpError` from
   `../../core/domain/application/ApplicationError/http-error`.
2. Apply `buildSanitizedIdFilter` to `findById`, `update`, `deleteById`.
3. Rebuild `update`'s persisted document via `buildAllowlistedUpdate` into
   `{ $set: ... }`, removing the raw `input` forward.
4. Apply `assertPlainString` validation to `createPending`'s `workId`,
   `authorName`, `content`, and `assertStringIdentifier` +
   `sanitizeFilter` to `listApprovedByWorkId`.
5. Update
   `test/unit/infra/repositories/mongo-comment.repository.spec.ts`,
   rewriting the affected existing assertions and adding all new
   rejection-path cases listed in Testing Strategy.
6. Create `test/e2e/admin-comment-update-security.e2e-spec.ts` with the
   AC-007 malicious-payload cases.
7. Run `npx jest test/unit/infra/repositories/mongo-comment.repository.spec.ts`,
   then `npm test`, `npm run build`, `npm run test:e2e`.
8. Run `npm run test:coverage` and confirm/document coverage per the
   Testing Strategy section.

## Definition of Done Mapping

| Requirement | Plan Element |
|---|---|
| FR-001 (validate `id` as plain string) | `assertStringIdentifier`/`buildSanitizedIdFilter` applied in `findById`, `update`, `deleteById` |
| FR-002 (`sanitizeFilter` on filters) | Applied via `buildSanitizedIdFilter` and `listApprovedByWorkId`'s filter construction |
| FR-003 (explicit allowlisted `$set`, unknown keys discarded) | `buildAllowlistedUpdate` steps 3–4 |
| FR-004 (reject operator/dotted/proto keys, whole-payload reject) | `buildAllowlistedUpdate` step 2 (`isDangerousKey`) |
| FR-005 (identifier validation on `deleteById`) | `buildSanitizedIdFilter` in `deleteById` |
| FR-006 (HTTP 400, no internal leakage) | Generic `HttpError(400, ...)` messages per rejection branch |
| FR-007 (preserve existing success-path behavior/shapes) | Unchanged `toComment`, return shapes, method signatures; regression coverage in unit tests |
| AC-001 | Unit tests: `findById`/`update`/`deleteById` malicious-id rejection |
| AC-002 | Unit tests: `update` operator-key/operator-value payload rejection |
| AC-003 | Unit tests: `update` dotted-key/proto-key payload rejection |
| AC-004 | Unit tests: `update` valid payload builds explicit `$set` |
| AC-005 | Regression tests for unchanged success-path shapes |
| AC-006 | Updated unit test file covering all listed scenarios |
| AC-007 | New E2E test file `test/e2e/admin-comment-update-security.e2e-spec.ts` |

## Open Non-Blocking Questions

None — the architect reported no blocking questions. The DoD tension
regarding whether the Mongoose version bump must land before CARSHOP-107 is
considered fully complete (see Risks) is a non-blocking flag for the
coordinator/task-manager, not an open question for implementation.
