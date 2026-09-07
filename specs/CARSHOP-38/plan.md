# CARSHOP-38 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-38/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Provide a safe, repeatable, non-destructive way to (1) confirm the
Mongoose→MongoDB Atlas connection at startup already fails/succeeds
correctly (already implemented, verify only), (2) verify/ensure every
index declared (unique/index: true) across all Mongoose models actually
exists in the target DB, without ever dropping unexpected indexes, (3)
exercise a controlled write→read→cleanup cycle against a target DB
leaving no residual data, and (4) confirm no Prisma/migration remnants
exist anywhere in the deploy flow. Maps to FR-001..008/AC-001..007 in
spec.md.

## Current Architecture

Findings against current repo (verified, not assumed):

- FR-001/002/AC-001/002 (MONGO_URI validation, startup connection
  fail-fast) already satisfied by existing `connectDatabase()` in
  `src/infra/database/mongoose.ts` and `env.ts`'s
  `assertMongoUriShape()` — no code change needed.
- FR-008/AC-007 (health check) already satisfied by the `GET /health`
  stack (`health.controller.ts`, `get-health-status.use-case.ts`,
  `mongoose-database-health-check.service.ts`) — no code change needed,
  regression-verify only.
- FR-007/AC-006 (no Prisma remnants) already satisfied — repo-wide grep
  confirms zero Prisma matches in `package.json`,
  `.github/workflows/sonar-backend.yml`, or source; only `specs/`
  mentions Prisma historically. No code change, only verification
  evidence.
- Current gap: `src/main/create-indexes.ts` exists, has proper sanitized
  error handling already (contra a stale Obsidian note), BUT only covers
  3 of 8 models (WorkModel, CategoryModel, TagModel) and uses
  `Model.syncIndexes()`, which is destructive (drops indexes absent from
  current schema) — conflicts with FR-005/NFR-003 and the spec's own
  stated risk.
- No npm script currently exposes `create-indexes.ts` (unlike
  `purge:expired-works`) — NFR-004 discoverability gap.
- No existing mechanism satisfies FR-006/AC-005 (controlled read/write
  test) — gap.

## Proposed Solution

Replace the destructive index-sync mechanism with an additive-only,
report-driven index verification script covering all Mongoose models,
add a new isolated model and standalone script to exercise a controlled
write→read→cleanup cycle, expose both via discoverable npm scripts, and
document the Mongoose-only nature of the persistence stack. See
Technical Decisions below for the exact, verbatim architect decisions.

## Technical Decisions

### Decision 1

Replace `syncIndexes()` with additive-only `Model.createIndexes()` in
`create-indexes.ts`, plus a read-only presence report built from
`model.schema.indexes()` (source of truth for declared indexes, covers
inline `unique`/`index: true` and explicit `.index()` calls) cross-checked
against `model.collection.indexes()`. Never call any drop-capable index
API.

### Reason

`syncIndexes()` is destructive — it drops indexes absent from the current
schema snapshot, conflicting with FR-005/NFR-003 and the spec's explicit
risk about inadvertently removing an intentionally-created index.

### Alternatives Considered

(Not enumerated separately by the architect beyond the rejected current
behavior of `syncIndexes()`.)

### Trade-offs

`createIndexes()` is additive-only and safe, but does not automatically
remove stray/obsolete indexes — this is an intentional trade-off in favor
of safety over automatic cleanup.

---

### Decision 2

Extend `create-indexes.ts` to iterate all 8 Mongoose models (Work,
Category, Tag, Comment, WorkImage, AdminUser, AuthSession,
PortfolioWork), per FR-003's literal "every Mongoose model currently
defined" scope — even though WorkImage/AdminUser/PortfolioWork are
currently unused by active use cases/routes. This is additive-only so
it's safe; flagged for reviewer awareness, not a scope violation.

### Reason

FR-003 literally requires index verification "for every Mongoose model
currently defined in the repository."

### Alternatives Considered

Limiting scope to the 3 currently-covered models (Work, Category, Tag)
was implicitly rejected as insufficient against the literal FR-003
requirement.

### Trade-offs

Including currently-unused models is harmless because the operation is
additive-only, but broadens the surface area touched by the script;
explicitly flagged to the reviewer as a literal-scope reading rather than
scope creep.

---

### Decision 3

Add a new minimal, isolated Mongoose model `HealthCheckPingModel`
(collection `health_check_pings`, no unique/index fields, no
hooks/validators) used exclusively by a new standalone script
`src/main/verify-read-write.ts` that does create → read-back/assert →
delete-in-`finally` (cleanup runs even on assertion failure), mirroring
the existing script shape in `src/main/purge-expired-works.ts` and
`src/main/create-indexes.ts` (connect → work → sanitized error logging
via `error.message` only, never raw error/`.cause`/connection string →
disconnect in finally → `process.exitCode = 1` on failure).

### Reason

No existing mechanism satisfies FR-006/AC-005 (controlled read/write
verification against a target database with no residual data left
behind).

### Alternatives Considered

Running the read/write check against an existing production collection
was implicitly rejected in favor of an isolated, dedicated,
non-production-shaped collection to avoid any risk of residual or
commingled data.

### Trade-offs

Introduces one new minimal model/collection solely for verification
purposes; kept intentionally free of hooks/validators/indexes to remain
a pure passthrough schema and to avoid any unintended side effects during
the verification cycle.

---

### Decision 4

Add two package.json scripts, `verify:indexes` and `verify:read-write`
(mirroring the existing `purge:expired-works` script pattern, ts-node
`--transpile-only`), and document both plus a one-line "this project
uses Mongoose only, no Prisma/migrations" statement in README.md, closing
NFR-004 and reinforcing FR-007 evidence.

### Reason

NFR-004 requires the verification procedure to be discoverable and
repeatable without undocumented manual steps; no npm script currently
exposes `create-indexes.ts`.

### Alternatives Considered

(None enumerated beyond mirroring the existing `purge:expired-works`
script pattern, which was adopted directly.)

### Trade-offs

None noted beyond the minor addition of two npm scripts and a README
statement.

## Execution Flow

1. Modify `create-indexes.ts` to iterate all 8 models and switch from
   `syncIndexes()` to `createIndexes()` plus a presence report.
2. Add `health-check-ping.model.ts` (new, minimal passthrough schema).
3. Add `verify-read-write.ts` (new standalone script per Decision 3).
4. Add `verify:indexes` and `verify:read-write` npm scripts to
   `package.json`.
5. Update README.md documenting both scripts and the Mongoose-only
   statement.
6. Update/add corresponding unit tests (see Files below).
7. Run `npm test`, `npm run test:coverage`, `npm run build`; recommend
   `npm run test:e2e` as low-cost regression insurance for `GET /health`.
8. Re-run repo-wide grep for Prisma migration commands as AC-006
   evidence.

## Files

### Files to Create

- `src/data/models/health-check-ping.model.ts` — minimal schema,
  `timestamps: true`, collection `health_check_pings`, no
  hooks/validators/indexes.
- `src/main/verify-read-write.ts` — standalone script per Decision 3.
- `test/unit/main/verify-read-write.spec.ts` — happy path, write
  failure, read-mismatch failure, cleanup failure cases.
- `test/unit/data/models/health-check-ping.model.spec.ts` — light
  structural test (pure passthrough schema, no hooks — proportionate per
  testing.md exception language).

### Files to Modify

- `src/main/create-indexes.ts` — iterate all 8 models; `createIndexes()`
  instead of `syncIndexes()`; presence report; preserve existing
  try/catch/finally/exitCode/sanitized-log shape.
- `package.json` — add `verify:indexes` and `verify:read-write` scripts.
- `README.md` — document both scripts and the Mongoose-only statement.
- `test/unit/main/create-indexes.spec.ts` — mock all 8 models; assert
  additive-only behavior (no drop-capable call ever invoked); assert
  report content; keep sanitized-error non-leak tests.

No changes required to: `src/infra/config/env.ts`,
`src/infra/database/mongoose.ts`, `src/infra/server.ts`,
`src/main/index.ts`, `GET /health` stack — regression-verify via existing
tests only, do not modify.

## Contract Impact

None. `GET /health` route/response/status unchanged (AC-007). No Swagger
changes needed. The new `health_check_pings` collection is never exposed
via any route/use case; it is always cleaned up by the script itself.

## Persistence Impact

- `create-indexes.ts` moves from a destructive `syncIndexes()` call to an
  additive-only `createIndexes()` call plus a read-only presence report,
  covering all 8 Mongoose models instead of 3.
- A new, minimal, isolated collection `health_check_pings` is introduced
  solely for the controlled write→read→cleanup verification cycle; no
  hooks, validators, or indexes are declared on it, and it is never
  populated outside of the `verify-read-write.ts` script's own
  create/cleanup cycle.
- No changes to existing model schemas, indexes, or uniqueness
  constraints.

## Security Impact

- NFR-001 (no sensitive logging): all new/changed logging must log only
  `error.message` or a fixed string, never raw error/`.cause`/connection
  string, mirroring the existing tested pattern.
- No changes to authentication, authorization, cookies, CORS, or upload
  handling.

## Swagger Impact

None. No route, controller, or middleware contract changes.

## Testing Strategy

All new/changed code is unit-testable via the existing model-mocking
pattern (`jest.doMock` on models/`connectDatabase`/`disconnectDatabase`)
— no real DB needed. `>= 80%` new/changed-code coverage target (per
`.claude/rules/testing.md`) expected without exception.

`health-check-ping.model.ts` is a pure passthrough schema — a light
structural test is proportionate per testing.md's exception language;
full behavioral tests are required for `create-indexes.ts` and
`verify-read-write.ts` (real branching/error handling).

Run `npm test`, `npm run test:coverage`, `npm run build` after changes.
Recommend also running `npm run test:e2e` as low-cost regression
insurance for `GET /health` (AC-007), though not strictly required (no
route/middleware/auth/cookie/server-composition change).

AC-006 validation: re-run
`grep -ri "prisma|migrate deploy|schema.prisma"` across the repo
(excluding `specs/`) as tester/reviewer evidence; expect zero matches.

## Risks

- `syncIndexes()` → `createIndexes()` is an intentional, spec-mandated
  safety improvement (no longer drops stray indexes) — not a regression;
  must be documented as such to the reviewer.
- Including currently-unused models (WorkImage/AdminUser/PortfolioWork)
  in index verification is harmless (additive-only) but should be
  flagged to the reviewer as a literal FR-003 scope reading.
- NFR-001 (no sensitive logging): all new/changed logging must log only
  `error.message` or a fixed string, never raw error/`.cause`/connection
  string, mirroring the existing tested pattern.
- No breaking changes to existing scripts/routes; `purge:expired-works`
  and other scripts unchanged.

## Implementation Steps

See Execution Flow above (steps 1–8).

## Definition of Done Mapping

- FR-001/FR-002 → AC-001, AC-002 — already satisfied, regression-verify
  only, no code change.
- FR-003, FR-004 → AC-003 — satisfied by Decisions 1 and 2
  (`create-indexes.ts` covering all 8 models with a presence report).
- FR-005 → AC-004 — satisfied by Decision 1 (additive-only
  `createIndexes()`, never drop-capable).
- FR-006 → AC-005 — satisfied by Decision 3
  (`verify-read-write.ts` + `HealthCheckPingModel`).
- FR-007 → AC-006 — already satisfied; verification evidence via
  repo-wide grep, no code change.
- FR-008 → AC-007 — already satisfied; regression-verify only, no code
  change.
- NFR-001 → sanitized logging preserved/extended per existing pattern.
- NFR-002 → idempotency preserved (additive-only operations against an
  already-healthy, already-indexed database do not change behavior or
  data).
- NFR-003 → no destructive operations introduced (Decision 1 removes the
  only destructive path).
- NFR-004 → satisfied by Decision 4 (npm scripts + README documentation).

## Open Non-Blocking Questions

The spec's two non-blocking open questions (index-verification
mechanism, read/write procedure shape) are resolved by Decisions 1 and 3
above; no open non-blocking questions remain.

## Required Output

Plan:

`specs/CARSHOP-38/plan.md`

Status:

`WRITTEN`
