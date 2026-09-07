# CARSHOP-38 — Validar conexão e índices do MongoDB Atlas em produção

## Status

Ready

## Source

Notion Task:
CARSHOP-38

## Context

CarShop persists data in MongoDB via Mongoose. A previous task in this
backlog line assumed a Prisma-based migration flow, which does not apply
to this project's persistence stack. That task has been repurposed: the
underlying operational objective — guaranteeing that the API can reach
its database reliably and that the database is structurally ready to
serve the application's read/write patterns before release — remains
valid, but "run Prisma migrations" is replaced by "validate the Mongoose
connection and the indexes declared on the existing models."

Today, the repository already provides:

- Structural validation of the `MONGO_URI` environment variable at
  startup (its name and connection-string shape, never its value).
- A `connectDatabase` routine that connects Mongoose to the configured
  `MONGO_URI` and fails with a descriptive, non-sensitive error when the
  connection cannot be established (including a dedicated hint for the
  MongoDB Atlas "IP not allowed" case).
- A `GET /health` endpoint that reports whether the Mongoose connection
  is currently established.
- Mongoose models (`Work`, `PortfolioWork`, `Category`, `Tag`, `Comment`,
  `WorkImage`, `AdminUser`, `AuthSession`) that already declare `unique`
  and/or `index: true` on several fields used for lookups and uniqueness
  constraints.

What is not yet established as a verifiable, repeatable outcome is: (a)
an explicit, safe procedure to confirm that the indexes declared in the
Mongoose schemas actually exist as indexes in the target database, (b)
a controlled, non-destructive way to confirm basic read/write operations
against the production (or an equivalent production-like) database, and
(c) an explicit statement that no Prisma/migration command remains
anywhere in the deploy flow.

## Objective

Provide a verifiable, repeatable, and safe way to confirm — before or as
part of a production release — that:

1. The backend can establish a Mongoose connection to the configured
   MongoDB Atlas database using the production `MONGO_URI`.
2. Every index required by the current Mongoose model definitions
   (uniqueness constraints and lookup/filter fields already declared with
   `unique` and/or `index: true`) is present in the corresponding
   collection.
3. Basic read and write operations succeed against the target database in
   a controlled way, without introducing destructive or irreversible side
   effects.
4. No command or step tied to Prisma migrations remains part of the
   deploy flow.

## Functional Requirements

- **FR-001**: On application startup, the backend must attempt to
  establish a Mongoose connection using the configured `MONGO_URI` before
  the HTTP server begins accepting traffic that depends on the database.
- **FR-002**: When the Mongoose connection cannot be established at
  startup, the backend must fail fast (stop before serving traffic that
  depends on the database) and log an actionable message that identifies
  the nature of the failure (e.g., malformed connection string, network
  access/IP restriction, authentication failure, unreachable host)
  without exposing the `MONGO_URI` value, credentials, or other sensitive
  connection details.
- **FR-003**: For every Mongoose model currently defined in the
  repository, each field declared with `unique: true` and/or
  `index: true` in its schema must have a corresponding index verifiably
  present in the underlying MongoDB collection.
- **FR-004**: There must be a safe, non-destructive, repeatable means
  (e.g., an operational script, a documented command, or an equivalent
  verifiable procedure) to confirm the presence of the indexes described
  in FR-003 against a given database, without requiring manual inspection
  of production data.
- **FR-005**: Index verification/creation must not silently drop or
  rebuild existing indexes in a way that risks data loss, unplanned
  downtime, or removal of indexes still required by the application,
  unless the change is an explicit, intentional part of a reviewed schema
  change.
- **FR-006**: There must be a controlled procedure to exercise a basic
  write followed by a basic read against the target database (in
  production or a production-like environment) that confirms the
  connection and permissions are functional end-to-end, and that leaves
  no residual test data behind (or clearly marks/removes any data it
  creates as part of the same procedure).
- **FR-007**: The deploy flow (build/start scripts, CI/CD configuration,
  and any documented deployment steps) must not invoke any Prisma or
  Prisma-migration command (e.g., `prisma migrate deploy` or equivalents).
- **FR-008**: The existing `GET /health` behavior (reporting database
  connectivity status) must remain accurate and must not be weakened by
  any change introduced to satisfy this task.

## Non-Functional Requirements

- **NFR-001 (Security)**: No verification procedure, log message, script
  output, or documentation produced for this task may expose the
  `MONGO_URI` value, database credentials, connection strings, or other
  sensitive configuration values.
- **NFR-002 (Reliability)**: Connection and index verification must be
  idempotent — running them multiple times against an already-healthy,
  already-indexed database must not change application behavior or data.
- **NFR-003 (Safety)**: No verification or startup procedure introduced
  for this task may perform automatic destructive operations (e.g.,
  dropping collections, dropping indexes without an explicit, reviewed
  reason, or deleting production data) as a side effect of normal
  application startup or health verification.
- **NFR-004 (Maintainability)**: The verification procedure for indexes
  and connectivity must be discoverable and repeatable by a developer or
  operator without requiring undocumented manual steps.

## Acceptance Criteria

- **AC-001**: When `MONGO_URI` is valid and the target MongoDB Atlas
  cluster is reachable, application startup completes and the Mongoose
  connection is established, verifiable via the existing `GET /health`
  endpoint reporting a connected state.
- **AC-002**: When `MONGO_URI` is missing, malformed, or the target
  cluster is unreachable, application startup fails before the HTTP
  server accepts database-dependent traffic, and the resulting log output
  contains an actionable description of the failure category without
  containing the `MONGO_URI` value or credentials.
- **AC-003**: For each Mongoose model in the repository, when the index
  verification procedure (FR-004) is run against a target database, it
  reports, for every field declared with `unique: true` and/or
  `index: true` in that model's schema, whether the corresponding index
  exists in the collection.
- **AC-004**: When the index verification procedure (FR-004) is run
  against a database that already has all expected indexes, it completes
  without dropping, recreating, or altering any existing index.
- **AC-005**: When the basic read/write verification procedure (FR-006)
  is executed against a target database, it completes a write followed by
  a read that confirms the written data, and it does not leave residual
  test data in the target database after completion.
- **AC-006**: A repository-wide search for Prisma migration commands
  (e.g., `prisma migrate`) across build scripts, CI/CD configuration, and
  deployment documentation returns no matches.
- **AC-007**: Existing `GET /health` behavior and its automated tests
  continue to pass unchanged in outcome (connected → healthy response;
  disconnected → degraded response) after this task's changes.

## Constraints

- Must not introduce Prisma or any Prisma-related tooling, dependency, or
  command.
- Must not perform automatic destructive operations (dropping indexes,
  collections, or data) as part of normal application startup.
- Must not expose `MONGO_URI`, database credentials, or other sensitive
  configuration values in code, logs, specs, or documentation produced for
  this task.
- Must reuse the existing `src/infra/database/mongoose.ts` connection
  entry point and the existing Mongoose model definitions as the source of
  truth for which indexes are required; this specification does not
  invent new indexes beyond what the models already declare.
- Any verification procedure must be safe to run against a
  production-like environment without requiring destructive
  pre-conditions (e.g., wiping the database first).

## Dependencies

- MongoDB Atlas cluster already provisioned and reachable, with
  `MONGO_URI` already configured as a deployment secret (per README's
  existing Atlas/deploy setup) — treated as an already-satisfied
  prerequisite for this task.
- Existing `GET /health` endpoint and its underlying
  `DatabaseHealthCheckPort` implementation.
- Existing Mongoose model definitions under `src/data/models/`, which are
  the authoritative source for which fields require indexes.
- Existing environment validation in `src/infra/config/env.ts` that
  checks `MONGO_URI` presence and structural shape at startup.

## Out of Scope

- Defining new indexes or new uniqueness constraints not already declared
  in the current Mongoose model definitions.
- Introducing or evaluating a schema-migration framework for MongoDB.
- Changing the shape, response format, or route of the existing
  `GET /health` endpoint.
- Provisioning, resizing, or otherwise administering the MongoDB Atlas
  cluster itself (network access rules, cluster tier, backups), which is
  covered by prerequisite/related infrastructure work.
- Any Prisma-related migration work (explicitly superseded by this task).

## Risks

- Running index verification/creation against production without care
  could impact performance during creation on large collections if not
  done safely (e.g., background index builds) — must be handled with a
  non-blocking, safe approach.
- An automatic index-sync mechanism that also drops "unexpected" indexes
  could inadvertently remove an intentionally-created index not reflected
  in the current schema snapshot.
- A basic read/write verification procedure that is not carefully scoped
  could leave residual test documents in production collections if not
  cleaned up.

## Open Questions

### Blocking

(none)

### Non-blocking

- Which exact mechanism (a standalone script, a startup-time check, a
  CI/CD deploy step, or a combination) will perform index verification is
  an implementation decision left to the architect.
- The exact procedure and tooling for the controlled read/write
  production-environment test (FR-006) — e.g., a dedicated script writing
  to a disposable/marked document versus running it against a
  staging/production-like environment — is left to the architect,
  provided it satisfies AC-005 and NFR-003.

## Traceability

FR-001 → AC-001, AC-002
FR-002 → AC-002
FR-003 → AC-003
FR-004 → AC-003, AC-004
FR-005 → AC-004
FR-006 → AC-005
FR-007 → AC-006
FR-008 → AC-007
