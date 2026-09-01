# CARSHOP-111 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-111/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Add a small, deterministic E2E regression suite (against the real
composition-root `createApp()`, real Express middleware chain, in-memory
Mongo, no real external services) proving nine security-control acceptance
criteria (AC-001–009 in `specs/CARSHOP-111/spec.md`), and wire it (or a
designated required subset) into CI so a regression fails the build.

## Current Architecture

Facts confirmed against the repository (ground truth):

- No CI pipeline currently runs `test:e2e` — only
  `.github/workflows/sonar-backend.yml` exists, running
  `npm run test:coverage` (unit only).
- Composition-Root Override Seam (`createApp(overrides)`) confirmed
  current: `src/infra/server.ts` `CreateAppOverrides` only exposes
  `imageStorage?: ImageStoragePort`. Reusable, including to
  deterministically force a generic 5xx via a throwing `ImageStoragePort`
  double.
- 9 existing e2e spec files (not 7 as an old note said):
  `admin-comment-hard-delete`, `admin-work-hard-delete`, `app`,
  `auth-login-rate-limit`, `comment-moderation-flow`, `work-crud`,
  `work-image-upload`, `works`, plus
  `support/fake-image-storage.adapter.ts` and `setup/*`. No dedicated
  security-controls suite exists.
- `jest-e2e.json` `rootDir` fix (CARSHOP-90) verified current, no
  regression.
- `env.ts` eager validation / globalSetup requirement verified current and
  binding: `test/e2e/setup/mongo-memory-server.global-setup.ts` sets
  `process.env.MONGO_URI` before Jest requires spec files. New spec files
  must follow the same `beforeEach` env-setting pattern already used
  everywhere (`JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
  `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`), plus `CORS_ORIGIN` where
  CORS is exercised.
- `maxWorkers: 1` in `jest-e2e.json` serializes spec files within one
  Jest run; new specs must still use distinct IPs/slugs/emails per
  scenario to avoid collisions.
- CARSHOP-104 error-handler-arity fix verified current (4-arg signature).
  AC-006 suite should generalize the existing single login-failure
  assertion into a representative set (400, 401, 403, 413, 429, and via
  the override seam, 500).
- No existing Helmet/CORS/rate-limit/CSRF-suite/fake-clock notes —
  designed fresh, reusing the fake-clock pattern already proven in
  `auth-login-rate-limit.e2e-spec.ts`.
- Overlap-avoidance decision: `test/e2e/auth-login-rate-limit.e2e-spec.ts`
  (CARSHOP-108) already fully owns the login-specific rate limiter — this
  suite must not duplicate that; it covers the GLOBAL rate limiter
  (`globalRateLimitMiddleware`, 100/15min) instead, which has zero
  existing E2E coverage. `work-image-upload.e2e-spec.ts` (CARSHOP-103)
  already owns upload success/validation flows; this suite only reuses
  the upload path once, as a vehicle to force a generic 500 for AC-006.

Middleware order and behavior (ground truth):

- Middleware order in `registerBaseMiddlewares`
  (`src/infra/config/middleware.ts`): `helmet()` → `cors(buildCorsOptions())`
  → `globalRateLimitMiddleware` → `express.json({ limit: '1mb' })` →
  `morgan`. Terminal: `notFoundMiddleware` → `errorHandlerMiddleware`
  (4-arg, confirmed).
- `buildCorsOptions()`: origin allow-list from `env.corsOrigins`
  (comma-split `CORS_ORIGIN`); requests with no `Origin` header are always
  allowed; a present-but-disallowed origin causes the origin callback to
  invoke `callback(new Error(...))`.
- Verified in `node_modules/cors/lib/index.js`: the `cors` middleware
  calls `next(err)` when the origin callback errors. That plain `Error`
  is neither `HttpError` nor `SyntaxError`, so `errorHandlerMiddleware`'s
  generic branch fires: HTTP 500, body
  `{ message: 'Erro interno no servidor.' }`, no
  `Access-Control-Allow-Origin` header, `console.error(error)`
  server-side only. This is the actual current behavior for a disallowed
  origin — not a 403. The plan asserts on it precisely (status 500 and
  header absence), not on an assumed different contract.
- `globalRateLimitMiddleware`: 100 req / 15 min, `standardHeaders: true`
  (`RateLimit-*` headers), `legacyHeaders: false`, counts all requests.
  `loginRateLimitMiddleware`: 5/5min, already fully covered by
  CARSHOP-108's spec — do not duplicate.
- `auth.middleware.ts`: rejects missing/absent bearer (401), non-'access'
  token type (401 — covers refresh-used-as-access), inactive session
  (401 — covers revoked). `SessionStorePort.isActive()` (Mongo impl)
  returns false when `revokedAt` is a number or `expiresAt <= Date.now()`.
- `JsonWebTokenService.verify()`: any `jsonwebtoken` verify failure (bad
  signature, expired) is normalized to `HttpError(401, 'Token inválido ou
  expirado.')` — confirms tampered and expired tokens both 401 via the
  same code path.
- `csrfProtectionMiddleware` runs before `AuthController.refresh`/
  `.logout` on `/auth/refresh` and `/auth/logout` — a CSRF failure
  structurally never reaches the controller/`AuthService`, so "session
  state unaltered" can be asserted both by DB session count and by
  re-using the original still-valid access token against
  `GET /auth/session` afterward.
- `MongoWorkRepository.findById()` queries by the app's own string id
  field (not Mongo `_id`), so a malformed work id does not produce a
  Mongoose `CastError`/500 — there is no natural, unmodified 5xx trigger
  in the works/comments flow. The clean way to force a genuine 5xx
  without touching `src/` or weakening any control is the existing
  `createApp({ imageStorage })` override seam: inject a throwing
  `ImageStoragePort` double on the upload path
  (`POST /admin/works/:workId/images`), not caught by
  `normalizeUploadError` (that only wraps Multer errors) — the use-case
  failure propagates through `WorkImageController.upload`'s generic catch
  to `next(error)` → `errorHandlerMiddleware`'s generic 500 branch.
- Fake-clock pattern already proven in
  `auth-login-rate-limit.e2e-spec.ts`:
  `jest.useFakeTimers({ doNotFake: [...] })` (excluding
  `setTimeout`/`setInterval`/socket-related timers) +
  `jest.setSystemTime(futureEpochMs)`, freezing only `Date`/`performance`.
  Works for both `express-rate-limit`'s `Date.now()` check and
  `jsonwebtoken`'s expiry check, serving both the expired-access-token
  scenario (AC-005) and, if needed, a rate-limit-window-reset scenario
  (AC-007).
- `mongodb-memory-server` IS already wired (`test/e2e/setup/*`,
  referenced by `test/jest-e2e.json`'s `globalSetup`/`globalTeardown`) —
  no new wiring work required, only reuse.
- CI: only `.github/workflows/sonar-backend.yml` exists; it never runs
  `npm run test:e2e`. AC-009 requires adding this.

## Proposed Solution

Pure test-authoring change: no `src/` production code changes. All new
files live under `test/e2e/` and one workflow file under
`.github/workflows/`.

File organization — one new spec file per control domain (mirrors
existing convention):

1. `test/e2e/security-http-headers.e2e-spec.ts` — AC-001 (Helmet + no
   `X-Powered-By`).
2. `test/e2e/security-cors-policy.e2e-spec.ts` — AC-002 (allowed vs.
   disallowed origin).
3. `test/e2e/security-body-size-limit.e2e-spec.ts` — AC-003 (413 before
   route logic).
4. `test/e2e/security-csrf-protection.e2e-spec.ts` — AC-004
   (refresh/logout, missing + mismatched CSRF, session-state-unaltered).
5. `test/e2e/security-token-session-authorization.e2e-spec.ts` — AC-005
   (tampered, refresh-as-access, revoked, expired).
6. `test/e2e/security-error-leakage.e2e-spec.ts` — AC-006 (representative
   400/401/403/413/429/500, no leakage).
7. `test/e2e/security-rate-limit-global.e2e-spec.ts` — AC-007 (global
   limiter headers + 429; explicitly not the login limiter).

New shared test support (scoped, not touching `src/`):

- `test/e2e/support/security-test.helpers.ts` — `extractCookie`/
  `getSetCookieArray` + `loginAsAdmin(app)` helper, shared by the new
  files only (does not refactor existing spec files).
- `test/e2e/support/fake-clock.helper.ts` — wraps the exact
  `jest.useFakeTimers`/`jest.setSystemTime` pattern already proven in
  `auth-login-rate-limit.e2e-spec.ts`, parameterized by target future
  epoch.
- `test/e2e/support/failing-image-storage.adapter.ts` — minimal
  `ImageStoragePort` test double whose `upload()` rejects with a plain
  `Error('Simulated upstream failure.')`. Used only by file 6.

No change to `CreateAppOverrides` itself is needed.

## Technical Decisions

### Decision

Use the existing `createApp(overrides)` composition-root seam
(`imageStorage?: ImageStoragePort`) to inject a throwing image-storage
double for the AC-006 500 scenario, instead of modifying `src/` to add a
new fault-injection path.

### Reason

The seam already exists and is minimal; it lets the test force a genuine
5xx through the real error-handling pipeline without weakening any
production code or adding new production surface area.

### Alternatives Considered

- Modifying `MongoWorkRepository`/routes to introduce an artificial
  failure path — rejected: touches `src/`, out of scope for a
  test-authoring task, and risks weakening a real control.
- Relying on a malformed work id to trigger a Mongoose `CastError` — not
  viable: repository queries by the app's own string id field, not Mongo
  `_id`, so this does not naturally produce a 5xx.

### Trade-offs

Slightly narrows the 500 scenario to the upload flow specifically (since
that's where the override seam is exposed), rather than a generic route;
accepted as sufficient for AC-006's "representative" 5xx requirement.

---

### Decision

Cover only the global rate limiter (`globalRateLimitMiddleware`,
100/15min) in this suite; do not re-test the login-specific rate limiter
already owned by `auth-login-rate-limit.e2e-spec.ts` (CARSHOP-108).

### Reason

NFR-004 (non-duplication) and the constraint against duplicating
scenarios already fully owned by other rate-limit-specific E2E tests.

### Alternatives Considered

- Duplicating login-limiter coverage here for completeness — rejected as
  direct duplication of existing, already-passing coverage.

### Trade-offs

This suite does not exercise a rate-limit-window-reset scenario for the
global limiter (deferred/omitted to avoid duplicating CARSHOP-108's
fake-clock reset test pattern against a different limiter).

---

### Decision

Assert the CORS-disallowed-origin behavior exactly as currently
implemented (HTTP 500, generic body, no
`Access-Control-Allow-Origin` header) rather than asserting an assumed
"more correct" 403.

### Reason

This is a regression suite documenting actual current behavior. Verified
directly against `node_modules/cors/lib/index.js` and
`errorHandlerMiddleware`'s generic branch. Changing this behavior is out
of scope (Out of Scope section of spec.md explicitly excludes changing
existing control configuration/behavior).

### Alternatives Considered

- Treating the 500-on-disallowed-origin as a defect to fix as a side
  effect — rejected: out of scope for this test-authoring task; flagged
  as an observation only.

### Trade-offs

None functionally; documented as a risk/observation so it isn't
mistaken for a defect discovered and silently "fixed."

---

### Decision

Extend the existing `.github/workflows/sonar-backend.yml` job
(add a step running `npm run test:e2e` after "Run unit tests with
coverage" and before the SonarCloud scan) rather than creating a new CI
job.

### Reason

Simplest change; reuses the single checkout/install already performed in
that job; `mongodb-memory-server`'s pinned binary version (`8.0.29`)
already targets Ubuntu 24.04 matching `runs-on: ubuntu-latest`'s current
image, so no new CI environment setup is needed.

### Alternatives Considered

- A new, separate CI job dedicated to E2E — rejected as unnecessary
  additional CI setup/duplication for this task's scope.

### Trade-offs

E2E test failures will fail the same job that also runs unit
tests/Sonar scan, rather than being isolated in their own job/status
check.

## Execution Flow

1. Create shared test support files
   (`security-test.helpers.ts`, `fake-clock.helper.ts`,
   `failing-image-storage.adapter.ts`).
2. Create the 7 new `security-*.e2e-spec.ts` files, one per control
   domain, following existing E2E conventions (env setup, in-memory
   Mongo, `createApp()`).
3. Extend `.github/workflows/sonar-backend.yml` with the new
   `npm run test:e2e` step (AC-009).
4. Run validation commands (see Testing Strategy) locally before
   considering the task complete.

## Files

### Files to Create

- `test/e2e/security-http-headers.e2e-spec.ts` — AC-001
- `test/e2e/security-cors-policy.e2e-spec.ts` — AC-002
- `test/e2e/security-body-size-limit.e2e-spec.ts` — AC-003
- `test/e2e/security-csrf-protection.e2e-spec.ts` — AC-004
- `test/e2e/security-token-session-authorization.e2e-spec.ts` — AC-005
- `test/e2e/security-error-leakage.e2e-spec.ts` — AC-006
- `test/e2e/security-rate-limit-global.e2e-spec.ts` — AC-007
- `test/e2e/support/security-test.helpers.ts` — shared cookie/login
  helpers for the 7 new files
- `test/e2e/support/fake-clock.helper.ts` — deterministic time control
  (AC-005, FR-017)
- `test/e2e/support/failing-image-storage.adapter.ts` — forces
  deterministic 500 (AC-006) via existing override seam

### Files to Modify

- `.github/workflows/sonar-backend.yml` — add `npm run test:e2e` step
  (AC-009)

No files under `src/` change. No Swagger fragment changes (no
contract/behavior change).

## Contract Impact

None. This task documents/proves existing behavior only.

## Persistence Impact

`AuthSessionModel` is read/written directly in tests only to simulate
revocation, mirroring the repository's own update shape (mirrors
`MongoSessionStoreRepository.revoke()`'s update shape) — no schema
change.

## Security Impact

- NFR-001 requires observing real behavior only, never bypassing it — no
  test weakens Helmet/CORS/CSRF/rate-limit/upload validation;
  `failing-image-storage.adapter.ts` only replaces the Cloudinary I/O
  boundary via the sanctioned override seam.
- Secret hygiene: error-leakage assertions check for absence of literal
  env-var-name-adjacent strings and stack-trace signatures; test code
  never logs or asserts on real secret values.
- CORS-block-returns-500 is existing, not new, behavior — must not be
  "fixed" as a side effect of this task even though a 403 might arguably
  be more correct; flagged as observation only, not a defect requiring
  action.

## Swagger Impact

None. No contract/behavior change.

## AC → Concrete Test Scenarios

- **AC-001**: `GET /` unauthenticated. Assert absence of `x-powered-by`;
  assert presence of representative Helmet default headers (confirm
  exact header names against installed `helmet@8.1.0` during
  implementation).
- **AC-002** (`security-cors-policy.e2e-spec.ts`, two scenarios):
  `beforeEach` sets `process.env.CORS_ORIGIN = 'https://allowed.e2e.test'`
  before `createApp()`. Allowed: `GET /` with
  `Origin: https://allowed.e2e.test` → 200, `access-control-allow-origin`
  echoes origin, `access-control-allow-credentials: true`. Disallowed:
  `GET /` with `Origin: https://blocked.e2e.test` → 500 generic body, no
  `access-control-allow-origin` header at all — assert header absence
  explicitly plus the observed status/body.
- **AC-003** (`security-body-size-limit.e2e-spec.ts`): `POST /auth/login`
  with JSON body > 1MB → expect 413. Assert no session/cookie side
  effects (`AuthSessionModel.countDocuments`) as evidence the route
  handler never ran.
- **AC-004** (`security-csrf-protection.e2e-spec.ts`, 4 scenarios:
  missing-CSRF-refresh, mismatched-CSRF-refresh, missing-CSRF-logout,
  mismatched-CSRF-logout): login first to get `refresh_token`/
  `csrf_token` cookies and access token; call refresh/logout omitting
  `X-CSRF-Token` header, or with a mismatched value → expect 403 each
  time; assert session state unaltered by re-hitting `GET /auth/session`
  with the original access token (200, same `sessionId`), plus
  `AuthSessionModel.countDocuments` check for no new session row.
- **AC-005** (`security-token-session-authorization.e2e-spec.ts`, all
  against `GET /auth/session`):
  - Tampered: valid access token with last char of signature segment
    mutated → 401.
  - Refresh-as-access: extract `refresh_token` cookie value from a real
    login, send as `Authorization: Bearer <value>` → 401.
  - Revoked: login, then directly
    `AuthSessionModel.findOneAndUpdate({ id: sessionId }, { revokedAt:
    Date.now() })` (mirrors `MongoSessionStoreRepository.revoke()`'s own
    update shape) → original access token now 401.
  - Expired: login with short `JWT_EXPIRES_IN` (e.g. `'5s'`) set before
    `createApp()`, advance `Date` via `fake-clock.helper` past expiry,
    call `GET /auth/session` with original access token → 401.
    `afterEach(() => jest.useRealTimers())`.
- **AC-006** (`security-error-leakage.e2e-spec.ts`, representative
  responses): 400 (malformed JSON to `POST /auth/login`, existing
  `SyntaxError` branch), 401 (unauthenticated `GET /auth/session`), 403
  (CSRF failure), 413 (reuse body-size scenario), 429 (drive
  `globalRateLimitMiddleware` past 100), 500 (via
  `failing-image-storage.adapter.ts` on
  `POST /admin/works/:workId/images`, reusing `loginAsAdmin`/`createWork`
  helpers analogous to `work-image-upload.e2e-spec.ts`). For each:
  assert `response.body` has no `stack` property,
  `JSON.stringify(response.body)` doesn't match
  `/\.ts:\d+|\/Users\/|at\s+\w+\s+\(/`, doesn't contain literal
  env-var-name-adjacent secret substrings, and `response.text` doesn't
  match `/<html/i`.
- **AC-007** (`security-rate-limit-global.e2e-spec.ts`, targeting
  `globalRateLimitMiddleware` (100/15min) via `GET /`, NOT the login
  limiter (owned by CARSHOP-108)):
  - Headers-present: single `GET /` asserts presence of
    `ratelimit-limit`/`ratelimit-remaining`/`ratelimit-reset` (confirm
    exact header names/casing against installed
    `express-rate-limit@8.7.0` during implementation).
  - 429: issue 101 sequential `GET /` requests from one fixed IP
    (`X-Forwarded-For`) → 101st returns 429 with configured message. Own
    unique `X-Forwarded-For` value to avoid bucket collisions with other
    specs in the same run. No window-reset scenario here (avoids
    duplicating CARSHOP-108's fake-clock reset test against the login
    limiter).
- **AC-008**: satisfied structurally by reusing existing
  `mongo-memory-server.global-setup/teardown.ts` +
  `connectDatabase`/`disconnectDatabase` pattern in every new file's
  `beforeAll`/`afterAll`, the `failing-image-storage.adapter.ts` double
  (no real Cloudinary calls), and `fake-clock.helper.ts` (no real
  wall-clock waits). No new file introduces any real external network
  call.
- **AC-009**: extend `.github/workflows/sonar-backend.yml` with a new
  step in the EXISTING test-and-sonar job (not a new job) after "Run
  unit tests with coverage" and before the SonarCloud scan, running
  `npm run test:e2e`, default `run:` step failure behavior fails the
  job. Rationale: simplest change, single checkout/install,
  `mongodb-memory-server`'s pinned `binary.version` `'8.0.29'` already
  targets Ubuntu 24.04 matching `runs-on: ubuntu-latest`'s current image
  — no new CI environment setup needed.

## Testing Strategy

Pure test-authoring task; no new/changed production code under `src/`,
so the `>= 80%` new/changed-code unit-test coverage target in
`.claude/rules/testing.md` is **NOT APPLICABLE** (per that rule's "Not
applicable" exception tier — no production code delta to measure). If
any genuine `src/` defect is discovered during implementation (none
anticipated), route it back to the coordinator rather than fix inline.

Validation commands for developer/tester phase:

- `npx jest --config ./test/jest-e2e.json test/e2e/security-*.e2e-spec.ts`
  (new files in isolation first)
- `npm run test:e2e` (full E2E suite, all 9 existing + 7 new files, must
  pass with no regressions)
- `npm test` and `npm run build` (type-check sanity)
- Confirm `npm run test:e2e` succeeds standalone locally before
  considering AC-009 done (no local Actions runner expected)

Traceability: every new `it(...)` should map back to its FR/AC id in the
test description, following the existing `(FR-xxx/AC-xxx)` convention
already used in `app.e2e-spec.ts` and
`auth-login-rate-limit.e2e-spec.ts`.

## Risks

- CORS-block-returns-500 is existing, not new, behavior — must not be
  "fixed" as a side effect of this task even though a 403 might arguably
  be more correct; flagged as observation only, not a defect requiring
  action.
- CI runtime growth: 7 new files + one 101-request loop, all
  in-process/in-memory, expected minor duration impact given
  `maxWorkers: 1` already serializes E2E specs.
- Determinism: expired-token assertions reuse the proven Date-only
  fake-timer pattern; 429 threshold tests use fixed unique
  `X-Forwarded-For` values to avoid bucket collisions within the same
  Jest run.
- Security: NFR-001 requires observing real behavior only, never
  bypassing it — no test weakens Helmet/CORS/CSRF/rate-limit/upload
  validation; `failing-image-storage.adapter.ts` only replaces the
  Cloudinary I/O boundary via the sanctioned override seam.
- Secret hygiene: error-leakage assertions check for absence of literal
  env-var-name-adjacent strings and stack-trace signatures; test code
  never logs or asserts on real secret values.
- `mongodb-memory-server` has not previously been wired into any test
  suite for this kind of suite before (only via the existing E2E setup
  reused here) — first-time reuse in this specific context carries some
  minor implementation risk, mitigated by reusing the already-proven
  `test/e2e/setup/*` mechanism unchanged.

## Implementation Steps

1. Create `test/e2e/support/security-test.helpers.ts`.
2. Create `test/e2e/support/fake-clock.helper.ts`.
3. Create `test/e2e/support/failing-image-storage.adapter.ts`.
4. Create `test/e2e/security-http-headers.e2e-spec.ts` (AC-001).
5. Create `test/e2e/security-cors-policy.e2e-spec.ts` (AC-002).
6. Create `test/e2e/security-body-size-limit.e2e-spec.ts` (AC-003).
7. Create `test/e2e/security-csrf-protection.e2e-spec.ts` (AC-004).
8. Create `test/e2e/security-token-session-authorization.e2e-spec.ts`
   (AC-005).
9. Create `test/e2e/security-error-leakage.e2e-spec.ts` (AC-006).
10. Create `test/e2e/security-rate-limit-global.e2e-spec.ts` (AC-007).
11. Extend `.github/workflows/sonar-backend.yml` with the `npm run
    test:e2e` step (AC-009).
12. Run validation commands listed under Testing Strategy.

## Definition of Done Mapping

- AC-001 → `test/e2e/security-http-headers.e2e-spec.ts`
- AC-002 → `test/e2e/security-cors-policy.e2e-spec.ts`
- AC-003 → `test/e2e/security-body-size-limit.e2e-spec.ts`
- AC-004 → `test/e2e/security-csrf-protection.e2e-spec.ts`
- AC-005 → `test/e2e/security-token-session-authorization.e2e-spec.ts`
- AC-006 → `test/e2e/security-error-leakage.e2e-spec.ts`
- AC-007 → `test/e2e/security-rate-limit-global.e2e-spec.ts`
- AC-008 → structural property of all 7 new spec files (in-memory Mongo,
  no real network calls, deterministic clock)
- AC-009 → `.github/workflows/sonar-backend.yml` extension

## Open Non-Blocking Questions

None (architect reported no blocking questions).

---

## Addendum A — Mid-Implementation Architectural Decision (AC-003/FR-004 413 defect fix)

### Context

During implementation of CARSHOP-111, the developer found that AC-003/FR-004
("JSON body > 1MB must return 413") was not actually met against the real
stack: the app returned 500, not 413, because `errorHandlerMiddleware` did
not recognize the `http-errors`-shaped payload-too-large error produced by
`express.json`'s body-size limit.

Per `CLAUDE.md`'s "Unexpected Change Request" classification, this was
routed back to `architect` as an **Architecture-Level Change**, since it
touches shared error-handling middleware and is security-adjacent (response
body content on an error path). The architect evaluated the proposal and
returned verdict:

`READY FOR IMPLEMENTATION`

The user explicitly chose to fix the production defect rather than either
(a) accept the pre-existing 500 as documented current behavior or (b) leave
the AC-003/FR-004 gap undocumented.

This addendum documents that fix design exactly as approved. It does not
alter, reinterpret, or supersede any decision in the original plan above.

### Decision

Modify `src/infra/presentation/middleware/error-handler.middleware.ts`
only, adding a narrow type guard and a new response branch — inserted
before the existing generic 500 fallback — that recognizes the
`http-errors`-shaped payload-too-large error from `express.json`'s body-size
limit and returns `413` with a static message.

### File to Change

`src/infra/presentation/middleware/error-handler.middleware.ts` (only file
under `src/` touched by this addendum).

### Reason

`express.json({ limit: '1mb' })` (already configured in
`registerBaseMiddlewares`, see original plan's "Middleware order and
behavior" ground-truth notes) rejects oversized bodies with an
`http-errors`-shaped error (`type: 'entity.too.large'`,
`statusCode`/`status: 413`) that is neither an application `HttpError` nor a
`SyntaxError`, so it was previously falling through to the generic 500
branch. AC-003/FR-004 requires 413 specifically. This is the smallest
change that closes the gap without touching any other error branch.

### Design (as approved by architect)

Add a narrow type guard:

```ts
type PayloadTooLargeError = Error & {
  type?: string;
  statusCode?: number;
  status?: number;
};

function isPayloadTooLargeError(error: unknown): error is PayloadTooLargeError {
  if (!(error instanceof Error)) {
    return false;
  }
  const candidate = error as PayloadTooLargeError;
  return (
    candidate.type === 'entity.too.large' &&
    (candidate.statusCode === 413 || candidate.status === 413)
  );
}
```

Add a new branch inside `errorHandlerMiddleware`, before the generic 500
fallback:

```ts
if (isPayloadTooLargeError(error)) {
  response.status(413).json({
    message: 'Corpo da requisição excede o limite permitido.',
  });
  return;
}
```

### Alternatives Considered

- Leaving the 500 as documented current behavior (as the original plan did
  for the analogous CORS-disallowed-origin 500 case) — rejected by the user
  for this specific defect, since AC-003/FR-004 explicitly requires 413,
  unlike the CORS case which has no such explicit AC requiring a different
  status.
- Broadening the match to any error with `statusCode`/`status === 413`
  regardless of `type` — rejected: risks intercepting unrelated errors that
  happen to carry a `413` status without being a genuine payload-too-large
  case.

### Trade-offs

Matching on both `type === 'entity.too.large'` AND
(`status`/`statusCode === 413`) keeps the guard narrow and avoids
intercepting the CORS-rejection 500 case (which has no `type`/`statusCode`
at all). Purely additive: no change to the existing `HttpError` branch,
`SyntaxError` branch, or generic 500 fallback. No other `src/` consumer is
affected — `work-image.routes.ts`'s `normalizeUploadError` is route-scoped
to Multer errors and is unaffected by this change.

### Security Impact

Response body is a static, hardcoded message only
(`'Corpo da requisição excede o limite permitido.'`) — no `error.message`,
`type`, `limit`, or stack trace is echoed to the client, consistent with
`.claude/rules/security.md`'s prohibition on exposing internal details in
error messages.

### Contract Impact

`POST` (or any) endpoint receiving a JSON body over the configured 1MB
limit now returns `413` instead of `500`. This corrects behavior toward the
already-specified AC-003/FR-004 contract; it is not a new, undocumented
contract change.

### Test-Only Follow-Ups Required Alongside This Fix

- `test/unit/infra/presentation/middleware/error-handler.middleware.spec.ts`:
  add (1) a happy-path case asserting `413` plus the exact static message
  body for a payload-too-large-shaped error, and (2) a negative/boundary
  case proving an error with only one of `type`/`statusCode` still falls
  through unchanged to the existing generic 500 branch. The existing 3
  tests (`HttpError`, `SyntaxError`, generic `Error`) must remain passing
  unmodified.
- `test/e2e/security-body-size-limit.e2e-spec.ts`: update the assertion
  from `.expect(500)` to `.expect(413)`, and correct its header comment
  (which previously documented the 500 deviation) to state that the defect
  was fixed under CARSHOP-111.

### Coverage Policy Note

This addendum introduces new/changed production code under `src/`, so the
`>= 80%` new/changed-code unit-test coverage target defined in
`.claude/rules/testing.md` now applies to this specific diff. This
supersedes, for this diff only, the original plan's "Testing Strategy"
section statement that the coverage target was NOT APPLICABLE — that
statement remains accurate for the plan's original pure-test-authoring
scope (the 7 new E2E spec files and CI workflow change), which had no
production-code delta. The two new unit test cases described above are
expected to satisfy the `>= 80%` target for this addendum's diff: every new
line/branch introduced (both boolean predicates in
`isPayloadTooLargeError`, and the new `413` response branch) receives
direct unit-test coverage.

### Files Changed by This Addendum

#### Files to Modify

- `src/infra/presentation/middleware/error-handler.middleware.ts` — add
  `isPayloadTooLargeError` guard and new 413 branch (AC-003/FR-004 fix)
- `test/unit/infra/presentation/middleware/error-handler.middleware.spec.ts`
  — add 2 new test cases (413 happy path, fall-through negative case)
- `test/e2e/security-body-size-limit.e2e-spec.ts` — update `.expect(500)`
  to `.expect(413)`; correct header comment to reference the CARSHOP-111
  fix

### Origin

Coordinator-routed "Unexpected Change Request", classified as an
**Architecture-Level Change** per `CLAUDE.md` (shared error-handling
middleware, security-adjacent response-body content). Architect verdict:
`READY FOR IMPLEMENTATION`. The user explicitly authorized fixing the
production defect rather than accepting the 500 or leaving it undocumented.
