# CARSHOP-111 — E2E Regression Suite for Global Security Controls

## Status

Ready

## Source

Notion Task:
CARSHOP-111

## Context

The project already has meaningful security-relevant test coverage:
authentication, draft authorization, negative CSRF checks on refresh, cookie
behavior, and upload validation are exercised. However, a significant part
of the *global* security controls — Helmet response headers, CORS
allow/deny behavior, the JSON body-size limit, and the generic error
handler's leakage prevention — are currently verified only through unit
tests that mock middleware in isolation. They are not verified against the
application actually assembled end-to-end (real Express app, real
middleware chain, real routes), the way `test/e2e/*.e2e-spec.ts` specs do
for other flows.

This gap means a regression in how these global controls are wired into the
real composition root (for example, wrong middleware order, a
misconfigured Helmet option, or an error handler that lets a stack trace
leak) could pass all unit tests while still being broken in the running
application, because unit tests validate middleware logic in isolation, not
its actual integration into the assembled app.

## Objective

Add a small, deterministic, self-contained E2E test suite that proves the
project's global security controls behave correctly against the actually
assembled HTTP application (not against mocked middleware), and ensure this
suite runs as part of CI so regressions in these controls are caught
automatically.

## Functional Requirements

- FR-001: An E2E test must verify that HTTP responses from the assembled
  application include the expected Helmet-provided security headers, and
  do not expose unnecessary technology-identifying information (e.g. no
  `X-Powered-By` header revealing the framework).
- FR-002: An E2E test must verify that a request from an allowed CORS
  origin receives the correct CORS authorization (appropriate
  `Access-Control-Allow-Origin` behavior for that origin).
- FR-003: An E2E test must verify that a request from a origin that is not
  in the allowed CORS configuration does not receive CORS authorization for
  that origin.
- FR-004: An E2E test must verify that a JSON request body larger than the
  application's configured size limit (1 MB) is rejected with HTTP 413
  before the target route's handler logic executes.
- FR-005: An E2E test must verify that `POST /auth/refresh` fails and does
  not alter session state when the CSRF cookie/header pair is missing.
- FR-006: An E2E test must verify that `POST /auth/refresh` fails and does
  not alter session state when the CSRF cookie value and the
  `X-CSRF-Token` header value do not match.
- FR-007: An E2E test must verify that `POST /auth/logout` fails and does
  not alter session state when the CSRF cookie/header pair is missing.
- FR-008: An E2E test must verify that `POST /auth/logout` fails and does
  not alter session state when the CSRF cookie value and the
  `X-CSRF-Token` header value do not match.
- FR-009: An E2E test must verify that a request presenting a tampered
  (invalid-signature) access token is rejected with HTTP 401 by an
  authenticated route.
- FR-010: An E2E test must verify that a request presenting a valid refresh
  token used as if it were an access token is rejected with HTTP 401 by an
  authenticated route.
- FR-011: An E2E test must verify that a request presenting a token bound
  to a revoked session is rejected with HTTP 401 by an authenticated
  route.
- FR-012: An E2E test must verify that a request presenting an expired
  access token is rejected with HTTP 401 by an authenticated route.
- FR-013: An E2E test must verify that representative 4xx and 5xx error
  responses produced by the application's error handler do not contain a
  stack trace, a local filesystem path, or any secret/credential detail.
- FR-014: An E2E test must verify that rate-limited responses include the
  application's standard rate-limit response headers.
- FR-015: An E2E test must verify that exceeding the configured rate-limit
  policy for the exercised route(s) results in an HTTP 429 response.
- FR-016: The suite must run against isolated, in-memory/test-scoped
  persistence (no real external database) and must not perform any network
  call to an external/third-party service (e.g. no real Cloudinary calls).
- FR-017: The suite must produce deterministic results across repeated
  runs, without relying on real wall-clock waiting for token/session
  expiration or rate-limit window resets (time-dependent scenarios must
  use a controlled/simulated notion of time or an equivalent deterministic
  mechanism).
- FR-018: The full suite, or an explicitly designated required security
  subset of it, must be executed automatically as part of the project's
  CI workflow, and a failure in that suite/subset must cause the CI run to
  fail.

## Non-Functional Requirements

- NFR-001 (Security): The suite must not weaken, bypass, or disable any
  existing security control (Helmet configuration, CORS policy, CSRF
  double-submit check, rate limiting, upload validation) merely to make a
  test pass; it must observe real enforced behavior.
- NFR-002 (Reliability): The suite must be runnable repeatedly, in
  isolation and as part of the full test run, without leaving residual
  state (database records, sessions, rate-limit counters) that affects
  subsequent runs.
- NFR-003 (Maintainability): The suite must follow the project's existing
  E2E testing conventions (location under `test/e2e/`, Jest +
  `test/jest-e2e.json`, existing assertion/setup patterns) so it can be
  extended consistently with the rest of the test base.
- NFR-004 (Non-duplication): The suite must avoid duplicating scenarios
  already fully covered by other rate-limiting-specific or upload-specific
  E2E tests; where such existing coverage exists, this suite may reference
  or complement it rather than re-implement it, per FR-014/FR-015 and the
  upload-adjacent aspects of FR-016.
- NFR-005 (Isolation): The suite must not depend on, or interfere with,
  any real external service (email, Cloudinary, third-party APIs) as
  required by FR-016.

## Acceptance Criteria

(Mirroring the Notion checklist's AC numbering for traceability to the
source task.)

- AC-001: Responses from the assembled application include the expected
  Helmet security headers and do not expose unnecessary technology
  identifiers.
- AC-002: A request from an allowed CORS origin receives correct CORS
  authorization; a request from a disallowed origin does not.
- AC-003: A JSON request body exceeding 1 MB returns HTTP 413 without the
  target route's business logic executing.
- AC-004: `POST /auth/refresh` and `POST /auth/logout` fail, and do not
  alter session state, when CSRF is missing or when
  `csrf_token`/`X-CSRF-Token` mismatch.
- AC-005: A tampered access token, a refresh token used as an access
  token, a revoked session, and an expired session each result in HTTP
  401 on an authenticated route.
- AC-006: Representative 4xx/5xx error responses contain no stack trace,
  no local filesystem path, and no secret/credential detail.
- AC-007: Rate-limited responses include the standard rate-limit headers,
  and exceeding the configured policy returns HTTP 429.
- AC-008: The suite runs against in-memory/test-scoped persistence with a
  controlled/deterministic notion of time and without contacting any real
  external service.
- AC-009: The project's CI workflow executes the full suite, or an
  explicitly designated required security subset, and a failure fails the
  CI run.

## Constraints

- The suite must exercise the actually assembled Express application
  (the real composition root), not a standalone mock of individual
  middleware.
- The suite must not access any real external service or production data
  (per AC-008 / FR-016 and the project's spec-security rules).
- The suite's persistence must be isolated/in-memory or otherwise
  test-scoped; it must not target a shared or production database.
- Time-dependent scenarios (token/session expiration, rate-limit window
  reset) must not rely on real wall-clock delays that would make the
  suite slow or flaky.
- The suite must not duplicate scenarios already fully owned by other,
  more specific rate-limiting or upload E2E tasks; coordination with
  those tasks is required, even though their exact CARSHOP IDs are not
  stated in the source Notion task.
- This specification intentionally does not prescribe: specific test file
  names, whether existing `test/e2e/*.e2e-spec.ts` files are extended or
  new files are created, the specific in-memory MongoDB wiring mechanism,
  or the specific CI job/step structure. Those are architecture/
  implementation decisions.

## Dependencies

- The application's global security middleware and configuration:
  Helmet, CORS, JSON body-size limit, rate limiting, and the central
  error handler (see `src/infra/config/middleware.ts` and
  `src/infra/presentation/middleware/*`).
- The existing authentication/session model (JWT access + rotating
  refresh tokens, server-side session store, CSRF double-submit) as
  described in `README.md` and implemented under
  `src/core/domain/application/Auth/` and
  `src/infra/presentation/middleware/auth.middleware.ts`.
- The project's existing E2E test setup (`test/e2e/`,
  `test/jest-e2e.json`) and existing E2E specs (e.g.
  `test/e2e/app.e2e-spec.ts`, `test/e2e/auth-login-rate-limit.e2e-spec.ts`)
  as the closest precedent for the new suite's structure.
- `mongodb-memory-server`, currently listed as a devDependency but not
  yet wired into any test suite; this task is expected to be the first to
  wire it into an E2E flow, if the architecture phase selects it as the
  in-memory persistence mechanism required by AC-008/FR-016.
- The project's existing CI workflow definition (exact file/location to
  be identified during the architecture phase) for the CI wiring required
  by FR-018/AC-009.
- Related but unspecified rate-limit-specific and upload-specific tasks
  referenced in the Notion task's Dependencies section, without stated
  CARSHOP IDs; coordination is required to avoid duplicate test coverage
  (NFR-004).

## Out of Scope

- Introducing new global security controls or changing the behavior/
  configuration of existing ones (Helmet options, CORS allow-list,
  body-size limit value, rate-limit thresholds). This task only adds
  regression tests for controls that already exist.
- Full, exhaustive rate-limiting or upload-validation E2E coverage beyond
  what FR-014/FR-015 (rate-limit headers and 429 behavior) and the
  upload-adjacent parts of FR-016 (no external service calls) require;
  detailed rate-limit/upload scenario coverage belongs to the specific
  related tasks referenced in Dependencies.
- Changes to production source code under `src/` to make it more
  testable, unless a genuine defect in a global security control is
  discovered while building the suite (in which case that finding must be
  routed back to the coordinator rather than silently fixed as part of
  this test-authoring task).
- Performance/load testing of rate limiting or any other control; this
  task covers functional/security regression behavior only.

## Risks

- `mongodb-memory-server` has not previously been wired into any test
  suite in this repository; first-time integration carries some
  implementation risk (start-up time, CI compatibility) to be evaluated
  by the architecture phase.
- Without a clearly designated "required security subset," CI runtime
  could grow if the full E2E suite is always executed; FR-018/AC-009
  explicitly allow either the full suite or a designated required subset
  to address this.
- Overlap with not-yet-identified rate-limit/upload tasks could produce
  duplicated test coverage if not coordinated; NFR-004 exists to mitigate
  this risk, but the exact related task IDs are unknown at spec time (see
  Open Questions).
- Time-dependent scenarios (expiration, rate-limit windows) risk
  flakiness if not implemented with a genuinely deterministic time/clock
  control mechanism, per FR-017.

## Open Questions

### Blocking

None.

### Non-blocking

- Exact CARSHOP IDs of the related rate-limit-specific and upload-
  specific tasks referenced in the Notion task's Dependencies section are
  not stated; needed only for coordination/deduplication, not for
  defining this task's own acceptance criteria.
- Whether existing files under `test/e2e/` (e.g.
  `test/e2e/app.e2e-spec.ts`, `test/e2e/auth-login-rate-limit.e2e-spec.ts`)
  should be extended, or new dedicated files created, for each control
  area — left to the architecture phase after repository inspection.
- Whether AC-009's CI execution is implemented as a new CI job/step or by
  extending an existing one — left to the architecture phase after
  repository inspection.
- Exact mechanism for the "controlled clock" required by FR-017 (e.g.
  fake timers vs. injectable clock abstraction) — an implementation
  decision for the architecture phase.

## Traceability

FR-001 → AC-001
FR-002 → AC-002
FR-003 → AC-002
FR-004 → AC-003
FR-005 → AC-004
FR-006 → AC-004
FR-007 → AC-004
FR-008 → AC-004
FR-009 → AC-005
FR-010 → AC-005
FR-011 → AC-005
FR-012 → AC-005
FR-013 → AC-006
FR-014 → AC-007
FR-015 → AC-007
FR-016 → AC-008
FR-017 → AC-008
FR-018 → AC-009
NFR-001 → AC-001, AC-002, AC-003, AC-004, AC-005, AC-007
NFR-002 → AC-008
NFR-003 → AC-009
NFR-004 → AC-007
NFR-005 → AC-008
