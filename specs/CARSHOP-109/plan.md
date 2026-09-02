# CARSHOP-109 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-109/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Add real, binary-content (magic-byte/structural) validation to the
work-image upload pipeline so that a client cannot bypass image-type
restrictions by declaring an allowed Content-Type while sending
non-image, truncated, or mismatched-type content. Must preserve the
existing 5 MB / single-file limits, guarantee temp-file cleanup on every
rejection path, define an explicit declared-vs-detected coherence rule,
and keep the public HTTP contract (status codes, response shape)
consistent with what already exists for MIME rejection (415). Acceptance
criteria AC-001 through AC-009 in `specs/CARSHOP-109/spec.md` are all
satisfied by this design; traceability is preserved 1:1 with the FR/AC
table already in the spec.

## Current Architecture

Confirmed current flow, `infra/http/routes/work-image.routes.ts`:

```
authMiddleware
  → uploadMiddleware.single('file')   (src/infra/middleware/upload.middleware.ts — Multer, declared-mimetype fileFilter only, 5MB/1-file limits, diskStorage → tmp/uploads)
  → normalizeUploadError               (local function in work-image.routes.ts — NOT error-handler.middleware.ts — translates Multer/fileFilter errors into HttpError(413/400/415); forwards HttpError untouched)
  → controller.upload                  (WorkImageController — throws HttpError(400) if !request.file)
      → UploadWorkImageUseCase.execute (reads file via fs.readFile, uploads to Cloudinary via ImageStoragePort, unlinks temp file in finally)
```

Correction to historical Obsidian note: `error-handler.middleware.ts`
only recognizes `HttpError`, `SyntaxError` w/ body, and
`entity.too.large` — that part is accurate. But for this route
specifically, `normalizeUploadError` already converts Multer/fileFilter
errors to `HttpError` before they reach the generic handler. The design
reuses this existing seam instead of inventing a new error shape, so no
change to `error-handler.middleware.ts` is required.

## Proposed Solution

### 1. Where the check runs

Real magic-byte/structural inspection requires actual bytes, only fully
available after Multer writes the file to `tmp/uploads` (`fileFilter`
only sees metadata as the stream starts). The new check is a separate
middleware step inserted after `uploadMiddleware.single('file')` and
before `normalizeUploadError`. `upload.middleware.ts` itself is NOT
modified — existing declared-MIME filter, size limit, file-count limit
stay as-is.

New route chain:

```
authMiddleware → uploadMiddleware.single('file') → imageContentValidationMiddleware (NEW) → normalizeUploadError → controller.upload
```

### 2. Dependency decision (NFR-002 audit)

No new npm dependency. `file-type` was evaluated and rejected: since v17
it's ESM-only (forces `await import()` interop in this CommonJS
codebase — unjustified friction); it only inspects header bytes, not
structural completeness (PNG IEND, JPEG EOI, WebP RIFF chunk-size
consistency), which FR-003 (truncation detection) requires regardless,
reducing the dependency's marginal value. `typescript.md` instructs not
to add a library when the platform solves it simply and safely — for
exactly 3 well-documented formats, magic-byte + trailing-structure
checks are simple, boundable, fully unit-testable pure functions with
zero added supply-chain/license/maintenance burden.

Chosen approach: dependency-free pure function
`detectImageMimeType(buffer: Buffer)`:

- JPEG: first 3 bytes `FF D8 FF` (SOI) AND last 2 bytes `FF D9` (EOI).
- PNG: first 8 bytes match PNG signature
  `89 50 4E 47 0D 0A 1A 0A` AND last 12 bytes match IEND chunk footer
  `00 00 00 00 49 45 4E 44 AE 42 60 82`.
- WebP: bytes 0-3 `"RIFF"`, bytes 8-11 `"WEBP"`, fourCC at bytes 12-15 ∈
  `{"VP8 ", "VP8L", "VP8X"}`, and little-endian RIFF size field
  (bytes 4-7) consistent with `buffer.length` (`riffSize + 8 ===
  buffer.length`, tolerating standard 1-byte RIFF pad, i.e. accept
  `riffSize + 8` or `riffSize + 9`).
- Anything else → `null`.

Document in code comments that this validates signature/structural
framing, not full codec-level decodability (matches spec scope —
excludes malware/deep-content scanning).

### 3. Coherence rule (FR-004/AC-004)

Reject on any declared-vs-detected mismatch (spec option a), including
when both types are individually allowed. Justification: matches Notion
DoD "Arquivo com MIME falso é rejeitado" — a declared MIME not matching
true content is false, independent of whether the true content is also
an allowed format. Lower architectural footprint: the alternative
(proceed using detected type as authoritative) would require rewiring
the detected MIME type through `WorkImageController` →
`UploadWorkImageUseCase.execute` → `ImageStoragePort.upload` (currently
`mimeType: input.mimeType` is the client-declared value forwarded as-is
to Cloudinary, `upload-work-image.use-case.ts` ~line 45) — unnecessary
scope expansion. Reject-on-mismatch keeps the change scoped to the
middleware layer and is simpler to test deterministically.

### 4. Error shape and cleanup

On any rejection (invalid content, truncated content, or
declared/detected mismatch): delete the temp file via
`fs.promises.unlink(request.file.path)` in a best-effort try/catch
(mirrors existing pattern in `upload-work-image.use-case.ts`'s finally
block), then call
`next(new HttpError(415, 'Tipo de arquivo não suportado. Envie JPEG, PNG ou WebP.'))`.
Reuses exact same status code/message already used by
`normalizeUploadError` for declared-MIME-rejection, keeping the public
contract identical (FR-009) — no new status code, no new response
shape. Because `HttpError` is thrown directly,
`normalizeUploadError`'s existing
`if (error instanceof HttpError) { next(error); return; }` branch
forwards it untouched, and `error-handler.middleware.ts`'s existing
`HttpError` branch renders it. No modification to
`error-handler.middleware.ts` needed.

If `!request.file`: middleware calls `next()` immediately, unchanged
behavior (`WorkImageController` still produces existing `HttpError(400)`).

Any unexpected I/O error while reading the file (not "file missing") is
forwarded via `next(error)` as-is — accepted residual case, falls to
generic 500 handler, consistent with other unexpected infra failures.

## Technical Decisions

### Decision

No new npm dependency; implement dependency-free pure function
`detectImageMimeType(buffer: Buffer)` for JPEG/PNG/WebP magic-byte and
structural (trailer/RIFF-size) validation.

### Reason

`file-type` (evaluated) is ESM-only since v17 (CommonJS interop
friction) and only checks header bytes, not structural completeness
required by FR-003. For exactly 3 well-documented formats, boundable
pure functions are simple, fully unit-testable, and add zero
supply-chain/license/maintenance burden, per `typescript.md`'s guidance
against unnecessary dependencies.

### Alternatives Considered

- `file-type` npm package — rejected (ESM-only interop friction; header-only
  detection insufficient for truncation detection).

### Trade-offs

Hand-rolled detection is scoped to exactly 3 formats and must be kept in
sync manually if new formats are ever added; in exchange it avoids a new
dependency and is fully synchronous/CommonJS-compatible.

### Decision

Reject-on-mismatch coherence rule for declared vs. detected MIME type
(FR-004/AC-004), even when both are individually allowed.

### Reason

Matches Notion DoD "Arquivo com MIME falso é rejeitado." Keeps the
change scoped to the middleware layer; avoids rewiring the detected MIME
type through the controller/use case/storage port.

### Alternatives Considered

- Proceed using detected type as authoritative when declared/detected
  disagree but detected type is allowed — rejected as unnecessary scope
  expansion requiring changes to `WorkImageController` →
  `UploadWorkImageUseCase.execute` → `ImageStoragePort.upload`.

### Trade-offs

Slightly stricter than necessary in the narrow case where both declared
and detected types are individually valid images but disagree; accepted
because it matches DoD intent and keeps the implementation simple and
deterministic.

### Decision

Insert `imageContentValidationMiddleware` as a new middleware between
`uploadMiddleware.single('file')` and `normalizeUploadError`, reusing the
existing `HttpError(415, ...)` shape already used for declared-MIME
rejection.

### Reason

Real content bytes are only available after Multer writes the file to
disk. Reusing the existing error shape/status code preserves the public
contract (FR-009) and requires no change to
`error-handler.middleware.ts`.

### Alternatives Considered

- Modifying `upload.middleware.ts`'s `fileFilter` — rejected, since
  `fileFilter` only sees metadata as the stream starts, not full file
  bytes.

### Trade-offs

None material; this is an additive middleware insertion with no
structural changes to existing components.

## Execution Flow

```
authMiddleware → uploadMiddleware.single('file') → imageContentValidationMiddleware (NEW) → normalizeUploadError → controller.upload → UploadWorkImageUseCase.execute → ImageStoragePort (Cloudinary)
```

## Files

### Files to Create

1. `src/infra/middleware/image-content-validation.middleware.ts` — pure
   function `detectImageMimeType(buffer: Buffer)` returning
   `(typeof ALLOWED_IMAGE_MIME_TYPES)[number] | null` (imports the type
   from `upload.middleware.ts`, no duplication) + exported
   `imageContentValidationMiddleware: RequestHandler` implementing the
   read/detect/compare/cleanup/next logic described above.
2. `test/unit/infra/middleware/image-content-validation.middleware.spec.ts`
   — unit tests for `detectImageMimeType` (valid/truncated/garbage
   buffers for all 3 formats) and for the middleware (no-file
   passthrough; valid+matching → `next()`; invalid/truncated/mismatched
   → `next(HttpError(415,...))` + `fs.promises.unlink` called with
   `request.file.path`, mocking fs the same way
   `test/unit/usecase/upload-work-image.use-case.spec.ts` already does).

### Files to Modify

1. `src/infra/http/routes/work-image.routes.ts` — import
   `imageContentValidationMiddleware` and insert into the
   `POST '/:workId/images'` chain between `uploadMiddleware.single('file')`
   and `normalizeUploadError`. No change to `normalizeUploadError` itself.
2. `src/infra/docs/admin-works.swagger.ts` — add a bullet to the existing
   description array for `POST /admin/works/{workId}/images` clarifying
   that real binary content is inspected (not only declared
   Content-Type) and that a declared/detected mismatch is rejected with
   the existing 415 response. No schema/status/shape changes — the 415
   `errorResponse` entry already exists and is reused verbatim.
3. `test/unit/infra/http/routes/work-image.routes.spec.ts` — update
   wiring assertion (currently expects 5-arg `mockPost` call with
   `normalizeUploadError` at index 3) to account for new middleware now
   occupying index 3 and `normalizeUploadError` shifting to index 4;
   add/adjust helper to extract new middleware reference for direct
   testing if desired.
4. `test/e2e/work-image-upload.e2e-spec.ts` — extend (not replace):
   (a) replace/upgrade `FAKE_JPEG_BUFFER` with a fixture that also has a
   correct EOI trailer (current 12-byte fixture has no EOI and will
   legitimately start failing once structural validation exists —
   expected, must be fixed as part of this task); (b) add
   genuinely-valid minimal PNG and WebP fixtures per the byte layout
   above and two new "accepts a valid PNG/WebP upload" tests (AC-003,
   AC-008); (c) add a spoofed-content test: declared image/jpeg/allowed
   MIME, body is plain text (AC-001); (d) add a truncated-image test:
   declared allowed MIME, body is valid-header-but-incomplete image,
   e.g. PNG signature without IEND (AC-002); (e) add a mismatch test:
   declared image/png, body is a genuinely valid JPEG buffer, expect 415
   (AC-004); confirm existing `imageStorage.upload` spy is NOT called in
   all new rejection cases (mirrors existing uploadSpy assertions),
   satisfying AC-009/NFR-001.

No changes to: `upload.middleware.ts`, `error-handler.middleware.ts`,
`WorkImageController`, `UploadWorkImageUseCase`, `ImageStoragePort`,
`cloudinary-storage.service.ts`, `package.json`.

## Contract Impact

No new endpoint, no new status code, no new response shape.
`POST /admin/works/{workId}/images` keeps its existing
201/400/401/404/413/415/500 response set; 415 is now reachable via a new
rejection path in addition to the existing declared-MIME-not-allowed
path, using the identical message.

## Persistence Impact

None — no schema or persistence changes.

## Security Impact

- Closes the spoofed-Content-Type bypass gap described in the spec.
- Validation occurs strictly before any Cloudinary call (NFR-001).
- Consistent with `security.md`'s upload requirements (size limit,
  explicit MIME allow-list, safe temp cleanup — none weakened).
- `ALLOWED_IMAGE_MIME_TYPES`, `MAX_IMAGE_SIZE_BYTES`, and single-file
  limit are untouched (NFR-004).

## Swagger Impact

`src/infra/docs/admin-works.swagger.ts` — add a description bullet for
`POST /admin/works/{workId}/images` clarifying real binary-content
inspection and the declared/detected mismatch rejection behavior. No
schema, status code, or response-shape changes; the existing 415
`errorResponse` entry is reused verbatim.

## Testing Strategy

New production code confined to one new small file plus a one-line
wiring change and a documentation string change (no logic) — all
reasonably 100% unit-testable via pure-function tests and mocked-fs
middleware tests (mirroring `upload-work-image.use-case.spec.ts`
pattern), so the `>= 80%` new/changed-code unit-test coverage target
defined in `.claude/rules/testing.md` is expected to be met without
exception.

Run: `npx jest test/unit/infra/middleware/image-content-validation.middleware.spec.ts`,
then `npm test`, `npm run build`, then `npm run test:e2e`. Map tests to
AC-001…AC-009 explicitly in the tester's report.

## Risks

- Fixture compatibility risk: pre-existing e2e fixture
  `FAKE_JPEG_BUFFER` is not structurally complete (no EOI) and will
  start being rejected once this validation ships — intended per
  AC-003/AC-008 but must be fixed in the same change or two
  currently-passing e2e tests will regress to failing.
- WebP RIFF-size tolerance: real-world encoders may pad odd-length
  chunks by 1 byte; detector must tolerate `riffSize + 8` or
  `riffSize + 9` to avoid false rejections of genuinely valid WebP
  files.
- Security: closes exactly the gap described (spoofed Content-Type
  bypass), keeps validation strictly before any Cloudinary call
  (NFR-001), consistent with `security.md`'s upload requirements (size
  limit, explicit MIME allow-list, safe temp cleanup — none weakened).
- Compatibility: `ALLOWED_IMAGE_MIME_TYPES`, `MAX_IMAGE_SIZE_BYTES`, and
  single-file limit are untouched (NFR-004).
- Introducing a new dependency for magic-byte/structural validation
  would have been a meaningful architectural/dependency decision
  requiring dependency audit (NFR-002); mitigated by the no-new-
  dependency decision above.

## Implementation Steps

1. Create `src/infra/middleware/image-content-validation.middleware.ts`
   with `detectImageMimeType(buffer: Buffer)` and
   `imageContentValidationMiddleware`.
2. Wire the new middleware into
   `src/infra/http/routes/work-image.routes.ts` between
   `uploadMiddleware.single('file')` and `normalizeUploadError`.
3. Update `src/infra/docs/admin-works.swagger.ts` description bullet for
   the upload endpoint.
4. Add unit tests in
   `test/unit/infra/middleware/image-content-validation.middleware.spec.ts`.
5. Update `test/unit/infra/http/routes/work-image.routes.spec.ts` wiring
   assertions for the new middleware position.
6. Extend `test/e2e/work-image-upload.e2e-spec.ts` with corrected JPEG
   fixture, new PNG/WebP valid fixtures, spoofed-content test,
   truncated-image test, and mismatch test, per AC-001 through AC-009.
7. Run `npx jest test/unit/infra/middleware/image-content-validation.middleware.spec.ts`,
   then `npm test`, `npm run build`, then `npm run test:e2e`.

## Definition of Done Mapping

- "Arquivo com MIME falso é rejeitado" → FR-002/FR-003/FR-004 →
  AC-001, AC-002, AC-004.
- Existing size/file-count limits preserved → FR-005/FR-006 → AC-005,
  AC-006.
- Temp file cleanup on every rejection path → FR-007/NFR-003 → AC-007.
- Valid images of allowed types accepted unchanged → FR-008 → AC-003.
- Public contract preserved (status codes/response shape) → FR-009 →
  AC-003, AC-005, AC-006.
- No dependency added without audit → NFR-002 → satisfied by the
  no-new-dependency decision.
- No real Cloudinary network calls in tests → AC-009/NFR-001.

## Open Non-Blocking Questions

None — the architect resolved both non-blocking questions raised in
`spec.md` (library/parsing approach: no new dependency, hand-rolled pure
functions; declared-vs-detected mismatch resolution: reject-on-mismatch).
