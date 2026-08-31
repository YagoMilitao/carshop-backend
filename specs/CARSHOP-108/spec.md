# CARSHOP-108 — Dedicated Brute-Force Protection for Login

## Status

Ready

## Source

Notion Task:
CARSHOP-108

## Context

The application currently applies a single global rate limiter to all
routes: a fixed window of 15 minutes allowing up to 100 requests per IP
(implemented in `src/infra/presentation/middleware/rate-limit.middleware.ts`
as `globalRateLimitMiddleware`, and registered for the whole app in
`src/infra/config/middleware.ts`). `POST /auth/login`
(`src/infra/http/routes/auth.routes.ts`) does not have any route-specific
rate limiting; it only inherits the shared global policy.

This generic, shared policy is not an adequate brute-force defense for the
admin login endpoint: an attacker attempting to guess the admin password
has the same 100-requests/15-minutes budget as any other visitor browsing
the public site, and successful/failed login attempts are not distinguished
from other traffic.

Additionally, the repository does not currently configure Express's
`trust proxy` setting anywhere (no reference to `trust proxy` was found in
`src/infra/config/env.ts`, `src/infra/config/middleware.ts`, or elsewhere
in `src`). Because rate limiting by IP depends on Express correctly
resolving the client's IP address behind any reverse proxy/load balancer
used in deployment, an unconfigured `trust proxy` setting can make IP-based
limiting unreliable or spoofable in the deployed environment.

## Objective

Introduce a dedicated, stricter rate-limiting policy for `POST
/auth/login`, separate from the existing global limiter, so that automated
password-guessing attempts against the admin account are throttled much
more aggressively than general traffic — without leaking whether a
submitted email exists, without storing credentials in limiter state, and
with an explicit, tested `trust proxy` configuration appropriate for the
deployment environment.

## Functional Requirements

- FR-001: A rate-limiting policy dedicated to `POST /auth/login` must
  exist, separate from `globalRateLimitMiddleware`, applied only to the
  login route.
- FR-002: The dedicated login policy's window duration and maximum request
  count must both be smaller/stricter than the existing global limiter's
  window (15 minutes) and limit (100 requests). The exact numeric values
  are an implementation detail to be decided during architecture/
  development, within this constraint.
- FR-003: Both failed (invalid credentials) and successful login attempts
  must count toward the dedicated login limit's counter. (The existing
  global limiter already applies this "count everything" behavior via
  `skipSuccessfulRequests: false`; the dedicated login limiter must
  preserve this property.)
- FR-004: When the dedicated login limit is exceeded, the endpoint must
  respond with HTTP 429.
- FR-005: The HTTP 429 response body must not reveal whether the submitted
  email corresponds to an existing account. It must use a generic message
  that does not vary based on email validity.
- FR-006: The key used to track rate-limit state must be derived from the
  client's IP address and, where applicable, a normalized identity (e.g. a
  normalized/hashed form of the submitted identifier). The key or any
  associated limiter state must never contain the raw email, raw password,
  or any other credential value.
- FR-007: Express's `trust proxy` setting must be explicitly configured
  (not left at its implicit default) for the application, so that
  IP-based rate limiting correctly and safely identifies the client IP in
  the deployment environment.
- FR-008: Legitimate admin logins with correct credentials, made at a
  normal human pace, must not be blocked by the dedicated login limiter
  during ordinary use.
- FR-009: After the dedicated login limiter's window elapses (or is reset),
  a client that was previously blocked must be able to attempt login again
  normally.
- FR-010: Any metric or log entry produced by the login rate-limiting
  mechanism (e.g. blocking events) must never record password, access
  token, refresh token, or cookie values.

## Non-Functional Requirements

- NFR-001 (Security): The dedicated login limiter must not introduce a
  user-enumeration side channel through timing, response body content, or
  response headers that differ based on account existence.
- NFR-002 (Security): No credential material (raw email, raw password,
  tokens, cookies) may be persisted, logged, or used as-is as part of
  rate-limit key material or blocking telemetry. Where an identity
  component is used in the key, it must be normalized/derived in a way
  that does not expose the original credential value.
- NFR-003 (Reliability): The `trust proxy` configuration must match the
  actual number of trusted proxy hops in the deployment topology, so that
  the resolved client IP used for rate limiting cannot be trivially
  spoofed via forged `X-Forwarded-For` headers, while still correctly
  identifying distinct clients.
- NFR-004 (Compatibility): Introducing the dedicated login limiter must
  not change the existing response contract of `POST /auth/login` for
  non-rate-limited requests (status codes, response body shape, cookies
  set on success) as documented in the project's Swagger fragments and
  `README.md`.
- NFR-005 (Maintainability): The dedicated login limiter must be
  implemented following the existing rate-limiter pattern in
  `src/infra/presentation/middleware/rate-limit.middleware.ts` rather than
  introducing a parallel, inconsistent mechanism.

## Acceptance Criteria

- AC-001: A request to `POST /auth/login` is subject to a dedicated
  rate-limit policy whose configured window is shorter than 15 minutes and
  whose configured request limit is lower than 100, distinct from the
  global limiter.
- AC-002: When the number of login attempts (successful or failed) from
  the same client within the dedicated policy's window exceeds its
  configured limit, the endpoint responds with HTTP 429.
- AC-003: The HTTP 429 response body does not contain the submitted email,
  does not indicate whether that email exists, and is identical in shape
  regardless of whether the rate-limited attempts used a real or
  nonexistent admin email.
- AC-004: Inspecting the rate-limit key/state used by the dedicated login
  limiter shows no raw email, raw password, token, or cookie value stored
  or logged as part of that key/state.
- AC-005: The application's `trust proxy` setting is explicitly set (not
  relying on the Express default) and covered by a test that verifies the
  configured value is applied.
- AC-006: An E2E test that performs invalid login attempts until the
  dedicated limiter returns HTTP 429 confirms that no session is created
  and no `refresh_token` or `csrf_token` cookie is set on the 429 response.
- AC-007: An E2E test confirms that after the dedicated login limiter's
  window resets (via waiting or controlled clock manipulation), a
  subsequent legitimate login attempt is no longer blocked and succeeds
  under normal conditions.
- AC-008: A legitimate login with correct credentials performed within the
  dedicated limiter's allowed attempt count completes successfully
  (existing 200/success contract preserved) and is not blocked.
- AC-009: No blocking-related log or metric emitted by the dedicated login
  limiter contains a password, access token, refresh token, or cookie
  value.

## Constraints

- Must reuse the existing `express-rate-limit`-based pattern already used
  for `globalRateLimitMiddleware`, unless the architecture phase
  identifies a concrete reason to deviate.
- Must not weaken or alter the existing CSRF protections on `/auth/refresh`
  and `/auth/logout`.
- Must not change the public response contract of `POST /auth/login`
  (status codes, body shape, cookies) for requests that are not rate
  limited.
- Must not introduce logging or storage of raw credential values (email,
  password) as part of the rate-limiting mechanism.
- Exact numeric values for the dedicated login limiter's window and
  request limit are not fixed by this specification beyond "smaller/
  stricter than the global limiter" (FR-002); they are left to the
  architecture/development phase.
- Exact deployment proxy topology (number of trusted hops in front of the
  application) is not detailed here; it must be determined from
  infrastructure configuration during the architecture phase before
  finalizing the `trust proxy` value.

## Dependencies

- `express-rate-limit` (currently `^8.7.0` in `package.json`) — the task's
  Definition of Done calls for updating this dependency before release;
  the exact target version is an implementation/architecture decision.
- `ip-address` — referenced in the Notion task as a dependency to update
  before release. It is not currently listed as a direct dependency in
  `package.json`; if it is required (e.g. as a transitive dependency of
  `express-rate-limit`, or introduced for IP normalization), its version
  must be verified/updated as part of implementation.
- Depends on the existing `AuthController` / `POST /auth/login` route
  composition in `src/infra/http/routes/auth.routes.ts`.
- Depends on Express's `trust proxy` setting, which must be added to the
  application's configuration (`src/infra/config/env.ts` and/or
  `src/infra/server.ts` / `src/infra/config/middleware.ts`, exact location
  to be decided during architecture).

## Out of Scope

- Changes to the global rate limiter's existing window/limit values for
  routes other than login.
- Changes to the JWT access/refresh token model, session rotation, or CSRF
  double-submit mechanism on `/auth/refresh` and `/auth/logout`.
- Account lockout or persistent ban mechanisms beyond the rate-limit
  window (e.g. permanent account suspension after repeated failures) —
  not requested by the task.
- CAPTCHA or other secondary challenge mechanisms on login — not requested
  by the task.
- Multi-instance/distributed rate-limit state sharing (e.g. Redis-backed
  store) — not mentioned in the task; may only be considered if the
  architecture phase determines the current in-memory approach is
  insufficient for the deployment topology, in which case this
  specification would need to be revisited.

## Risks

- An overly strict window/limit could block legitimate admins who
  mistype their password a few times in a row (mitigated by FR-008/AC-008,
  which require normal legitimate use to remain unblocked).
- An incorrectly configured `trust proxy` value could either make the
  limiter trivially bypassable (too permissive) or incorrectly group
  distinct clients behind a shared proxy into a single rate-limit bucket
  (too strict) — this depends on infrastructure details not fully known
  at spec time (see Open Questions, non-blocking).
- Adding a normalized-identity component to the rate-limit key introduces
  a risk of accidentally leaking or mishandling credential-adjacent data
  if not implemented carefully; FR-006/NFR-002/AC-004 exist specifically
  to guard against this.

## Open Questions

### Blocking

None.

### Non-blocking

- Exact numeric window/limit values for the dedicated login limiter beyond
  "smaller than the global limiter" (FR-002) — to be decided by
  architect/developer.
- Exact deployment proxy topology (number of trusted hops for `trust
  proxy`) — needs infrastructure/repo inspection during the architecture
  phase; not detailed in the Notion task.
- Whether `ip-address` needs to be added as a direct dependency or is only
  relevant transitively — to be confirmed during implementation.

## Traceability

FR-001 → AC-001
FR-002 → AC-001
FR-003 → AC-002, AC-008
FR-004 → AC-002
FR-005 → AC-003
FR-006 → AC-004
FR-007 → AC-005
FR-008 → AC-008
FR-009 → AC-007
FR-010 → AC-009
NFR-001 → AC-003
NFR-002 → AC-004, AC-009
NFR-003 → AC-005
NFR-004 → AC-008
NFR-005 → AC-001
