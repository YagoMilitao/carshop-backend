# CARSHOP-91 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-91/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Make `npm run test:e2e` run the full auth e2e flow against an isolated
test MongoDB instance, without requiring any manually started or
externally reachable MongoDB process, with zero changes to `src/`.

## Current Architecture

`createApp()` (`src/infra/server.ts:26-82`) instantiates
`MongoSessionStoreRepository` / `MongoWorkRepository` /
`MongoCommentRepository`, all Mongoose-backed, but never calls
`mongoose.connect()` itself. The actual connection is only established by
`connectDatabase(env.mongoUri)` in `src/main/index.ts:13`, which
`createApp()` never calls and which `test/e2e/app.e2e-spec.ts` never calls
either.

With no connection open, Mongoose's command buffering queues
`AuthSessionModel.create(...)` during `POST /auth/login` until it times
out.

`src/infra/config/env.ts` validates `MONGO_URI` eagerly at module-load
time (imported at the top of `createApp()`'s dependency chain), and
`app.e2e-spec.ts` imports `createApp` at the top of the file — so
`process.env.MONGO_URI` must be set BEFORE Jest even requires the spec
file's module graph. A `beforeAll` inside the spec file is too late.

## Proposed Solution

Jest `globalSetup`/`globalTeardown` (test-only, zero `src/` changes). No
change to `src/infra/server.ts`, `src/main/index.ts`, or any other `src/`
file. `connectDatabase`/`disconnectDatabase`
(`src/infra/database/mongoose.ts`) already accept a `mongoUri` parameter,
decoupled from `env.mongoUri`.

## Technical Decisions

### Decision

Use Jest `globalSetup`/`globalTeardown` with `mongodb-memory-server` to
provision an isolated, in-memory MongoDB instance for the e2e suite,
setting `process.env.MONGO_URI` before any test module (including
`env.ts`) is evaluated. The e2e spec itself explicitly calls
`connectDatabase`/`disconnectDatabase` around the existing test.

### Reason

`env.ts` validates `MONGO_URI` eagerly at module-load time, and
`app.e2e-spec.ts` imports `createApp` at the top of the file, so the
environment variable must exist before Jest requires the spec file's
module graph — only a Jest `globalSetup` (which runs once in Jest's main
process before any test file is required) satisfies that ordering
constraint. `connectDatabase`/`disconnectDatabase` already accept a URI
parameter and are decoupled from `env.mongoUri`, so no new seam is
needed. `mongodb-memory-server` is already a devDependency, avoiding a
new dependency.

### Alternatives Considered

Adding a configurable Mongo-connection seam to `src/infra/server.ts`
(e.g. an injectable `mongoUri`/session-store factory param to
`createApp()`).

### Trade-offs

The seam alternative was rejected because `connectDatabase` already
takes a URI param and `createApp()` never calls it (no seam needed), and
touching the composition root would add review surface for zero
functional gain, contradicting `architecture.md`'s "do not introduce a
new architectural pattern without justification." The chosen
`globalSetup`/`globalTeardown` approach keeps all changes confined to
`test/`, at the cost of relying on Jest's own env-var-mutation timing
pattern for `mongodb-memory-server` (confirmed compatible with the
project's `jest ^30.3.0`).

## Execution Flow

1. Jest `globalSetup` (runs once in Jest's main process, before any test
   file is required, i.e. before `env.ts` is ever evaluated): starts a
   `MongoMemoryServer`, gets its URI, sets `process.env.MONGO_URI` to
   that URI. Worker processes that execute test files start after
   `globalSetup` completes and inherit `process.env`.
2. The `MongoMemoryServer` instance is stashed on `globalThis` under a
   dedicated typed key (`globalSetup` and `globalTeardown` are separate
   files that only share process-level state).
3. Test file (`app.e2e-spec.ts`): new `beforeAll` calls
   `connectDatabase(process.env.MONGO_URI as string)` (defensive throw if
   unset), new `afterAll` calls `disconnectDatabase()`. Existing
   `beforeEach` (env vars + `createApp()`) stays unchanged.
4. Jest `globalTeardown` (runs once in the main process after all test
   files/workers finish): retrieves the `MongoMemoryServer` from
   `globalThis`, calls `.stop()`.

A fresh `MongoMemoryServer` (empty datastore) is created per
`npm run test:e2e` invocation and torn down at the end — no persisted
state between invocations, no leaked `mongod` process, no hardcoded port
(`MongoMemoryServer.create()` auto-selects a free port).

## Files

### Files to Create

- `test/e2e/setup/mongo-memory-server.context.ts` — typed helper
  (`setMongoMemoryServer`/`getMongoMemoryServer`) storing the
  `MongoMemoryServer` instance on `globalThis` under a dedicated key, no
  `any`. Shared state bridge between `globalSetup` and `globalTeardown`.
- `test/e2e/setup/mongo-memory-server.global-setup.ts` — default async
  function: `MongoMemoryServer.create()` → `process.env.MONGO_URI =
  server.getUri()` → `setMongoMemoryServer(server)`.
- `test/e2e/setup/mongo-memory-server.global-teardown.ts` — default async
  function: `getMongoMemoryServer()?.stop()`.

### Files to Modify

- `test/jest-e2e.json` — add `"globalSetup"` and `"globalTeardown"` keys
  pointing to the two files above via `<rootDir>`. Does not affect
  `package.json`'s root jest config (unit tests unaffected).
- `test/e2e/app.e2e-spec.ts` — add import of
  `connectDatabase`/`disconnectDatabase` from
  `../../src/infra/database/mongoose`; add `beforeAll` calling
  `connectDatabase(process.env.MONGO_URI as string)`; add `afterAll`
  calling `disconnectDatabase()`. Keep existing `beforeEach` unchanged.

No file under `src/**` is touched.

`mongodb-memory-server` is already a devDependency (`package.json`) and
in `package-lock.json` — no new dependency introduced. Note:
`node_modules` was absent in this checkout at analysis time; developer
must run `npm install` first (environment setup, not a dependency
change).

## Contract Impact

No change. No route, controller, middleware, status code, cookie,
header, or schema changes required.

## Persistence Impact

No production persistence code changes. The e2e suite now connects to an
isolated, ephemeral in-memory MongoDB instance instead of never
connecting at all. Production wiring (`main/index.ts`'s
`connectDatabase(env.mongoUri)`) is unaffected — zero `src/` changes.

## Security Impact

- Zero `src/` changes → production wiring
  (`main/index.ts`'s `connectDatabase(env.mongoUri)`) provably
  unaffected.
- No change to `AuthService`, `auth.middleware.ts`,
  `csrf-protection.middleware.ts`, cookie attributes, or token
  validation. Existing assertions (CSRF 403/200, `HttpOnly` cookie, 401
  after logout) now actually execute instead of never being reached due
  to the login timeout.
- `mongodb-memory-server`'s first-run `mongod` binary download requires
  one-time network access (cached after) — accepted per the spec's
  pre-authorization of this devDependency; not a new external MongoDB
  *service* dependency (NFR-005 targets that, not the one-time binary
  fetch).
- Jest's `globalSetup` env-var-mutation pattern for
  `mongodb-memory-server` is Jest's own documented pattern; confirmed
  compatible with the project's `jest ^30.3.0`.
- Current spec file has exactly one `it()` block, so no inter-test DB
  cleanup is required now; if future e2e specs add more `it()` blocks, an
  `afterEach` collection-clear should be added then (explicitly out of
  scope for this task, to avoid scope creep).
- No transactions/replica set needed (`AuthSessionModel`/auth flow use no
  `session.startSession()`/`withTransaction`) — standalone
  `MongoMemoryServer` suffices.
- No hardcoded port; `MongoMemoryServer.create()` auto-selects a free
  port.

## Swagger Impact

None. No route, controller, middleware, status code, cookie, header,
schema, or Swagger fragment changes required.

## Testing Strategy

This task produces no new/changed production code under `src/**/*.ts`,
so the `>= 80%` unit-coverage policy in `.claude/rules/testing.md` does
not apply (scope-based non-applicability, not an invoked exception — no
`src/` diff exists to measure).

Required validation:

- `npm run test:e2e` must pass the full Auth flow (e2e) sequence:
  login→200, session→200, refresh w/o CSRF→403, refresh w/ CSRF→200,
  logout→200, session after logout→401.
- Run `npm run test:e2e` twice in immediate succession to confirm
  reproducibility and full `mongod` teardown (no port collision/hang)
  between runs.
- Run `npm test` (unit suite) to confirm it is unaffected (separate Jest
  config, not referenced by `package.json`'s root jest block).
- Run `npm run build` since new TypeScript test-support files are added.
- Confirm no manually started `mongod`/Docker/external Mongo is present
  during validation, to genuinely prove no-external-Mongo-required.
- Acceptance criteria mapping: FR-001 → e2e passes without external
  Mongo; FR-002..007 → the six sequential assertions in the existing
  `it()`; FR-008 → `globalSetup`/`globalTeardown` lifecycle;
  NFR-001/AC-003 → double-run reproducibility; NFR-002 → isolated
  in-memory instance, never shared/prod URI; NFR-003/AC-005 → existing
  CSRF/cookie/401-after-logout assertions now execute; NFR-004/AC-004 →
  zero `src/` diff.

## Risks

- Any change that makes the Mongo connection configurable at the
  composition-root level carries a risk of accidentally affecting
  production wiring if not carefully scoped — mitigated here by making
  zero `src/` changes.
- Improper teardown of the isolated test MongoDB instance between test
  runs could cause state leakage and flaky results (see NFR-001,
  AC-003) — mitigated by the `globalTeardown` `.stop()` call and the
  double-run validation step.
- `mongodb-memory-server`'s first-run `mongod` binary download requires
  one-time network access (cached after).
- No ADR/pattern precedent existed for DI-seam/composition-root design
  (fresh ground, consistent with deciding not to touch the composition
  root at all). One troubleshooting note
  (`mongoose-pre-save-hook-unit-testing-without-db.md`) states "test/unit/
  never hits a real DB; test/e2e/ does" — this plan is compatible:
  `mongodb-memory-server` runs a genuine MongoDB-compatible engine, just
  ephemeral/in-memory rather than persistent/shared; only provisioning
  changes, not the real-engine-vs-mock distinction.

## Implementation Steps

1. Run `npm install` (environment setup; `node_modules` absent at
   analysis time; no dependency change).
2. Create `test/e2e/setup/mongo-memory-server.context.ts` (typed
   `globalThis` bridge helper).
3. Create `test/e2e/setup/mongo-memory-server.global-setup.ts` (starts
   `MongoMemoryServer`, sets `process.env.MONGO_URI`, stashes instance).
4. Create `test/e2e/setup/mongo-memory-server.global-teardown.ts` (stops
   the stashed `MongoMemoryServer`).
5. Update `test/jest-e2e.json` to register `globalSetup` and
   `globalTeardown`.
6. Update `test/e2e/app.e2e-spec.ts` to add `beforeAll`
   `connectDatabase(...)` and `afterAll` `disconnectDatabase()`, keeping
   the existing `beforeEach` unchanged.
7. Run validation per Testing Strategy above.

## Definition of Done Mapping

- FR-001 → e2e suite persists/reads session data without a real/external
  MongoDB deployment (via `MongoMemoryServer`).
- FR-002 → login `beforeAll`/`it()` assertion, `200` + tokens/cookies, no
  timeout, now reachable because the connection exists.
- FR-003 → session `200` assertion with matching `sessionId`.
- FR-004 → refresh without CSRF header → `403` assertion.
- FR-005 → refresh with CSRF header → `200` + rotated token/cookies
  assertion.
- FR-006 → logout `200` assertion.
- FR-007 → session after logout → `401` assertion.
- FR-008 → `globalSetup`/`globalTeardown` lifecycle, automatic, no manual
  step.
- NFR-001/AC-003 → double `npm run test:e2e` run validation.
- NFR-002 → isolated in-memory instance only, never a shared/prod URI.
- NFR-003/AC-005 → existing CSRF/cookie/401-after-logout assertions
  execute unchanged.
- NFR-004/AC-004 → zero `src/` diff; production wiring untouched.
- NFR-005/AC-001 → no Docker, no manually started `mongod`, no external
  network MongoDB service required.
- AC-002 → full sequential assertion chain in the existing `it()` block.

## Open Non-Blocking Questions

None remaining. The spec's non-blocking open question (globalSetup/
globalTeardown vs. an explicit DI seam in `src/infra/server.ts`) has been
resolved by the architect in favor of `globalSetup`/`globalTeardown`, as
recorded in the Technical Decisions section above.
