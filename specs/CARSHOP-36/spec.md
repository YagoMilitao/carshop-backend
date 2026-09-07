# CARSHOP-36 — Configurar MongoDB Atlas de produção e MONGO_URI

## Status

Ready

## Source

Notion Task:
CARSHOP-36

## Context

The CarShop backend already uses Mongoose against a MongoDB connection
string supplied through the `MONGO_URI` environment variable
(`src/infra/config/env.ts`, `src/infra/database/mongoose.ts`,
`src/main/index.ts`). Production needs a managed MongoDB database. The
raw Notion Definition of Done spans work that is partly external
infrastructure provisioning (creating a MongoDB Atlas cluster, configuring
database users and IP/network access, storing the resulting secret in the
hosting/deployment provider's environment configuration) and partly
repository work (hardening how the application validates and reports
problems with `MONGO_URI`, and documenting the manual setup process).

The coordinator and user explicitly agreed on the following scoping
decision: this specification governs only the two items that can be
implemented and verified inside this repository. Provisioning the actual
Atlas cluster, configuring its network access list, creating the database
user, and storing the real `MONGO_URI` secret in a hosting provider's
dashboard are manual operator actions that remain outside this codebase
and outside this specification's testable scope.

Current relevant behavior observed in the repository before this task:

- `src/infra/config/env.ts` reads `MONGO_URI` via `getRequiredEnv`, which
  only checks that the variable is present and non-empty. It performs no
  format validation, unlike the existing production-only strength checks
  already implemented for `JWT_SECRET`, `ADMIN_PASSWORD`, and
  `CORS_ORIGIN` in the same file.
- `src/infra/database/mongoose.ts` (`connectDatabase`) re-checks for an
  empty `mongoUri`, attempts `mongoose.connect(mongoUri)`, and on failure
  detects an MongoDB Atlas "IP not allowed" scenario to produce a
  friendlier message. On success it logs a fixed, non-sensitive message
  (`"✅ Conectado ao MongoDB com sucesso."`). On failure that is not the
  recognized Atlas IP-allowlist case, it rethrows the original driver
  error unmodified.
- `src/main/index.ts` calls `connectDatabase(env.mongoUri)` before
  `createApp()`. On any thrown error it logs `error.message` (for
  `Error` instances) via `console.error` and exits the process with
  `process.exit(1)`. Depending on the underlying MongoDB driver, some
  connection-failure error messages can include the connection string
  itself (which may embed credentials), so this rethrow-and-log path is
  not guaranteed to keep `MONGO_URI` contents out of process logs today.
- `src/infra/presentation/middleware/error-handler.middleware.ts` already
  returns a generic, non-leaking `500` JSON body
  (`{ "message": "Erro interno no servidor." }`) for unrecognized errors
  reaching the central error handler at runtime, while logging the raw
  error server-side via `console.error(error)`. This already prevents
  raw driver error internals from reaching HTTP clients, but the
  server-side `console.error(error)` call is not guaranteed to redact
  `MONGO_URI`/credentials if a raw driver error object happens to embed
  them.
- The README does not currently document any MongoDB Atlas setup process
  or how `MONGO_URI` must be supplied in a production/deployment
  environment. `.env.example` already documents `MONGO_URI` using a
  placeholder value (`<DATABASE_URL>`), consistent with the project's
  existing fictional-value convention.

## Objective

1. Strengthen production-facing `MONGO_URI` handling so that the
   application fails fast at startup with a clear, non-sensitive error
   message when `MONGO_URI` is missing or structurally invalid, and so
   that no `MONGO_URI` value or embedded credential is ever written to
   application logs or returned to an HTTP client, whether the failure
   happens at startup or at runtime.
2. Document, in the README (and `.env.example` if applicable), the manual
   steps an operator must follow to provision MongoDB Atlas for
   production and to supply `MONGO_URI` as a secret through the hosting/
   deployment provider's environment configuration, using variable
   NAMES and placeholder values only.

## Functional Requirements

FR-001. At application startup, when the `MONGO_URI` environment
variable is missing or empty, the application must fail before the HTTP
server starts listening, with an error message that names the variable
(`MONGO_URI`) and does not include any connection-string value.

FR-002. At application startup, when the `MONGO_URI` environment
variable is present but is not a structurally valid MongoDB connection
string (i.e., it does not start with `mongodb://` or `mongodb+srv://`),
the application must fail before the HTTP server starts listening, with
an error message that names the variable (`MONGO_URI`) and does not
include the invalid value itself.

FR-003. When the Mongoose connection to MongoDB succeeds, the
application must log a confirmation message that does not include the
`MONGO_URI` value, host, or any embedded credential.

FR-004. When the Mongoose connection attempt fails at startup (for any
reason, including but not limited to network/DNS failure, authentication
failure, or an Atlas IP-allowlist rejection), the application must log a
message describing the failure without including the `MONGO_URI` value
or any embedded credential, must not print the raw underlying driver
error object or message when that object/message could contain the
connection string, and must still exit without starting the HTTP server.

FR-005. When a MongoDB-related error occurs at runtime (after startup,
e.g. during a request), any HTTP response returned to the client must
remain within the existing generic error-handling contract (no raw
driver error internals, connection details, or credentials included in
the HTTP response body).

FR-006. When a MongoDB-related error occurs at runtime and is logged
server-side for diagnostics, the log output must not include the
`MONGO_URI` value or any embedded credential.

FR-007. The README must document the manual, human-operator steps
required to configure MongoDB Atlas for production, expressed in
provider-agnostic terms unless the repository already implies a specific
hosting provider: creating/selecting a cluster and database, creating a
database user with least-privilege access appropriate for the
application, restricting network access (IP allowlist) to the necessary
sources, and obtaining the resulting connection string.

FR-008. The README must document that the resulting `MONGO_URI` value
must be supplied to the production backend exclusively as a secret
through the hosting/deployment provider's environment configuration
mechanism, must never be committed to the repository, and must never be
hardcoded in source files.

## Non-Functional Requirements

NFR-001 (Security). No implementation change introduced by this task may
log, print, return in an HTTP response, or otherwise expose the value of
`MONGO_URI` or any credential embedded in it, in any environment.

NFR-002 (Reliability). The application must not start accepting HTTP
traffic when `MONGO_URI` is missing or structurally invalid; the process
must exit with a non-zero status in that case, consistent with the
existing startup-validation pattern already used for `JWT_SECRET`,
`ADMIN_PASSWORD`, and `CORS_ORIGIN` in `src/infra/config/env.ts`.

NFR-003 (Maintainability). New validation and redaction logic must
follow the existing patterns already present in `src/infra/config/env.ts`
(fail-fast helper functions with variable-name-only error messages) and
`src/infra/database/mongoose.ts` (centralized connection handling),
rather than introducing a new, parallel validation mechanism.

NFR-004 (Compatibility). Existing successful-connection behavior, the
existing Atlas IP-not-allowed friendly message, and the existing
generic-500 runtime error contract must not be weakened or removed by
this task.

## Acceptance Criteria

AC-001. Given `MONGO_URI` is unset or empty, when the application
starts, then the process exits with a non-zero status before the HTTP
server begins listening, and the emitted error message names `MONGO_URI`
without containing a connection-string value.

AC-002. Given `MONGO_URI` is set to a value that does not begin with
`mongodb://` or `mongodb+srv://`, when the application starts, then the
process exits with a non-zero status before the HTTP server begins
listening, and the emitted error message names `MONGO_URI` without
containing the invalid value.

AC-003. Given `MONGO_URI` is set to a structurally valid value and the
underlying Mongoose connection succeeds, when the application starts,
then a success message is logged that contains no connection-string
value, host, username, or password.

AC-004. Given `MONGO_URI` is set to a structurally valid value but the
underlying Mongoose connection attempt fails (e.g. simulated
network/auth failure), when the application starts, then the process
exits with a non-zero status, and neither the console output nor any
logged error message contains the configured `MONGO_URI` value or any
credential embedded in it.

AC-005. Given a MongoDB-related error occurs while handling an HTTP
request after successful startup, when the central error handler
processes that error, then the HTTP response body matches the existing
generic error contract (no raw driver internals, connection string, or
credentials present in the response body).

AC-006. Given a MongoDB-related error occurs while handling an HTTP
request after successful startup, when that error is logged server-side,
then the log output does not contain the configured `MONGO_URI` value or
any credential embedded in it.

AC-007. The README contains a documented, human-readable procedure
covering: MongoDB Atlas cluster/database setup, database user creation,
network access (IP allowlist) restriction, obtaining the connection
string, and supplying `MONGO_URI` as a secret via the hosting/deployment
provider's environment configuration — using only the variable name
`MONGO_URI` and placeholder/fictitious values, with no real connection
string, hostname, username, or password present.

AC-008. The existing Atlas "IP not allowed" friendly error message
behavior in `src/infra/database/mongoose.ts` continues to function for
the recognized error hints after this task's changes.

## Constraints

- No agent or implementation step may read, log, transmit, or persist a
  real `MONGO_URI` value, real MongoDB Atlas credentials, or any other
  real secret at any point during specification, planning, or
  implementation.
- Only variable NAMES (e.g. `MONGO_URI`) may appear in this
  specification, in the README, and in `.env.example`; only clearly
  fictitious placeholder values may be used in examples.
- Implementation must follow the existing validation pattern in
  `src/infra/config/env.ts` (fail-fast helper functions) and the existing
  connection-handling pattern in `src/infra/database/mongoose.ts`, rather
  than introducing a new configuration or connection abstraction.
- Provisioning the actual MongoDB Atlas cluster, configuring its network
  access list, creating the database user, and storing the real
  `MONGO_URI` secret in the hosting/deployment provider's dashboard are
  explicitly out of scope for code changes under this specification; they
  remain manual operator actions performed outside the repository.
- The base URL configuration principle for this project (`API_URL`
  supplied externally, never hardcoded) applies analogously here:
  `MONGO_URI` must never be hardcoded and must always be supplied through
  environment configuration.

## Dependencies

- Existing Mongoose connection wiring in `src/main/index.ts` and
  `src/infra/database/mongoose.ts`.
- Existing environment-variable validation pattern in
  `src/infra/config/env.ts`.
- Existing central error handler in
  `src/infra/presentation/middleware/error-handler.middleware.ts`.
- A manually provisioned MongoDB Atlas cluster and a `MONGO_URI` secret
  configured by the operator in the hosting/deployment provider (external
  dependency, out of scope for this specification's code changes, but a
  precondition for AC-003/AC-004/AC-008 to be verified against a real
  Atlas cluster in a non-production validation environment).

## Out of Scope

- Creating, configuring, or administering the actual MongoDB Atlas
  cluster, database, database user, or network access (IP allowlist)
  rules.
- Storing or managing the real `MONGO_URI` secret in any hosting/
  deployment provider's dashboard or secret manager.
- Naming or committing to a specific hosting/deployment provider beyond
  what the repository already implies.
- Any change to the authentication, CORS, JWT, upload, or other
  environment-variable validation rules already implemented in
  `src/infra/config/env.ts` that is unrelated to `MONGO_URI`.
- Data migration from any prior Neon/Postgres/Prisma proposal; the
  Technical Notes confirm MongoDB Atlas + Mongoose is already the sole
  official database approach and no migration work is implied.
- Automated end-to-end validation against a real production Atlas
  cluster from within this repository's CI; validation of format/failure
  behavior is expected to use local/mocked connection strings and mocked
  Mongoose connection failures, consistent with existing test patterns
  (see `.claude/rules/testing.md`).

## Risks

- Network access (IP allowlist) configured too broadly on the Atlas side
  would widen the attack surface; this is a manual operator
  responsibility documented under FR-007 but not enforceable from code.
- If redaction logic is incomplete, a future driver upgrade or unusual
  error shape could still leak `MONGO_URI` contents into logs; this risk
  should be mitigated by the redaction/sanitization behavior required in
  FR-004 and FR-006 and verified by AC-004 and AC-006.
- Exposing `MONGO_URI` or credentials in the frontend is explicitly
  called out as a risk in the source task; this specification's scope is
  backend-only and does not touch any frontend code, so no frontend
  change is authorized under this specification.

## Open Questions

### Blocking

None.

### Non-blocking

- Whether the hosting/deployment provider for production is already
  decided (e.g. a specific PaaS) is not confirmed in the source task; the
  README documentation (FR-007/FR-008) should stay provider-agnostic
  unless the repository already implies a specific provider.

## Traceability

FR-001 → AC-001
FR-002 → AC-002
FR-003 → AC-003
FR-004 → AC-004, AC-008
FR-005 → AC-005
FR-006 → AC-006
FR-007 → AC-007
FR-008 → AC-007
