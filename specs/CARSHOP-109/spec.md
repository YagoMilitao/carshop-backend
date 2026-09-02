# CARSHOP-109 — Validate Real Content of Uploaded Image Files

## Status

Ready

## Source

Notion Task:
CARSHOP-109

## Context

The work-image upload flow (`src/infra/middleware/upload.middleware.ts`,
used by the upload route described in `README.md`/`CLAUDE.md` as
`infra/http/routes/work-image.routes.ts` →
`uploadMiddleware` → `authMiddleware` → `WorkImageController` →
`UploadWorkImageUseCase` → `ImageStoragePort` (Cloudinary)) currently
validates only the client-declared `file.mimetype` via
`isAllowedImageMimeType`/`fileFilter` in Multer's configuration. The
declared MIME type is provided by the client and is not verified against
the file's actual binary content.

Because of this gap, a malicious or malformed request can declare an
allowed MIME type (e.g. `image/jpeg`) while the request body actually
contains text, HTML, an executable, or a truncated/corrupted image. Such
content currently passes the existing filter and reaches the temporary
filesystem (`tmp/uploads`) and, from there, would be forwarded to the
external image storage provider (Cloudinary) unchecked.

## Objective

Ensure that only files whose real, inspected content is a structurally
valid JPEG, PNG, or WebP image are accepted by the upload flow, while
preserving all existing upload safeguards: the 5 MB per-file size limit,
the single-file-per-request limit, and safe cleanup of any temporary file
on every error path (size-limit rejection, MIME/content rejection, or any
other upload failure).

## Functional Requirements

- FR-001: The upload flow must inspect the actual binary content of each
  uploaded file (not only the client-declared `Content-Type`/`mimetype`)
  to determine its real image type, using magic-byte/structural
  inspection appropriate for JPEG, PNG, and WebP.
- FR-002: A file whose declared MIME type is one of the allowed values
  (`image/jpeg`, `image/png`, `image/webp`) but whose real, inspected
  content is not a valid image of an allowed type (e.g. plain text, HTML,
  an executable/script, or another disallowed format) must be rejected.
- FR-003: A file whose real, inspected content is a truncated or
  otherwise structurally invalid/corrupted image (even if the first bytes
  superficially resemble a valid header) must be rejected.
- FR-004: The upload flow must apply an explicit, deterministic coherence
  rule relating the client-declared MIME type, the file extension (when
  the original filename is available and an extension is present), and
  the type detected from real content inspection. This rule must be
  documented as part of the implementation and must be one of:
  (a) reject the upload whenever the detected type does not match the
  declared MIME type (and/or extension, when relevant), or
  (b) proceed using the detected type as authoritative when the declared
  MIME type and/or extension disagree with it, provided the detected type
  is itself one of the allowed types.
  Whichever option is chosen, the behavior must be explicit, consistently
  applied, and covered by a test that exercises a declared/detected
  mismatch where both types are individually allowed (e.g. declared
  `image/png`, detected content is actually a valid JPEG).
  Note: the Notion Definition of Done states "Arquivo com MIME falso é
  rejeitado" ("a file with a fake/false MIME type is rejected"), which
  directly mandates rejection for FR-002/FR-003 (declared-allowed but
  really-invalid content). It does not, by itself, resolve the narrower
  case in this requirement where the declared MIME and the detected MIME
  are both individually allowed but disagree with each other; that
  specific sub-case remains an implementation decision per the option
  above.
- FR-005: The existing 5 MB per-file size limit
  (`MAX_IMAGE_SIZE_BYTES`) must continue to be enforced and must not be
  weakened or bypassed by the new content-validation step.
- FR-006: The existing single-file-per-request limit must continue to be
  enforced and must not be weakened or bypassed by the new
  content-validation step.
- FR-007: When a file is rejected for any reason (declared MIME not
  allowed, detected content not a valid allowed image, structural/
  truncation failure, declared/detected mismatch handled as rejection
  per FR-004, or size-limit violation), any temporary file already
  written to disk for that request must be removed before the error
  response is produced.
- FR-008: A file whose declared MIME type is allowed and whose real,
  inspected content is a structurally valid image of an allowed type
  (JPEG, PNG, or WebP) must be accepted and proceed through the existing
  upload flow unchanged.
- FR-009: The end-to-end behavior of the upload endpoint for a caller
  (accepted vs. rejected, and the general shape of the error response)
  must remain consistent with the existing upload error-handling pattern
  already used for MIME-type and size-limit rejections, so this change
  does not introduce an unrelated breaking change to the endpoint's
  public contract.

## Non-Functional Requirements

- NFR-001 (Security): Content/magic-byte validation must occur before the
  file is forwarded to the external image storage provider (Cloudinary),
  so that no file with invalid or spoofed content reaches that external
  service.
- NFR-002 (Security): Any new library or mechanism introduced to perform
  real content/structure validation must go through the project's
  dependency-audit process before being added; this specification does
  not pre-approve any specific library.
- NFR-003 (Reliability): Temporary file cleanup (FR-007) must occur
  reliably on every rejection path, including validation errors raised
  during or after the content-inspection step, not only on the
  size-limit and declared-MIME rejection paths that already exist today.
- NFR-004 (Compatibility): The change must not alter the accepted
  image formats (JPEG, PNG, WebP), the 5 MB size limit, or the
  single-file limit already documented for the upload endpoint.
- NFR-005 (Maintainability): The content-validation logic must follow the
  existing separation between the upload middleware and its testable
  helper functions (e.g. the existing `isAllowedImageMimeType` pattern),
  so the new logic remains unit-testable without a running HTTP server.

## Acceptance Criteria

- AC-001: A request declaring an allowed MIME type (e.g. `image/jpeg`)
  but sending non-image content (plain text, HTML, or an executable
  payload) is rejected.
- AC-002: A request declaring an allowed MIME type but sending a
  truncated/corrupted image (invalid or incomplete structure for that
  format) is rejected.
- AC-003: A request sending a genuinely valid JPEG file with the correct
  declared MIME type is accepted, for each of the three supported
  formats (JPEG, PNG, WebP) tested independently.
- AC-004: A request where the declared MIME type and the real detected
  content type are both individually allowed but disagree with each
  other (e.g. declared `image/png`, actual content is a valid JPEG) is
  handled according to the single documented coherence rule chosen under
  FR-004, and this behavior is verified by a test.
- AC-005: A request whose file exceeds the existing 5 MB size limit is
  still rejected, and this behavior is unaffected by the new
  content-validation step.
- AC-006: A request sending more than one file where only one is allowed
  is still rejected, and this behavior is unaffected by the new
  content-validation step.
- AC-007: For every rejection scenario in AC-001, AC-002, AC-004 (when
  the chosen rule rejects), AC-005, and AC-006, no leftover temporary
  file remains under the upload temporary directory after the request
  completes.
- AC-008: E2E tests exist covering: MIME-type spoofing (declared-allowed,
  content-invalid), an over-the-limit file, and at least one genuinely
  valid image for each of the three supported formats (JPEG, PNG, WebP).
- AC-009: No unit or E2E test added or modified for this task makes a
  real network call to the Cloudinary service; any interaction with
  image storage is stubbed/mocked.

## Constraints

- Must preserve the existing 5 MB size limit and single-file-per-request
  limit already enforced by `uploadMiddleware`.
- Must preserve safe temporary-file cleanup on every error path, per the
  project's security rules for uploads.
- Must not weaken the existing allow-list of MIME types
  (`ALLOWED_IMAGE_MIME_TYPES`: JPEG, PNG, WebP).
- Any new dependency required for magic-byte/structural validation must
  go through the project's dependency-audit process; this specification
  does not select or pre-approve a specific library.
- Must not introduce a real network call to Cloudinary from any test
  added for this task.
- This specification does not prescribe the specific library, parser, or
  internal code structure used to perform content inspection; those are
  implementation decisions for the architecture phase.

## Dependencies

- `src/infra/middleware/upload.middleware.ts` — the existing Multer-based
  middleware that currently performs only declared-MIME-type filtering
  and enforces the size/file-count limits.
- The upload route composition described in `CLAUDE.md`'s Request Flow
  Example: `infra/http/routes/work-image.routes.ts` →
  `uploadMiddleware` → `authMiddleware` → `WorkImageController` →
  `UploadWorkImageUseCase` → `ImageStoragePort` (Cloudinary adapter at
  `src/infra/gateway/cloudinary/cloudinary-storage.service.ts`).
- A to-be-selected library or safe parser capable of magic-byte/structural
  validation for JPEG, PNG, and WebP, subject to the project's dependency
  audit process (see Non-Functional Requirements and Constraints).

## Out of Scope

- Changes to the set of accepted image formats (still limited to JPEG,
  PNG, WebP).
- Changes to the 5 MB size limit value or the single-file-per-request
  limit.
- Changes to how validated images are subsequently stored, transformed,
  or served by Cloudinary or by `UploadWorkImageUseCase`.
- Virus/malware scanning beyond structural/magic-byte image validation;
  not requested by the task.
- Any change to authentication/authorization on the upload route; this
  task only affects content validation of the uploaded file itself.

## Risks

- Introducing a new dependency for magic-byte/structural validation is a
  meaningful architectural/dependency decision and must go through the
  project's dependency-audit process before being added (see
  NFR-002/Constraints).
- The coherence rule required by FR-004, for the case where declared MIME
  and detected type are both individually allowed but disagree, is not
  fully specified by the source Notion task; an explicit, documented, and
  tested rule must be established during architecture/implementation
  (see Open Questions, non-blocking).
- Because this task touches security-relevant upload handling, both
  acceptance and rejection paths must be covered by tests, per the
  project's security testing rules; incomplete rejection-path coverage
  would leave a security gap undetected.

## Open Questions

### Blocking

None.

### Non-blocking

- Exact library or parsing approach for magic-byte/structural validation
  is left open for the architecture phase, subject to dependency audit.
- Exact resolution of the declared-MIME-vs-detected-type mismatch case
  described in FR-004/AC-004 (reject-on-mismatch vs.
  accept-using-detected-type) is left to the architecture phase; whatever
  is chosen must be explicit, documented, and tested.

## Traceability

FR-001 → AC-001, AC-002, AC-003
FR-002 → AC-001
FR-003 → AC-002
FR-004 → AC-004
FR-005 → AC-005
FR-006 → AC-006
FR-007 → AC-007
FR-008 → AC-003
FR-009 → AC-003, AC-005, AC-006
NFR-001 → AC-001, AC-002, AC-009
NFR-002 → (governs implementation choice; not directly testable via AC)
NFR-003 → AC-007
NFR-004 → AC-003, AC-005, AC-006
NFR-005 → AC-008
