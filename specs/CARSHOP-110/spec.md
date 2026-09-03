# CARSHOP-110 — Endurecer validação de secrets e configuração de produção

## Status

Ready

## Source

Notion Task:
CARSHOP-110

## Context

Today the application fails at startup when required environment variables
are missing (`src/infra/config/env.ts`), but it does not verify that the
values provided are strong or production-appropriate. `JWT_SECRET` and
`ADMIN_PASSWORD` are only checked for non-emptiness; there is no minimum
length/entropy check, no rejection of known weak/default values, no bound
on JWT expiration windows, and no validation that `CORS_ORIGIN` is a safe,
explicit HTTPS origin when the application runs in production with
cross-origin cookies in play.

This creates a real risk of deploying to production with a short or
predictable `JWT_SECRET`, a trivial `ADMIN_PASSWORD` (e.g. a value used in
local development or documentation examples), overly long-lived tokens, or
a permissive/misconfigured CORS origin — all of which weaken the existing
JWT + refresh-token + CSRF security model described in
`.claude/rules/security.md` and the project README.

## Objective

Make the application fail fast and loudly at startup — never silently —
when `NODE_ENV=production` and any of the following configuration
weaknesses are present: an insufficiently strong `JWT_SECRET`, a weak or
known-default `ADMIN_PASSWORD`, an invalid or excessive JWT expiration
window, or a missing/invalid explicit HTTPS `CORS_ORIGIN`. Existing secure
cookie attributes (`Secure`, `HttpOnly`, `SameSite`, `path`) must not be
weakened as part of this hardening. Configuration error messages must never
expose the offending value, only the variable name.

## Functional Requirements

- **FR-001** — At startup, when `NODE_ENV=production`, the application
  must reject a `JWT_SECRET` shorter than **32 characters** (see
  NFR-001/Constraints for rationale) by throwing a startup error that
  prevents the server from starting.
- **FR-002** — At startup, when `NODE_ENV=production`, the application
  must reject an `ADMIN_PASSWORD` that does not meet the minimum password
  policy defined in NFR-002, by throwing a startup error.
- **FR-003** — At startup, when `NODE_ENV=production`, the application
  must reject an `ADMIN_PASSWORD` (case-insensitively, after trimming)
  that matches any entry in the known weak/default value denylist defined
  in Constraints, by throwing a startup error.
- **FR-004** — At startup, the application must validate `JWT_EXPIRES_IN`
  and `JWT_REFRESH_EXPIRES_IN`: each value must parse as a valid duration
  and must not exceed the maximum bounds defined in NFR-003. An
  unparsable or out-of-bounds value must throw a startup error, in every
  environment (not just production), since an invalid duration is a
  configuration bug regardless of environment.
- **FR-005** — At startup, when `NODE_ENV=production`, the application
  must require at least one entry in `CORS_ORIGIN` and every entry must be
  an absolute `https://` URL (no wildcard `*`, no bare hostname, no
  `http://` origin). Violation must throw a startup error.
- **FR-006** — The existing cookie attributes set in
  `src/presentation/helpers/auth.cookies.ts` (`refresh_token`:
  `httpOnly: true`, `sameSite: 'strict'`, `secure` tied to production,
  `path: '/auth'`; `csrf_token`: `httpOnly: false`, same `sameSite`,
  `secure`, `path`) must remain unchanged in strength by this task. Any
  change to configuration validation must not cause these attributes to
  be weakened, removed, or made conditionally optional.
- **FR-007** — All configuration validation error messages introduced or
  modified by this task must reference only the environment variable name
  (e.g. `JWT_SECRET`, `ADMIN_PASSWORD`, `CORS_ORIGIN`). They must never
  include the variable's actual value, a substring of it, its length as a
  disguised hint beyond what's already stated as a rule, or any derived
  value that could help reconstruct the secret.
- **FR-008** — Outside of `NODE_ENV=production` (i.e. `development` and
  `test`), the new minimum-strength and denylist checks for `JWT_SECRET`
  and `ADMIN_PASSWORD` (FR-001, FR-002, FR-003) must not block startup,
  so that existing local/dev/test workflows and fixtures keep working
  unless they explicitly opt into stricter validation. The
  duration-validity checks in FR-004 apply in all environments, since
  they protect against configuration typos, not against weak secrets.

## Non-Functional Requirements

- **NFR-001 (Security — JWT secret strength)**: The minimum accepted
  `JWT_SECRET` length in production is **32 characters** (approx. 256
  bits of entropy when generated from a sufficiently random character
  set). This is a standard, OWASP-aligned minimum for HMAC-based JWT
  signing secrets and is chosen as an implementation-ready assumption,
  not a Notion-confirmed constant. The check is length-based (not a full
  entropy estimator), consistent with the project's stated preference for
  simple, dependency-free validation (`.claude/rules/typescript.md`).
- **NFR-002 (Security — admin password policy)**: The minimum
  `ADMIN_PASSWORD` policy in production is: **at least 12 characters**,
  containing **at least one uppercase letter, one lowercase letter, one
  digit, and one symbol**. This is a standard OWASP-aligned baseline for
  an administrative credential protecting the only privileged account in
  the system. Chosen as an implementation-ready assumption pending
  operational confirmation.
- **NFR-003 (Security — bounded token lifetimes)**: `JWT_EXPIRES_IN`
  (access token) must resolve to a duration of at most **1 hour**.
  `JWT_REFRESH_EXPIRES_IN` (refresh token) must resolve to a duration of
  at most **30 days**. Both must resolve to a strictly positive duration.
  These bounds limit the blast radius of a leaked token and are
  implementation-ready assumptions aligned with the existing defaults
  (`15m` / `7d`) already used by the project.
- **NFR-004 (Maintainability)**: Validation logic and rejected-value
  lists must live in the existing configuration-loading layer
  (`src/infra/config/env.ts` or an adjacent module in the same layer),
  consistent with current startup-validation patterns already used for
  `PORT`, `NODE_ENV`, `WORK_HARD_DELETE_AFTER_DAYS`, and
  `TRUST_PROXY_HOPS`. (Exact file layout is an architect decision.)
- **NFR-005 (Reliability)**: Any configuration hardening failure must
  prevent the HTTP server from binding to a port; it must not be possible
  for the process to serve requests with a rejected configuration.

## Acceptance Criteria

- **AC-001**: Given `NODE_ENV=production` and `JWT_SECRET` shorter than 32
  characters, when the application starts, then startup must fail with an
  error referencing only `JWT_SECRET`, and the process must not begin
  listening for HTTP requests.
- **AC-002**: Given `NODE_ENV=production` and `JWT_SECRET` with 32 or more
  characters, when the application starts, then this check must not block
  startup (assuming no other configuration violation exists).
- **AC-003**: Given `NODE_ENV=production` and an `ADMIN_PASSWORD` that
  fails the policy in NFR-002 (too short, or missing a required character
  class), when the application starts, then startup must fail with an
  error referencing only `ADMIN_PASSWORD`.
- **AC-004**: Given `NODE_ENV=production` and an `ADMIN_PASSWORD` matching
  a denylisted value (case-insensitive, trimmed) such as `123456`,
  `password`, `admin`, `changeme`, `senha123`, `admin123`, or `12345678`,
  when the application starts, then startup must fail with an error
  referencing only `ADMIN_PASSWORD`, even if the value otherwise satisfies
  the length/character-class policy.
- **AC-005**: Given `NODE_ENV=production` and an `ADMIN_PASSWORD` that
  satisfies both the policy (NFR-002) and is not denylisted, when the
  application starts, then these checks must not block startup.
- **AC-006**: Given any environment and a `JWT_EXPIRES_IN` or
  `JWT_REFRESH_EXPIRES_IN` value that fails to parse as a valid duration
  (e.g. `"abc"`), when the application starts, then startup must fail
  with an error referencing only the offending variable name.
- **AC-007**: Given any environment and a `JWT_EXPIRES_IN` greater than 1
  hour, or a `JWT_REFRESH_EXPIRES_IN` greater than 30 days, when the
  application starts, then startup must fail with an error referencing
  only the offending variable name.
- **AC-008**: Given `NODE_ENV=production` and `CORS_ORIGIN` unset, empty,
  containing a wildcard (`*`), or containing at least one non-`https://`
  entry, when the application starts, then startup must fail with an
  error referencing only `CORS_ORIGIN`.
- **AC-009**: Given `NODE_ENV=production` and `CORS_ORIGIN` set to one or
  more valid absolute `https://` origins, when the application starts,
  then this check must not block startup.
- **AC-010**: Given `NODE_ENV=development` or `NODE_ENV=test`, when
  `JWT_SECRET` or `ADMIN_PASSWORD` do not meet the production strength
  policy, then startup must still succeed (FR-008), preserving existing
  developer and test workflows.
- **AC-011**: For every configuration rejection covered by AC-001,
  AC-003, AC-004, AC-006, AC-007, and AC-008, the thrown error message
  must not contain the rejected value, any substring of it, or any other
  data that could allow reconstructing or guessing the secret/value.
- **AC-012**: The cookie attributes asserted by existing tests for
  `setAuthCookies`/`clearAuthCookies` (`httpOnly`, `sameSite`, `secure`,
  `path` values as currently implemented) must remain unchanged and
  continue to pass after this task's changes.

## Constraints

- Do not weaken `Secure`, `HttpOnly`, `SameSite`, path, or expiration
  attributes already applied to `refresh_token` / `csrf_token` cookies.
- Do not introduce a hardcoded production secret or bypass value anywhere
  in the codebase.
- Do not log, print, or persist the values of `JWT_SECRET`,
  `ADMIN_PASSWORD`, or `CORS_ORIGIN` as part of validation error handling.
- The known weak/default `ADMIN_PASSWORD` denylist (case-insensitive,
  trimmed) must include at minimum: `123456`, `12345678`, `password`,
  `admin`, `admin123`, `changeme`, `senha123`, `qwerty`, `letmein`, and
  the literal example value documented in `README.md`
  (`123456`, already covered). This list is an implementation-ready
  starting point, not exhaustive, and may be extended by the architect
  without requiring a spec change, provided it is not reduced.
- New validation must not alter the existing public HTTP contract (status
  codes, response bodies, cookie names) — it is a startup-time concern
  only.
- No real secret, credential, or `.env` value may be added to this spec,
  to code comments, or to test fixtures beyond clearly fictitious
  examples (e.g. `changeme`, `senha123` are policy-denylist entries, not
  real credentials).

## Dependencies

- Final numeric values (32-character minimum for `JWT_SECRET`, the
  12-character/character-class policy for `ADMIN_PASSWORD`, and the
  1-hour/30-day expiration ceilings) should be reconciled with the real
  deployment environment and secret-management process before production
  rollout. They are documented here as security-best-practice defaults
  (OWASP-aligned), not confirmed by Notion or the deploy team.
- Depends on `src/infra/config/env.ts` remaining the single source of
  environment loading (per `.claude/rules/architecture.md` and current
  `CLAUDE.md` documentation of the composition root).
- Depends on `src/presentation/helpers/auth.cookies.ts` for the cookie
  attributes referenced in FR-005/FR-006/AC-012.
- Documentation (`.env.example`, `README.md`) should be updated to
  reflect the new minimum policies without ever containing real secret
  values.

## Out of Scope

- Rotating or changing any currently deployed secret value.
- Introducing a secrets manager, vault integration, or external
  secret-storage service.
- Changing the JWT signing algorithm or token payload shape.
- Changing the CSRF double-submit mechanism itself (only its
  precondition — a valid production CORS origin — is in scope).
- Rate limiting changes (already covered by existing login rate limiting,
  unrelated to this task).
- Multi-admin-account support or password-change/reset flows for the
  admin user.

## Risks

- Numeric thresholds (32 chars, 12 chars + classes, 1h/30d) are
  best-practice assumptions, not Notion-confirmed; if the real deploy
  environment already uses values outside these bounds, rollout could be
  blocked until secrets/config are rotated to comply.
- Denylist-based rejection is inherently incomplete; it mitigates only
  known/common weak values, not all weak passwords.
- Overly strict production-only gating could cause a working
  non-production environment (e.g. a staging environment incorrectly set
  to `NODE_ENV=production`) to fail startup; this is treated as intended
  behavior for this task, not a defect.

## Open Questions

### Blocking

None.

### Non-blocking

- Should the `ADMIN_PASSWORD` denylist and minimum policy be
  configurable (e.g. via an env var) rather than hardcoded, for future
  flexibility? Left to architect/developer judgment; not required by
  Notion.
- Should staging (non-`production`, non-`development`, non-`test`)
  environments — if introduced later — be subject to the same production
  hardening? Out of scope today since `Environment['nodeEnv']` only
  supports `development | test | production`.

## Traceability

FR-001 → AC-001, AC-002, AC-010, AC-011
FR-002 → AC-003, AC-005, AC-010, AC-011
FR-003 → AC-004, AC-005, AC-011
FR-004 → AC-006, AC-007
FR-005 → AC-008, AC-009, AC-011
FR-006 → AC-012
FR-007 → AC-011
FR-008 → AC-010
