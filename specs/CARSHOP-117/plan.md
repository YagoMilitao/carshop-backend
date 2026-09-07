# CARSHOP-117 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-117/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Expose a public `GET /works/:slug` endpoint that returns a single `Work`
(`200`) when it is `published` and not soft-deleted, and `404` in every
other case (not found, draft, or soft-deleted — regardless of
authentication), without changing `GET /works` behavior. Also fix the
pre-existing `WorkResponse` Swagger schema drift and document the new
path. Acceptance criteria AC-001 through AC-008 as stated in
`specs/CARSHOP-117/spec.md` map directly onto this plan.

## Current Architecture

- `WorkRepositoryPort.findBySlug(slug)` is declared in
  `src/core/domain/repositories/work.repository.ts`.
- Its Mongo implementation
  (`src/infra/repositories/mongo-work.repository.ts`) already filters out
  soft-deleted works (`deletedAt: null`) via `sanitizeSlugIdentifier` /
  `assertStringIdentifier`, but does not filter by `status`.
- `findBySlug` is currently used internally only by `CreateWorkUseCase`
  to enforce slug uniqueness on creation (including against drafts).
- No route, controller, or use case currently exposes a single-work
  lookup publicly.
- `GET /works` remains unpaginated and returns an array of `Work`.

## Existing Knowledge (Obsidian) vs. Repository

- ADR-006 (conditional route gate for drafts, via
  `requireAuthForDraftsMiddleware`): relevant precedent but not directly
  applicable — that pattern returns `401` for an explicit admin toggle
  on a LIST endpoint. This task's spec has already fixed the behavior as
  `404` for everyone on draft/deleted slugs (no admin bypass). No
  conflict — different endpoint shape, correctly not reused.
- Troubleshooting note (CARSHOP-102, missing auth middleware): lesson —
  audit every behavior mode, not just the "primary" one — already
  reflected in spec's AC-003/AC-004. Plan closes this gap via explicit
  use-case-level check.
- Pattern (repository boundary identifier validation):
  `MongoWorkRepository.findBySlug` already implements this via
  `sanitizeSlugIdentifier`/`assertStringIdentifier` (confirmed in code).
  No repository change needed.
- Pattern (batch-purge composes single-item use case → `HttpError 404`
  from use-case layer): directly applicable, confirmed by
  `CreateWorkUseCase`'s `HttpError(409, ...)` usage. New
  `GetWorkBySlugUseCase` follows the same convention.

## Proposed Solution

Key decision: the visibility check (published + not soft-deleted) lives
in the USE CASE, not the repository. `findBySlug`'s Mongo filter stays
untouched (spec's Out-of-Scope forbids changing it, since
`CreateWorkUseCase` relies on it for uniqueness checks against drafts
too). `GetWorkBySlugUseCase` calls `workRepository.findBySlug(slug)` then
explicitly checks `work.status === 'published'` and
`work.deletedAt == null`, throwing `HttpError(404, ...)` otherwise. No
new port, no new repository method, no new Mongoose query — minimal
diff, consistent with `.claude/rules/usecases.md`.

## Technical Decisions

### Decision

Perform the published/not-deleted visibility check inside a new
`GetWorkBySlugUseCase`, not inside `WorkRepositoryPort.findBySlug` or
`MongoWorkRepository`.

### Reason

`findBySlug` is shared with `CreateWorkUseCase`'s slug-uniqueness check,
which must still match against drafts. Changing the repository filter
would break that existing behavior. Keeping the visibility rule in the
use case isolates the new business rule from the shared repository
method.

### Alternatives Considered

- Add a `status`/visibility filter parameter to `findBySlug` at the
  repository level: rejected — would require updating the port,
  implementation, and `CreateWorkUseCase` call site for a rule that only
  applies to the new public endpoint.
- Add a new repository method (e.g. `findPublishedBySlug`): rejected —
  unnecessary new abstraction/port surface for a rule expressible in a
  few lines at the use-case layer, and inconsistent with the
  batch-purge/`CreateWorkUseCase` precedent of enforcing such rules in
  the use case.

### Trade-offs

Two code paths now read `findBySlug`'s result with different
interpretations (uniqueness check vs. public visibility check), so
future readers must understand that `findBySlug` itself does not encode
"publicly visible." This is mitigated by keeping the check explicit and
localized in `GetWorkBySlugUseCase`.

## Execution Flow

```
GET /works/:slug
    ↓
src/infra/http/routes/work.routes.ts (no authMiddleware)
    ↓
WorkController.getBySlug
    ↓
requireStringRouteParam(request.params.slug, 'slug')
    ↓
GetWorkBySlugUseCase.execute(slug)
    ↓
WorkRepositoryPort.findBySlug(slug)  (unchanged Mongo filter)
    ↓
use-case checks status === 'published' && deletedAt == null
    ↓
200 + Work JSON   OR   HttpError(404) → next(error) → errorHandlerMiddleware
```

## Files

### Files to Create

- `src/usecase/get-work-by-slug.use-case.ts`
- `test/unit/usecase/get-work-by-slug.use-case.spec.ts`

### Files to Modify

- `src/presentation/controllers/work.controller.ts`
- `src/infra/http/routes/work.routes.ts`
- `src/infra/docs/works.swagger.ts`
- `test/unit/presentation/controllers/work.controller.spec.ts`
- `test/unit/infra/http/routes/work.routes.spec.ts`
- `test/e2e/works.e2e-spec.ts`

### Files Explicitly Not Changed

- `src/core/domain/repositories/work.repository.ts` (port unchanged)
- `src/infra/repositories/mongo-work.repository.ts` (unchanged)
- `src/infra/server.ts` / `src/infra/config/routes.ts` (composition
  already passes `workRepository` into `buildWorkRouter`)

## File-by-File Changes

1. **NEW** `src/usecase/get-work-by-slug.use-case.ts`: class
   `GetWorkBySlugUseCase`, constructor
   `(private readonly workRepository: WorkRepositoryPort)`.
   `async execute(slug: string): Promise<Work>`: calls
   `findBySlug(slug)`; if
   `!work || work.status !== 'published' || work.deletedAt` →
   `throw new HttpError(404, 'Trabalho não encontrado.')`; else return
   work. No slug format validation here (already enforced in
   `MongoWorkRepository.sanitizeSlugIdentifier`).

2. **MODIFY** `src/presentation/controllers/work.controller.ts`: import
   `GetWorkBySlugUseCase` and `requireStringRouteParam` (from
   `../helpers/route-param.helper`). Extend constructor with a third
   param `private readonly getWorkBySlugUseCase: GetWorkBySlugUseCase` —
   this is a breaking constructor-signature change; update every call
   site (route builder + `test/unit/presentation/controllers/work.controller.spec.ts`)
   in the same change. Add method:

   ```ts
   getBySlug = async (request, response, next) => {
     try {
       const slug = requireStringRouteParam(request.params.slug, 'slug');
       const work = await this.getWorkBySlugUseCase.execute(slug);
       response.status(200).json(work);
     } catch (error: unknown) {
       next(error);
     }
   };
   ```

   Keep the exact async-arrow + `catch (error: unknown) { next(error); }`
   convention already used by `create`/`list`.

3. **MODIFY** `src/infra/http/routes/work.routes.ts`: import
   `GetWorkBySlugUseCase`; instantiate
   `const getWorkBySlugUseCase = new GetWorkBySlugUseCase(workRepository);`;
   pass as third constructor arg to
   `new WorkController(createWorkUseCase, listWorksUseCase, getWorkBySlugUseCase)`;
   register `router.get('/:slug', workController.getBySlug);` — PUBLIC,
   no `authMiddleware`, no `requireAuthForDraftsMiddleware`. Placement:
   LAST route registration, after `GET '/:workId/comments'`:

   ```ts
   router.get('/', requireAuthForDraftsMiddleware, workController.list);
   router.post('/', authMiddleware, workController.create);
   router.post('/:workId/comments', commentController.create);
   router.get('/:workId/comments', commentController.listApproved);
   router.get('/:slug', workController.getBySlug); // NEW
   ```

   (Route shadowing with `/:workId/comments` is structurally impossible
   due to Express segment-count matching; last-position placement is
   defensive/documentation-of-intent only.)

4. **MODIFY** `src/infra/docs/works.swagger.ts`:
   - Fix `WorkResponse` schema: add `images` (array of objects: `id`,
     `url`, `publicId`, `alt`, `isCover`, `order`, `createdAt`,
     `updatedAt` — inline, mirroring `WorkImage` in `work.types.ts`; no
     separate named schema needed), `createdAt`
     (`type: string, format: date-time`), `updatedAt` (same),
     `deletedAt` (`type: string, format: date-time, nullable: true`).
   - Add new path `worksPaths['/works/{slug}']`: `get` — tag `Works`,
     summary/description noting it's public and returns a single
     published, non-deleted work by slug; `parameters`:
     `{ in: 'path', name: 'slug', required: true, schema: { type: 'string' } }`;
     `security: [{}]` (no auth variant exists for this endpoint);
     `responses`: `200` →
     `successResponse('Trabalho encontrado', '#/components/schemas/WorkResponse')`,
     `404` →
     `errorResponse('Nenhum trabalho publicado e não removido foi encontrado para o slug informado.')`.
   - No changes needed to `swaggerSingletonArray.ts` /
     `swagger.merge.ts` — new path key, no same-path multi-fragment
     merge needed.

5. **NO CHANGES** to: `src/core/domain/repositories/work.repository.ts`
   (port unchanged), `src/infra/repositories/mongo-work.repository.ts`
   (unchanged), `src/infra/server.ts` / `src/infra/config/routes.ts`
   (composition already passes `workRepository` into
   `buildWorkRouter`).

## Contract Impact

New: `GET /works/{slug}` → `200` with a `Work` JSON object (same shape
as one array item from `GET /works`), or `404` with `{ message: string }`
(standard `HttpError` shape from `errorHandlerMiddleware`). No change to
`GET /works` request/response contract, status codes, or
`includeDrafts` behavior. No schema/type change — `Work` type already
has every needed field.

`WorkController`'s constructor signature changes (adds required third
argument `getWorkBySlugUseCase`) — this is an internal composition-root
contract, not a public HTTP contract, but every instantiation site must
be updated atomically or the build/tests fail immediately.

## Persistence Impact

None. `WorkRepositoryPort.findBySlug` and its Mongo implementation are
unchanged. The new use case reads the existing `Work` domain object
returned by `findBySlug` and applies an in-memory visibility check; no
new query, index, or schema field is introduced.

## Security Impact

- Draft/soft-delete leak risk (primary concern of this task): closed by
  the use case's explicit `status`/`deletedAt` check, independent of
  `findBySlug`'s current filtering.
- Route shadowing: structurally impossible given Express segment-count
  matching; defensive placement documented.
- Constructor-signature break: `WorkController` gains a required third
  arg — must update `work.routes.ts` and `work.controller.spec.ts`
  atomically or build/tests fail immediately (fail-fast).
- No new dependency, no new middleware, no auth changes.
- CSRF/auth: N/A — this is a public, unauthenticated `GET` endpoint.

## Swagger Impact

- Fix pre-existing `WorkResponse` schema drift: add `images`,
  `createdAt`, `updatedAt`, `deletedAt` fields as detailed above.
- Add new path `GET /works/{slug}` to `src/infra/docs/works.swagger.ts`
  with `slug` path parameter, `security: [{}]`, `200` success response
  referencing `WorkResponse`, and `404` error response.
- No changes required to `swaggerSingletonArray.ts` or
  `swagger.merge.ts`.

## Testing Strategy

Test and validation strategy (NFR-004, `>= 80%` new/changed-code
coverage):

1. **NEW** `test/unit/usecase/get-work-by-slug.use-case.spec.ts` (mirrors
   `list-works.use-case.spec.ts`'s mock pattern): happy path (published,
   `deletedAt` null → resolves work); not found (`findBySlug` resolves
   undefined → rejects `HttpError 404`); draft (`status !== 'published'`,
   `deletedAt` null → rejects `HttpError 404`); soft-deleted (`deletedAt`
   non-null → rejects `HttpError 404`, defense-in-depth branch).
2. **MODIFY** `test/unit/presentation/controllers/work.controller.spec.ts`:
   update `createUseCaseMocks()` to include `getWorkBySlugUseCase` mock,
   pass to every `new WorkController(...)` call; add
   `describe('getBySlug', ...)`: valid slug + resolved work → `200` +
   `response.json(work)`; missing/blank `request.params.slug` →
   `next(expect.any(HttpError))`, use case not called; use case rejects
   `HttpError 404` → `next` called with that error, `response.status`
   not called.
3. **MODIFY** `test/unit/infra/http/routes/work.routes.spec.ts`: add
   assertion
   `expect(mockGet).toHaveBeenCalledWith('/:slug', expect.any(Function))`
   (no middleware arg) to prove no auth middleware is attached —
   verifies AC-007.
4. `src/infra/docs/works.swagger.ts` is declarative data — no unit test
   required unless the project already has a convention of asserting
   `openApiDocument` shape for other fragments (check
   `test/unit/infra/docs/*.spec.ts` at implementation time).
5. **E2E** (required per NFR-004/AC-008): add to
   `test/e2e/works.e2e-spec.ts` (reuse existing login/create-work
   helpers): `GET /works/:slug` for just-created published work → `200`,
   body matches AC-001 fields; `GET /works/does-not-exist-slug` → `404`;
   `GET /works/:slug` for a draft work (unauthenticated) → `404`, body
   does not leak draft fields; regression check that existing
   `GET /works` e2e scenarios still pass unmodified.

Run `npm test`, `npm run build`, `npm run test:e2e` after implementation,
per AC-008. No justified coverage exception anticipated —
`GetWorkBySlugUseCase` is small/pure/fully mockable,
`WorkController.getBySlug` is a thin adapter following the established
pattern.

## Risks

- Draft/soft-delete leak risk (primary): closed by use-case's explicit
  status/deletedAt check, independent of `findBySlug`'s current
  filtering.
- Route shadowing: structurally impossible given Express segment-count
  matching; defensive placement documented.
- Constructor-signature break: `WorkController` gains a required third
  arg — must update `work.routes.ts` and `work.controller.spec.ts`
  atomically or build/tests fail immediately (fail-fast).
- No new dependency, no new middleware, no auth changes.
- CSRF/auth: N/A — public unauthenticated GET.

## Implementation Steps

1. Create `GetWorkBySlugUseCase` in `src/usecase/get-work-by-slug.use-case.ts`.
2. Add its unit tests in `test/unit/usecase/get-work-by-slug.use-case.spec.ts`.
3. Extend `WorkController` with `getBySlug` and the new constructor
   parameter; update `test/unit/presentation/controllers/work.controller.spec.ts`
   in the same change.
4. Wire the use case and route in `src/infra/http/routes/work.routes.ts`;
   update `test/unit/infra/http/routes/work.routes.spec.ts`.
5. Fix `WorkResponse` schema drift and add the `/works/{slug}` path in
   `src/infra/docs/works.swagger.ts`.
6. Add e2e coverage in `test/e2e/works.e2e-spec.ts`.
7. Run `npm test`, `npm run build`, and `npm run test:e2e`; confirm all
   pass and that `GET /works` behavior is unaffected.

## Definition of Done Mapping

- AC-001 (published work by slug → 200 with full Work fields):
  `GetWorkBySlugUseCase` happy path + controller `getBySlug` + e2e test.
- AC-002 (unknown slug → 404): `GetWorkBySlugUseCase` not-found branch +
  e2e test.
- AC-003 (draft slug, unauthenticated → 404): `GetWorkBySlugUseCase`
  status check + e2e test.
- AC-004 (draft slug, authenticated → still 404, no admin bypass): no
  auth middleware on the route + use-case check applies regardless of
  `request.auth` + e2e test.
- AC-005 (soft-deleted slug → 404): `GetWorkBySlugUseCase` `deletedAt`
  check (defense-in-depth) + unit test.
- AC-006 (`GET /works` behavior unchanged): no changes to `list`/
  `ListWorksUseCase`/`findBySlug`'s Mongo filter; regression e2e check.
- AC-007 (endpoint is public, no auth middleware): route registration
  without `authMiddleware`/`requireAuthForDraftsMiddleware` + route
  test asserting no middleware argument.
- AC-008 (validation commands pass): `npm test`, `npm run build`,
  `npm run test:e2e` run after implementation.

## Open Non-Blocking Questions

None. The architect reported no blocking questions.
