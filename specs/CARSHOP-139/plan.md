# CARSHOP-139 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-139/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Audit every mutating endpoint in the In-Scope Endpoint Inventory (Works,
Comments, Auth, admin moderation/upload) plus their read counterparts (for
response minimization only), close any gap against FR-001..FR-009/AC-001..
AC-009 in `specs/CARSHOP-139/spec.md`, and produce verifiable test evidence
(not just code inspection) per AC-008. Scope is exactly the inventory in
`spec.md`; no unrelated routes/refactors.

## Current Architecture

Repository findings vs. Obsidian historical knowledge:

1. "Allowlisted `$set` Rebuild" pattern (CARSHOP-107) — confirmed still in
   effect, unweakened, in `src/infra/repositories/mongo-comment.repository.ts`
   (`buildAllowlistedUpdate`, `isDangerousKey`, `assertStringIdentifier`,
   `buildSanitizedIdFilter`). Matches the note exactly. Compatible, no drift.
2. "Repository-Boundary Identifier Validation" pattern — confirmed for
   `MongoCommentRepository`, but NOT equivalently applied in
   `MongoWorkRepository` (see Gap A below). FR-009 explicitly requires
   closing this gap.
3. "Mirror Mongoose Schema Limits in Zod Validators" — the cited gap
   (`work-image.model.ts` alt maxlength 160 vs Zod) is NO LONGER TRUE;
   `upload-work-image-body.schema.ts` already has `.max(160)`. No
   remediation needed. `UploadWorkImageUseCase.execute`'s fixed
   `HttpError(500)` rethrow on persistence errors is a non-blocking
   observation only, out of scope for FR-001..FR-009.
4. "Inline Zod Body Validation vs Dedicated Middleware" — confirmed as
   still the exact pattern used everywhere; no change needed.
5. "Zod Migration Pitfalls: Unknown-Key Stripping" — already fully
   remediated: `create-work.schema.ts`, `comment.schema.ts`,
   `update-comment.schema.ts`, `login.schema.ts`, and
   `upload-work-image-body.schema.ts` ALL already call `.strict()`. No
   code change required for this dimension; must be recorded as an audit
   finding (FR-005).
6. "E2E Attack-Payload→400 May Not Prove Inner Guard Fired" — informs
   testing strategy: unit tests must call repository methods directly,
   bypassing the outer Zod/route-param layer.
7. No general response-minimization architectural note existed; confirmed
   directly from repository that public Work/WorkImage responses currently
   over-expose `publicId` and `deletedAt` (Gap B).
8. CARSHOP-109 correction accepted — not a mass-assignment precedent.

## Proposed Solution

Close Gap A (identifier-guard parity in `MongoWorkRepository`) and Gap B
(response minimization for public Work/WorkImage responses), record the
FR-005 audit finding (no code change required), and add the test evidence
required by AC-008. Gap C is a non-blocking, optional consistency nit.

### Gap A — MongoWorkRepository identifier guard weaker than MongoCommentRepository's (FR-002/FR-004/FR-009, AC-004/AC-009)

`src/infra/repositories/mongo-work.repository.ts`,
`assertStringIdentifier(value, fieldName)` (lines 81-87) only checks
`typeof value !== 'string'`. Unlike `MongoCommentRepository.assertStringIdentifier`,
it does NOT reject empty/whitespace-only strings, or values starting with
`$`, containing `.`, or equal to `__proto__`/`constructor`/`prototype` (no
`isDangerousKey` equivalent).

This backs `findById`, `findByIdIncludingDeleted`, `softDelete`,
`hardDelete`, `hardDeleteData`, `addImage(workId)`,
`removeImage(workId, imageId)` — reachable from `DELETE /admin/works/:workId`,
`POST /works/:workId/images`, `DELETE /works/:workId/images/:imageId`, and
`workId` used internally by comment use cases. `findBySlug` is already
fully compliant (`sanitizeSlugIdentifier` + `SLUG_PATTERN` regex) — no
change needed there.

Only `findBySlug` wraps its filter with `sanitizeFilter`; the other six
id-based methods build plain filter object literals without it.

Note on exploitability: `id`/`workId`/`imageId` are used as filter VALUES
not KEYS, so practical NoSQL-injection risk is lower than the
comment-update `$set`-from-keys case — but AC-004 is unconditional, so the
guard must be implemented regardless, both for AC-004 conformance and
defense-in-depth consistency.

### Gap B — Public Work/WorkImage responses over-expose internal fields (FR-006/FR-007, AC-005)

`Work.deletedAt` and `WorkImage.publicId` (Cloudinary internal asset id)
are returned verbatim by `GET /works` (public by default) and
`GET /works/:slug` (always public). Both are currently documented in
`works.swagger.ts`'s `WorkResponse` schema. `deletedAt` is always `null`
for anything these two endpoints return (soft-delete implementation detail
leak, no functional value). `publicId` is an internal Cloudinary
identifier with no documented public-contract purpose.

`POST /works` (admin-only) and `GET /works?includeDrafts=true`
(authenticated) are NOT public — no minimization needed; keep full shape.

Auth responses already fully compliant (`AuthController` constructs
explicit `{accessToken, csrfToken, sessionId, tokenType}`;
`AuthService.getSession` returns only `{sessionId, email, expiresAt}`;
`passwordHash` never serialized) — no code change required for Auth.

Comment responses contain no internal/sensitive fields anywhere — no code
change required for Comments.

`MongoSessionStoreRepository.update()` takes `Partial<AuthSession>` passed
into `findOneAndUpdate`, but is never fed by request-body/caller-controlled
input (only `AuthService.refresh()` constructing fixed internal objects) —
not applicable to FR-004, no remediation needed.

`src/data/models/work-image.model.ts` (separate `WorkImageModel`/
`work_images` collection) confirmed NOT wired into any route/use
case/repository — orphaned/legacy, out of scope, not to be touched.

### Gap C — Minor consistency nit (non-blocking, optional)

`WorkImageController.upload` validates `workId` manually instead of using
the `requireStringRouteParam` helper. Functionally equivalent, no security
gap. Optional drive-by cleanup only, not required for AC compliance.

### FR-005 audit finding (must be recorded, not just implemented)

Every existing in-scope mutating body-schema (create-work, comment,
update-comment, login, upload-work-image-body) already uses `.strict()` —
consistent explicit HTTP 4xx rejection of unexpected body fields across
Works/Comments/Auth. No silent-discard anywhere. Satisfies FR-005/NFR-003
as-is; implementation summary must explicitly record this finding.

## Technical Decisions

### Decision 1 — Gap A remediation (identifier-guard parity)

#### Decision

Duplicate the comment-repository's identifier-guard pattern locally inside
`MongoWorkRepository` (local-duplication convention — no shared
cross-repository helper; scope is Comment [already compliant] + Work
only):

- Add private `isDangerousKey(key: string): boolean` to
  `MongoWorkRepository`, identical logic to
  `MongoCommentRepository`'s (`key.startsWith('$') || key.includes('.') ||
  DANGEROUS_KEYS.has(key)`, `DANGEROUS_KEYS = new Set(['__proto__',
  'constructor', 'prototype'])`).
- Strengthen `assertStringIdentifier(value, fieldName)` to also reject
  `value.trim().length === 0` and `isDangerousKey(value)`, throwing
  `HttpError(400, ...)` — mirroring `MongoCommentRepository`'s, adapted to
  Work's existing method/field names and error message style.
- Wrap filter objects built in `findById`, `findByIdIncludingDeleted`,
  `softDelete`, `hardDelete`, `hardDeleteData`, `addImage`'s two
  `updateOne` calls, and `removeImage`'s `updateOne` call with
  `sanitizeFilter(...)`, consistent with `findBySlug`'s existing usage.
  Additive/defense-in-depth only.
- `findBySlug`/`sanitizeSlugIdentifier`: no changes needed.
- No `WorkRepositoryPort` signature changes — purely internal to the
  adapter.

#### Reason

Close the identifier-guard parity gap required by FR-002/FR-004/FR-009 and
AC-004/AC-009, using the established, already-precedented pattern from
`MongoCommentRepository` (CARSHOP-107), consistent with NFR-003
(no new, parallel validation mechanism).

#### Alternatives Considered

A shared cross-repository helper was not chosen; the local-duplication
convention already established by the codebase (Comment-only precedent)
is kept, with scope limited to Comment (already compliant) + Work only.

#### Trade-offs

Some duplication of guard logic between `MongoCommentRepository` and
`MongoWorkRepository` in exchange for avoiding a premature shared
abstraction, consistent with `.claude/rules/architecture.md`'s guidance
against premature abstraction.

### Decision 2 — Gap B remediation (response minimization)

#### Decision

- Add new pure mapping function in presentation layer:
  `src/presentation/helpers/work-response.mapper.ts`, exporting
  `toPublicWorkResponse(work: Work): PublicWorkResponse`.
  `PublicWorkResponse` = `Work` minus `deletedAt`, with each `images[]`
  entry minus `publicId`. Define `PublicWorkResponse`/`PublicWorkImage`
  types in this new file. Mapping function belongs in presentation layer
  (controllers.md: controllers map result to HTTP response), keeping
  `src/core/domain` and `src/usecase` free of HTTP-shape concerns.
- `WorkController.list`: when `request.auth` is NOT set (unauthenticated
  public listing), map each work through `toPublicWorkResponse` before
  responding. When `request.auth` IS set (admin/`includeDrafts=true`),
  return full `Work[]` unchanged.
- `WorkController.getBySlug`: always map through `toPublicWorkResponse`
  (no authenticated variant of this route).
- `WorkController.create` (`POST /works`, admin-only): no change — keep
  full `Work` object.
- Do not touch `Work`/`WorkImage`/`Comment` domain types or
  `WorkRepositoryPort`/`toWork()` mapping in the repository — full
  internal shape still needed internally (e.g. `hardDelete`/
  `upload-work-image` use `image.publicId` internally). Minimization is
  purely a presentation-boundary concern.

#### Reason

FR-006/FR-007/AC-005/AC-007 require evaluating and closing the leak of
`publicId`/`deletedAt` in public responses while explicitly preserving
the full shape for admin/authenticated contexts (AC-007 regression
guarantee) and confirming the domain/persistence layers remain unaffected
(NFR-003, `.claude/rules/architecture.md`).

#### Alternatives Considered

Stripping the fields at the domain/repository level was rejected because
the full internal shape (including `publicId`) is still needed
internally (e.g. `hardDelete`, `upload-work-image` use `image.publicId`).
Minimization is scoped as a presentation-boundary concern only.

#### Trade-offs

Introduces a response-shape split between public and admin/authenticated
callers of `GET /works` — a deliberate, documented breaking change for any
consumer of the previously-uniform public shape, accepted under FR-007's
explicit mandate and covered by Swagger + regression tests.

### Decision 3 — Swagger updates

#### Decision

Per FR-007/NFR-004/`.claude/rules/openapi.md`:

- In `src/infra/docs/works.swagger.ts`, add new schema
  `PublicWorkResponse` (`WorkResponse` minus `images[].publicId` and minus
  `deletedAt`).
- Change `GET /works` 200 response to reference `PublicWorkResponse` as
  the array item schema for the public/default case; add a description
  note that `includeDrafts=true` by an authenticated admin returns full
  `WorkResponse` shape instead (prose note, no `oneOf`/`anyOf`).
- Change `GET /works/{slug}` 200 response to reference
  `PublicWorkResponse`.
- Leave `POST /works` response (`WorkResponse`) unchanged.
- No changes needed to `comments.swagger.ts`, `admin-comments.swagger.ts`,
  `admin-works.swagger.ts`, or `auth.swagger.ts`.

#### Reason

Required by `.claude/rules/openapi.md` and the spec's Constraints section:
any response-shape change resulting from FR-007 must be reflected in the
same change set in the corresponding Swagger fragment(s).

#### Alternatives Considered

Using `oneOf`/`anyOf` to express the conditional public/admin shape was
not chosen in favor of a single referenced schema plus a prose
description note, keeping the documented contract simple and consistent
with existing fragment conventions.

#### Trade-offs

The conditional (`includeDrafts=true`) admin behavior is documented as
prose rather than as a machine-checkable schema branch; acceptable given
existing project Swagger conventions.

## Execution Flow

1. Strengthen `MongoWorkRepository.assertStringIdentifier` and add
   `isDangerousKey`; wrap the six id-based filter/update call sites with
   `sanitizeFilter`.
2. Add `src/presentation/helpers/work-response.mapper.ts` with
   `toPublicWorkResponse`.
3. Update `WorkController.list` and `WorkController.getBySlug` to apply
   the mapper per the auth-context branching described in Decision 2.
4. Update `src/infra/docs/works.swagger.ts` with the new
   `PublicWorkResponse` schema and updated response references for
   `GET /works` and `GET /works/{slug}`.
5. Record the FR-005 audit finding (no code change) in the implementation
   summary.
6. Optionally apply the Gap C drive-by cleanup in `WorkImageController.upload`
   (non-blocking, not required for AC compliance).
7. Add/extend unit and E2E tests per the Testing Strategy section.
8. Run `npm run test:coverage` and record the actual percentage achieved
   on new/changed lines.

## Files

### Files to Create

- `src/presentation/helpers/work-response.mapper.ts`
- `test/unit/presentation/helpers/work-response.mapper.spec.ts`

### Files to Modify

- `src/infra/repositories/mongo-work.repository.ts`
- `src/presentation/controllers/work.controller.ts`
- `src/infra/docs/works.swagger.ts`
- `test/unit/infra/repositories/mongo-work.repository.spec.ts`
- `test/unit/presentation/controllers/work.controller.spec.ts`
- E2E specs covering Works (e.g. `works.e2e-spec.ts` / `work-crud.e2e-spec.ts`)
- Optionally `src/presentation/controllers/work-image.controller.ts` (Gap C,
  non-blocking)

## Contract Impact

- `GET /works` (public/default, unauthenticated) and `GET /works/:slug`:
  response shape changes from full `WorkResponse` to `PublicWorkResponse`
  (removes `images[].publicId` and top-level `deletedAt`). This is the one
  permitted, deliberate contract change under FR-007/NFR-004.
- `GET /works?includeDrafts=true` (authenticated admin) and `POST /works`
  (admin-only): unchanged, full `WorkResponse` shape.
- No other in-scope endpoint (Comments, Auth, admin moderation/upload)
  has a documented contract change; FR-008 explicitly requires Auth
  endpoints remain unweakened/unchanged.

## Persistence Impact

- `MongoWorkRepository`: additive, defense-in-depth strengthening of
  identifier validation and filter sanitization on `findById`,
  `findByIdIncludingDeleted`, `softDelete`, `hardDelete`,
  `hardDeleteData`, `addImage`, `removeImage`. No `WorkRepositoryPort`
  signature changes; purely internal to the adapter.
- `findBySlug` and its existing `sanitizeSlugIdentifier`/`SLUG_PATTERN`
  guard: unchanged.
- `MongoCommentRepository`: no change; verified still in effect (AC-009).
- No schema, index, or migration changes.

## Security Impact

- Closes the FR-002/FR-004/FR-009 identifier-guard gap in
  `MongoWorkRepository`, aligning it with the already-compliant
  `MongoCommentRepository` pattern (rejecting Mongo-operator keys, dotted
  keys, prototype-pollution-sensitive keys, and empty/whitespace-only
  identifiers before any query executes).
- Reduces response-body information exposure (Cloudinary `publicId`
  internal identifier, soft-delete `deletedAt` marker) on public,
  unauthenticated Work responses.
- No changes to authentication, session, or CSRF mechanics.
- `AdminUserModel.passwordHash` confirmed never serialized into any HTTP
  response — no remediation needed, but must remain verified by tests.

## Swagger Impact

- `src/infra/docs/works.swagger.ts`: add `PublicWorkResponse` schema;
  update `GET /works` and `GET /works/{slug}` 200 responses to reference
  it; add a prose note on the `includeDrafts=true` admin behavior; leave
  `POST /works` response unchanged.
- No changes to `comments.swagger.ts`, `admin-comments.swagger.ts`,
  `admin-works.swagger.ts`, or `auth.swagger.ts`.

## Testing Strategy

**Unit tests, extend `test/unit/infra/repositories/mongo-work.repository.spec.ts`:**

- For each of `findById`, `findByIdIncludingDeleted`, `softDelete`,
  `hardDelete`, `hardDeleteData`, `addImage`, `removeImage`: call directly
  with malicious identifier (`'$ne'`, `'a.b'`, `'__proto__'`, `''`/whitespace)
  and assert (a) throws `HttpError` with `statusCode` 400, and (b) the
  corresponding mocked `WorkModel` method (`findOne`/`updateOne`/`deleteOne`)
  was NOT called.
- Keep/extend existing happy-path tests as regression coverage (AC-007).

**New unit test:** `test/unit/presentation/helpers/work-response.mapper.spec.ts`
— assert `toPublicWorkResponse` strips `deletedAt` and each image's
`publicId`, preserves every other field unchanged.

**Extend `test/unit/presentation/controllers/work.controller.spec.ts`:**
assert `list()` returns mapped/minimized shape when `request.auth` absent,
full shape when present; assert `getBySlug()` always returns minimized
shape.

**E2E:**

- Extend `works.e2e-spec.ts` / `work-crud.e2e-spec.ts`: `GET /works` (no
  auth) and `GET /works/:slug` responses must not contain `publicId`
  inside any image object nor `deletedAt` at top level; `POST /works`
  (admin) and `GET /works?includeDrafts=true` (admin) responses must still
  contain both fields (regression proving intentional split — AC-007).
- Add extra-field/mass-assignment E2E case for `POST /works` (valid body +
  one unexpected field, expect 400) if not already covered —
  FR-001/AC-001/AC-008.
- Add Mongo-operator-key/prototype-pollution-key E2E case targeting a
  Works route-param (e.g. `DELETE /admin/works/%24ne` or similar),
  expecting 400 with no document mutated — AC-002/AC-003/AC-004/AC-008 for
  Works; developer must confirm actual before/after behavior so the test
  asserts the corrected contract.
- Confirm `admin-comment-update-security.e2e-spec.ts` still passes
  unmodified (AC-009 regression evidence).
- Add an Auth-group extra-field E2E case only if not already present
  (`login.schema.ts` already `.strict()`, likely already covered — check
  first).

### Coverage strategy

New/changed production files: `mongo-work.repository.ts` (guard
strengthening, ~7 methods), new `work-response.mapper.ts`,
`work.controller.ts` (list/getBySlug branching), `works.swagger.ts`
(schema/doc only, exempt as not-applicable boilerplate per
`.claude/rules/testing.md`). All logic-bearing changes are reasonably
unit-testable using the existing mock-the-Mongoose-model pattern.
Developer/tester should run `npm run test:coverage` and record the actual
percentage achieved on new/changed lines against the `>= 80%`
new/changed-code unit-test coverage target defined in
`.claude/rules/testing.md`. No exception is anticipated for this task's
new/changed logic-bearing files, since all of them are reasonably
unit-testable with existing project patterns; if any exception is
ultimately needed, it must be recorded with the coverage percentage
obtained, the uncovered parts, the reason, and the residual risk, per
`.claude/rules/testing.md`.

## Risks

- Response-shape split for `GET /works` / `GET /works/:slug` is the one
  permitted, deliberate contract change under FR-007/NFR-004; must ship
  together with Swagger update and regression tests proving the admin
  path unaffected. Any frontend depending on `publicId`/`deletedAt` from
  these two public endpoints would break — spec explicitly accepts this
  risk under FR-007's mandate.
- `MongoWorkRepository` guard strengthening is additive only — no
  legitimate UUID-shaped identifier affected; regression tests cover this
  (AC-007).
- No dependency, schema, or migration changes. No changes to
  auth/session/CSRF mechanics.

## Implementation Steps

See Execution Flow above; in summary:

1. Strengthen `MongoWorkRepository` identifier guard and filter
   sanitization (Gap A / Decision 1).
2. Add `work-response.mapper.ts` and wire it into `WorkController.list`
   and `WorkController.getBySlug` (Gap B / Decision 2).
3. Update `works.swagger.ts` (Decision 3).
4. Record the FR-005 audit finding.
5. Add unit tests (repository, mapper, controller) and E2E tests per
   Testing Strategy.
6. Run `npm run test:coverage`, `npm test`, `npm run build`, and
   `npm run test:e2e`; record results.

## Definition of Done Mapping

- FR-001/AC-001/AC-007/AC-008 → existing `.strict()` Zod schemas
  (recorded finding, no code change) + new/extended E2E extra-field
  cases.
- FR-002/AC-004/AC-008 → Decision 1 (`MongoWorkRepository` identifier
  guard strengthening) + new repository unit tests.
- FR-003/AC-001/AC-002/AC-003/AC-007 → verified via existing explicit
  field-construction pattern (no raw `request.body` passthrough found) +
  Decision 1 guard.
- FR-004/AC-002/AC-003/AC-008/AC-009 → Decision 1 (Works) + verified
  unweakened `MongoCommentRepository` (Comments, AC-009 regression).
- FR-005/AC-001/AC-008 → recorded audit finding (all in-scope schemas
  already `.strict()`).
- FR-006/AC-005/AC-006 → Decision 2 (response minimization) + verified
  Auth/Comment responses already compliant.
- FR-007/AC-005/AC-007 → Decision 2 + Decision 3 (Swagger split), with
  AC-007 regression tests proving admin shape unaffected.
- FR-008/AC-006/AC-007 → verified Auth contract unchanged (no code
  change required).
- FR-009/AC-009 → verified `MongoCommentRepository` unweakened; Decision
  1 extends the equivalent pattern to Works.

## Open Non-Blocking Questions

- Gap C (`WorkImageController.upload` manual `workId` validation instead
  of `requireStringRouteParam` helper) is an optional, non-blocking
  consistency cleanup; not required for AC compliance and may be deferred
  or applied at developer discretion as a drive-by change.
