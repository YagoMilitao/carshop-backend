# CARSHOP-91 — E2E auth suite must run against an isolated test MongoDB instance

## Status

Ready

## Source

Notion Task:
CARSHOP-91

## Context

`test/e2e/app.e2e-spec.ts` exercises the auth flow (login, session, refresh,
logout) by calling `createApp()` from `src/infra/server.ts` directly.

`createApp()` always instantiates `MongoSessionStoreRepository`, a
Mongoose-backed implementation that requires an active MongoDB connection.
The e2e suite never establishes any MongoDB connection (neither a real
external instance nor an in-memory one), even though `mongodb-memory-server`
already exists as a project devDependency.

As a result, `POST /auth/login` attempts to persist a session, the Mongo
driver stalls until its connection timeout is reached, the request fails
with a `500` response, and the test exceeds Jest's default timeout. There is
currently no working end-to-end validation of the authentication flow
(login, refresh, session, logout), nor of any other endpoint that depends on
a Mongo-backed repository.

The blocking prerequisite, CARSHOP-90 (Jest e2e configuration fix), is
already resolved: the suite now loads the application correctly and fails
only because of this Mongo-connectivity gap.

## Objective

Running `npm run test:e2e` must exercise the full auth flow described in the
Definition of Done end-to-end, against an isolated test MongoDB instance,
without requiring any manually started or externally provided MongoDB
process. The suite must pass reproducibly on a local machine and in CI.

## Functional Requirements

- FR-001: When `npm run test:e2e` is executed, the auth e2e suite must be
  able to persist and read session data during the test run without
  connecting to a real/external MongoDB deployment.
- FR-002: `POST /auth/login` with valid admin credentials must respond
  `200` and return an access token, a session identifier, and the expected
  authentication cookies, without timing out.
- FR-003: `GET /auth/session`, when called with a valid access token issued
  by the preceding login, must respond `200` and return session data
  consistent with the login response (matching `sessionId`).
- FR-004: `POST /auth/refresh`, when called with valid session cookies but
  without the required CSRF header, must respond `403`.
- FR-005: `POST /auth/refresh`, when called with valid session cookies and
  the matching CSRF header, must respond `200` and return a rotated access
  token different from the one issued at login, along with rotated
  session cookies.
- FR-006: `POST /auth/logout`, when called with the rotated session cookies
  and matching CSRF header, must respond `200`.
- FR-007: `GET /auth/session`, when called after logout with the
  access token obtained from refresh, must respond `401`.
- FR-008: The mechanism that provides the isolated test MongoDB instance
  must be established and torn down automatically as part of the e2e test
  run, without requiring a separate manual step before or after invoking
  `npm run test:e2e`.

## Non-Functional Requirements

- NFR-001 (Reliability): `npm run test:e2e` must pass reproducibly across
  repeated local runs and in CI, without flakiness caused by shared or
  leftover state between runs.
- NFR-002 (Isolation): The isolated test MongoDB instance used by the e2e
  suite must not read from or write to any real/production/shared
  development database.
- NFR-003 (Security): The fix must preserve the existing authentication and
  session model as defined in `.claude/rules/security.md` — short-lived
  access tokens, rotating refresh tokens, server-side session tracking with
  explicit revocation, and double-submit CSRF protection on refresh and
  logout. No change may weaken cookie attributes (`HttpOnly`, `Secure`,
  `SameSite`, path, expiration) or the CSRF validation flow.
- NFR-004 (Compatibility): Production wiring and behavior — the app started
  by `src/main/index.ts` against the configured `MONGO_URI` — must remain
  unchanged. Any accommodation added to make the composition root
  test-friendly must not alter runtime behavior when the application is
  started normally.
- NFR-005 (No external dependency): Running `npm run test:e2e` must not
  require Docker, a manually started `mongod` process, or network access to
  an external MongoDB service.

## Acceptance Criteria

- AC-001: Running `npm run test:e2e` completes without any manually started
  or externally reachable MongoDB process available in the environment.
- AC-002: The `Auth flow (e2e)` test in `test/e2e/app.e2e-spec.ts` passes,
  covering in sequence: login → `200`, session → `200`, refresh without
  CSRF → `403`, refresh with CSRF → `200`, logout → `200`, session after
  logout → `401`.
- AC-003: Running `npm run test:e2e` twice in succession on the same
  machine produces the same passing result both times (no state leakage
  between runs).
- AC-004: Starting the application via `npm run start` / `npm run
  start:prod` against a real `MONGO_URI` continues to work exactly as
  before; no production code path silently switches to a test-only data
  store.
- AC-005: No existing security control is weakened: refresh and logout
  still require a valid `X-CSRF-Token` header matching the `csrf_token`
  cookie, the `refresh_token` cookie remains `HttpOnly`, and an access token
  issued before logout is rejected (`401`) after the session is revoked.

## Constraints

- The chosen isolation mechanism must not require a real, externally
  reachable MongoDB deployment for `npm run test:e2e` to pass.
- `mongodb-memory-server` is already present in the project's
  devDependencies; introducing a new external service or a new dependency
  to solve this is out of scope unless the architect determines the
  existing devDependency is insufficient.
- Any change to `src/infra/server.ts` or other composition-root code must
  preserve current production wiring and must not be reachable or
  activated outside of the test execution context.
- No secret, credential, or real connection string may be introduced,
  hardcoded, or logged as part of the fix (see
  `.claude/rules/spec-security.md` and `.claude/rules/security.md`).
- The fix must follow the project's existing hexagonal layering; it must
  not introduce Mongoose or Express details into domain or use-case code.

## Dependencies

- CARSHOP-90 (Jest e2e `moduleNameMapper`/`rootDir` configuration fix) —
  already resolved; the e2e suite currently loads the application
  correctly and fails only on the Mongo-connectivity issue addressed here.
- `mongodb-memory-server` devDependency, already present in `package.json`.

## Out of Scope

- Adding e2e coverage for endpoints other than the auth flow described in
  the Definition of Done (works, comments, image upload) is not part of
  this task.
- Changing the production database technology, connection library, or
  Mongo topology.
- Changing the authentication/session/CSRF business rules themselves
  (only their testability against an isolated database is in scope).
- Introducing a new external service or paid infrastructure for CI.

## Risks

- Any change that makes the Mongo connection configurable at the
  composition-root level (`src/infra/server.ts`) carries a risk of
  accidentally affecting production wiring if not carefully scoped to the
  test execution path only.
- Improper teardown of the isolated test MongoDB instance between test
  runs could cause state leakage and flaky results (see NFR-001, AC-003).
- Because the task may touch `src/infra/server.ts` (a composition-root/
  infrastructure file), it must not be treated as a trivial, unreviewed
  change; the architectural decision on how to inject the test connection
  must be validated before implementation.

## Open Questions

### Blocking

None.

### Non-blocking

- Whether the isolated MongoDB connection is provided to the composition
  root via a Jest `globalSetup`/`globalTeardown` hook that only sets
  `process.env.MONGO_URI` before `createApp()` is called, or via an
  explicit dependency-injection seam added to `src/infra/server.ts`, is an
  implementation decision left to the architect. Both approaches satisfy
  the functional and non-functional requirements above; the choice does
  not change WHAT this specification requires.

## Traceability

FR-001 → AC-001, AC-002
FR-002 → AC-002
FR-003 → AC-002
FR-004 → AC-002, AC-005
FR-005 → AC-002, AC-005
FR-006 → AC-002, AC-005
FR-007 → AC-002, AC-005
FR-008 → AC-001, AC-003
NFR-001 → AC-003
NFR-002 → AC-002, AC-003
NFR-003 → AC-005
NFR-004 → AC-004
NFR-005 → AC-001
