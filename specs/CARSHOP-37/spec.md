# CARSHOP-37 — Deploy do backend no Render (Web Service)

## Status

Ready

Note: OQ-001 (below) was reclassified from "Blocking" to a mandatory
architecture-phase input. It is a HOW decision (which health-check route
implementation to use), not a WHAT ambiguity — the requirement itself
(the service must respond successfully to a designated health-check
endpoint, per FR-005/AC-004) is unambiguous. Per the project's
Specification Gate rules, the architect owns HOW for NON-TRIVIAL tasks.
Coordinator decision recorded 2026-09-07, per explicit user authorization.

## Source

Notion Task:
CARSHOP-37

## Context

The CarShop backend (Node.js + Express + TypeScript, persisting to MongoDB
via Mongoose) currently runs only in local/development environments. The
Next.js frontend needs a publicly reachable backend API to consume. This
task covers publishing the existing backend as a Web Service on Render,
configuring the build/start process for the compiled TypeScript output,
configuring production environment variables (by name only), and
configuring a health check so Render (and operators) can verify the
service is live and connected to its database.

This is an infrastructure/deployment task. It does not introduce new
business features, new persistence models, or new API endpoints beyond
what may be required to satisfy the health-check requirement below.

A related, separate task ("Configurar MongoDB Atlas de produção e
MONGO_URI") is responsible for provisioning the production MongoDB Atlas
cluster and the `MONGO_URI` value itself. This specification assumes that
task's output exists as a prerequisite and does not redefine it.

## Objective

Have the CarShop backend running as a Render Web Service, publicly
reachable over HTTPS, successfully connected to the production MongoDB
Atlas database, built and started using the project's existing
TypeScript build/start scripts, with production environment variables
configured exclusively through Render's environment-variable mechanism,
and with a working health-check endpoint that Render's platform health
check can use to determine service liveness.

## Functional Requirements

- FR-001: The backend must be deployable as a Render Web Service
  connected to the project's Git repository, building the TypeScript
  project into the compiled output already produced by the project's
  existing build script, and starting the compiled output using the
  project's existing start script.
- FR-002: The deployed service must accept its MongoDB Atlas connection
  string exclusively via the `MONGO_URI` environment variable, without
  hardcoding any connection value in source code or in versioned
  configuration.
- FR-003: The deployed service must accept authentication- and
  security-related configuration (JWT, CSRF/CORS, and other required
  secrets) exclusively via environment variables configured on the
  Render service, by variable name; no secret value may be committed to
  the repository or written into this specification.
- FR-004: `CORS_ORIGIN` must be configurable to the deployed frontend's
  production origin via an environment variable, without requiring a
  code change to update the allowed origin.
- FR-005: The deployed service must expose an HTTP endpoint that Render
  can use as a health check, returning a successful HTTP response when
  the service (including its MongoDB Atlas connectivity, to the extent
  already implemented by existing startup/connection behavior) is up.
  The exact route path and whether an existing route is reused or a new
  one is introduced is an open decision point for the architect (see
  Open Questions).
- FR-006: The deployment process must not execute any Prisma or
  Prisma-migration related command, and must not depend on any
  Prisma/PostgreSQL related package, since the current stack is
  Node.js/Express/MongoDB (Mongoose) and Prisma is not part of it.
- FR-007: After deployment, the publicly reachable service must respond
  successfully to its configured health-check endpoint and to at least
  one existing basic application endpoint (e.g. an existing works
  listing endpoint), confirming both the process is running and it can
  serve real application traffic.

## Non-Functional Requirements

- NFR-001 (Security): No secret value (JWT secret, admin credentials,
  `MONGO_URI`, Cloudinary credentials, or any other credential) may be
  present in the repository, in Render build/start scripts checked into
  the repository, or in any versioned specification/documentation. All
  such values must be configured only through Render's environment
  variable mechanism.
- NFR-002 (Compatibility): The Node.js runtime version selected on
  Render must be compatible with the version(s) the project is built and
  tested against locally, to avoid runtime/build discrepancies between
  environments.
- NFR-003 (Reliability): The health-check endpoint must allow Render to
  correctly detect an unhealthy instance (e.g., a failed or lost MongoDB
  Atlas connection, if such failure is already surfaced by existing
  application behavior) rather than reporting the service as healthy
  when it cannot serve real traffic.
- NFR-004 (Maintainability): Environment variable names required in
  production must be documented (by name only) so operators can
  reproduce the Render configuration without needing to read source code.

## Acceptance Criteria

- AC-001: When the Render Web Service is deployed from the backend
  repository using the project's existing build and start scripts, the
  build must complete successfully and the process must start without
  error, using only the compiled TypeScript output.
- AC-002: When the deployed service starts with a valid `MONGO_URI`
  environment variable pointing to the production MongoDB Atlas
  cluster, the service must establish a database connection successfully,
  observable via application logs, without the `MONGO_URI` value being
  logged or exposed.
- AC-003: When a required production environment variable (e.g.
  `MONGO_URI`, `JWT_SECRET`) is missing at startup, the service must fail
  to start rather than silently running with an invalid/default
  configuration, consistent with existing startup validation behavior.
- AC-004: When an HTTP GET request is made to the configured
  health-check endpoint on the publicly reachable Render URL, the
  service must respond with a successful HTTP status.
- AC-005: When an HTTP GET request is made to at least one existing
  basic application endpoint (e.g. an existing works listing endpoint)
  on the publicly reachable Render URL, the service must respond with a
  successful HTTP status and valid application data.
- AC-006: When the deployment process is inspected (build command, start
  command, and any deploy hooks configured on Render), it must not
  contain any Prisma or Prisma-migration related command.
- AC-007: When `CORS_ORIGIN` is set to the frontend's production origin
  via a Render environment variable, cross-origin requests from that
  origin must be permitted according to the existing CORS behavior,
  without requiring a source-code change.
- AC-008: No secret value appears in the repository, in this
  specification, or in any other versioned file as a result of this task.

## Constraints

- The build must use the project's existing TypeScript build process,
  producing the same compiled output already used by
  `npm run start:prod` (or equivalent existing script).
- Production configuration must be supplied only via `API_URL` (for any
  consumer needing to reach this API) and other environment variable
  names already defined by the project's typed environment
  configuration; no concrete environment-specific URL may be hardcoded
  into this specification or into the repository as part of this task.
- Authenticated requests to protected endpoints continue to use the
  project's existing Bearer token strategy; no token value is defined or
  implied by this specification.
- No Prisma command or Prisma/PostgreSQL dependency may be introduced or
  invoked as part of this deployment, per the explicit repository fact
  that the current stack is Node/Express/MongoDB Atlas.
- Secrets must be configured exclusively through Render's environment
  variable mechanism; they must never be committed to the repository.

## Dependencies

- Production MongoDB Atlas cluster and its `MONGO_URI` value, provisioned
  by the related task "Configurar MongoDB Atlas de produção e
  MONGO_URI". This specification assumes that dependency is satisfied
  before deployment and does not redefine how it is provisioned.
- Existing project build/start scripts (`npm run build`, and the
  project's existing start script for compiled output) must already
  build and run successfully outside of Render, since this task performs
  no source-code refactor of the build/start process by itself.
- Final production frontend domain, required to configure `CORS_ORIGIN`
  correctly (per Risks below).

## Out of Scope

- Provisioning or configuring the MongoDB Atlas cluster itself, or
  generating the `MONGO_URI` value (owned by a separate, related task).
- Any change to business logic, API contracts, or persistence models
  beyond what is strictly required to satisfy the health-check
  requirement (FR-005), which is itself an open decision point for the
  architect.
- Introducing Prisma, PostgreSQL, or any related tooling, command, or
  dependency.
- Frontend deployment or frontend configuration, beyond documenting that
  `CORS_ORIGIN` must eventually point to the frontend's final production
  domain.
- Defining the exact Render dashboard configuration steps (service name,
  region, instance size, autoscaling), which are operational choices not
  derivable from the task's product requirements.

## Risks

- Node.js version incompatibility between Render's runtime and the
  version the project is built/tested against locally.
- Secrets being accidentally exposed if not configured strictly through
  Render's environment variable mechanism (e.g., accidentally committed
  to the repository or logged at startup).
- `CORS_ORIGIN` misconfiguration if set before the final frontend
  production domain is known, which would block legitimate frontend
  requests or, if overly permissive, weaken CORS protection.
- The literal `/health` path required by the Definition of Done may not
  match the currently active composition root's behavior (see Open
  Questions — OQ-001), risking a deploy that satisfies build/start
  requirements but fails the DoD's explicit health-check path
  expectation.

## Open Questions

### Mandatory architecture-phase input

- OQ-001: The Definition of Done requires the API to respond on
  `/health`. The currently active composition root
  (`src/infra/config/routes.ts`, wired through `src/infra/server.ts` and
  `src/main/index.ts`) registers only `GET /` as a simple health
  indicator. A `GET /health` route exists in
  `src/infra/http/server.ts`, but that file is explicitly documented as
  legacy and is not wired into `src/main/index.ts`. The architect must
  decide whether to (a) add a real `GET /health` route to the active
  composition root, or (b) point Render's health check configuration at
  the existing `GET /` route instead, or (c) another approach consistent
  with existing architecture. This specification does not resolve this
  decision; it flags it as a mandatory input to the architecture phase
  for a NON-TRIVIAL classification.

### Non-blocking

- OQ-002: The exact list of Render-specific dashboard settings (service
  name, region, instance plan/size, autoscaling policy) is not defined
  by the Notion task and is left to the architect/operator, as long as
  it does not conflict with the constraints above.
- OQ-003: Whether Render's health-check mechanism should also validate
  live MongoDB Atlas connectivity per request, or only process liveness,
  is left to the architect, bounded by NFR-003.

## Traceability

FR-001 → AC-001
FR-002 → AC-002, AC-003
FR-003 → AC-003, AC-008
FR-004 → AC-007
FR-005 → AC-004
FR-006 → AC-006
FR-007 → AC-004, AC-005
