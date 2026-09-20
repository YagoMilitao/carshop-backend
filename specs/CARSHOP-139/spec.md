# CARSHOP-139 — Auditar mass assignment, validação e minimização das respostas da API

## Status

Ready

## Source

Notion Task:
CARSHOP-139

## Context

The CarShop API exposes several mutating endpoints (Works, Comments, Auth,
and admin moderation/upload routes) and returns JSON responses to both
public visitors and the authenticated admin. Some endpoints already use
explicit Zod schemas (e.g. `create-work.schema.ts`, `update-comment.schema.ts`
with `.strict()`) and construct use-case input objects field-by-field rather
than forwarding `request.body` verbatim. A related, narrower hardening
effort (CARSHOP-107) already rebuilt `MongoCommentRepository.update` to
reject Mongo operator keys, dotted keys, and prototype-pollution-sensitive
keys (`$...`, `a.b`, `__proto__`, `constructor`, `prototype`) before any
document mutation, and applies identifier sanitization on comment queries.

This task is a broader, repository-wide **audit** covering all mutable
endpoints and all public/admin response shapes (Works, Comments, Auth, and
any other mutating routes), to confirm the same guarantees hold
consistently everywhere, close any gaps found, and ensure API responses
never leak internal-only fields (e.g. `passwordHash`, session/token
internals, Cloudinary `publicId,` or soft-delete markers) beyond what a
given contract requires.

This specification does not assume CARSHOP-107 or the existing Zod layer
are insufficient; it requires verifying their actual current coverage
against the concrete endpoint inventory below and remediating any endpoint,
field, or response that does not already meet the requirements stated here.

## Objective

Ensure that every mutable CarShop API endpoint validates its inputs against
an explicit schema, mutates persistence only through an explicit allowlist
of fields (never a raw pass-through of `request.body` or an unvalidated
object into a Mongoose write), rejects Mongo-operator/prototype-pollution-style
keys in any caller-controlled input used to build a query or update, and
that every response (public or admin) returns only the fields required by
its documented contract, excluding credential/secret/internal-only data.

## In-Scope Endpoint Inventory

Derived from the current repository routes (`src/infra/http/routes/*.routes.ts`)
as of this specification. Any endpoint not listed here is out of scope
unless the architect determines it shares an implementation with an
in-scope endpoint.

Public (unauthenticated):

- `POST /works` — create work (mutating; currently requires `authMiddleware`,
  listed here for completeness of the Works surface).
- `GET /works` — list works (read; included for response minimization only).
- `GET /works/:slug` — get work by slug (read; included for response
  minimization only).
- `POST /works/:workId/comments` — create pending comment (mutating,
  public).
- `GET /works/:workId/comments` — list approved comments (read; included
  for response minimization only).
- `POST /auth/login` — admin login (mutating: creates a session).
- `POST /auth/refresh` — session rotation (mutating).
- `POST /auth/logout` — session revocation (mutating).
- `GET /auth/session` — session lookup (read; included for response
  minimization only).

Admin (authenticated via `authMiddleware`):

- `POST /works` — create work.
- `PATCH /admin/comments/:commentId/approve` — approve comment (mutating).
- `PATCH /admin/comments/:commentId` — update comment (mutating).
- `DELETE /admin/comments/:commentId` — delete comment (mutating).
- `DELETE /admin/works/:workId` — hard-delete work (mutating).
- `POST /works/:workId/images` — upload work image (mutating; multipart).
- `DELETE /works/:workId/images/:imageId` — delete work image (mutating).

## Functional Requirements

- FR-001: Every mutating endpoint listed in the In-Scope Endpoint Inventory
  must validate its request body (when applicable) against an explicit
  schema before the payload reaches a use case or persistence adapter.
  Requests with fields not defined by the schema, or with fields of the
  wrong type/shape, must be rejected with an HTTP 4xx response before any
  persistence write occurs.
- FR-002: Every mutating endpoint's route/path parameters (e.g. `workId`,
  `commentId`, `imageId`, `slug`) must be validated as well-formed plain
  string identifiers before being used to build a persistence query or
  update. Malformed identifiers (non-string, object-shaped, or containing
  Mongo operator/prototype-pollution-sensitive characters as described in
  FR-004) must be rejected before any query executes.
- FR-003: No use case or repository implementation in scope may pass
  `request.body`, or any other unvalidated caller-supplied object, directly
  into a Mongoose write operation (`create`, `save`, `updateOne`,
  `findOneAndUpdate`, `deleteOne`, etc.). Persisted writes must be
  constructed from an explicit allowlist of known, supported fields for
  that endpoint/use case.
- FR-004: Any caller-controlled input used to build a Mongo query filter or
  update document must be rejected when it contains: a key starting with
  `$` (a Mongo operator), a dotted key (e.g. `a.b`), or a
  prototype-pollution-sensitive key (`__proto__`, `constructor`,
  `prototype`). Rejection must happen before the query/update reaches
  MongoDB, and no partial/best-effort query may be executed.
- FR-005: Extra/unexpected fields submitted in a request body for an
  in-scope mutating endpoint (fields not part of that endpoint's allowlist)
  must never be persisted, must never influence the mutation performed, and
  must result in either (a) an explicit HTTP 4xx rejection of the whole
  request, or (b) silent discarding of the unknown fields with only the
  allowlisted fields applied — the audit must record, per endpoint, which
  of these two behaviors is implemented and confirm it is intentional and
  consistent with sibling endpoints of the same resource.
- FR-006: Every response body returned by an in-scope endpoint (public or
  admin) must contain only fields required to fulfill that endpoint's
  documented contract. Responses must never include: `passwordHash` or any
  other credential/secret material, raw refresh-token or session-store
  internals beyond what is already part of the documented `/auth/*`
  contract, and any other field not already part of the current documented
  response contract for that endpoint.
- FR-007: The audit must explicitly evaluate whether fields such as
  `WorkImage.publicId` (Cloudinary internal identifier) and soft-delete
  markers (e.g. `deletedAt`) are necessary for each response contract in
  which they currently appear (public `GET /works`, `GET /works/:slug`,
  `GET /works/:workId/comments` vs. admin-only contexts), and document the
  outcome (keep, remove, or split public/admin response shapes) as part of
  this task's implementation, without silently changing the contract
  outside of what this audit determines is necessary for minimization.
- FR-008: Auth endpoints must not have their existing documented contract
  weakened by this task: `POST /auth/login`, `POST /auth/refresh`, and
  `POST /auth/logout` must continue to return exactly the fields already
  documented (`accessToken`, `csrfToken`, `sessionId`, `tokenType`, and the
  logout confirmation shape), and `GET /auth/session` must continue to
  return only session-descriptive fields, never `passwordHash` or raw
  token/session-store internals.
- FR-009: The existing comment-repository hardening delivered by
  CARSHOP-107 (`MongoCommentRepository`) must be verified as still in
  effect and must not be weakened by this task; if the audit finds the
  same class of gap (raw pass-through, missing allowlist, missing
  operator/prototype-pollution rejection) in any other in-scope repository
  or use case (Works, Auth), it must be remediated using an equivalent
  approach.

## Non-Functional Requirements

- NFR-001 (Security): No mutating endpoint in scope may allow a caller to
  set or influence a persisted field that is not part of that endpoint's
  documented, allowlisted contract (mass-assignment prevention).
- NFR-002 (Security): No response in scope may leak credentials, secrets,
  tokens, password hashes, or fields not part of the documented contract
  (response minimization).
- NFR-003 (Maintainability): Validation and allowlisting logic must follow
  existing project patterns (Zod schemas + `validateWithSchema` at the
  controller boundary; explicit field construction in use cases and
  repositories), consistent with `.claude/rules/controllers.md`,
  `.claude/rules/usecases.md`, and `.claude/rules/persistence.md`, rather
  than introducing a new, parallel validation mechanism.
- NFR-004 (Compatibility): Except where FR-007 determines a response field
  must be removed for minimization, the audit must not otherwise change the
  documented public contract (status codes, response shapes, cookie names,
  headers) of in-scope endpoints.
- NFR-005 (Reliability): Rejections for malformed input, unexpected fields,
  or injection-style keys must be deterministic and consistent across
  requests, independent of persistence state or timing.

## Acceptance Criteria

- AC-001: For each mutating endpoint in the In-Scope Endpoint Inventory,
  sending a request body with all required fields plus one additional,
  undocumented field results in either an HTTP 4xx rejection or a
  successful response in which the extra field was not persisted and does
  not appear in the resulting resource's stored/returned state.
- AC-002: For each mutating endpoint that accepts a body, sending a
  malicious payload containing a Mongo-operator key (e.g. `$set`, `$ne`,
  `$where`) as a top-level or nested field name results in an HTTP 4xx
  response, and no document in the corresponding collection is mutated as
  a result of that request.
- AC-003: For each mutating endpoint that accepts a body, sending a
  payload containing `__proto__`, `constructor`, or `prototype` as a field
  name results in an HTTP 4xx response, and no document in the
  corresponding collection is mutated as a result of that request.
- AC-004: For each in-scope endpoint accepting a route/path identifier
  parameter, sending a structurally invalid identifier (e.g. an
  object-shaped value, or a value containing `$` or `.` consistent with
  operator/prototype-pollution injection) results in an HTTP 4xx response
  without any query being executed against MongoDB for that identifier.
- AC-005: For each in-scope response (public and admin), the response body
  does not contain `passwordHash`, raw refresh-token values, raw
  session-store internal identifiers beyond `sessionId`, or any field not
  already part of that endpoint's documented contract.
- AC-006: `GET /auth/session` never returns `passwordHash` or credential
  material; it returns only session-descriptive fields already documented
  for this endpoint.
- AC-007: A well-formed, valid request to each in-scope mutating endpoint
  (only allowlisted fields, valid identifiers) continues to succeed with
  the same HTTP status code and response shape as before this audit,
  confirming no regression was introduced for legitimate usage.
- AC-008: Unit and/or E2E tests exist and pass covering, at minimum, one
  extra-field/mass-assignment attempt and one Mongo-operator or
  prototype-pollution-key attempt per in-scope mutating endpoint group
  (Works, Comments, Auth), consistent with `.claude/rules/testing.md`.
- AC-009: The comment-repository hardening behavior established by
  CARSHOP-107 (`MongoCommentRepository.findById`, `update`, `deleteById`
  rejecting malformed/malicious ids and update payloads) remains verifiably
  in effect after this task, confirmed by the existing or updated test
  suite for that repository.

## Constraints

- Scope is limited to the endpoints listed in the In-Scope Endpoint
  Inventory. Do not expand scope to unrelated routes (e.g. `/health`,
  `/docs`, `/docs.json`) unless the architect finds they share an
  implementation detail requiring remediation.
- Must comply with `.claude/rules/architecture.md`,
  `.claude/rules/controllers.md`, `.claude/rules/usecases.md`,
  `.claude/rules/persistence.md`, `.claude/rules/security.md`,
  `.claude/rules/openapi.md`, `.claude/rules/typescript.md`,
  `.claude/rules/testing.md`, and `.claude/rules/spec-security.md`.
- Do not weaken or duplicate the CARSHOP-107 comment-repository hardening;
  reuse or extend its pattern where an equivalent gap is found elsewhere,
  per architect judgment.
- No secrets, credentials, tokens, or real environment/database values may
  be introduced into version-controlled files (including this spec, tests,
  or Swagger fragments) as part of this change.
- Any response-shape change resulting from FR-007 (response minimization)
  must be reflected in the same change set in the corresponding Swagger
  fragment(s) under `src/infra/docs/*.swagger.ts`, per
  `.claude/rules/openapi.md`.

## Dependencies

- `src/infra/presentation/helpers/zod-validation.helper.ts` and
  `validateWithSchema` (existing global validation entry point).
- Existing Zod schemas under `src/infra/presentation/validators/`
  (`create-work.schema.ts`, `update-comment.schema.ts`, `comment.schema.ts`,
  `login.schema.ts`, `upload-work-image-body.schema.ts`).
- `MongoCommentRepository` (`src/infra/repositories/mongo-comment.repository.ts`)
  and its CARSHOP-107 hardening, treated as precedent, not to be duplicated
  or weakened.
- `MongoWorkRepository` (`src/infra/repositories/mongo-work.repository.ts`)
  and its existing `sanitizeFilter` usage, treated as precedent.
- Domain types `Work`, `WorkImage`, `Comment`
  (`src/core/domain/application/Work/work.types.ts`) and the auth session
  response shape (`AuthService.getSession`).
- `AdminUserModel` (`src/data/models/admin-user.model.ts`), which holds
  `passwordHash` — must be confirmed never serialized into any HTTP
  response.

## Out of Scope

- Re-implementing or redesigning the CARSHOP-107 comment hardening from
  scratch; this task verifies and, if needed, extends the same pattern.
- Bumping the Mongoose dependency version (tracked as a separate,
  independent concern per CARSHOP-107's own Out of Scope section).
- Adding new business features, new endpoints, or new fields to existing
  contracts beyond what response minimization (FR-007) determines must be
  removed.
- Changes to CORS, rate limiting, or authentication/session mechanics
  themselves (covered by prior, separate hardening tasks), except where a
  response returned by an auth endpoint is found to leak an internal
  field, which remains in scope under FR-006/FR-008.
- Any route or module not listed in the In-Scope Endpoint Inventory.

## Risks

- Because most in-scope endpoints already route through Zod schemas and
  explicit use-case field construction, some acceptance criteria may
  already pass today; the audit must still produce verifiable evidence
  (tests) for each endpoint rather than assuming compliance from code
  inspection alone.
- Changing a response shape for minimization (FR-007) could be a breaking
  change for any existing frontend consumer if a field currently believed
  "unnecessary" is actually in use; the architect/developer must confirm
  before removing a field from a public contract, and any removal must be
  documented in Swagger and covered by an updated test.
- The distinction in FR-005 between "reject the whole request" vs. "silently
  discard extra fields" is currently inconsistent across the two existing
  strict/non-strict Zod schema styles observed in the repository; resolving
  this inconsistency endpoint-by-endpoint is explicitly part of this task's
  audit output, not a pre-decided outcome of this specification.

## Open Questions

### Blocking

None.

### Non-blocking

- Whether unknown/extra fields should be rejected outright (HTTP 4xx) or
  silently stripped is left to architect judgment per endpoint, as long as
  the choice is applied consistently within each resource group (Works,
  Comments, Auth) and is explicitly recorded in the implementation summary
  (FR-005).
- Whether `WorkImage.publicId` and `deletedAt` should be removed from
  public response contracts, kept as-is, or split into separate
  public/admin response shapes is left to architect/developer
  determination during implementation (FR-007), since Notion did not
  enumerate a specific field list to remove.
- Whether the Mongoose version bump referenced in CARSHOP-107's Notion task
  should also be revisited as part of this task is not specified; this
  specification keeps it out of scope, consistent with CARSHOP-107's own
  treatment of that concern.

## Traceability

FR-001 → AC-001, AC-007, AC-008
FR-002 → AC-004, AC-008
FR-003 → AC-001, AC-002, AC-003, AC-007
FR-004 → AC-002, AC-003, AC-008, AC-009
FR-005 → AC-001, AC-008
FR-006 → AC-005, AC-006
FR-007 → AC-005, AC-007
FR-008 → AC-006, AC-007
FR-009 → AC-009
