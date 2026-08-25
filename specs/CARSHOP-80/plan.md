# CARSHOP-80 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-80/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Build a non-HTTP, invokable-on-demand routine that permanently purges Work
documents soft-deleted more than `WORK_HARD_DELETE_AFTER_DAYS` (default 90)
days ago, cascading to their comments and image data/storage, using the same
per-work cascade already implemented for the single-work hard delete, and
logging the count removed. Must never touch active works or works still
inside the retention window, must be idempotent, and must not change the
existing `AdminWorkController.hardDelete` HTTP contract.

## Historical Knowledge

`knowledge-reader` was `BLOCKED` this run (missing `OBSIDIAN_VAULT_ID`). No
Obsidian context was retrieved. The architect proceeded on repository
evidence only.

## Current Architecture

Facts confirmed by the architect through repository inspection:

- `work.model.ts`: `deletedAt: Date | null`, indexed.
- `WorkRepositoryPort` exposes `findByIdIncludingDeleted`, `hardDelete`,
  `hardDeleteData`, `addImage`, `removeImage`. Only `MongoWorkRepository`
  implements this port.
- `mongo-work.repository.ts`: `hardDelete(id)` does
  `WorkModel.deleteOne({ id })` **and**
  `CommentModel.deleteMany({ workId: id })` — comment cascade confirmed.
  `hardDeleteData(id)` only deletes the Work document (no comment cascade) —
  must NOT be used for this routine.
- `hard-delete-work.use-case.ts` (`HardDeleteWorkUseCase`): for a single
  work, loops `work.images`, calls `imageStorage.delete(image.publicId)` for
  each, aborts with `HttpError(502)` before touching Mongo if deletion
  fails, then calls `workRepository.hardDelete(id)`. Throws `HttpError(404)`
  if `findByIdIncludingDeleted` returns nothing. This is the reusable
  cascade+cleanup unit.
- `work-image.model.ts` (`WorkImageModel`, collection `work_images`): zero
  references outside its own file — confirmed unused; image metadata lives
  embedded in `Work.images`. No separate cascade is needed for this
  collection.
- `env.ts`: typed `Environment` object, fail-fast getters (`getRequiredEnv`,
  `getPort`, `getNodeEnv`). No existing `WORK_HARD_DELETE_AFTER_DAYS`
  handling.
- `server.ts`/`routes.ts`: no scheduler dependency exists anywhere in
  `package.json` (no cron/agenda/bull).
- `main/index.ts` and `main/test-portfolio-model.ts` establish the pattern
  for a standalone script entry point: `connectDatabase` → do work →
  `disconnectDatabase` in `finally`, `console.log`/`console.error`,
  `process.exit(1)`/`process.exitCode` on failure.
  `test/unit/main/index.spec.ts` shows the `jest.doMock` +
  `jest.isolateModules` pattern for testing such scripts.
- `tsconfig.build.json` compiles everything under `src` except
  `test/*.spec.ts` — a new file under `src/main` is included automatically.

## Proposed Solution

Reuse the existing per-work cascade (`HardDeleteWorkUseCase`) by composing a
new use case (`PurgeExpiredWorksUseCase`) that selects soft-deleted works
older than a configurable cutoff via a new, strictly-scoped repository
query, invokes the existing cascade once per candidate, tolerates
already-removed candidates and per-item failures, and logs a summary. The
routine is exposed as a standalone script entry point
(`src/main/purge-expired-works.ts`) rather than a new HTTP endpoint, keeping
`AdminWorkController.hardDelete` and its route untouched.

## Technical Decisions

### Decision 1 — Reuse `HardDeleteWorkUseCase` by composition, not duplication

#### Reason

The new bulk routine depends on `HardDeleteWorkUseCase`
(constructor-injected) and calls `.execute(workId)` once per candidate,
rather than re-implementing cascade/cleanup. Satisfies NFR-001 (explicit
application logic), NFR-004 (single-work endpoint untouched), and avoids
duplicating destructive logic.

#### Alternatives Considered

Re-implementing the cascade/cleanup logic (comment deletion, image storage
deletion, Mongo document deletion) directly inside the new use case instead
of delegating to `HardDeleteWorkUseCase`.

#### Trade-offs

Duplicating destructive logic across two code paths would risk the two
paths drifting apart (e.g., a future fix to one cascade not being applied to
the other) and would violate NFR-001's requirement that cascade logic be
explicit, single-sourced application logic.

### Decision 2 — New port read method, strictly scoped

#### Reason

Add `listDeletedBefore(cutoffDate: Date): Promise<Work[]>` to
`WorkRepositoryPort`, implemented in `MongoWorkRepository` as:

```
WorkModel.find({ deletedAt: { $ne: null, $lte: cutoffDate } })
  .sort({ deletedAt: 1 })
  .lean()
```

mapped through the existing `toWork` mapper. Encodes FR-001/NFR-005 and
AC-004/005/006. All `jest.Mocked<WorkRepositoryPort>` test doubles (three
files) must add the new method.

#### Alternatives Considered

Not explicitly enumerated by the architect beyond the chosen strictly-scoped
query shape.

#### Trade-offs

The query is intentionally narrow (`deletedAt` non-null and `<=` cutoff
only) rather than a broader/reusable generic filter, trading flexibility for
safety on an irreversible operation (NFR-005).

### Decision 3 — New use case: `PurgeExpiredWorksUseCase`

#### Reason

New file `src/usecase/purge-expired-works.use-case.ts`:

```ts
export class PurgeExpiredWorksUseCase {
  constructor(
    private readonly workRepository: WorkRepositoryPort,
    private readonly hardDeleteWorkUseCase: HardDeleteWorkUseCase,
  ) {}

  async execute(retentionDays: number, referenceDate: Date = new Date()): Promise<{ removedWorksCount: number }> { ... }
}
```

Behavior:

1. Validate `retentionDays` is a positive integer (defensive; env layer
   already guarantees this).
2. Compute `cutoffDate = new Date(referenceDate.getTime() - retentionDays * MS_PER_DAY)`.
   `referenceDate` defaults to `new Date()` but is overridable in unit
   tests.
3. `candidates = await workRepository.listDeletedBefore(cutoffDate)`.
4. For each candidate:
   ```
   try {
     await hardDeleteWorkUseCase.execute(work.id);
     removedWorksCount++;
   } catch (error) { ... }
   ```
   - If `error instanceof HttpError && error.statusCode === 404`: skip
     silently (already removed by a prior/concurrent run), don't increment,
     don't rethrow. Makes reruns safe (NFR-002/AC-011).
   - Any other error: log a safe message
     (`error instanceof Error ? error.message : 'unknown error'` — never a
     raw provider payload, NFR-003) and continue to the next candidate
     rather than aborting the batch.
5. Always `console.log` a summary line with count removed vs. candidates
   found (FR-008, AC-007/008/009/010).
6. Return `{ removedWorksCount }`.

Zero Express/Mongoose/Cloudinary imports (only ports + the existing use
case).

#### Alternatives Considered

Aborting the whole batch on the first per-item failure (all-or-nothing
atomicity) instead of continuing to the next candidate.

#### Trade-offs

Explicit trade-off: a single work's storage failure should not block
cleanup of every other eligible work — the routine favors throughput over
all-or-nothing atomicity. This does not risk orphaned data because
`HardDeleteWorkUseCase` still refuses to delete the Mongo record when image
cleanup genuinely fails for that specific work.

### Decision 4 — Environment variable in `env.ts`

#### Reason

Add to `Environment` type: `workHardDeleteAfterDays: number`. Getter
mirroring `getPort()`'s fail-fast pattern:

```ts
function getWorkHardDeleteAfterDaysEnv(): number {
  const raw = process.env.WORK_HARD_DELETE_AFTER_DAYS ?? '90';
  const days = Number(raw);
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('A variável "WORK_HARD_DELETE_AFTER_DAYS" precisa ser um número inteiro positivo.');
  }
  return days;
}
```

Default `90` (AC-009), explicit valid value respected (AC-010), fail-fast on
malformed value. Update `.env.example` with `WORK_HARD_DELETE_AFTER_DAYS=90`
(variable name and example placeholder only — no secret, no real value).

#### Alternatives Considered

Not explicitly enumerated by the architect beyond the chosen fail-fast
getter mirroring the existing `getPort()` pattern.

#### Trade-offs

Fail-fast validation of `WORK_HARD_DELETE_AFTER_DAYS` also prevents normal
server startup if the value is malformed (see Risks section), matching the
existing `PORT`/`NODE_ENV` precedent rather than deferring validation to
routine invocation time.

### Decision 5 — Invocation mechanism: standalone script, no HTTP endpoint

#### Reason

New file `src/main/purge-expired-works.ts`, following the
`main/index.ts`/`test-portfolio-model.ts` shape:

```ts
async function run(): Promise<void> {
  try {
    await connectDatabase(env.mongoUri);
    const workRepository = new MongoWorkRepository();
    const imageStorage = new CloudinaryStorageService();
    const hardDeleteWorkUseCase = new HardDeleteWorkUseCase(workRepository, imageStorage);
    const purgeExpiredWorksUseCase = new PurgeExpiredWorksUseCase(workRepository, hardDeleteWorkUseCase);
    const result = await purgeExpiredWorksUseCase.execute(env.workHardDeleteAfterDays);
    console.log(`Rotina de expurgo concluída. Works removidos definitivamente: ${result.removedWorksCount}.`);
  } catch (error: unknown) {
    console.error('Erro ao executar a rotina de expurgo de works.', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}
void run();
```

Add `package.json` script:
`"purge:expired-works": "ts-node --transpile-only -r tsconfig-paths/register src/main/purge-expired-works.ts"`
(mirrors the existing `test:portfolio:model` pattern).

#### Alternatives Considered

Adding an authenticated admin HTTP endpoint to trigger the routine on
demand, or wiring an in-process scheduler/cron dependency.

#### Trade-offs

No admin HTTP endpoint is added. Rationale: the spec's Out-of-Scope section
excludes an admin UI; no scheduler dependency exists in the repository;
adding an endpoint would expand the authenticated HTTP surface with a new
destructive bulk-delete operation requiring its own rate-limiting, CSRF,
Swagger, and authorization review; actual OS/cron scheduling is an ops
concern outside this codebase. Consequently, no Swagger fragment or route
changes are required for this task.

## Execution Flow

1. `src/main/purge-expired-works.ts` connects to MongoDB via
   `connectDatabase(env.mongoUri)`.
2. It instantiates `MongoWorkRepository`, `CloudinaryStorageService`,
   `HardDeleteWorkUseCase`, and `PurgeExpiredWorksUseCase` with constructor
   injection.
3. It invokes `purgeExpiredWorksUseCase.execute(env.workHardDeleteAfterDays)`.
4. `PurgeExpiredWorksUseCase` computes `cutoffDate` from `retentionDays` and
   `referenceDate`, then calls `workRepository.listDeletedBefore(cutoffDate)`.
5. `MongoWorkRepository.listDeletedBefore` queries
   `WorkModel.find({ deletedAt: { $ne: null, $lte: cutoffDate } })`, sorted
   by `deletedAt` ascending, mapped through `toWork`.
6. For each candidate work, `PurgeExpiredWorksUseCase` calls
   `hardDeleteWorkUseCase.execute(work.id)`, which performs the existing
   per-work cascade (image storage deletion, then Mongo `hardDelete`,
   including the comment cascade already implemented there).
7. `HttpError(404)` results (already-removed work) are skipped silently;
   other errors are logged safely and the loop continues.
8. A summary log line reports the number of works removed for the run.
9. `disconnectDatabase()` runs in a `finally` block regardless of outcome.

## Files

### Files to Create

- `src/usecase/purge-expired-works.use-case.ts`
- `src/main/purge-expired-works.ts`
- `test/unit/usecase/purge-expired-works.use-case.spec.ts`
- `test/unit/infra/config/env.spec.ts`
- `test/unit/main/purge-expired-works.spec.ts`

### Files to Modify

- `src/core/domain/repositories/work.repository.ts` — add
  `listDeletedBefore(cutoffDate: Date): Promise<Work[]>`.
- `src/infra/repositories/mongo-work.repository.ts` — implement
  `listDeletedBefore` with strict `$ne: null, $lte: cutoffDate` query.
- `src/infra/config/env.ts` — add `workHardDeleteAfterDays`, default `90`,
  fail-fast validation.
- `.env.example` — document `WORK_HARD_DELETE_AFTER_DAYS` (name and example
  placeholder only, no real value).
- `package.json` — add `purge:expired-works` npm script.
- `test/unit/infra/repositories/mongo-work.repository.spec.ts` — add
  coverage for `listDeletedBefore`.
- `test/unit/usecase/hard-delete-work.use-case.spec.ts`,
  `test/unit/usecase/upload-work-image.use-case.spec.ts`,
  `test/unit/usecase/delete-work-image.use-case.spec.ts` — update
  `buildWorkRepository` mock helpers to add `listDeletedBefore: jest.fn()`.

No changes to: `AdminWorkController`, `admin-work.routes.ts`,
`HardDeleteWorkUseCase` itself, any Swagger fragment, any route file,
`CommentRepositoryPort`, `work-image.model.ts`.

## Contract Impact

No HTTP contract changes. No new or changed routes, request/response
shapes, status codes, cookies, or headers.
`AdminWorkController.hardDelete` (`DELETE /admin/works/:workId`) remains
untouched (NFR-004).

## Persistence Impact

- `WorkRepositoryPort` is extended (not changed/removed) with
  `listDeletedBefore` — additive, backward compatible. Only one concrete
  implementer (`MongoWorkRepository`), updated in the same change.
- No schema changes to `work.model.ts` or `comment.model.ts`.
- The new query is strictly scoped to `deletedAt: { $ne: null, $lte: cutoffDate }`,
  enforced at the repository layer and covered by dedicated repository
  tests (NFR-005, AC-004/005/006).
- Comment cascade continues to rely on the existing
  `MongoWorkRepository.hardDelete` behavior (`CommentModel.deleteMany({ workId: id })`);
  no separate comment-repository change is introduced.
- `work-image.model.ts` / `work_images` collection: confirmed unused by any
  active code path (embedded `Work.images` is the source of truth); no
  cascade cleanup for this collection is part of this task.

## Security Impact

- No new authenticated HTTP surface is introduced (no HTTP endpoint added).
- Logging only emits counts and safe error messages
  (`error instanceof Error ? error.message : 'unknown error'`), never raw
  Cloudinary responses or credentials (NFR-003, security.md).
- Idempotency relies on catching the existing `HttpError(404)` from
  `HardDeleteWorkUseCase` — no duplicated existence-check logic is
  introduced.
- Env fail-fast side effect: an invalid `WORK_HARD_DELETE_AFTER_DAYS` also
  prevents normal server startup (matches the existing `PORT`/`NODE_ENV`
  precedent) — noted for awareness, not treated as a defect.
- No secret, credential, or real environment value is introduced in code,
  logs, or `.env.example` (only the variable name and a placeholder default
  value of `90`).

## Swagger Impact

None. No route or endpoint is added or changed, so no Swagger fragment
update is required.

## Testing Strategy

1. `test/unit/infra/repositories/mongo-work.repository.spec.ts` — add
   case(s) for `listDeletedBefore`: assert `WorkModel.find` is called with
   exactly `{ deletedAt: { $ne: null, $lte: cutoffDate } }`, assert mapping
   via `toWork`, assert sort is applied.
2. `test/unit/usecase/purge-expired-works.use-case.spec.ts` (new) — cover:
   - happy path (N candidates all succeed → `removedWorksCount === N`,
     `execute` called once per id);
   - zero candidates (→ `0`, no `execute` calls, log produced);
   - boundary/cutoff computation (fixed `referenceDate` + `retentionDays` →
     exact expected `cutoffDate` passed to `listDeletedBefore`);
   - idempotent rerun (`HttpError(404)` → skipped, not counted, not
     thrown);
   - non-404 failure (`HttpError(502)` → logged, batch continues, not
     counted).
3. Update three existing `buildWorkRepository` mock helpers
   (`hard-delete-work.use-case.spec.ts`,
   `upload-work-image.use-case.spec.ts`,
   `delete-work-image.use-case.spec.ts`) to add
   `listDeletedBefore: jest.fn()`.
4. `test/unit/infra/config/env.spec.ts` (new) — `jest.resetModules()` +
   `jest.isolateModules`: unset → `90`; valid positive integer → that
   value; invalid (`"0"`, `"-5"`, `"abc"`) → throws.
5. `test/unit/main/purge-expired-works.spec.ts` (new) — mirror
   `test/unit/main/index.spec.ts`'s `jest.doMock` + `jest.isolateModules`
   pattern: mock `env`, `connectDatabase`/`disconnectDatabase`, concrete
   classes; assert connect → use case invoked with
   `env.workHardDeleteAfterDays` → log emitted → disconnect always called
   (including on error).

Run `npm test` and `npm run build` after implementation. No
`npm run test:e2e` is required (no route/middleware/auth/cookie/
server-composition/HTTP contract changes).

## Risks

- Destructive/irreversible operation: mitigated by strict single-condition
  Mongo query, enforced at the repository layer, covered by dedicated
  repository tests (NFR-005, AC-004/005/006).
- Deleting active (non-soft-deleted) works by mistake if the cutoff filter
  is not strictly scoped to `deletedAt` non-null and past the threshold.
- Leaving orphaned related data (comments, image metadata, or external
  image files) if the cascade for any related collection is incomplete.
- Partial-failure design: continuing past a single work's Cloudinary
  failure is deliberate (throughput over all-or-nothing atomicity); it does
  not orphan data since `HardDeleteWorkUseCase` still refuses to delete the
  Mongo record when image cleanup genuinely fails for that work.
- Idempotency relies on catching the existing `HttpError(404)` — no
  duplicated existence-check.
- Env fail-fast side effect: an invalid `WORK_HARD_DELETE_AFTER_DAYS` also
  prevents normal server startup (matches `PORT`/`NODE_ENV` precedent) —
  noted for awareness, not a defect.
- The operation is destructive and irreversible, so insufficient test
  coverage (happy path, cutoff boundary, no-op case, cascade correctness)
  could allow a regression to reach production undetected.

## Implementation Steps

1. Add `listDeletedBefore(cutoffDate: Date): Promise<Work[]>` to
   `WorkRepositoryPort` (`src/core/domain/repositories/work.repository.ts`).
2. Implement `listDeletedBefore` in `MongoWorkRepository`
   (`src/infra/repositories/mongo-work.repository.ts`) with the strictly
   scoped query, sort, and `toWork` mapping.
3. Add `workHardDeleteAfterDays` to the `Environment` type and its fail-fast
   getter in `src/infra/config/env.ts`; document
   `WORK_HARD_DELETE_AFTER_DAYS` in `.env.example`.
4. Create `PurgeExpiredWorksUseCase`
   (`src/usecase/purge-expired-works.use-case.ts`) implementing the
   behavior described in Decision 3.
5. Create the standalone script entry point
   (`src/main/purge-expired-works.ts`) wiring concrete adapters as described
   in Decision 5.
6. Add the `purge:expired-works` script to `package.json`.
7. Update the three existing `buildWorkRepository` mock helpers to add
   `listDeletedBefore: jest.fn()`.
8. Add/update unit tests per the Testing Strategy section.
9. Run `npm test` and `npm run build`.

## Definition of Done Mapping

- FR-001 → AC-001, AC-006, AC-007 → Decision 2 (`listDeletedBefore` query).
- FR-002 → AC-001, AC-006 → Decision 1/3 (delegated to
  `HardDeleteWorkUseCase.execute`).
- FR-003 → AC-002 → existing `MongoWorkRepository.hardDelete` comment
  cascade (unchanged, reused).
- FR-004 → AC-003 → existing `HardDeleteWorkUseCase` image cascade
  (unchanged, reused).
- FR-005 → AC-009, AC-010 → Decision 4 (`workHardDeleteAfterDays` env
  getter, default 90).
- FR-006 → AC-004 → Decision 2 (`deletedAt: { $ne: null }` clause).
- FR-007 → AC-005 → Decision 2 (`deletedAt: { $lte: cutoffDate }` clause).
- FR-008 → AC-007, AC-008 → Decision 3, step 5 (summary log line).
- FR-009 → AC-007 → Decision 3 (zero-candidates path still logs and
  completes without deleting).
- FR-010 → AC-012 → Decision 5 (standalone script invocation, no HTTP
  dependency).
- NFR-001 → AC-002, AC-003 → Decision 1 (explicit composition, no implicit
  DB cascade).
- NFR-002 → AC-011 → Decision 3, step 4 (`HttpError(404)` skip logic).
- NFR-003 → AC-008 → Decision 3, step 4 (safe error messages only).
- NFR-004 → no new AC; verified by leaving `AdminWorkController`,
  `admin-work.routes.ts`, and `HardDeleteWorkUseCase` itself unchanged, and
  by existing single-work hard delete tests continuing to pass.
- NFR-005 → AC-004, AC-005, AC-006 → Decision 2 (strictly scoped query).

## Open Non-Blocking Questions

- Whether the routine should be wired into an OS-level scheduler/cron is
  left as an operational concern outside this codebase (per Decision 5);
  this task only delivers the invokable script.
- Whether `WORK_HARD_DELETE_AFTER_DAYS` should accept only whole-day
  integers or also fractional values remains unspecified in the spec;
  Decision 4 assumes whole-day positive integers only, consistent with the
  spec's stated assumption.
- The spec's open question about the legacy `work_images` collection
  (`src/data/models/work-image.model.ts`) was investigated by the architect
  during repository verification: it has zero references outside its own
  file and is not populated by any active code path, so no cascade cleanup
  for that collection is included in this plan.

## Blocking Questions

None identified by the architect.

## Required Output

Plan:

`specs/CARSHOP-80/plan.md`

Status:

WRITTEN
