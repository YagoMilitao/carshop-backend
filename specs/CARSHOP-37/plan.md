# CARSHOP-37 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-37/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Make the existing backend deployable on Render as a Web Service using its
existing build/start scripts, with all secrets supplied only via Render env
vars (never committed), and with a `/health` endpoint that lets Render
detect both process liveness and MongoDB connectivity loss (NFR-003),
without introducing any Prisma tooling or breaking any existing contract.
Acceptance criteria map directly onto FR-001…FR-007 / AC-001…AC-008 as
written in the spec.

## Current Architecture

- `src/infra/server.ts` → `src/infra/config/routes.ts` is the active
  composition root (wired via `src/main/index.ts`). `routes.ts` currently
  only registers `GET /` → 200 "Hello World!".
- A `GET /health` route exists in `src/infra/http/server.ts`, but that file
  is legacy/unwired and must not be used or modified for this task.
- `src/infra/config/env.ts::getTrustProxyHopsEnv` currently defaults
  `TRUST_PROXY_HOPS` to `0` — verified, no code change needed here.
- No `.nvmrc` and no existing `engines` field in `package.json`.
  `.github/workflows/sonar-backend.yml` uses `actions/setup-node` with
  `node-version: 20` — the only concrete in-repo evidence of a target Node
  version.
- No `render.yaml` exists today.

## Proposed Solution

Add a real `GET /health` route to the active composition root, backed by an
actual MongoDB connectivity check, following the existing hexagonal flow:
port → use case → controller → route → composition root. Document Render
deployment configuration (build/start commands, health-check path, required
env var names) in README.md only, as operational documentation rather than
a versioned Render IaC file. Add a `package.json` `engines.node` field for
runtime/build consistency with what CI currently validates.

## Technical Decisions

### Decision: OQ-001 — Health-check route implementation

Add a real `GET /health` route to the active composition root
(`src/infra/config/routes.ts` / `src/infra/server.ts`), backed by an actual
MongoDB connectivity check. Do NOT point Render's health check at `GET /`,
and do NOT add anything to the legacy `src/infra/http/server.ts`.

### Reason

The Definition of Done literally requires `/health`. Pointing Render at `/`
would not satisfy NFR-003 (DB-connectivity detection) and would still leave
the DoD's literal path unmet. Adding a new, additive `/health` route avoids
touching `/`'s existing public contract.

### Alternatives Considered

- (b) Point Render's health-check configuration at the existing `GET /`
  route instead — rejected, does not satisfy NFR-003 or the DoD's literal
  `/health` path requirement.
- Reusing/reviving the legacy `GET /health` in `src/infra/http/server.ts` —
  rejected, that file is explicitly documented as legacy and unwired into
  `src/main/index.ts`.

### Trade-offs

A transient MongoDB blip will make `/health` return 503, which Render may
interpret as unhealthy and restart/stop routing traffic. This is the
explicit intent of NFR-003 and an accepted trade-off, not a bug
(health-check flapping risk).

---

### Decision: NFR-002 — Node engines field

Add `"engines": { "node": "20.x" }` to `package.json`.

### Reason

No `.nvmrc`; no existing `engines` field; `.github/workflows/sonar-backend.yml`
uses `actions/setup-node` with `node-version: 20` — the only concrete
in-repo evidence, used as the basis rather than inventing a version.

### Alternatives Considered

None explicitly evaluated beyond the in-repo evidence; inventing a newer
Node version without repository evidence was avoided.

### Trade-offs

Node 20 LTS maintenance window ended 2026-04-30 (today 2026-09-07), so
Node 20 is past EOL. Proceeding with `20.x` for build/runtime consistency
with what CI actually validates today is an accepted, flagged, non-blocking
residual risk. A follow-up recommendation (separate task) should evaluate
bumping CI + Render to a currently-maintained LTS.

---

### Decision: render.yaml

Do NOT add a `render.yaml`. Keep all Render-specific configuration (build
command, start command, health-check path, env var names) as documentation
only in README.md, not as a versioned Render config file.

### Reason

An IaC file would risk drifting from `package.json` scripts as a second
source of truth. The spec's Out-of-Scope section frames exact Render
config as an operational/dashboard concern.

### Alternatives Considered

Adding a `render.yaml` for declarative infra config — rejected for the
drift-risk reason above.

### Trade-offs

Operators must manually configure Render dashboard settings rather than
relying on a versioned config file; considered acceptable given the spec's
explicit Out-of-Scope framing.

---

### Decision: TRUST_PROXY_HOPS on Render

No code change. Recommend setting `TRUST_PROXY_HOPS=1` in the Render
dashboard (Render Web Services sit behind exactly one platform-managed
reverse proxy). Verified default in `src/infra/config/env.ts::getTrustProxyHopsEnv`
is `0`.

### Reason

This is an external/operational recommendation based on Render's documented
standard architecture, not verified from this repo alone.

### Alternatives Considered

Leaving `TRUST_PROXY_HOPS` unset (defaulting to `0`) — rejected as a
recommendation because it would misrepresent client IPs for rate-limiting
behind Render's proxy, per Render's documented topology.

### Trade-offs

The operator should confirm Render's actual proxy topology before trusting
production IP-based rate-limit behavior; this is dashboard-only, no code
change, and not independently verified against this specific deploy.

## Execution Flow

1. Domain port — `src/core/domain/application/Health/database-health-check.port.ts`:
   `export interface DatabaseHealthCheckPort { isConnected(): boolean; }`
2. Infra adapter — `src/infra/services/mongoose-database-health-check.service.ts`:
   `MongooseDatabaseHealthCheckService implements DatabaseHealthCheckPort`;
   `isConnected()` returns `mongoose.connection.readyState === 1`. Reads the
   existing global mongoose connection singleton from
   `src/infra/database/mongoose.ts::connectDatabase`; no new connection.
3. Use case — `src/usecase/get-health-status.use-case.ts`:
   `GetHealthStatusUseCase` (constructor-injected `DatabaseHealthCheckPort`),
   synchronous `execute()` returns
   `{ status: 'ok' | 'degraded'; database: 'connected' | 'disconnected' }`.
   No I/O, no throwing on the happy/degraded path — a state read, not a
   live DB ping.
4. Controller — `src/presentation/controllers/health.controller.ts`:
   `HealthController` thin `check` handler: calls use case, maps
   `status === 'ok'` → HTTP 200, `status === 'degraded'` → HTTP 503, both
   JSON. try/catch → `next(error)` per controllers.md.
5. Route wiring — `src/infra/config/routes.ts`: add
   `healthController: HealthController` to `RegisterRoutesDependencies`;
   add `app.get('/health', dependencies.healthController.check);`
   (additive, do not touch existing `app.get('/', ...)`).
6. Composition root — `src/infra/server.ts`: instantiate
   `new MongooseDatabaseHealthCheckService()` →
   `new GetHealthStatusUseCase(...)` → `new HealthController(...)`; pass
   `healthController` into `registerRoutes(app, {...})`.

## Files

### Files to Create

- `src/core/domain/application/Health/database-health-check.port.ts`
- `src/infra/services/mongoose-database-health-check.service.ts`
- `src/usecase/get-health-status.use-case.ts`
- `src/presentation/controllers/health.controller.ts`
- `test/unit/infra/services/mongoose-database-health-check.service.spec.ts`
- `test/unit/usecase/get-health-status.use-case.spec.ts`
- `test/unit/presentation/controllers/health.controller.spec.ts`

No spec file is needed for the port itself — pure interface, testing.md
type-only exception.

### Files to Modify

- `src/infra/config/routes.ts` — add `healthController` to
  `RegisterRoutesDependencies`; register `GET /health`.
- `src/infra/server.ts` — instantiate and wire the new health
  adapter/use case/controller.
- `src/infra/docs/health.swagger.ts` — add `/health` path.
- `package.json` — add `engines.node`.
- `README.md` — add Render deployment section (documentation only).
- `test/unit/infra/config/routes.spec.ts` — update all
  `registerRoutes(app, {...})` call sites to include a `healthController`
  mock; add a test asserting `app.get('/health', expect.any(Function))`
  and 200/503 mapping (mock `HealthController.check`, or assert wiring
  only if handler logic is covered at controller-spec level).
- `test/unit/infra/server.spec.ts` — mock
  `MongooseDatabaseHealthCheckService`, `GetHealthStatusUseCase`,
  `HealthController`; update `toHaveBeenCalledWith(...)` assertions
  (default and override-imageStorage cases) to include `healthController`.
- `test/unit/infra/docs/swaggerSingletonArray.spec.ts` — add assertion
  that `openApiDocument.paths['/health']` is defined with 200/503
  responses.
- `test/e2e/app.e2e-spec.ts` (or a new focused e2e spec, developer's
  choice) — add case: with e2e `beforeAll` DB connection established,
  `GET /health` returns 200 with
  `{ status: 'ok', database: 'connected' }`. Run `npm run test:e2e` since
  composition root/routes changed.

### Not Changed (verified, no action needed)

- `src/main/index.ts`, `src/main/create-indexes.ts` — both already log
  only `error.message` / a generic string on failure, never the raw
  error/cause object. No regression found, no fix required.
- `src/infra/config/env.ts` — `TRUST_PROXY_HOPS`, production-gated
  `CORS_ORIGIN`/`JWT_SECRET`/`ADMIN_PASSWORD` validation all already
  present and unchanged; no code change needed, only Render dashboard env
  var configuration.
- No `render.yaml` added.

## Contract Impact

New public, unauthenticated endpoint:
`GET /health` → 200 `{ status: 'ok', database: 'connected' }` or 503
`{ status: 'degraded', database: 'disconnected' }`. No cookies, no CSRF, no
auth. Existing `GET /` contract untouched.

## Persistence Impact

No persistence schema change, no new Mongoose model. The health-check
adapter reads the existing global mongoose connection singleton's
`readyState`; it does not open a new connection or perform a live query.

## Security Impact

- No secret values appear anywhere in this plan, per spec-security.md; all
  env vars referenced by name only.
- `/health` is a public, unauthenticated endpoint with no cookies/CSRF,
  consistent with its purpose as a platform health check.
- Atlas IP allowlisting: Render's outbound IPs must be allowlisted in
  MongoDB Atlas (or a static-IP add-on used) before deploy succeeds —
  external/operational prerequisite outside repo scope, already surfaced
  by `connectDatabase`'s Atlas-specific error message.
- `TRUST_PROXY_HOPS` dashboard recommendation (see Technical Decisions)
  affects accuracy of production IP-based rate-limit behavior; must be
  confirmed by the operator against Render's actual proxy topology.

## Swagger Impact

- `src/infra/docs/health.swagger.ts`: add a new `/health` path entry
  (leave existing `/` entry, if any, untouched) documenting: 200 response
  `{ status: 'ok', database: 'connected' }`; 503 response
  `{ status: 'degraded', database: 'disconnected' }`; no auth/CSRF (public
  endpoint); tag `Health`.
- No change needed to `src/infra/swagger.ts` merge wiring — the health
  paths object already flows into `mergeOpenApiPaths(...)`; adding a
  second key to the same exported object is sufficient.

## Testing Strategy

(NON-TRIVIAL, >=80% new/changed-code target)

- `get-health-status.use-case.spec.ts`: mock `DatabaseHealthCheckPort`;
  assert ok/connected when `isConnected()` true, degraded/disconnected
  when false. Full branch coverage achievable.
- `mongoose-database-health-check.service.spec.ts`: mock mongoose module's
  `connection.readyState`; assert `isConnected()` true only for
  `readyState===1`, false for 0/2/3. Full branch coverage achievable
  without a real DB connection.
- `health.controller.spec.ts`: mock `GetHealthStatusUseCase.execute`;
  assert 200/JSON on ok, 503/JSON on degraded, and `next(error)` on a
  thrown error (legitimate defensive-path test per controllers.md's
  mandated try/catch pattern).
- `routes.spec.ts` / `server.spec.ts` updates: wiring assertions only.
- `swaggerSingletonArray.spec.ts` addition: documents the new
  path/response codes exist.
- E2E addition: one live-DB `GET /health` case, run via
  `npm run test:e2e` per testing.md's explicit trigger (routes/server
  composition change). Does not substitute for the unit tests above.

Given the isolated, fully-mockable nature of every new file, >=80%
new-code coverage is expected to be fully reachable; no justified
exception anticipated. If tester later finds a genuine gap, report
percentage, uncovered lines, reason, residual risk per testing.md — do not
silently accept.

## Risks

- Atlas IP allowlisting: Render's outbound IPs must be allowlisted in
  MongoDB Atlas (or a static-IP add-on used) before deploy succeeds —
  external/operational prerequisite outside repo scope, already surfaced
  by `connectDatabase`'s Atlas-specific error message.
- `TRUST_PROXY_HOPS` recommendation is based on Render's general
  documented topology, not verified against this specific deploy;
  operator must confirm before trusting production IP-based rate-limit
  behavior.
- Node 20 EOL: flagged as residual, out-of-scope risk; recommend a
  follow-up task to evaluate bumping CI + Render to a currently-maintained
  LTS.
- Health-check flapping: a transient MongoDB blip will make `/health`
  return 503, which Render may interpret as unhealthy and
  restart/stop routing traffic — this is the explicit intent of NFR-003,
  an accepted trade-off, not a bug.
- No secret values appear anywhere in this plan, per spec-security.md; all
  env vars referenced by name only.

## Implementation Steps

1. Create `DatabaseHealthCheckPort` in
   `src/core/domain/application/Health/database-health-check.port.ts`.
2. Implement `MongooseDatabaseHealthCheckService` in
   `src/infra/services/mongoose-database-health-check.service.ts`.
3. Implement `GetHealthStatusUseCase` in
   `src/usecase/get-health-status.use-case.ts`.
4. Implement `HealthController` in
   `src/presentation/controllers/health.controller.ts`.
5. Wire `healthController` into `RegisterRoutesDependencies` and register
   `GET /health` in `src/infra/config/routes.ts`.
6. Instantiate and inject the new adapter/use case/controller chain in
   `src/infra/server.ts`.
7. Add the `/health` path to `src/infra/docs/health.swagger.ts`.
8. Add `"engines": { "node": "20.x" }` to `package.json`.
9. Add the "Deploy no Render (Web Service)" section to `README.md`
   (documentation only, names/values-free per spec-security.md), including
   the `TRUST_PROXY_HOPS=1` recommendation and the Node-version note.
10. Add/update unit tests: `get-health-status.use-case.spec.ts`,
    `mongoose-database-health-check.service.spec.ts`,
    `health.controller.spec.ts`.
11. Update `test/unit/infra/config/routes.spec.ts` and
    `test/unit/infra/server.spec.ts` for the new dependency wiring.
12. Update `test/unit/infra/docs/swaggerSingletonArray.spec.ts` to assert
    the new `/health` path/responses.
13. Add an e2e case for `GET /health` (live-DB, 200,
    `{ status: 'ok', database: 'connected' }`).
14. Run `npm test`, `npm run build`, and `npm run test:e2e` (routes/server
    composition changed).

## Definition of Done Mapping

- FR-001 → AC-001: satisfied by existing build/start scripts; no change
  required beyond `engines.node` (NFR-002).
- FR-002 → AC-002, AC-003: satisfied by existing `MONGO_URI` handling and
  startup validation; documented by name in README.
- FR-003 → AC-003, AC-008: satisfied by existing env-var-only secret
  configuration; documented by name in README; no secret values in any
  versioned file.
- FR-004 → AC-007: satisfied by existing `CORS_ORIGIN` env-var behavior;
  documented in README.
- FR-005 → AC-004: satisfied by the new `GET /health` route (OQ-001
  decision (a)) backed by real MongoDB connectivity state.
- FR-006 → AC-006: satisfied — no Prisma command or dependency introduced
  anywhere in this plan.
- FR-007 → AC-004, AC-005: satisfied by `GET /health` plus verification
  against an existing basic endpoint (e.g. works listing) post-deploy.
- NFR-001: no secret values in repo/spec/plan; env-var-only configuration.
- NFR-002: `engines.node` set to `20.x` per in-repo CI evidence.
- NFR-003: `/health` returns 503 on lost MongoDB connectivity via
  `MongooseDatabaseHealthCheckService.isConnected()`.
- NFR-004: README documents all required env var names.

## Open Non-Blocking Questions

- OQ-002: The exact list of Render-specific dashboard settings (service
  name, region, instance plan/size, autoscaling policy) is not defined by
  the Notion task and is left to the architect/operator, as long as it
  does not conflict with the spec's constraints.
- OQ-003: Whether Render's health-check mechanism should also validate
  live MongoDB Atlas connectivity per request, or only process liveness,
  is resolved by this plan as a state read of the existing connection's
  `readyState` (not a live per-request ping), bounded by NFR-003.
- Non-blocking recommendation (out of this task's scope): evaluate
  bumping CI + Render to a currently-maintained Node LTS in a follow-up
  task, given Node 20's EOL status noted above.

## Historical Knowledge Validation Summary

All four Obsidian historical-knowledge items (production-gated env
validation, Atlas IP allowlist troubleshooting, `TRUST_PROXY_HOPS`
default, sanitized error logging) were verified still valid/unchanged in
the current repository. No conflicts found between Obsidian history and
current repository state.

## Required Output

Plan:

`specs/CARSHOP-37/plan.md`

Status:

WRITTEN
