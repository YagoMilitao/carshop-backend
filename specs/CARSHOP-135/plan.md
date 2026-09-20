# CARSHOP-135 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-135/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Implement a protected, partial-update (PATCH) endpoint for an existing Work,
reusing the existing hexagonal layering and the Work domain model/ports, so
CARSHOP-32 (admin edit frontend) has a real, documented contract. Acceptance
criteria AC-001..AC-007 from `specs/CARSHOP-135/spec.md` (already READY)
apply verbatim; no spec changes are needed.

## Current Architecture

Repo-verified facts resolving the spec's open questions:

- Route path / method: `PATCH /admin/works/{workId}`. Precedent: `DELETE
  /admin/works/{workId}` in `src/infra/http/routes/admin-work.routes.ts`,
  mounted at `/admin/works` in `src/infra/config/routes.ts`. Closer
  precedent: `PATCH /admin/comments/{commentId}`
  (`AdminCommentController.update` → `UpdateCommentUseCase` →
  `CommentRepositoryPort.update()`) — exact pattern to mirror. `workId`
  (not slug) is the identifier, matching `DELETE /admin/works/{workId}`
  and the image routes.
- Slug-conflict status code: `409`. `CreateWorkUseCase.execute`
  (`src/usecase/create-work.use-case.ts:28-32`) throws
  `HttpError(409, 'Já existe um trabalho com esse slug.')` on slug
  collision; update use case must mirror this for collision with a
  different work (FR-006/AC-004).
- Editable field set (exhaustive): `slug`, `title`, `description`,
  `category`, `tags`, `status`. Confirmed against
  `src/core/domain/application/Work/work.types.ts` — domain `Work` type
  does not expose `metadata`/`seo`. `images` is out of scope (managed via
  `POST`/`DELETE /admin/works/{workId}/images*`). `id`/`createdAt`/
  `updatedAt`/`deletedAt` are server-managed.
- Dependencies verified present in repo: CARSHOP-13 (Works CRUD base:
  `CreateWorkUseCase`, `GetWorkBySlugUseCase`, `ListWorksUseCase`,
  `MongoWorkRepository`, `work.routes.ts`) and CARSHOP-2 (Auth:
  `buildAuthMiddleware` used identically on `admin-work.routes.ts`,
  `admin-comment.routes.ts`, `work-image.routes.ts`).

## Proposed Solution

Historical knowledge reconciliation (key corrections vs repo):

- `MongoWorkRepository` has `isDangerousKey`/`DANGEROUS_KEYS`/
  `assertStringIdentifier` (CARSHOP-139 hardening) but has NO `update()`
  method — must be added new, mirroring
  `MongoCommentRepository.buildAllowlistedUpdate` +
  `findOneAndUpdate(..., { new: true })` pattern, reusing existing
  `isDangerousKey`/`assertStringIdentifier` helpers.
- `work.model.ts` limits: `title` maxlength 120, `description` maxlength
  5000; repository enforces `MAX_SLUG_LENGTH = 120` and
  `SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/` for slug. New
  `update-work.schema.ts` must mirror these exactly
  (`create-work.schema.ts` currently does NOT mirror them — pre-existing
  gap, out of scope to fix).
- Convention: inline `validateWithSchema(schema, request.body)` in the
  controller (not Express middleware). New `update-work.schema.ts` under
  `src/infra/presentation/validators/`, all fields `.optional()`,
  `.strict()`, with a `.refine()` requiring at least one field present
  (mirrors `update-comment.schema.ts`).
- Response shape: PATCH is admin-only (`request.auth` always present) →
  return the full domain `Work` object directly (no
  `toPublicWorkResponse` mapping), consistent with `WorkController.create`
  and `AdminCommentController.update`.
- Swagger: `works.swagger.ts`'s `WorkResponse` schema can be reused via
  `$ref`; new PATCH request-body schema must be hand-built field-by-field
  against the new Zod schema, not copied from `CreateWorkRequest`.
- `test/e2e/work-crud.e2e-spec.ts` (CARSHOP-103) is the home for new
  PATCH E2E coverage; currently has no PATCH coverage.
- No update-work use case or `WorkRepositoryPort.update` currently exists
  — both net-new.
- ADR-018 is an empty/irrelevant file; the real contract doc is
  `docs/api-contract.md` (has "Works" and "Admin — Works" sections) —
  this is what must be updated.

## Technical Decisions

### Decision

Add `update` to `WorkRepositoryPort` and implement it in
`MongoWorkRepository` using an allowlisted `$set` builder plus
`findOneAndUpdate`, mirroring the existing `MongoCommentRepository`
update pattern.

### Reason

Reuses existing hardening helpers (`isDangerousKey`,
`assertStringIdentifier`) already used elsewhere in the repository and
keeps mass-assignment/prototype-pollution defenses consistent with
`POST /works` (CARSHOP-139).

### Alternatives Considered

None recorded beyond the mirrored comment-repository update pattern;
this is the established repository convention for partial updates.

### Trade-offs

`findOneAndUpdate` bypasses the Mongoose `pre('save')` normalization
hook, so slug/category/tags normalization must be performed explicitly
in the repository before constructing `$set` (see Risks).

### Decision

Place the new `update` handler on the existing `WorkController` (not a
new controller), wired into `admin-work.routes.ts` under
`/admin/works/{workId}`.

### Reason

`WorkController` already owns work write operations (`POST /works`);
`AdminWorkController` is scoped to destructive hard-delete only. The
route path is the canonical contract, not which controller class
implements it.

### Alternatives Considered

Creating a dedicated `AdminWorkController.update` method — rejected
because `WorkController` already centralizes work write logic and this
avoids splitting related responsibilities across controllers.

### Trade-offs

`WorkController`'s constructor grows to accept `UpdateWorkUseCase` in
addition to its existing use cases; instantiation of that dependency is
localized to `admin-work.routes.ts`.

### Decision

Use HTTP `409` for slug-conflict-on-update, matching `POST /works`.

### Reason

`CreateWorkUseCase.execute` already throws `HttpError(409, ...)` on slug
collision; using a different status code for update would create two
inconsistent conventions for the same underlying rule.

### Alternatives Considered

`400` — rejected as inconsistent with the existing `POST /works`
behavior.

### Trade-offs

None identified.

## Execution Flow

```text
infra/http/routes/admin-work.routes.ts
    ↓
authMiddleware
    ↓
WorkController.update
    ↓ (validateWithSchema updateWorkSchema)
UpdateWorkUseCase.execute
    ↓ (findById → optional findBySlug conflict check)
WorkRepositoryPort.update (MongoWorkRepository)
    ↓
WorkModel.findOneAndUpdate(filter with deletedAt: null, allowlisted $set)
```

## Files

### Files to Create

- `src/usecase/update-work.use-case.ts`
- `src/infra/presentation/validators/update-work.schema.ts`
- `test/unit/usecase/update-work.use-case.spec.ts`

### Files to Modify

- `src/core/domain/repositories/work.repository.ts` — add
  `UpdateWorkRepositoryInput` type and `update` method to
  `WorkRepositoryPort`.
- `src/infra/repositories/mongo-work.repository.ts` — add
  `buildAllowlistedUpdate` private method and `update` method.
- `src/presentation/controllers/work.controller.ts` — add `update`
  handler and constructor dependency on `UpdateWorkUseCase`.
- `src/infra/http/routes/admin-work.routes.ts` — instantiate
  `UpdateWorkUseCase`, wire `WorkController`, add
  `router.patch('/:workId', authMiddleware, workController.update)`.
- `src/infra/docs/admin-works.swagger.ts` — add `UpdateWorkRequest`
  schema and a PATCH operation under the existing
  `/admin/works/{workId}` path key.
- `docs/api-contract.md` — add a `### PATCH /admin/works/{workId}`
  subsection under "## Admin — Works".
- `test/unit/infra/repositories/mongo-work.repository.spec.ts` — extend
  with `describe('update', ...)` coverage.
- `test/unit/presentation/controllers/work.controller.spec.ts` — extend
  with `update` handler coverage.
- `test/unit/infra/http/routes/admin-work.routes.spec.ts` — extend to
  verify `authMiddleware` applied to the new PATCH route.
- `test/e2e/work-crud.e2e-spec.ts` — extend with a new PATCH describe
  block.

No changes are needed to `src/infra/server.ts` or
`src/infra/config/routes.ts` beyond existing wiring; `buildAdminWorkRouter`
already receives `workRepository`.

## Contract Impact

- New: `PATCH /admin/works/{workId}` — Bearer auth required.
- Request body (all optional, `.strict()`): `slug`, `title`,
  `description`, `category`, `tags: string[]`, `status:
  'draft'|'published'`.
- Response 200: full `WorkResponse` (same shape as `POST /works`'s 201
  body — includes `images[].publicId` and `deletedAt`, admin-
  authenticated response).
- Errors: `400` (validation/mass-assignment/empty-payload), `401`
  (no/invalid token), `404` (not found or soft-deleted), `409` (slug
  collision with different work), `429` (global rate limit, inherited
  automatically, no route-specific limiter needed).
- Backward compatibility: purely additive — no existing route/status/
  response shape changes.
- `images`, `metadata`, `seo` are explicitly out of scope/unreachable
  through this endpoint's payload (rejected by `.strict()`).

## Persistence Impact

- No schema/model change to `work.model.ts` — reuses existing fields and
  existing unique index on `slug`.
- Repository filter uses `deletedAt: null` so soft-deleted works are
  ineligible for update (FR-005), consistent with `persistence.md`.
- `findOneAndUpdate` bypasses the Mongoose `pre('save')` normalization
  hook (`work.model.ts:194-210`) — the repository must perform
  slug/category/tags normalization explicitly before building `$set`,
  exactly as `CreateWorkUseCase` does before `.create()`. This is called
  out as the single most important implementation risk.

## Security Impact

- Mass-assignment/prototype-pollution parity: same three defensive
  layers as `POST /works` (CARSHOP-139): Zod `.strict()`,
  `isDangerousKey` guard in `buildAllowlistedUpdate`, `sanitizeFilter` on
  the id-based filter. Must be unit- and E2E-tested identically to
  existing `POST /works` mass-assignment/operator-key/proto-pollution
  tests (AC-007).
- CSRF: not applicable; Bearer-token auth route like `POST /works` and
  `DELETE /admin/works/{workId}`, not cookie-based refresh/logout flow.
- Slug uniqueness race: use-case-level `findBySlug` pre-check narrows but
  does not eliminate a race between the check and `findOneAndUpdate`
  under concurrency; mirrors `CreateWorkUseCase`'s existing pre-existing
  same-shaped race — not a regression, not in scope to change. The
  unique index on `slug` remains the integrity backstop.

## Swagger Impact

- Add `UpdateWorkRequest` schema (all fields optional, mirrored from the
  Zod schema) to `adminWorksSchemas`.
- Add a `patch` operation under the existing `/admin/works/{workId}` path
  key (same object that already has `delete`):
  - `security`: `bearerSecurity`
  - `parameters`: `workId` path param (reuse shape from the existing
    delete operation)
  - `requestBody`: `application/json`, `$ref
    '#/components/schemas/UpdateWorkRequest'`
  - `responses`: `200` → `$ref '#/components/schemas/WorkResponse'`
    (from `works.swagger.ts`, merged into the same
    `components.schemas`); `400`; `401`; `404`; `409`; `429`
    (`globalRateLimitResponse`)
- Verify field-by-field against the actual Zod schema; do not copy
  `CreateWorkRequest`.

## Testing Strategy

Coverage target (`.claude/rules/testing.md`): new/modified files
(`update-work.use-case.ts`, `update-work.schema.ts`, new methods in
`mongo-work.repository.ts`/`work.controller.ts`/`admin-work.routes.ts`)
are subject to `>= 80%` new/changed-code unit-test coverage, measured via
`npm run test:coverage` per the method defined in
`.claude/rules/testing.md`. If a genuinely unreachable branch is found,
document it via the exception-criteria format (coverage percentage
obtained, uncovered parts, stated reason, residual risk) rather than skip
silently.

Unit tests (new/extended files):

- `test/unit/usecase/update-work.use-case.spec.ts` — mirror
  `update-comment.use-case.spec.ts`: success (partial fields persisted),
  404 when `findById` undefined, 409 when `findBySlug` returns a
  different work's id, no-conflict when `findBySlug` returns the same
  work (slug unchanged), 404 fallback when `update()` itself returns
  undefined.
- `test/unit/infra/repositories/mongo-work.repository.spec.ts` (extend)
  — add `describe('update', ...)` mirroring
  `mongo-comment.repository.spec.ts`'s update tests: allowlisted `$set`
  construction, rejection of dangerous keys (`$where`, `__proto__`,
  dotted keys), rejection of empty payload, `deletedAt: null` filter
  applied, slug/tags/category normalization applied before `$set`.
- `test/unit/presentation/controllers/work.controller.spec.ts` (extend)
  — add `update` handler tests: success (200 + body), invalid payload →
  `next(HttpError 400)`, missing `workId` param → 400, use-case error
  propagation via `next(error)`.
- `test/unit/infra/http/routes/admin-work.routes.spec.ts` (extend) —
  verify `authMiddleware` applied to the new PATCH `/:workId` route.
- Swagger merge test files (if any dedicated spec exists) — extend
  assertions that the new fragment merges correctly.

E2E tests — extend `test/e2e/work-crud.e2e-spec.ts`, new describe block,
mirroring existing `POST /works` test style/fixtures (`buildWorkPayload`,
`loginAsAdmin`, testSequence isolation):

- Successful partial update (AC-001): create work, PATCH a subset of
  fields (e.g. title only), assert 200 and unspecified fields unchanged.
- 401 unauthenticated (AC-002): PATCH without `Authorization` header →
  401, GET confirms no change.
- 404 not found (AC-003): PATCH random/nonexistent `workId` with valid
  token → 404.
- 409 slug conflict (AC-004): create two works, PATCH one's slug to the
  other's → 409, GET confirms neither changed.
- 400 validation error (AC-005): PATCH with wrong type (`tags` as
  string) or oversized title/description → 400, confirm no partial
  persistence.
- Mass-assignment/operator-key/proto-pollution guard still holds on
  PATCH (mirrors existing `POST /works` CARSHOP-139 tests, adapted):
  extra field → 400; `$where`-style key → 400; `__proto__`-style raw-JSON
  payload → 400; confirm via GET that the target work's real fields are
  unchanged in all three cases.

Required commands: `npm test`, `npm run build`, `npm run test:e2e`,
`npm run test:coverage`.

## Risks

- Mass-assignment/prototype-pollution parity must be maintained across
  the same three defensive layers used for `POST /works` (CARSHOP-139):
  Zod `.strict()`, `isDangerousKey` guard, `sanitizeFilter`.
- Slug uniqueness race: use-case-level `findBySlug` pre-check narrows but
  does not eliminate a race between check and `findOneAndUpdate` under
  concurrency; mirrors `CreateWorkUseCase`'s existing pre-existing
  same-shaped race — not a regression, not in scope to change. The
  unique index on slug remains the integrity backstop.
- `findOneAndUpdate` skips the `pre('save')` hook: must be explicitly
  handled in `buildAllowlistedUpdate` — most important implementation
  risk.
- Since the exact contract becomes canonical for CARSHOP-32, any late
  change after CARSHOP-32 begins consuming it would require coordinated
  rework on the frontend side.

## Implementation Steps

1. Add `UpdateWorkRepositoryInput` type and `update` method to
   `WorkRepositoryPort` (`src/core/domain/repositories/work.repository.ts`).
2. Implement `buildAllowlistedUpdate` and `update` in
   `MongoWorkRepository` (`src/infra/repositories/mongo-work.repository.ts`),
   including explicit slug/category/tags normalization and the
   `deletedAt: null` filter.
3. Create `UpdateWorkUseCase`
   (`src/usecase/update-work.use-case.ts`) with `findById` existence
   check, slug-conflict check via `findBySlug` (409 on collision with a
   different work), and delegation to `WorkRepositoryPort.update`.
4. Create `update-work.schema.ts` Zod validator
   (`src/infra/presentation/validators/update-work.schema.ts`), all
   fields optional, `.strict()`, `.refine()` requiring at least one
   field.
5. Add `update` handler to `WorkController`
   (`src/presentation/controllers/work.controller.ts`), wiring in
   `UpdateWorkUseCase` via the constructor.
6. Wire `router.patch('/:workId', authMiddleware, workController.update)`
   into `src/infra/http/routes/admin-work.routes.ts`.
7. Update `src/infra/docs/admin-works.swagger.ts` with
   `UpdateWorkRequest` schema and the new PATCH operation.
8. Update `docs/api-contract.md` with the new endpoint's documentation.
9. Write/extend unit tests per Testing Strategy.
10. Write/extend E2E tests per Testing Strategy.
11. Run `npm test`, `npm run build`, `npm run test:e2e`,
    `npm run test:coverage` and confirm the coverage target or a
    documented exception.

## Definition of Done Mapping

- FR-001, FR-002 → Route `PATCH /admin/works/{workId}` and
  `update-work.schema.ts` field set.
- FR-003 → `update-work.schema.ts` validation + `buildAllowlistedUpdate`
  rejection of invalid payloads.
- FR-004 → `authMiddleware` applied on the new route.
- FR-005 → `deletedAt: null` filter in `MongoWorkRepository.update`;
  `UpdateWorkUseCase` 404 handling.
- FR-006 → `UpdateWorkUseCase` slug-conflict check, `HttpError(409, ...)`.
- FR-007 → `WorkRepositoryPort.update` returning the persisted domain
  `Work`.
- FR-008 → Explicit normalization in `buildAllowlistedUpdate` mirroring
  `CreateWorkUseCase`/`work.model.ts` hook behavior.
- FR-009 → `admin-works.swagger.ts` and `docs/api-contract.md` updates.
- NFR-001 → Use case depends only on `WorkRepositoryPort`; no parallel
  editing model introduced.
- NFR-002 → Reuse of existing `authMiddleware`/session validation, no
  new auth mechanism.
- NFR-003 → Contract finalized per this plan's Contract Impact section.
- AC-001..AC-007 → Covered by the Testing Strategy section above.

## Open Non-Blocking Questions

None. The spec's non-blocking open questions (slug-conflict status code,
exhaustive editable field list, exact route path) have been resolved by
repository inspection as documented in the Current Architecture section
above.
