# CARSHOP-108 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-108/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Introduce a dedicated, stricter rate-limiting policy for `POST /auth/login`,
separate from the existing global limiter, so that automated
password-guessing attempts against the admin account are throttled much
more aggressively than general traffic — without leaking whether a
submitted email exists, without storing credentials in limiter state, and
with an explicit, tested `trust proxy` configuration appropriate for the
deployment environment.

## Existing Knowledge

No relevant historical knowledge found (`knowledge-reader` could not run:
`OBSIDIAN_VAULT_ID` unavailable in this session). Proceeding on repository
evidence only.

## Current Architecture

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

## Proposed Solution

Add a dedicated, stricter `express-rate-limit` policy to `POST
/auth/login`, keyed by IP + a salted/hashed normalized email (never raw
credentials), returning a generic 429 that leaks no enumeration signal,
backed by an explicit `trust proxy` setting, with no regression to the
existing 200/400/401 login contract.

## Technical Decisions

### Decision

Extend `src/infra/presentation/middleware/rate-limit.middleware.ts` (no
new file) with a new export `loginRateLimitMiddleware`, built via the
existing `createRateLimiter` helper:

- `windowMs`: 5 * 60 * 1000 (5 min) — smaller than global's 15 min.
- `limit`: 5 — smaller than global's 100.
- `standardHeaders: true`, `legacyHeaders: false` — consistent with global
  limiter.
- `skipSuccessfulRequests: false` — count everything (FR-003).
- `message: { message: 'Muitas tentativas de login. Tente novamente mais
  tarde.' }` — static, generic, identical regardless of email validity
  (FR-005/NFR-001/AC-003), same flat `{ message: string }` shape already
  returned by `errorHandlerMiddleware`/`HttpError`.

### Reason

Reuses the existing rate-limiter pattern (NFR-005) rather than introducing
a parallel mechanism, and satisfies FR-001/FR-002/FR-003 with values
stricter than the global limiter's 15 min / 100 requests.

### Alternatives Considered

Not specified beyond reuse of the existing `express-rate-limit` pattern
(constraint in spec.md); no alternative middleware/library evaluated
because an existing dependency already solves the problem.

### Trade-offs

Fixed numeric values (5 attempts / 5 minutes) are a starting point tunable
later without architecture change; overly strict values could affect
legitimate admins mistyping credentials, mitigated by FR-008/AC-008.

---

### Decision

Key strategy: export a pure, independently unit-testable function
`buildLoginRateLimitKey(ip: string, rawEmail: unknown): string` in the
same file:

- Normalize email: `typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''`
  (mirrors `login.validator.ts` normalization).
- Hash it: `createHash('sha256').update(normalizedEmail).digest('hex')`
  (same `node:crypto` primitive `AuthService` already uses for
  `hashToken`) — if no email present, use fixed sentinel `'no-email'`
  rather than hashing empty string.
- Combine with IP via `express-rate-limit` v8's own `ipKeyGenerator`
  export: `` `${ipKeyGenerator(request.ip ?? '')}:${emailHash}` ``.
  Required because `express-rate-limit` v8 validation flags custom
  `keyGenerator` functions referencing `req.ip`/`request.ip` directly
  (IPv6 subnet bypass risk).
- Wired as the limiter's `keyGenerator`: `(request) =>
  buildLoginRateLimitKey(request.ip ?? '', (request.body as { email?:
  unknown })?.email)`. `request.body` is already parsed by
  `express.json()` registered globally before routes mount.
- Nothing raw (email, password) ever stored — only SHA-256 digest.

### Reason

Satisfies FR-006/NFR-002/AC-004: the rate-limit key/state must never
contain raw email, raw password, or any other credential value, while
still distinguishing distinct clients/identities.

### Alternatives Considered

Using `request.ip` directly in the key was rejected because
`express-rate-limit` v8 flags this pattern due to IPv6 subnet bypass risk;
the library's own `ipKeyGenerator` helper is used instead.

### Trade-offs

Adding a normalized-identity component to the key introduces a risk of
accidentally leaking or mishandling credential-adjacent data if not
implemented carefully; FR-006/NFR-002/AC-004 exist specifically to guard
against this, and the pure-function design keeps it independently
unit-testable.

---

### Decision

Route wiring: in `src/infra/http/routes/auth.routes.ts`, change only the
login line:

```
router.post('/login', loginRateLimitMiddleware, controller.login);
```

No other route touched. `express-rate-limit`'s handler responds 429
before reaching `AuthController.login`, so `setAuthCookies` never
executes on 429 — no cookies/session created (AC-006) by construction.

### Reason

Satisfies FR-001 (dedicated policy applied only to the login route) and
NFR-004 (no change to non-rate-limited login contract).

### Alternatives Considered

None recorded beyond the direct route wiring approach.

### Trade-offs

None identified.

---

### Decision

Add explicit `trust proxy` configuration:

- New validated env var `TRUST_PROXY_HOPS` (integer >= 0, default 1) in
  `src/infra/config/env.ts`, following the exact existing pattern of
  `getWorkHardDeleteAfterDaysEnv`. Default 1 = single reverse proxy hop
  assumption (documented in code comments and README as an assumption,
  since no IaC/deploy manifest exists in-repo to confirm actual topology;
  if real topology differs, only the env var value needs to change).
- Apply in `src/infra/server.ts` as the first statement in `createApp()`
  right after `const app = express();`: `app.set('trust proxy',
  env.trustProxyHops);` — runs before `registerBaseMiddlewares` (and both
  rate limiters), also correctly benefiting the existing global limiter's
  IP resolution.
- Update `.env.example` with `TRUST_PROXY_HOPS=1` plus a short comment
  (name only, no secret value).

### Reason

Satisfies FR-007/NFR-003/AC-005: `trust proxy` must be explicitly
configured (not left at implicit default) so IP-based rate limiting
correctly and safely identifies the client IP.

### Alternatives Considered

None recorded; default value of 1 chosen as a documented assumption in
the absence of in-repo IaC/deploy manifest evidence of actual proxy
topology.

### Trade-offs

`trust proxy` topology uncertainty: default of 1 is a documented
assumption, not a hard architectural fact — flagged in code
comments/README. An incorrectly configured value could either make the
limiter trivially bypassable (too permissive) or incorrectly group
distinct clients behind a shared proxy into a single rate-limit bucket
(too strict).

---

### Decision

Logging/metrics: no new logging introduced. `express-rate-limit`'s
default 429 handling does not log; no custom handler/`onLimitReached`
callback is added. Existing `morgan` access logging already logs
method/path/status only, not body — unaffected.

### Reason

Satisfies FR-010/AC-009 by not introducing any new logging surface that
could record credential material.

### Alternatives Considered

None recorded.

### Trade-offs

None identified.

---

### Decision

Do not add the `ip-address` package as a new dependency.

### Reason

`express-rate-limit@^8.7.0` (already installed) exports `ipKeyGenerator`
directly (confirmed in
`node_modules/express-rate-limit/dist/index.d.mts`). No new dependency is
needed, per `typescript.md` ("do not add a library when an existing
dependency solves the problem").

### Alternatives Considered

Adding `ip-address` as referenced in the Notion task's dependency note
was considered and rejected as unnecessary for this feature; the
Notion task's dependency-bump note is treated as a separate chore-type
concern, out of scope for this feature-level change.

### Trade-offs

None identified.

---

### Decision

Swagger: in `src/infra/docs/auth.swagger.ts`, add a 429 response entry to
the existing `/auth/login` path's `responses` object, reusing the
existing `errorResponse(...)` helper and `ErrorResponse` schema (already
used for 400/401):

```
'429': errorResponse('Muitas tentativas de login. Tente novamente mais tarde.'),
```

Only Swagger change; `/auth/refresh`, `/auth/logout`, `/auth/session`
untouched.

### Reason

Keeps documented contract synchronized with actual route behavior per
`openapi.md`.

### Alternatives Considered

None recorded.

### Trade-offs

None identified.

## Execution Flow

1. Extend `rate-limit.middleware.ts` with `buildLoginRateLimitKey` and
   `loginRateLimitMiddleware`.
2. Add `TRUST_PROXY_HOPS` env validation to `env.ts`.
3. Apply `app.set('trust proxy', env.trustProxyHops)` at the start of
   `createApp()` in `server.ts`.
4. Wire `loginRateLimitMiddleware` onto `POST /login` in
   `auth.routes.ts`.
5. Add the 429 response fragment to `auth.swagger.ts`.
6. Update `.env.example` (and optionally `README.md`) with
   `TRUST_PROXY_HOPS`.
7. Add/extend unit tests and E2E tests per Testing Strategy below.
8. Run `npm test`, `npm run build`, and `npm run test:e2e`.

## Files

### Files to Create

None. (Optionally a new E2E spec file for AC-006/AC-007/AC-008 if not
extending an existing one — see Testing Strategy.)

### Files to Modify

- `src/infra/presentation/middleware/rate-limit.middleware.ts` — add
  `loginRateLimitMiddleware` + exported `buildLoginRateLimitKey` pure
  function.
- `src/infra/http/routes/auth.routes.ts` — wire
  `loginRateLimitMiddleware` onto `POST /login` only.
- `src/infra/config/env.ts` — add `trustProxyHops` field +
  `getTrustProxyHopsEnv()` validator.
- `src/infra/server.ts` — call `app.set('trust proxy',
  env.trustProxyHops)` at start of `createApp()`.
- `src/infra/docs/auth.swagger.ts` — add 429 response on `/auth/login`.
- `.env.example` — add `TRUST_PROXY_HOPS=1` with comment.
- `README.md` — optionally note dedicated login rate limit and trust
  proxy setting.

No domain/use-case/controller/model changes.

## Contract Impact

- `POST /auth/login`: unchanged 200/400/401 contract. New 429
  `{ "message": "Muitas tentativas de login. Tente novamente mais
  tarde." }` plus standard `RateLimit-*` headers.
- No cookie contract change.
- `/auth/refresh`, `/auth/logout`, `/auth/session` untouched.

## Persistence Impact

No persistence/schema changes — reuses `express-rate-limit`'s default
in-memory store (single-instance only; multi-instance/distributed state
explicitly out of scope per spec).

## Security Impact

- No weakening of CSRF, cookie flags, or JWT/session behavior — none of
  those files touched.
- Rate-limit key/state derived only from IP + SHA-256 hash of normalized
  email; no raw email, password, token, or cookie value stored or logged.
- Generic, static 429 message prevents user-enumeration via response
  body content.
- Explicit `trust proxy` configuration reduces IP-spoofing risk for
  rate-limit bypass, subject to the documented topology assumption
  (default 1 hop).

## Swagger Impact

`src/infra/docs/auth.swagger.ts`: add a `429` response entry to the
existing `/auth/login` path, reusing the existing `errorResponse(...)`
helper and `ErrorResponse` schema. No other path documentation changes.

## Testing Strategy

- `test/unit/infra/presentation/middleware/rate-limit.middleware.spec.ts`
  (extend): `loginRateLimitMiddleware` is an Express middleware function
  (mirrors existing `globalRateLimitMiddleware` assertion);
  `buildLoginRateLimitKey`: same IP+email → same key; case/whitespace
  email variants → same normalized key; different IP → different key;
  missing/non-string email → stable sentinel-based key; assert returned
  key never contains raw email substring (tests AC-004/FR-006 at unit
  level).
- `test/unit/infra/config/env.spec.ts` (extend, following
  `WORK_HARD_DELETE_AFTER_DAYS` pattern): default `trustProxyHops` = 1
  when unset; valid override; throws on invalid values (-1, `'abc'`,
  1.5).
- `test/unit/infra/server.spec.ts` (extend, using existing
  `mockApp`/`jest.mock` scaffolding): assert `mockApp.set` (add `set:
  jest.fn()` to `mockApp`) called with `('trust proxy',
  env.trustProxyHops)` before `registerBaseMiddlewares`. Satisfies
  AC-005.
- `src/infra/docs/auth.swagger.ts`: if an existing swagger-fragment/schema
  unit test suite exists, add the 429 case there (verify at
  implementation time).
- E2E (`test/e2e/`, new file or extend existing `app.e2e-spec.ts`
  auth-flow spec):
  - AC-006: repeated invalid-credential POSTs to `/auth/login` until 429;
    assert no `Set-Cookie` for `refresh_token`/`csrf_token` on the 429
    response, and no new `AuthSessionModel` document exists for that
    attempt window.
  - AC-007: after advancing past the window, confirm recovery —
    developer must choose fake timers
    (`jest.useFakeTimers`/`advanceTimersByTime`, verified experimentally
    against `express-rate-limit` v8's store timing) OR a test-only
    env-overridable `windowMs`/`limit`; either approach must preserve
    production values from FR-002. This choice is left to the developer
    as a non-architectural implementation detail.
  - AC-008: legitimate login within allowed count (e.g. 3 of 5) still
    returns 200 with existing `AuthResponse` shape — regression check for
    NFR-004.
  - AC-005 (optional E2E companion): supertest request with forged
    `X-Forwarded-For` behind configured hop count to sanity-check IP
    resolution; unit test on `app.set` is primary AC-005 evidence.
- Run `npm test`, `npm run build`, and `npm run test:e2e` (routes/
  middleware/auth files changed).

### Coverage Target and Exception Rationale

Per `.claude/rules/testing.md`, new or changed production code introduced
by this task is expected to carry `>= 80%` unit-test coverage, measured
against the new/changed code produced by this task (task-diff-based),
not the repository's historical/global coverage number, using
`npm run test:coverage` and `coverage/lcov.info` (added files: file's own
aggregate `LH`/`LF`; modified files: `git diff` changed lines
cross-referenced against `DA:<line>,<hits>` records, using the correct
base revision and new-file-side line numbers, excluding unrelated
changes). An exception to the `>= 80%` target may be accepted only when
reaching it is technically infeasible, disproportionate, or not
applicable (e.g. pure passthrough schema declarations with no custom
hook/validator/derived-field logic); Mongoose model files with custom
hook or validation logic are not automatically exempt. E2E tests do not
automatically substitute for unit tests when the behavior is reasonably
unit-testable. If an exception is accepted for this task, the recorded
result must include: the coverage percentage actually obtained, the
uncovered parts of the new/changed code, the stated reason for the
exception, and the residual risk. No exception has been pre-approved by
the architect for this task; this rationale is recorded so it is
available if the developer/tester determine one is genuinely warranted
during implementation (e.g. for lines only reachable via real
`express-rate-limit` internal timing behavior that cannot be reasonably
unit-tested and are instead covered at the E2E level per AC-006/AC-007).

## Risks

- False positives for legitimate admins: mitigated by 5 attempts/5
  minutes (generous for human mistyping, strict against automated brute
  force); tunable later without architecture change.
- `trust proxy` topology uncertainty: default of 1 is a documented
  assumption, not a hard architectural fact — flagged in code
  comments/README.
- In-memory store: single-instance only; acceptable per spec's
  out-of-scope note.
- Security: no weakening of CSRF, cookie flags, or JWT/session behavior —
  none of those files touched.
- An overly strict window/limit could block legitimate admins who
  mistype their password a few times in a row (mitigated by
  FR-008/AC-008).
- An incorrectly configured `trust proxy` value could either make the
  limiter trivially bypassable (too permissive) or incorrectly group
  distinct clients behind a shared proxy into a single rate-limit bucket
  (too strict).
- Adding a normalized-identity component to the rate-limit key introduces
  a risk of accidentally leaking or mishandling credential-adjacent data
  if not implemented carefully; FR-006/NFR-002/AC-004 exist specifically
  to guard against this.

## Implementation Steps

1. Add `buildLoginRateLimitKey` and `loginRateLimitMiddleware` to
   `rate-limit.middleware.ts`.
2. Add `TRUST_PROXY_HOPS` validation to `env.ts`.
3. Call `app.set('trust proxy', env.trustProxyHops)` first in
   `createApp()` in `server.ts`.
4. Wire `loginRateLimitMiddleware` on `POST /login` in
   `auth.routes.ts`.
5. Add 429 response fragment to `auth.swagger.ts`.
6. Update `.env.example` (and optionally `README.md`).
7. Write/extend unit tests (middleware, env, server) and E2E tests
   (AC-005/006/007/008).
8. Run `npm test`, `npm run build`, `npm run test:e2e`.

## Definition of Done Mapping

- FR-001/FR-002 → dedicated `loginRateLimitMiddleware` with stricter
  window/limit → AC-001.
- FR-003 → `skipSuccessfulRequests: false` → AC-002, AC-008.
- FR-004 → 429 on limit exceeded → AC-002.
- FR-005/NFR-001 → static generic 429 message → AC-003.
- FR-006/NFR-002 → `buildLoginRateLimitKey` (IP + SHA-256 email hash) →
  AC-004.
- FR-007/NFR-003 → `TRUST_PROXY_HOPS` + `app.set('trust proxy', ...)` →
  AC-005.
- FR-008 → 5 attempts/5 minutes generous threshold → AC-008.
- FR-009 → window expiry allows retry → AC-007.
- FR-010 → no new logging surface introduced → AC-009.
- NFR-004 → no change to non-rate-limited login contract; route wiring
  isolated to login → AC-008.
- NFR-005 → reuse of `createRateLimiter` pattern → AC-001.
- Swagger: 429 response documented on `/auth/login`.
- `.env.example`/README updated with `TRUST_PROXY_HOPS`.

## Open Non-Blocking Questions

- Exact numeric window/limit values for the dedicated login limiter
  beyond "smaller than the global limiter" (FR-002) — resolved by
  architect as 5 attempts / 5 minutes; may be tuned later without
  architecture change.
- Exact deployment proxy topology (number of trusted hops for `trust
  proxy`) — resolved by architect as a documented default assumption of
  1 hop, since no in-repo IaC/deploy manifest confirms actual topology;
  update the env var value if real topology differs.
- Whether `ip-address` needs to be added as a direct dependency — resolved
  by architect: not needed, `express-rate-limit`'s own `ipKeyGenerator`
  export is used instead; the Notion task's dependency-bump note is
  treated as a separate chore-type concern, out of scope for this
  feature-level change.
</content>
