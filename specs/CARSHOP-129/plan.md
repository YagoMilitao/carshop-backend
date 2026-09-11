# CARSHOP-129 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-129/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Correct the consistency and documentation of the hard-delete-work flow for
the partial-failure scenario during external-storage image deletion,
ensuring the JSDoc, `docs/api-contract.md`, and Swagger accurately describe
the real behavior, and that a test covering AC-007 (partial failure followed
by a successful retry) exists — without changing the use case's control
flow, error contract, or any port.

## Current Architecture

`HardDeleteWorkUseCase` (`src/usecase/hard-delete-work.use-case.ts`) deletes
a work's images from Cloudinary sequentially, one by one, via
`ImageStoragePort`, before deleting the work in MongoDB via
`WorkRepositoryPort`. The active Cloudinary adapter
(`src/infra/gateway/cloudinary/cloudinary-storage.service.ts`) treats
"not found" as a successful delete (idempotent delete). Any genuine storage
error aborts the use case with `HttpError(502, ...)` before Mongo is
touched.

## Proposed Solution

### Reconciliation Finding

Inspection of `src/usecase/hard-delete-work.use-case.ts`, the active
Cloudinary adapter, and existing tests found that current code already
matches ADR-002
(`CarShop/ADR/ADR-002-hard-delete-cascade-abort-before-mongo.md`): images
are deleted from Cloudinary sequentially before the Mongo hard-delete; the
Cloudinary adapter treats "not found" as success (idempotent delete); any
genuine storage error aborts with `HttpError(502)` before touching Mongo;
Mongo is untouched on partial failure. Consequence: because Mongo is
untouched on partial failure, a retry of the same DELETE endpoint safely
completes — already-deleted images return "not found" (treated as success)
and the loop proceeds to the previously-failing image. Retry is already
idempotent and safe today, with NO change needed to the use case's control
flow, the `HttpError` message/status, `ImageStoragePort`, or
`WorkRepositoryPort`. ADR-002 remains valid and is NOT being reversed or
extended.

### Real Gap Identified (non-behavioral)

1. Misleading JSDoc in `hard-delete-work.use-case.ts` claiming the ordering
   "evita registros órfãos" — it does not describe the actual transitional
   state where the Work still references already-deleted images until a
   successful retry.
2. `docs/api-contract.md` and `src/infra/docs/admin-works.swagger.ts` repeat
   the same inaccurate claim and do not document partial-failure/retry-safety
   behavior.
3. `test/unit/usecase/hard-delete-work.use-case.spec.ts` only covers "all
   images fail", not the partial-failure-then-successful-retry scenario
   required by spec AC-007.

## Technical Decisions

### Decision

Keep the existing control flow, error contract (`HttpError(502, ...)`), and
port signatures unchanged. Only correct documentation (JSDoc, API contract
doc, Swagger description) and add a missing unit test for the
partial-failure-then-retry scenario.

### Reason

Current implementation already satisfies ADR-002 and FR-001/FR-002/FR-003/
NFR-001/NFR-003 through the existing sequential-delete-before-Mongo ordering
combined with the Cloudinary adapter's idempotent "not found as success"
behavior. The only real gap is inaccurate documentation and missing test
coverage for the retry scenario (FR-005, FR-006, AC-005, AC-006, AC-007).

### Alternatives Considered

Introducing a new compensation/retry mechanism, a flag/field to track
already-deleted images, or a queue/async job — all rejected because the
existing behavior already satisfies the functional and non-functional
requirements; adding new mechanisms would be unnecessary complexity not
justified by the reconciliation finding.

### Trade-offs

The Work remains in MongoDB referencing already-deleted images during the
transitional window between a partial failure and a successful retry. This
is an accepted, now-documented behavior rather than a defect, since the
client is expected to retry the same DELETE call and retries are safe and
idempotent.

## Execution Flow

1. Correct the JSDoc in `src/usecase/hard-delete-work.use-case.ts`.
2. Update `docs/api-contract.md` for the DELETE `/admin/works/{workId}`
   section.
3. Update `src/infra/docs/admin-works.swagger.ts` description to match.
4. Add the AC-007 unit test to
   `test/unit/usecase/hard-delete-work.use-case.spec.ts`.
5. Run validation commands.

## Files

### Files to Create

None.

### Files to Modify

- `src/usecase/hard-delete-work.use-case.ts` — rewrite the class-level
  JSDoc (current lines ~5-15) to accurately state: the real deletion order
  (external storage first, Mongo second); that "not found" from Cloudinary
  is treated as success, making retries safe; that on partial failure the
  Work remains in MongoDB referencing already-deleted images until a
  successful retry (removing the incorrect "evita registros órfãos" claim);
  that the client should retry the same DELETE call and retries are safe.
  No change to signature, control flow, or the `HttpError(502, ...)`
  message — preserves NFR-003 and the existing documented error contract.
- `docs/api-contract.md` — in the "DELETE /admin/works/{workId}" section
  (current lines ~359-378): remove "evitando registros órfãos"; document
  that on partial failure the Work and its remaining unaffected data stay
  in MongoDB, already-deleted external images are not restored (no
  automatic compensation), and calling the same endpoint again safely
  resumes and completes cleanup idempotently (Cloudinary "not found" =
  success). Keep 502 as the documented status for this scenario — no
  status/contract change.
- `src/infra/docs/admin-works.swagger.ts` — in the
  `/admin/works/{workId}` delete operation's `description` (current lines
  ~248-252): apply the same corrected text as the `docs/api-contract.md`
  change, to keep Swagger and `docs/api-contract.md` synchronized per
  `.claude/rules/openapi.md`. Do not change the `responses` block — the
  existing 502 `errorResponse('Falha ao remover arquivos do armazenamento
  externo. Tente novamente.')` is already correct and unchanged.
- `test/unit/usecase/hard-delete-work.use-case.spec.ts` — add a test
  covering spec AC-007 (partial failure then successful retry): `work.images`
  has >= 2 images; first `execute()` call: `imageStorage.delete` mocked with
  `mockResolvedValueOnce` for image 1 and `mockRejectedValueOnce` for image
  2 → expect `HttpError` with `statusCode` 502 and `workRepository.hardDelete`
  NOT called; second `execute()` call on the same `useCase`/mocks:
  `imageStorage.delete` resolves for both images (representing the real
  adapter's not-found-as-success for the already-deleted image, and genuine
  success for the previously-failing one) → expect `{ success: true }` and
  `workRepository.hardDelete` called once with the same `workId`.

## Explicitly Out of Scope / Do Not Touch

`ImageStoragePort`, `WorkRepositoryPort`, `AdminWorkController`, routes,
error-handler middleware, e2e tests, and the legacy duplicate Cloudinary
adapter at
`src/core/domain/application/Gateway/cloudinary/cloudinary-storage.service.ts`.

## Contract Impact

None. The `502` status and the `HttpError` message on partial failure are
unchanged. Only the documented description of behavior in
`docs/api-contract.md` and Swagger is corrected/expanded to reflect the
real, already-existing behavior (no status/format change).

## Persistence Impact

None. No schema, model, or repository change. Mongo hard-delete continues
to occur only after all image deletions succeed, preserving the
destructive/cascading-operation rule (`.claude/rules/persistence.md`) and
NFR-001.

## Security Impact

None. No change to authentication, authorization, or error message content
that would expose sensitive details. NFR-002 continues to be satisfied by
the existing error-logging behavior (unchanged).

## Swagger Impact

`src/infra/docs/admin-works.swagger.ts` description for
`DELETE /admin/works/{workId}` is updated to match the corrected
`docs/api-contract.md` text, per `.claude/rules/openapi.md`. The
`responses` block (including the existing 502 error response) is
unchanged.

## Testing Strategy

No new executable `src/` lines are introduced by this task (only a
JSDoc/comment rewrite in `hard-delete-work.use-case.ts` and documentation
text changes in `docs/api-contract.md` and
`src/infra/docs/admin-works.swagger.ts`), so the `>= 80%` new/changed-code
unit-test coverage target defined in `.claude/rules/testing.md` applies
trivially to this task's `src/` diff. Nonetheless, the new AC-007 unit test
is still required by `.claude/rules/testing.md`'s bug-fix testing rule
("Every bug fix must include a test that fails without the fix") and by
spec AC-007, and must be added to
`test/unit/usecase/hard-delete-work.use-case.spec.ts` covering the
partial-failure-then-successful-retry scenario described above.

## Risks

- Touches persistence (MongoDB) and an external integration (Cloudinary)
  simultaneously as subject matter, even though no code behavior changes,
  increasing the surface for documentation/behavior mismatch if the
  reconciliation finding is later invalidated by a code change elsewhere.
- Any future change to the use case's control flow or to the Cloudinary
  adapter's "not found as success" behavior would invalidate the corrected
  documentation and must be re-reviewed against ADR-002.
- The HTTP response in the partial-failure scenario (FR-002) is a publicly
  observable contract; this plan intentionally keeps it unchanged (`502`)
  and only clarifies documentation, avoiding a silent contract break.

## Implementation Steps

1. Update the JSDoc in `src/usecase/hard-delete-work.use-case.ts` as
   described above. No other code in this file changes.
2. Update the "DELETE /admin/works/{workId}" section of
   `docs/api-contract.md` as described above.
3. Update the `description` field of the `/admin/works/{workId}` delete
   operation in `src/infra/docs/admin-works.swagger.ts` to match, leaving
   `responses` unchanged.
4. Add the AC-007 partial-failure-then-retry unit test to
   `test/unit/usecase/hard-delete-work.use-case.spec.ts`.
5. Run validation commands (see below).

## Definition of Done Mapping

- FR-001, FR-002, FR-003, AC-001, AC-002, AC-003, AC-004, NFR-001, NFR-003
  — already satisfied by existing implementation per the reconciliation
  finding; verified (not re-implemented) by the new AC-007 test and by
  preserving existing "all images fail" and success-path tests unchanged.
- FR-004 — preserved: no change to scoping logic; `workId`-scoped behavior
  is untouched.
- FR-005, AC-005 — satisfied by the JSDoc rewrite in
  `hard-delete-work.use-case.ts`.
- FR-006, AC-006 — satisfied by the `docs/api-contract.md` update.
- AC-007 — satisfied by the new unit test in
  `test/unit/usecase/hard-delete-work.use-case.spec.ts`.
- NFR-002 — preserved: no change to logging behavior.

## Open Non-Blocking Questions

(Carried forward from `spec.md`, unresolved by this plan since the
reconciliation finding determined no new mechanism is needed:)

- The exact HTTP status for the partial-failure scenario was confirmed to
  remain `502` (no new status/format introduced), resolving the spec's
  first non-blocking question in favor of no change.
- The concrete mechanism to persist/signal which images were already
  removed between attempts was confirmed unnecessary: the Cloudinary
  adapter's existing "not found as success" idempotency already provides
  this signal implicitly, resolving the spec's second non-blocking
  question in favor of no new persistence mechanism.

## Validation Commands

```bash
npx jest test/unit/usecase/hard-delete-work.use-case.spec.ts
npm test
npm run build
```

`npm run test:e2e` is optional/not strictly required (no route, contract,
or middleware change), but may be run as extra regression validation.
