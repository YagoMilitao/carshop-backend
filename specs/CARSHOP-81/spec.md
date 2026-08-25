# CARSHOP-81 — Implementar armazenamento externo de imagens

## Status

Ready

## Source

Notion Task:
CARSHOP-81

## Context

The Mongo database currently must not store raw image binary data. Work
images need to be handled through an external storage provider, with only
URLs and metadata persisted in Mongo.

The repository already has a `WorkImage` persistence model that stores
`id`, `workId`, `url`, `alt`, and `isCover`, but it does not yet persist a
provider identifier (`publicId`) or a display `order`. The existing hard
delete flow for a work (`WorkRepositoryPort.hardDelete`) currently removes
the work document and its comments, but does not remove associated work
images (neither their Mongo records nor the corresponding files in
external storage).

This creates two gaps relative to the desired behavior:

1. Image metadata persisted in Mongo does not yet include everything
   needed to manage the image lifecycle in the external storage provider
   (specifically a stable identifier usable for deletion).
2. Hard-deleting a work does not propagate deletion to the external
   storage provider, risking orphaned files that have no corresponding
   Mongo record.

## Objective

Ensure that work images are stored in an external image storage provider,
that Mongo persists only image metadata (never binary image data), and
that deleting a work's images — including as part of a work hard delete —
also removes the corresponding files from external storage.

## Functional Requirements

FR-001
When an admin uploads an image for a work, the system must send the image
file to an external image storage provider and must not persist the raw
binary image data in Mongo.

FR-002
After a successful upload to external storage, the system must persist in
Mongo an image record containing at least: `url` (the externally hosted
image location), `publicId` (a stable identifier usable to reference or
delete the file in the external storage provider), `alt` (a text
description), `isCover` (whether the image is the work's cover image), and
`order` (the image's display position among the work's images).

FR-003
If the upload to the external storage provider fails, the system must not
create an image metadata record in Mongo for that upload attempt, and must
return an error response to the caller.

FR-004
If persisting the image metadata to Mongo fails after a successful upload
to external storage, the system must not leave the caller with a
successful response; the failure must be reported as an error.

FR-005
When a work image is individually deleted, the system must delete the
corresponding file from external storage (using the persisted `publicId`)
in addition to removing its metadata record from Mongo.

FR-006
When a work is hard-deleted, the system must delete, from external
storage, every image file associated with that work, and must remove the
corresponding image metadata records from Mongo.

FR-007
Only one image per work may be marked as the cover image (`isCover:
true`) at any given time.

FR-008
Uploaded image files must be validated for allowed file type before being
sent to external storage; files of a disallowed type must be rejected with
an error and must not be uploaded or persisted.

FR-009
Uploaded image files must be validated against a maximum file size before
being sent to external storage; files exceeding the limit must be rejected
with an error and must not be uploaded or persisted.

## Non-Functional Requirements

NFR-001 (Security)
Provider credentials required to access the external storage service must
be supplied only through environment configuration and must never be
logged, returned in API responses, or persisted in Mongo.

NFR-002 (Reliability)
The upload flow must not result in a Mongo metadata record that has no
corresponding file in external storage (no orphaned metadata), nor a file
in external storage that is unreachable through any Mongo metadata record
created by this flow, under normal (non-crash) operation.

NFR-003 (Compatibility)
The change must preserve the existing public contract of work and
work-image endpoints (status codes, response shape, authentication
requirements) except where this specification explicitly requires new
fields (`publicId`, `order`) to be introduced.

NFR-004 (Maintainability)
External storage provider details (SDK calls, provider-specific
identifiers, provider errors) must remain isolated behind an adapter and
must not leak into use cases, controllers, or domain types as
provider-specific shapes.

## Acceptance Criteria

AC-001
When an admin uploads a valid image file for a work, the response
indicates success and the created image metadata includes non-empty
`url`, `publicId`, `alt`, `isCover`, and `order` values.

AC-002
When a work image is created, the raw binary image content is not present
in the Mongo `work_images` collection record — only URL and metadata
fields are stored.

AC-003
When the external storage upload fails, no work image metadata record is
created in Mongo, and the caller receives an error response.

AC-004
When an admin deletes a single work image, the file is removed from
external storage and the corresponding Mongo metadata record no longer
exists.

AC-005
When an admin hard-deletes a work that has one or more images, all
associated image files are removed from external storage and all
associated Mongo image metadata records are removed.

AC-006
When an upload request includes a file whose type is not in the allowed
list, the request is rejected with an error and no file is sent to
external storage.

AC-007
When an upload request includes a file exceeding the configured maximum
size, the request is rejected with an error and no file is sent to
external storage.

AC-008
When an image is marked as `isCover: true` for a work that already has a
cover image, at most one image for that work remains marked as cover
after the operation completes.

AC-009
Authenticated (admin) requests required for image upload, update, and
delete operations use the project's existing Bearer token strategy; a
request without a valid token is rejected.

## Constraints

- Mongo must never store raw/binary image data — only `url` and metadata
  (`publicId`, `alt`, `isCover`, `order`).
- Deletion from external storage must use the persisted `publicId` (or
  equivalent stable identifier), not a derived or guessed value.
- File type and size validation must occur before any data is sent to the
  external storage provider.
- The specific external storage provider, SDK, and internal file/module
  layout are architecture decisions and are out of scope for this
  specification.
- No concrete provider credentials, API keys, or environment values may
  appear in this specification or in any file under `specs/`. Only
  environment variable names may be referenced (e.g. provider API key
  variable names), never their values.
- API base URL, where referenced by any related client-facing
  documentation, must be provided through `API_URL` and must not be
  hardcoded to an environment-specific value.

## Dependencies

- An existing work-image persistence model (`WorkImage`), to be extended
  with `publicId` and `order` fields.
- A configured external image storage provider (the repository already
  contains a Cloudinary adapter usable for this purpose, but the final
  provider choice belongs to the architect).
- The existing work hard-delete flow, which must be extended to cascade
  into image deletion (both Mongo records and external storage files).
- Existing upload handling (size/type validation) already present in the
  codebase, to be reused or extended as needed.

## Out of Scope

- Choosing or changing the external storage provider (Cloudinary vs. S3
  vs. another) — this is an architecture decision.
- Bulk/batch image re-ordering endpoints beyond persisting an `order`
  value per image.
- Image transformation, resizing, or optimization pipelines.
- Migrating or backfilling any pre-existing image data.
- Soft delete behavior for individual work images (only hard delete
  propagation to external storage is in scope, per the task's Definition
  of Done).

## Risks

- Orphaned files in external storage with no corresponding Mongo record,
  if upload succeeds but metadata persistence fails.
- Orphaned Mongo metadata records with no corresponding file in external
  storage, if metadata persistence succeeds but is not correctly linked
  to the upload result.
- Failure to persist `publicId` would make it impossible to delete the
  corresponding file from external storage later.
- Unvalidated file type or size could allow unsafe or excessively large
  uploads.

## Open Questions

### Blocking

None.

### Non-blocking

- Should failed external-storage deletions during work hard delete block
  the deletion of the work's Mongo data, or should the work deletion
  proceed with the storage cleanup failure reported/logged separately?
  (Not specified in the source task; left for architectural judgment
  unless clarified in Notion.)
- Exact allowed file types and maximum file size limit values are not
  restated in the source task beyond "validate file type/size on
  upload"; existing project conventions may apply unless clarified in
  Notion.

## Traceability

FR-001 → AC-001, AC-002
FR-002 → AC-001
FR-003 → AC-003
FR-004 → AC-003
FR-005 → AC-004
FR-006 → AC-005
FR-007 → AC-008
FR-008 → AC-006
FR-009 → AC-007
NFR-001 → AC-009
NFR-002 → AC-003, AC-004, AC-005
NFR-003 → AC-001
NFR-004 → AC-001, AC-004, AC-005
