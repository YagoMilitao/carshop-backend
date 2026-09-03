# CARSHOP-110 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-110/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Harden `src/infra/config/env.ts` startup validation so that, in
`NODE_ENV=production`, a weak `JWT_SECRET` (< 32 chars), a weak or
denylisted `ADMIN_PASSWORD`, an out-of-bounds/unparsable JWT expiration
window, or a non-HTTPS/missing `CORS_ORIGIN` all fail application startup
loudly. Development/test behavior for the secret/password checks must
remain unchanged; duration-validity checks apply in every environment.
Existing secure cookie attributes must never be weakened (FR-006/AC-012).

## Current Architecture

1. `src/infra/config/env.ts` today performs only non-emptiness checks for
   `JWT_SECRET`/`ADMIN_PASSWORD`, numeric/range checks for `PORT`,
   `WORK_HARD_DELETE_AFTER_DAYS`, `TRUST_PROXY_HOPS`, and an enum check for
   `NODE_ENV`. No strength/denylist/duration-ceiling/CORS-scheme validation
   exists yet. Validation is eager, at module-load time.
2. `src/presentation/helpers/auth.cookies.ts` current attributes (verified
   by the architect): `refresh_token` → `httpOnly: true`,
   `sameSite: 'strict'`, `secure: isProduction()`, `path: '/auth'`;
   `csrf_token` → `httpOnly: false`, same `sameSite`/`secure`/`path`.
   `isProduction()` reads `process.env.NODE_ENV` directly. This file is
   **out of scope for edits** — only a regression check via its existing
   test suite is required.
3. CORS: `src/infra/config/middleware.ts` builds `CorsOptions` from
   `env.corsOrigins` (an array produced by `env.ts`'s
   `getCorsOrigins()`); no scheme/wildcard validation exists today. New
   validation is added in `env.ts` at construction time; `middleware.ts`
   is unchanged.
4. Duration parsing: `auth.constants.ts` has a type-only import of `ms`'s
   `StringValue` type (not a real runtime dependency, not present in
   `package.json`). Decision: implement a small, self-contained,
   dependency-free regex-based duration parser inside `env.ts` rather than
   adding or relying on any library.
5. `getJwtSecret()`'s fallback in `auth.constants.ts`
   (`?? 'dev-secret-change-me'`) is a pre-existing, practically
   unreachable legacy fallback (`env.ts` already eagerly throws first
   today). This is documented as a residual risk and is **not fixed** in
   this task — out of scope, avoids an unrelated refactor.
6. Test fixture audit: no existing unit/e2e test sets
   `NODE_ENV=production`. All `JWT_EXPIRES_IN`/`JWT_REFRESH_EXPIRES_IN`
   fixtures (`15m`, `7d`, `5s`) fall within the new 1h/30d ceilings. No
   adjustment to global test setup is required.

## Proposed Solution

Single-file approach: extend `src/infra/config/env.ts` only, adding
private helper functions in the same style as the existing
`getPort`/`getTrustProxyHopsEnv`/`getNodeEnv` helpers. No new file, no new
port/adapter, no new dependency. Restructure env construction into
sequential `const` assignments that preserve the exact same eager-throw
order semantics and the exact same exported `Environment` shape (no field
added, removed, or renamed).

## Technical Decisions

### Decision

Implement all new validation logic (JWT secret strength, admin password
policy/denylist, duration parsing/bounding, CORS production validation)
directly inside `src/infra/config/env.ts`, with no new file, port, or
adapter.

### Reason

Consistent with `NFR-004` and the project's existing pattern of colocating
all startup/env validation in this single composition-root configuration
module (`PORT`, `NODE_ENV`, `WORK_HARD_DELETE_AFTER_DAYS`,
`TRUST_PROXY_HOPS` already validated there).

### Alternatives Considered

- A separate `env-security.ts` validation module — rejected as
  unnecessary layering for logic this cohesive with existing `env.ts`
  responsibilities.
- Using the `ms` npm package for duration parsing — rejected because it
  is not an actual runtime dependency today (only a type-only import
  exists) and the project prefers not adding a dependency when a small
  regex parser suffices (`.claude/rules/typescript.md`).

### Trade-offs

A hand-rolled duration parser is simpler and dependency-free but supports
a narrower syntax (bare integer seconds, or `<number><unit>` with
unit ∈ `ms|s|m|h|d`) than a full-featured duration library; this is
judged sufficient given the project's existing fixture values (`15m`,
`7d`, `5s`).

### Decision

Keep the `ADMIN_PASSWORD` denylist as a hardcoded in-file constant (no new
env-var-driven configuration surface for this security control).

### Reason

Avoids introducing a new configuration axis for a security control whose
purpose is to enforce a floor, not to be tunable; matches the spec's
Constraints section, which treats the denylist as an implementation-ready
starting point that may be extended but not reduced.

### Alternatives Considered

- Making the denylist configurable via an environment variable — left as
  a non-blocking open question in the spec; not adopted, to avoid
  expanding scope without a confirmed need.

### Trade-offs

Extending the denylist in the future requires a code change rather than a
config change; acceptable given the security-floor nature of the list.

### Decision

Staging is explicitly out of scope for this task's production-only
hardening gates.

### Reason

`Environment['nodeEnv']` currently only supports
`development | test | production`; no staging value exists in the type
today, so there is nothing to gate.

### Alternatives Considered

None — this follows directly from the current type definition and the
spec's non-blocking open question on the topic.

### Trade-offs

If a `staging` environment value is introduced later, this task's gates
will not automatically apply to it and would need a follow-up review.

## Execution Flow

1. Startup imports/executes `src/infra/config/env.ts`.
2. Existing checks continue to run in their current order.
3. New checks run as part of the same eager module-load validation,
   using the current `NODE_ENV` value already being resolved:
   - `assertJwtSecretStrength` (production-gated).
   - `assertAdminPasswordPolicy` (production-gated).
   - `assertBoundedDuration` for `JWT_EXPIRES_IN` and
     `JWT_REFRESH_EXPIRES_IN` (all environments).
   - `assertProductionCorsOrigins` (production-gated).
4. Any failure throws synchronously during module load, before the HTTP
   server binds to a port (satisfies `NFR-005`).
5. On success, the exported `Environment` object is unchanged in shape
   from today.

## Files

### Files to Create

None.

### Files to Modify

- `src/infra/config/env.ts` — add the following private helpers and
  constants, following the same Portuguese-language, variable-name-only
  error-message style already used in the file:
  - `JWT_SECRET_MIN_LENGTH = 32`
  - `ADMIN_PASSWORD_MIN_LENGTH = 12`
  - `ADMIN_PASSWORD_DENYLIST: ReadonlySet<string>` — lowercase, at least:
    `123456`, `12345678`, `password`, `admin`, `admin123`, `changeme`,
    `senha123`, `qwerty`, `letmein`.
  - `ACCESS_TOKEN_MAX_DURATION_MS = 60 * 60 * 1000` (1h)
  - `REFRESH_TOKEN_MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000` (30d)
  - `assertJwtSecretStrength(nodeEnv, jwtSecret): void` — FR-001/FR-008:
    no-op unless `nodeEnv === 'production'`; throws referencing only
    `JWT_SECRET` if length < 32.
  - `assertAdminPasswordPolicy(nodeEnv, adminPassword): void` —
    FR-002/FR-003/FR-008: no-op unless production; checks length >= 12
    and presence of uppercase/lowercase/digit/symbol; checks denylist
    (trim + lowercase); throws a single generic message referencing only
    `ADMIN_PASSWORD` (does not reveal which sub-rule failed).
  - `parseDurationToMs(name, raw): number` — FR-004: regex parse, throws
    referencing only `name` on parse failure.
  - `assertBoundedDuration(name, raw, maxMs): void` — calls
    `parseDurationToMs`; throws referencing only `name` if the result is
    <= 0 or > `maxMs`. Applied in **all** environments (not
    production-gated).
  - `assertProductionCorsOrigins(nodeEnv, origins): void` — FR-005:
    no-op unless production; throws referencing only `CORS_ORIGIN` if
    `origins.length === 0`, any entry contains `*`, `new URL(entry)`
    throws, or `protocol !== 'https:'`.
  - Restructure env construction into sequential `const` assignments
    preserving the exact same eager-throw-order semantics and the exact
    same exported `Environment` shape (no field added/removed/renamed).
- `.env.example` — doc-only update describing the new minimums
  (32-char `JWT_SECRET`, 12-char + complexity `ADMIN_PASSWORD`, 1h/30d
  expiration ceilings, HTTPS-only `CORS_ORIGIN` in production). No real
  secret values.
- `README.md` — doc-only update describing the same new minimums.

### Explicitly Not Changed

- `src/presentation/helpers/auth.cookies.ts` (FR-006 — must remain
  byte-for-byte identical; verified only via its existing test suite
  passing unchanged, AC-012).
- `src/infra/config/middleware.ts` (consumes `env.corsOrigins`
  unchanged).
- Any route, controller, use case, port, model, or Swagger fragment
  (this is a startup-only concern, with no HTTP contract change).

## Contract Impact

None. This is a startup-time configuration-validation concern only; no
HTTP status code, response body, cookie name, or route contract changes.

## Persistence Impact

None. No schema, model, or repository changes.

## Security Impact

- Enforces stronger `JWT_SECRET` and `ADMIN_PASSWORD` requirements in
  production, reducing the risk of deploying with weak or default
  credentials (FR-001, FR-002, FR-003).
- Bounds JWT/refresh token lifetimes in all environments, limiting the
  blast radius of a leaked token (FR-004).
- Requires an explicit HTTPS `CORS_ORIGIN` in production, protecting the
  CSRF double-submit precondition (FR-005).
- Ensures configuration error messages never leak the offending secret
  value (FR-007).
- Explicitly preserves existing cookie security attributes
  (`HttpOnly`, `Secure`, `SameSite`, `path`) unchanged (FR-006, AC-012).
- No new secrets, bypass values, or logging of sensitive values are
  introduced, consistent with `.claude/rules/security.md` and
  `.claude/rules/spec-security.md`.

## Swagger Impact

None. No route, controller, or contract change; this is a startup-only
concern.

## Testing Strategy

All new logic is pure, synchronous, dependency-free, and fully
unit-testable without mocks, using the existing
`jest.isolateModules` + `require('.../env')` pattern already used in
`test/unit/infra/config/env.spec.ts`.

New `describe` blocks to add to `test/unit/infra/config/env.spec.ts`:

1. JWT_SECRET strength (FR-001, AC-001, AC-002, AC-010, AC-011):
   production + < 32 chars throws mentioning only `JWT_SECRET` (message
   excludes the value); production + >= 32 chars does not throw;
   test/development + short secret does not throw.
2. ADMIN_PASSWORD policy (FR-002, AC-003, AC-005, AC-010, AC-011):
   production + too-short/missing-character-class throws referencing
   only `ADMIN_PASSWORD`; production + compliant does not throw;
   non-production + weak does not throw.
3. ADMIN_PASSWORD denylist (FR-003, AC-004, AC-011): production + each
   denylisted value (`it.each`, case/trim variants) throws even if
   length-compliant; message excludes the value.
4. Duration validation (FR-004, AC-006, AC-007): unparsable string for
   `JWT_EXPIRES_IN`/`JWT_REFRESH_EXPIRES_IN` throws in test env too (not
   gated); values exceeding 1h/30d throw; boundary values at/just-under
   the ceiling do not throw.
5. CORS_ORIGIN production validation (FR-005, AC-008, AC-009, AC-011):
   production + unset/empty/`*`/`http://` throws referencing only
   `CORS_ORIGIN`; production + valid `https://` does not throw;
   non-production + missing/invalid does not throw.
6. Error message safety (FR-007, AC-011): for each throw scenario,
   assert the message does not contain the literal rejected value.

AC-012/FR-006 regression: no new test needed in `auth.cookies` — re-run
the existing `test/unit/presentation/helpers/auth.cookies.spec.ts`
unchanged as evidence of non-regression.

Commands:
`npx jest test/unit/infra/config/env.spec.ts`, then `npm test`,
`npm run build`, `npm run test:coverage` (target `>= 80%` new/changed
code per `.claude/rules/testing.md`; none of the new logic is expected to
need an exception), and `npm run test:e2e` once (`env.ts` is imported by
the whole app graph).

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
- Pre-existing `getJwtSecret()` fallback in `auth.constants.ts` is a
  latent inconsistency, practically unreachable, left as-is (out of
  scope for this task).

## Implementation Steps

1. Add the new constants and private helper functions to
   `src/infra/config/env.ts` as described in Files to Modify, without
   changing the exported `Environment` shape.
2. Wire the new helper calls into the existing eager env construction
   flow, preserving throw order for pre-existing checks and adding the
   new checks at the appropriate point (duration checks apply in all
   environments; secret/password/CORS checks are production-gated).
3. Update `.env.example` and `README.md` with the new documented minimums
   (no real secret values).
4. Add the new test `describe` blocks to
   `test/unit/infra/config/env.spec.ts` per the Testing Strategy section.
5. Re-run `test/unit/presentation/helpers/auth.cookies.spec.ts` unchanged
   to confirm no regression (FR-006/AC-012).
6. Run `npx jest test/unit/infra/config/env.spec.ts`, `npm test`,
   `npm run build`, `npm run test:coverage`, and `npm run test:e2e`.

## Definition of Done Mapping

- FR-001 → AC-001, AC-002, AC-010, AC-011 — implemented via
  `assertJwtSecretStrength`; tested in `describe` block 1.
- FR-002 → AC-003, AC-005, AC-010, AC-011 — implemented via
  `assertAdminPasswordPolicy`; tested in `describe` block 2.
- FR-003 → AC-004, AC-005, AC-011 — implemented via the denylist check
  inside `assertAdminPasswordPolicy`; tested in `describe` block 3.
- FR-004 → AC-006, AC-007 — implemented via `parseDurationToMs` and
  `assertBoundedDuration`; tested in `describe` block 4.
- FR-005 → AC-008, AC-009, AC-011 — implemented via
  `assertProductionCorsOrigins`; tested in `describe` block 5.
- FR-006 → AC-012 — no code change to `auth.cookies.ts`; verified by its
  existing, unchanged test suite.
- FR-007 → AC-011 — all new throw messages reference only the variable
  name; verified in `describe` block 6 across all rejection scenarios.
- FR-008 → AC-010 — production gating on all secret/password checks;
  verified by non-production branches in `describe` blocks 1 and 2.
- NFR-005 — validation runs eagerly at module load, before the HTTP
  server can bind to a port; no separate test needed beyond the existing
  eager-throw pattern already covered by `env.spec.ts`.

## Open Non-Blocking Questions

- Should the `ADMIN_PASSWORD` denylist and minimum policy be
  configurable (e.g. via an env var) rather than hardcoded, for future
  flexibility? Left to future judgment; not required by Notion for this
  task.
- Should staging (non-`production`, non-`development`, non-`test`)
  environments — if introduced later — be subject to the same production
  hardening? Out of scope today since `Environment['nodeEnv']` only
  supports `development | test | production`.
</content>
