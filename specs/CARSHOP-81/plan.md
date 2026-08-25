# CARSHOP-81 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-81/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Ensure work images are stored exclusively in Cloudinary (external storage),
Mongo persists only `{url, publicId, alt, isCover, order}` metadata, and
both individual image deletion and work hard-delete cascade into Cloudinary
cleanup — without leaving orphaned files/records under normal operation.
Acceptance criteria AC-001…AC-009 as listed in `specs/CARSHOP-81/spec.md`.

## Existing Knowledge (Obsidian)

`knowledge-reader` returned no relevant historical knowledge. Repository is
the sole source of truth for this plan.

## Current Architecture

### Already correct — no change needed

- `src/core/domain/application/Work/work.types.ts` — `WorkImage` domain
  type already has `publicId` and `order`.
- `src/data/models/work.model.ts` — actively wired `Work` schema embeds
  `images[]` with `id`, `url`, `publicId`, `alt`, `isCover`, `order`, plus a
  Mongoose validator enforcing at most one `isCover: true`. No raw binary
  field exists. Satisfies AC-002 and most of FR-002/FR-007 already.
- `src/core/domain/application/Storage/image-storage.port.ts`
  (`ImageStoragePort`) and
  `src/infra/gateway/cloudinary/cloudinary-storage.service.ts` — correctly
  isolate Cloudinary specifics (`upload(buffer, ...)`, `delete(publicId)`),
  treating "not found" as success (idempotent), satisfying NFR-004.
- `src/infra/middleware/upload.middleware.ts` — already enforces 5 MB
  limit and JPEG/PNG/WebP allow-list via Multer limits/fileFilter,
  satisfying FR-008/FR-009 at the validation-logic level.
- `MongoWorkRepository.addImage` already flips other images' `isCover` to
  `false` before pushing a new cover image — FR-007/AC-008 already
  satisfied for the upload path.
- `WorkRepositoryPort.hardDelete` already deletes the `Work` document and
  its comments (`CommentModel.deleteMany`) in one call — reusable as-is for
  the Mongo side of FR-006.

### Confirmed gaps

1. Broken upload use case (blocks FR-001/FR-002/AC-001 functionally).
   `src/usecase/upload-work-image.use-case.ts` calls
   `this.imageStorage.upload(input.filePath)` — a string — but
   `ImageStoragePort.upload()` requires
   `UploadImageInput { buffer, mimeType, originalName, folder }`. Type
   mismatch; use case never reads the Multer-saved temp file into a buffer,
   never passes `folder`. `src/presentation/controllers/work-image.controller.ts`
   passes `request.file.path`, consistent with the broken use case, not
   with the port. Must be fixed together.
2. No temp-file cleanup anywhere. `uploadMiddleware` uses Multer disk
   storage (`dest: 'tmp/uploads'`). Nothing ever unlinks these files.
   Violates `security.md` on both success and failure paths.
3. FR-004 compensating action missing. If `workRepository.addImage(...)`
   fails after a successful Cloudinary upload, nothing deletes the
   just-uploaded remote file — orphan risk (NFR-002).
4. FR-005/AC-004 not implemented. `src/usecase/delete-work-image.use-case.ts`
   exists but is empty. No controller method, no route.
5. FR-006/AC-005 not implemented and not reachable. No use case,
   controller, or route calls `WorkRepositoryPort.hardDelete`. No
   admin-facing way to hard-delete a work at all. `hardDeleteData` (deletes
   only the `Work` doc, no comments) exists but is unused and must NOT be
   used as-is (skips comment cleanup, would regress existing tested
   behavior of `hardDelete`).
6. Swagger/error-handler mismatch (AC-006/AC-007). `admin-works.swagger.ts`
   already documents 413/415 for upload, but
   `error-handler.middleware.ts` only special-cases `HttpError` and JSON
   `SyntaxError`. Multer's `MulterError` (`LIMIT_FILE_SIZE`) and the custom
   `fileFilter` `Error` both fall through to a generic 500. Contradicts the
   committed contract; weakens AC-006/AC-007.
7. Legacy/dead code confirmed, not to be touched:
   `src/data/models/work-image.model.ts` (`work_images` collection) never
   referenced — dead duplicate.
   `src/core/domain/application/Gateway/cloudinary/cloudinary-storage.service.ts`
   is the known legacy duplicate. `src/usecase/set-cover-image.use-case.ts`
   is also empty; no FR/AC requires it — deliberate scope decision to leave
   it empty.

## Proposed Solution

### A. Fix `UploadWorkImageUseCase` (FR-001–FR-004, AC-001–AC-003)

- Change constructor/execute input to accept Multer file info needed to
  build `UploadImageInput`: read the temp file from disk into a Buffer
  (`fs.promises.readFile(filePath)`), pass `mimeType`, `originalName`, and
  `folder` (suggest `carshop/works/${workId}`, matching the legacy
  adapter's `carshop/works` convention).
- On success: call `imageStorage.upload(...)`, then
  `workRepository.addImage(...)`.
- Compensating action (FR-004/NFR-002): if `addImage` throws, best-effort
  call `imageStorage.delete(uploadedImage.publicId)` inside a try/catch
  that swallows/logs the secondary failure (never mask the original
  error), then rethrow the original error mapped to an `HttpError` (500).
- Temp file cleanup: in a `finally` block, always
  `fs.promises.unlink(filePath)` best-effort, without throwing if the file
  is already gone.
- Keep the use case free of Express/Multer types per `usecases.md`.
  Recommendation: keep `filePath` as input and do the disk read + cleanup
  inside the use case; do not leak `Express.Multer.File` into the use case
  signature.

### B. Fix upload error mapping (AC-006/AC-007, NFR-003)

- In `work-image.routes.ts`, wrap `uploadMiddleware.single('file')` with a
  small adapter/error-normalizing middleware right after it that
  translates:
  - `multer.MulterError` code `LIMIT_FILE_SIZE` →
    `HttpError(413, 'A imagem ultrapassa o limite de 5 MB.')`
  - custom `fileFilter` `Error` (invalid mime type) →
    `HttpError(415, 'Tipo de arquivo não suportado. Envie JPEG, PNG ou WebP.')`
  - any other Multer error → `HttpError(400, ...)`

  before calling `next(mappedError)`. Keeps Multer knowledge in infra
  (route-level).

### C. Implement single image delete (FR-005/AC-004)

- Add to `WorkRepositoryPort`: `removeImage(workId, imageId): Promise<void>`
  — implemented in `MongoWorkRepository` via `$pull` on `images` matching
  `{ id: imageId }`, scoped by `{ id: workId }`.
- Implement `src/usecase/delete-work-image.use-case.ts`:
  `execute({ workId, imageId })`: `findById(workId)` → 404 if missing; find
  image in `work.images` by `id` → 404 if missing; call
  `imageStorage.delete(image.publicId)`; call
  `workRepository.removeImage(workId, imageId)`; return
  `{ success: true }` (mirrors `DeleteCommentUseCase` pattern).
- Add `WorkImageController.delete` handler (validate `workId`/`imageId` via
  `requireStringRouteParam`), call use case, respond 200.
- Add route `DELETE /:workId/images/:imageId` in `work-image.routes.ts`,
  behind `authMiddleware`.
- Swagger: add delete operation to
  `/admin/works/{workId}/images/{imageId}` in `admin-works.swagger.ts`
  (new path key) with 200/401/404/500 responses, reusing
  `bearerSecurity`/`successResponse`/`errorResponse` helpers.

### D. Implement work hard-delete cascade (FR-006/AC-005)

- New `src/usecase/hard-delete-work.use-case.ts`: `execute(workId)`:
  `findByIdIncludingDeleted(workId)` → 404 if missing. For each image in
  `work.images`, call `imageStorage.delete(image.publicId)`.
- Architectural decision: if any storage deletion throws a genuine error
  (Cloudinary's `delete()` already treats "not found" as success, so a
  thrown error means real provider failure), abort before touching Mongo
  and propagate `HttpError(502, 'Falha ao remover arquivos do armazenamento externo. Tente novamente.')`.
  Rationale: keeps Mongo record intact rather than deleting metadata while
  a file might still exist, best satisfies NFR-002, makes the operation
  safely retryable.
- On success of all storage deletions, call
  `workRepository.hardDelete(workId)` (existing method — deletes `Work`
  doc + comments; do NOT use `hardDeleteData`). Return `{ success: true }`.
- New `src/presentation/controllers/admin-work.controller.ts` with a
  single `hardDelete` handler (thin, mirrors `AdminCommentController.delete`).
- New `src/infra/http/routes/admin-work.routes.ts` exposing
  `DELETE /:workId`, composing
  `HardDeleteWorkUseCase(workRepository, imageStorage)`, behind
  `authMiddleware`.
- Composition: mount this router at the same base path in
  `src/infra/config/routes.ts`:

  ```ts
  app.use('/admin/works', buildAdminWorkRouter(dependencies.workRepository, dependencies.imageStorage, dependencies.sessionStore, dependencies.tokenService));
  app.use('/admin/works', buildWorkImageRouter(...)); // existing
  ```

  No new dependency needs to be threaded into `createApp()` —
  `workRepository` and `imageStorage` already available in
  `src/infra/server.ts`.
- Swagger: new path `/admin/works/{workId}` with delete operation
  (200/401/404/502 responses) in `admin-works.swagger.ts`.

### E. No changes required

`ImageStoragePort`, `CloudinaryStorageService`, `WorkImage` domain type,
`work.model.ts` schema, `addImage` cover-flip logic, upload size/type
limits — all already meet the spec. Do not modify
`src/data/models/work-image.model.ts`,
`src/core/domain/application/Gateway/cloudinary/*`, or
`src/usecase/set-cover-image.use-case.ts`.

## Technical Decisions

### Decision

Compensating delete + finally-block temp-file cleanup inside
`UploadWorkImageUseCase`, keeping `filePath` (not a Multer file object) as
the use case input.

### Reason

Prevents orphaned Cloudinary files on Mongo failure (FR-004/NFR-002) and
orphaned temp files on disk (security.md), while keeping the use case free
of Express/Multer types per `usecases.md`.

### Alternatives Considered

Passing the Multer file object directly into the use case (rejected —
leaks infra types into the use case layer). Doing cleanup at the
controller layer instead of the use case (rejected — controller would then
need to know about compensating storage deletes, mixing concerns).

### Trade-offs

Use case still receives a filesystem path, which is a minor infra leak,
but is deemed acceptable and consistent with the existing (broken) design
being repaired rather than redesigned from scratch.

---

### Decision

Hard-delete a work aborts before touching Mongo if any Cloudinary deletion
throws a genuine (non-"not found") error, returning `HttpError(502)`.

### Reason

Keeps Mongo record intact rather than deleting metadata while a file might
still exist in external storage, best satisfies NFR-002, and makes the
operation safely retryable.

### Alternatives Considered

Best-effort deletion that proceeds with Mongo hard-delete regardless of
storage failures, logging the failure separately (this was the
non-blocking open question left in the spec for architectural judgment).

### Trade-offs

A work can become "stuck" (undeletable) if Cloudinary is persistently
unreachable. This is an intentional, safer trade-off but should be flagged
to the coordinator/user in case product wants best-effort deletion
instead.

---

### Decision

Multer error normalization (413/415/400 mapping) is implemented as a
route-level adapter middleware placed right after
`uploadMiddleware.single('file')`, not inside the global error handler.

### Reason

Keeps Multer-specific knowledge in infra/route layer, consistent with
`architecture.md`'s direction-of-dependency rule, while still producing the
already-documented Swagger contract (413/415).

### Alternatives Considered

Adding Multer-specific handling directly to
`error-handler.middleware.ts` (rejected — would import Multer types into a
generic, feature-agnostic middleware).

### Trade-offs

None significant; slightly more boilerplate at the route level.

## Execution Flow

1. Fix `UploadWorkImageUseCase` (buffer read, folder, compensating delete,
   temp-file cleanup) and its controller wiring.
2. Add Multer error-normalizing middleware in `work-image.routes.ts`.
3. Add `removeImage` to `WorkRepositoryPort` and `MongoWorkRepository`.
4. Implement `DeleteWorkImageUseCase`, controller delete handler, and
   `DELETE /:workId/images/:imageId` route.
5. Implement `HardDeleteWorkUseCase`, `AdminWorkController`,
   `admin-work.routes.ts`, and mount it in `src/infra/config/routes.ts`.
6. Update `admin-works.swagger.ts` with the two new path operations.
7. Add/extend unit tests for all changed and new files.
8. Run targeted specs, then `npm test` and `npm run build`.

## Files

### Files to Create

- `src/usecase/hard-delete-work.use-case.ts`
- `src/presentation/controllers/admin-work.controller.ts`
- `src/infra/http/routes/admin-work.routes.ts`
- `test/unit/usecase/upload-work-image.use-case.spec.ts`
- `test/unit/usecase/delete-work-image.use-case.spec.ts`
- `test/unit/usecase/hard-delete-work.use-case.spec.ts`
- `test/unit/presentation/controllers/work-image.controller.spec.ts`
- `test/unit/presentation/controllers/admin-work.controller.spec.ts`
- `test/unit/infra/http/routes/work-image.routes.spec.ts` (or equivalent
  route-level supertest spec)
- `test/unit/infra/gateway/cloudinary/cloudinary-storage.service.spec.ts`
  (if not already covered)

### Files to Modify

- `src/usecase/upload-work-image.use-case.ts`
- `src/presentation/controllers/work-image.controller.ts`
- `src/infra/http/routes/work-image.routes.ts`
- `src/core/domain/repositories/work.repository.ts`
- `src/infra/repositories/mongo-work.repository.ts`
- `src/usecase/delete-work-image.use-case.ts` (currently empty)
- `src/infra/config/routes.ts`
- `src/infra/docs/admin-works.swagger.ts`
- `test/unit/infra/repositories/mongo-work.repository.spec.ts` (extend for
  `removeImage`)

## Contract Impact

New/changed endpoints (all under existing `/admin/works` base, existing
Bearer-auth model, no CSRF needed since no cookies involved — consistent
with `admin-comment.routes.ts` precedent):

- `DELETE /admin/works/:workId/images/:imageId` → 200 `{ success: true }`
  / 401 / 404 / 500
- `DELETE /admin/works/:workId` → 200 `{ success: true }` / 401 / 404 / 502
- `POST /admin/works/:workId/images` — unchanged contract (already
  documented 201/400/401/404/413/415/500), but 413/415 will now actually
  be returned instead of 500.

No breaking changes to existing response shapes. `publicId`/`order`
already present in the persisted/returned Work/WorkImage shape
(NFR-003 compliant).

## Persistence Impact

- `WorkRepositoryPort` gains `removeImage(workId, imageId): Promise<void>`.
- `MongoWorkRepository.removeImage` implemented via `$pull` on
  `images` matching `{ id: imageId }`, scoped by `{ id: workId }`.
- `hardDelete` reused unchanged (deletes `Work` doc + comments via
  `CommentModel.deleteMany`); `hardDeleteData` remains unused/untouched.
- No schema changes to `work.model.ts` required — `publicId`/`order`
  already present.

## Security Impact

- Compensating deletes and hard-delete cascades must never include raw
  Cloudinary error payloads in `HttpError.details` (NFR-001) — wrap
  provider errors in a generic message.
- Multer disk storage + explicit unlink cleanup must handle the case where
  `readFile` throws (e.g., permission error) without leaving the temp file
  behind — cleanup must run in a `finally` block.
- No changes required to `.env`/`env.ts` — reuses existing `CLOUDINARY_*`
  variables.
- All new/changed routes remain behind `authMiddleware` (Bearer token),
  consistent with AC-009.

## Swagger Impact

- Add `DELETE /admin/works/{workId}/images/{imageId}` operation
  (200/401/404/500) to `admin-works.swagger.ts`, reusing
  `bearerSecurity`/`successResponse`/`errorResponse` helpers.
- Add `DELETE /admin/works/{workId}` operation (200/401/404/502) to
  `admin-works.swagger.ts`.
- No change needed to the existing upload operation's documented contract
  (413/415 already documented); implementation is being brought into
  alignment with it.

## Testing Strategy

- Unit tests for every new/changed file listed above, covering:
  - Happy path (upload, delete image, hard-delete work).
  - FR-003 (upload failure → no Mongo record, error returned).
  - FR-004 (Mongo failure after successful upload → compensating
    Cloudinary delete, original error propagated).
  - Temp-file cleanup on both success and failure paths.
  - 404 cases (missing work, missing image).
  - Storage-failure-aborts-hard-delete case (502, Mongo untouched).
  - Multer 413/415/400 mapping at the route level.
- Extend `mongo-work.repository.spec.ts` for `removeImage`.
- Run targeted specs individually first, e.g.:
  `npx jest test/unit/usecase/upload-work-image.use-case.spec.ts`
- Then run `npm test` and `npm run build`.
- `npm run test:e2e` should still pass (auth flow only, unaffected);
  extending e2e coverage to admin works/images is recommended but not
  currently an established pattern — treated as optional, not blocking.

## Risks

- Orphaned files in external storage with no corresponding Mongo record,
  if upload succeeds but metadata persistence fails (mitigated by
  compensating delete in section A).
- Orphaned Mongo metadata records with no corresponding file in external
  storage, if metadata persistence succeeds but is not correctly linked to
  the upload result.
- Failure to persist `publicId` would make it impossible to delete the
  corresponding file from external storage later (already mitigated —
  schema already persists `publicId`).
- Unvalidated file type or size could allow unsafe or excessively large
  uploads (already mitigated by existing Multer configuration; this plan
  fixes only the error-mapping gap).
- Aborting hard-delete on storage failure means a work can become "stuck"
  if Cloudinary is persistently unreachable; intentional, safer trade-off
  per NFR-002 — flagged to coordinator/user in case product wants
  best-effort instead.
- Multer disk storage + explicit unlink cleanup must handle the case where
  `readFile` throws without leaving the temp file behind — cleanup must
  run in a `finally` block.

## Implementation Steps

1. Fix `src/usecase/upload-work-image.use-case.ts`: read temp file into a
   buffer, build `UploadImageInput` with `mimeType`, `originalName`,
   `folder`, add compensating delete on Mongo failure, add `finally`-block
   temp-file cleanup.
2. Update `src/presentation/controllers/work-image.controller.ts` to match
   the corrected use case input; keep controller thin.
3. Add Multer error-normalizing middleware in
   `src/infra/http/routes/work-image.routes.ts`, mapping
   `LIMIT_FILE_SIZE` → 413, invalid mime type → 415, other Multer errors →
   400.
4. Add `removeImage(workId, imageId)` to
   `src/core/domain/repositories/work.repository.ts` and implement it in
   `src/infra/repositories/mongo-work.repository.ts` via `$pull`.
5. Implement `src/usecase/delete-work-image.use-case.ts` (404 on missing
   work/image, Cloudinary delete, Mongo `removeImage`).
6. Add `WorkImageController.delete` handler and
   `DELETE /:workId/images/:imageId` route in `work-image.routes.ts`,
   behind `authMiddleware`.
7. Implement `src/usecase/hard-delete-work.use-case.ts` (storage cascade
   with abort-on-failure, then `workRepository.hardDelete`).
8. Create `src/presentation/controllers/admin-work.controller.ts` and
   `src/infra/http/routes/admin-work.routes.ts` (`DELETE /:workId`, behind
   `authMiddleware`).
9. Mount `buildAdminWorkRouter` in `src/infra/config/routes.ts` alongside
   the existing `buildWorkImageRouter` mount at `/admin/works`.
10. Update `src/infra/docs/admin-works.swagger.ts` with the two new path
    operations.
11. Write/extend unit tests listed in "Files to Create"/"Files to Modify".
12. Run targeted specs, then `npm test` and `npm run build`.

## Definition of Done Mapping

- FR-001, FR-002, AC-001, AC-002 → Step 1 (buffer-based upload, no raw
  binary persisted, full metadata persisted).
- FR-003, AC-003 → Step 1 (upload failure → no Mongo record, error
  returned).
- FR-004, NFR-002, AC-003 → Step 1 (compensating delete on Mongo failure).
- FR-005, AC-004 → Steps 4–6 (single image delete cascades to storage +
  Mongo).
- FR-006, AC-005 → Steps 7–9 (hard-delete cascades to storage + Mongo,
  including comments via existing `hardDelete`).
- FR-007, AC-008 → Already satisfied by existing `addImage` cover-flip
  logic (no change needed).
- FR-008, FR-009, AC-006, AC-007 → Step 3 (Multer error normalization
  aligned with existing Swagger contract).
- NFR-001 → Steps 1, 7 (no raw provider error payloads surfaced).
- NFR-003 → No breaking contract changes; `publicId`/`order` already
  present.
- NFR-004 → Section E (no change needed; already isolated behind
  `ImageStoragePort`/`CloudinaryStorageService`).
- AC-009 → All new/changed routes behind existing `authMiddleware`.

## Open Non-Blocking Questions

- Should failed external-storage deletions during work hard delete block
  the deletion of the work's Mongo data, or should the work deletion
  proceed with the storage cleanup failure reported/logged separately?
  This plan adopts the abort-and-return-502 approach (see Technical
  Decisions) as the safer default; flagged to the coordinator/user in case
  product wants best-effort deletion instead.
- Exact allowed file types and maximum file size limit values are not
  restated in the source task beyond "validate file type/size on upload";
  existing project conventions (5 MB, JPEG/PNG/WebP) are reused unless
  clarified in Notion.
