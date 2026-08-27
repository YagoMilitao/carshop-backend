# CARSHOP-101 — Validar todos os endpoints do backend e definir cobertura E2E

## Status

Ready

## Source

Notion Task:
CARSHOP-101

## Context

The CarShop backend exposes public, authenticated, and admin HTTP endpoints
covering works, comments, work images, and authentication (login, refresh,
logout, session). There is no current, verified record confirming that every
active endpoint behaves according to its implemented contract, nor an
objective assessment of how well the existing automated E2E suite
(`test/e2e/*.e2e-spec.ts`) covers that real endpoint surface.

This task is a validation/diagnostic exercise, not an implementation change.
It must produce a verified inventory of active endpoints, evidence that each
was exercised against its success and main error scenarios, and an explicit
verdict on whether current E2E automation is sufficient or has gaps that
justify a dedicated follow-up task.

## Objective

Produce a documented, evidence-based validation of every active backend
endpoint's behavior and an explicit, justified verdict on E2E coverage
sufficiency, without altering any backend contract to make validation pass.

## Functional Requirements

FR-001: An inventory of all active backend endpoints must be derived from
the repository's actual route registrations and/or the served OpenAPI
document (`GET /docs.json`), not assumed or invented. Endpoints that do not
exist in code/Swagger must not appear in the inventory.

FR-002: For each inventoried endpoint, the inventory must record: HTTP
method, route path, authentication/authorization requirement (public,
authenticated, admin, CSRF-protected), and a short description of expected
behavior derived from the code/Swagger contract.

FR-003: Each applicable public, authenticated, and admin endpoint must be
exercised in an appropriate non-production test environment to validate its
documented success flow.

FR-004: Each applicable endpoint must be exercised against its main relevant
error scenarios, including (as applicable to that endpoint): missing/invalid
authentication, insufficient authorization, input validation failures, and
not-found resource.

FR-005: Stateful flows that depend on an ordered sequence — access token
issuance, refresh token rotation, session validity, CSRF double-submit
(`csrf_token` cookie + `X-CSRF-Token` header), or resources created earlier
in the flow — must be tested in the correct dependent order.

FR-006: Endpoints involving uploads and the Cloudinary integration must be
tested safely in a non-production-equivalent manner (e.g., disposable test
assets, non-production credentials/configuration), without using or
exposing production credentials.

FR-007: No test executed for this task may perform a destructive operation
against a production environment or production data.

FR-008: The final result must contain a matrix mapping endpoint -> scenario
-> result, where each result is one of: PASS, FAIL, or NOT VERIFIED.

FR-009: Every scenario marked FAIL in the matrix must include an observed
cause and enough evidence (e.g., request shape, response status, relevant
response body fields) to support opening a bug/follow-up task, without
including sensitive data (see Constraints).

FR-010: Existing automated E2E test coverage under `test/e2e/*.e2e-spec.ts`
must be reviewed and compared against the verified endpoint inventory
produced under FR-001.

FR-011: The task must issue exactly one explicit final verdict: either
"E2E COVERAGE SUFFICIENT" or "E2E COVERAGE GAP".

FR-012: If the verdict is "E2E COVERAGE GAP", the result must list the
specific flows/endpoints lacking automated E2E coverage and explicitly
recommend creating a dedicated follow-up E2E automation task. This task's
own scope must not be expanded to implement that automation.

## Non-Functional Requirements

NFR-001 (Security): No production credentials, secrets, session cookies, or
tokens may be used, logged, or included in any validation evidence or
report produced by this task.

NFR-002 (Reliability): Validation must run in a controlled, non-production
test environment so that no state validated for this task depends on or
mutates production data.

NFR-003 (Traceability): Every endpoint present in the code/Swagger route
surface at the time of validation must appear in the inventory and matrix;
omissions must be explicitly noted as NOT VERIFIED with a reason, not
silently dropped.

NFR-004 (Maintainability): Existing build/test/lint commands
(`npm test`, `npm run build`, `npm run lint`, `npm run test:e2e`) must
continue to pass after this task, or any pre-existing/newly found failure
unrelated to this task's own actions must be documented separately rather
than silently ignored.

## Acceptance Criteria

AC-001: When the inventory is produced, every route registered in
`src/infra/config/routes.ts` / `src/infra/http/routes/*.routes.ts` and/or
exposed via `GET /docs.json` is present, and no route absent from those
sources appears in the inventory.

AC-002: When the inventory entry for an endpoint is read, it states the
HTTP method, route path, and authentication/authorization requirement
(public, authenticated, admin, and CSRF where applicable).

AC-003: When an applicable endpoint's success flow is exercised in the test
environment, the result matrix records PASS or FAIL with supporting
evidence, not a subjective statement.

AC-004: When an applicable endpoint's error scenarios (auth/authorization,
validation, not-found) are exercised, each relevant scenario appears as its
own row in the result matrix with a PASS, FAIL, or NOT VERIFIED result.

AC-005: When a stateful flow (login -> refresh -> logout, or
create-then-read/update/delete of a resource) is exercised, the matrix
shows the flow was tested end-to-end in dependency order, not as
disconnected, order-independent calls.

AC-006: When an upload/Cloudinary-dependent endpoint is exercised, the
matrix entry documents that no production credentials were used and that
the test was performed safely.

AC-007: When any matrix row is FAIL, that row includes an observed cause
and reproduction evidence sufficient to open a bug/follow-up task, and
contains no sensitive data (tokens, secrets, credentials, or `Authorization`/
`Cookie` header values).

AC-008: When the E2E coverage comparison is complete, the report states
which inventoried endpoints/flows are and are not currently covered by
`test/e2e/*.e2e-spec.ts`.

AC-009: When the final report is read, it contains exactly one of the two
allowed verdict strings: "E2E COVERAGE SUFFICIENT" or "E2E COVERAGE GAP".

AC-010: When the verdict is "E2E COVERAGE GAP", the report lists the
specific uncovered flows/endpoints and recommends opening a dedicated
follow-up E2E task, without this task implementing that automation itself.

AC-011: After this task's validation activity, `npm test`, `npm run build`,
and `npm run lint` either pass, or any failure is explicitly documented as
pre-existing/unrelated rather than silently left unreported.

AC-012: No backend contract (route, status code, payload shape, cookie
name, header) is modified as part of this task solely to make a validation
scenario pass.

## Constraints

- This is a diagnostic/validation task: no production contract, route,
  controller, or middleware behavior may be changed to make a test pass.
- No destructive test may run against a production environment or
  production data.
- No production credentials, secrets, or real `.env` values may be used,
  logged, or included in the report.
- Any evidence included for a FAIL result must exclude sensitive data,
  including `Authorization` and `Cookie`/`Set-Cookie` header values, tokens,
  and credentials.
- The API base URL used for validation must come from environment
  configuration (e.g., an `API_URL`-style variable name) and must never be
  hardcoded to a private or production URL in versioned output.
- Authenticated requests during validation must use the project's existing
  Bearer token / cookie-based session strategy; no token value may appear
  in versioned output.

## Dependencies

- Real route registrations in `src/infra/config/routes.ts` and
  `src/infra/http/routes/*.routes.ts`.
- The served OpenAPI document (`GET /docs.json`) and Swagger fragments in
  `src/infra/docs/*.swagger.ts`.
- Existing E2E test suite under `test/e2e/*.e2e-spec.ts` and its Jest
  configuration (`test/jest-e2e.json`).
- A non-production test environment with its own configuration (database,
  Cloudinary test credentials) reachable via environment variables such as
  `MONGO_URI`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
  (names only, no values).

## Out of Scope

- Implementing new E2E automation to close any identified coverage gap;
  that is limited to a recommendation for a dedicated follow-up task.
- Changing backend contracts, business rules, or persistence behavior.
- Fixing bugs discovered during validation; discovered FAIL results are to
  be documented as evidence for separate bug/follow-up tasks, not fixed
  inline as part of this task.
- Performance, load, or scalability testing.
- Testing against a production environment.

## Risks

- Stateful and security-sensitive flows (tokens, sessions, CSRF) can be
  order-dependent and environment-sensitive; incorrect sequencing could
  produce false FAIL results.
- Incomplete or stale Swagger fragments could cause the inventory to miss
  an active route if only `GET /docs.json` is used without cross-checking
  the actual route registration files.
- Upload/Cloudinary testing carries a risk of accidental use of
  production-equivalent credentials if the test environment is not clearly
  isolated.

## Open Questions

### Blocking

None identified.

### Non-blocking

- Whether a dedicated ephemeral test database/Cloudinary sandbox is already
  available for this validation, or must be provisioned as part of running
  the validation, is left to the implementer to confirm against existing
  project/test conventions.

## Traceability

FR-001 → AC-001
FR-002 → AC-002
FR-003 → AC-003
FR-004 → AC-004
FR-005 → AC-005
FR-006 → AC-006
FR-007 → AC-006, AC-012
FR-008 → AC-003, AC-004
FR-009 → AC-007
FR-010 → AC-008
FR-011 → AC-009
FR-012 → AC-010
FR-002 (contract preservation) → AC-012, AC-011
