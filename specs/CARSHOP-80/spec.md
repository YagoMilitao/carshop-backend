# CARSHOP-80 — Implementar limpeza definitiva de works com soft delete

## Status

Ready

## Source

Notion Task:
CARSHOP-80

## Context

Works are currently soft-deleted rather than physically removed: the `Work`
Mongoose model (`src/data/models/work.model.ts`) already has a `deletedAt`
field (`null` = active, `Date` = logically removed), and the domain port
`WorkRepositoryPort` (`src/core/domain/repositories/work.repository.ts`)
already exposes `findByIdIncludingDeleted`, `hardDelete`, and
`hardDeleteData` operations used by the existing on-demand single-work hard
delete (`HardDeleteWorkUseCase`, `src/usecase/hard-delete-work.use-case.ts`,
wired through `AdminWorkController.hardDelete`).

That existing flow only removes one specific work when an administrator
explicitly requests it. There is currently no mechanism that periodically
or on demand purges works that have been soft-deleted for a long time,
so soft-deleted `works` documents (and, indirectly, orphaned related data)
accumulate indefinitely in MongoDB.

This task adds a cleanup routine that permanently deletes works whose
`deletedAt` timestamp is older than a configurable retention window, along
with their related data, so storage does not grow unbounded with logically
deleted records that nobody intends to restore.

## Objective

Provide a routine that identifies works soft-deleted more than a
configurable number of days ago and permanently removes them, together with
their related comments and image data, in a safe, explicit, auditable and
idempotent way — without ever touching works that are still active or still
within their retention window.

## Functional Requirements

FR-001
The routine must identify candidate works using the criteria: `deletedAt`
is not `null` AND `deletedAt <= cutoffDate`, where `cutoffDate` is computed
as the current time minus the configured retention period.

FR-002
For each candidate work identified by FR-001, the routine must permanently
delete (hard delete) the work's document from the database.

FR-003
For each work permanently deleted by FR-002, the routine must also
permanently delete all comments associated with that work (comments whose
`workId` matches the deleted work's id), consistent with the cascading
behavior already implemented for the existing single-work hard delete.

FR-004
For each work permanently deleted by FR-002, the routine must also remove
the work's image metadata from the database and attempt removal of the
corresponding files from external image storage, consistent with the
behavior already implemented for the existing single-work hard delete
(`HardDeleteWorkUseCase`).

FR-005
The retention period, expressed in days, must be configurable through the
environment variable `WORK_HARD_DELETE_AFTER_DAYS`. When the variable is
not set, the routine must use a default retention period of 90 days.

FR-006
The routine must never delete or modify a work whose `deletedAt` is `null`
(an active, non-soft-deleted work).

FR-007
The routine must never delete a work whose `deletedAt` is set but is more
recent than `cutoffDate` (i.e., still inside the configured retention
window).

FR-008
On every execution, the routine must log at least the number of works
permanently deleted during that run.

FR-009
When no work satisfies the criteria in FR-001, the routine must complete
without deleting any record and must log that zero works were removed.

FR-010
The routine must be invokable independently of an HTTP request/response
cycle (e.g., directly as a function, use case, or script entry point), so
it can be triggered on demand or by a scheduling mechanism without
requiring an incoming HTTP call. The specific invocation mechanism
(standalone script, scheduled job, or admin-triggered action) is an
implementation decision left to the architect.

## Non-Functional Requirements

NFR-001 (Explicit cascade)
The cascade deletion of related data (comments, image metadata, external
image files) must be performed through explicit application logic. The
routine must not rely on implicit or automatic database-level cascade
behavior.

NFR-002 (Idempotency / safe re-execution)
Running the routine multiple times in a row must be safe: once a work and
its related data have been permanently removed, subsequent runs must treat
that work as already handled and must not error because the record no
longer exists.

NFR-003 (Auditability without sensitive data)
Log output produced by the routine must be sufficient to determine how many
works (and, where applicable, related comments) were permanently removed in
a given run, without logging credentials, secrets, raw external-provider
(Cloudinary) responses, or other sensitive values, consistent with the
project's existing security rules.

NFR-004 (No regression on existing contract)
The routine must not change the request/response contract, status codes,
or behavior of the existing on-demand single-work hard delete endpoint
already wired through `AdminWorkController.hardDelete`.

NFR-005 (Scoped destructive operation)
Because the operation is irreversible, the query used to select candidate
works must be strictly scoped to `deletedAt` being non-null and older than
or equal to the configured cutoff; the routine must not use a broader
selection criteria that could include active or recently soft-deleted
works.

## Acceptance Criteria

AC-001
Given a work whose `deletedAt` is older than `cutoffDate` (computed from
`WORK_HARD_DELETE_AFTER_DAYS`), when the cleanup routine runs, then that
work's document no longer exists in the database afterward.

AC-002
Given a work whose `deletedAt` is older than `cutoffDate` and that has one
or more associated comments, when the cleanup routine runs, then no
comment with that work's id remains in the database afterward.

AC-003
Given a work whose `deletedAt` is older than `cutoffDate` and that has one
or more images, when the cleanup routine runs, then the work's image
metadata no longer exists in the database and removal of the corresponding
file is attempted in external image storage for each image.

AC-004
Given a work whose `deletedAt` is `null` (active), when the cleanup routine
runs, then that work remains unchanged in the database afterward.

AC-005
Given a work whose `deletedAt` is set to a timestamp more recent than
`cutoffDate` (i.e., still within the retention window), when the cleanup
routine runs, then that work remains unchanged in the database afterward.

AC-006
Given a work whose `deletedAt` is exactly equal to `cutoffDate`, when the
cleanup routine runs, then that work is permanently deleted (the boundary
is inclusive, matching the `deletedAt: { $lte: cutoffDate }` criteria).

AC-007
Given that no work satisfies `deletedAt <= cutoffDate` at the time of
execution, when the cleanup routine runs, then no work, comment, or image
record is deleted, and the routine logs that zero works were removed.

AC-008
When a run of the cleanup routine permanently deletes N works (N >= 0),
then a log entry recording the value N is produced for that run.

AC-009
Given the environment variable `WORK_HARD_DELETE_AFTER_DAYS` is not set,
when the cleanup routine computes `cutoffDate`, then it uses a retention
period of 90 days.

AC-010
Given the environment variable `WORK_HARD_DELETE_AFTER_DAYS` is set to a
valid positive integer, when the cleanup routine computes `cutoffDate`,
then it uses that configured value instead of the default.

AC-011
Given the cleanup routine already ran and removed all qualifying works,
when it runs again immediately afterward with no newly qualifying works,
then the second run completes without error and performs no deletions.

AC-012
When the cleanup routine is invoked directly (not through an HTTP request),
then it completes successfully and produces the same deletion and logging
behavior described in AC-001 through AC-008.

## Constraints

- Must reuse the existing `deletedAt` soft-delete field already present on
  the `Work` model (`src/data/models/work.model.ts`); the routine must not
  introduce a parallel or duplicate soft-delete mechanism.
- The candidate-selection query must be strictly limited to
  `deletedAt: { $lte: cutoffDate }` with `deletedAt` non-null; it must not
  broaden the criteria to include active works.
- Cascade deletion of comments and image data must be explicit application
  logic, not an implicit database cascade.
- The retention period must be read from the environment variable
  `WORK_HARD_DELETE_AFTER_DAYS`, defaulting to 90 days when unset.
- The operation is destructive and irreversible; there is no undo/restore
  requirement in scope for this task.
- No secret, credential, or real environment value may appear in code
  comments, logs, or documentation related to this routine.

## Dependencies

- Soft delete already implemented on `Work`
  (`src/data/models/work.model.ts`, field `deletedAt`).
- `WorkRepositoryPort` operations already available:
  `findByIdIncludingDeleted`, `hardDelete`, `hardDeleteData`
  (`src/core/domain/repositories/work.repository.ts`).
- Existing cascading pattern in `MongoWorkRepository.hardDelete`, which
  already removes associated `Comment` documents by `workId`
  (`src/infra/repositories/mongo-work.repository.ts`).
- Existing `ImageStoragePort` and its Cloudinary adapter, already used by
  `HardDeleteWorkUseCase` to remove image files from external storage
  during a hard delete (`src/usecase/hard-delete-work.use-case.ts`,
  `src/infra/gateway/cloudinary/cloudinary-storage.service.ts`).
- Existing environment configuration module that validates required
  environment variables at startup (`src/infra/config/env.ts`).

## Out of Scope

- Changing the request/response contract, route, or behavior of the
  existing on-demand single-work hard delete endpoint
  (`AdminWorkController.hardDelete`).
- Introducing a new or independent soft-delete mechanism for comments or
  images.
- Building an admin UI to trigger, monitor, or configure the cleanup
  routine.
- Deciding the exact invocation mechanism (standalone script, scheduled
  job/cron, or admin-triggered action) — left to the architect per FR-010.
- Any restore/undo capability for permanently deleted works.
- Cleanup of the separate `work_images` Mongo collection defined in
  `src/data/models/work-image.model.ts`, unless the architect confirms this
  collection is actively populated by a current code path. Current
  inspection found no repository or use case referencing `WorkImageModel`
  in the active request flow; work image metadata observed in the codebase
  is embedded directly in the `Work` document's `images` array instead.

## Risks

- Deleting active (non-soft-deleted) works by mistake if the cutoff filter
  is not strictly scoped to `deletedAt` non-null and past the threshold.
- Leaving orphaned related data (comments, image metadata, or external
  image files) if the cascade for any related collection is incomplete.
- The operation is destructive and irreversible, so insufficient test
  coverage (happy path, cutoff boundary, no-op case, cascade correctness)
  could allow a regression to reach production undetected.

## Open Questions

### Blocking

None identified.

### Non-blocking

- Whether the routine should be exposed as a standalone script, wired into
  a scheduler, or triggered on demand through an existing administrative
  action is an implementation decision left to the architect (explicitly
  non-blocking per the source task).
- Whether `WORK_HARD_DELETE_AFTER_DAYS` should accept only whole-day
  integers or also fractional values is unspecified; absent further
  clarification, whole-day integers should be assumed.
- Whether the legacy `work_images` collection
  (`src/data/models/work-image.model.ts`) needs its own cascade cleanup, or
  whether the existing Work-embedded image metadata already satisfies the
  "remove related image data" requirement, should be confirmed by the
  architect against current code paths before implementation.

## Traceability

FR-001 → AC-001, AC-006, AC-007
FR-002 → AC-001, AC-006
FR-003 → AC-002
FR-004 → AC-003
FR-005 → AC-009, AC-010
FR-006 → AC-004
FR-007 → AC-005
FR-008 → AC-007, AC-008
FR-009 → AC-007
FR-010 → AC-012

NFR-001 → AC-002, AC-003
NFR-002 → AC-011
NFR-003 → AC-008
NFR-004 → (regression check on existing single-work hard delete tests;
no new AC introduced since behavior must remain unchanged)
NFR-005 → AC-004, AC-005, AC-006
