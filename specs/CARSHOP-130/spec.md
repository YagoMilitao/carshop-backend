# CARSHOP-130 — Validar JWT_REFRESH_COOKIE_MAX_AGE_MS para rejeitar valores não-positivos

## Status

Ready

## Source

Notion Task:
CARSHOP-130

## Context

The refresh cookie lifetime (`maxAge`) is computed from the environment
variable `JWT_REFRESH_COOKIE_MAX_AGE_MS`. The current logic only falls back
to a default of 7 days when the value is absent, empty, or resolves to
`NaN`. A value that is numerically valid but non-positive (e.g. `0` or a
negative number) is currently accepted as-is and used directly as the
cookie's `maxAge`.

This was identified during API contract review (related to CARSHOP-122),
flagged by automated review tooling, and confirmed manually against the
code. A non-positive `maxAge` produces either a session cookie (`maxAge: 0`)
or an invalid/immediate expiration, silently breaking the refresh/logout
flow. This is a session/security behavior bug, not a cosmetic one.

## Objective

Ensure that the refresh cookie lifetime calculation always falls back to
the existing 7-day default whenever the configured value is not a valid
positive number, while continuing to respect valid positive values exactly
as today.

## Functional Requirements

FR-001: When `JWT_REFRESH_COOKIE_MAX_AGE_MS` is absent or an empty string,
the system must use the existing 7-day fallback value for the refresh and
CSRF cookies' `maxAge`.

FR-002: When `JWT_REFRESH_COOKIE_MAX_AGE_MS` resolves to `NaN` (not a
valid number), the system must use the existing 7-day fallback value.

FR-003: When `JWT_REFRESH_COOKIE_MAX_AGE_MS` resolves to a numeric value
less than or equal to `0` (including `0` and any negative number), the
system must use the existing 7-day fallback value instead of the
configured value.

FR-004: When `JWT_REFRESH_COOKIE_MAX_AGE_MS` resolves to a valid numeric
value strictly greater than `0`, the system must use that value as the
`maxAge` for the refresh and CSRF cookies, unchanged from current
behavior.

FR-005: The fallback and validation behavior must apply consistently to
both the refresh token cookie and the CSRF token cookie, since both
currently share the same computed `maxAge`.

## Non-Functional Requirements

NFR-001 (Security/Reliability): The system must never issue an
authentication cookie with a non-positive `maxAge` as a result of
environment misconfiguration; the corrected fallback must eliminate silent
session/expiration failures caused by such misconfiguration.

NFR-002 (Maintainability): The fix must be limited to the value validation
logic and must not alter the cookie names, paths, `httpOnly`, `secure`, or
`sameSite` attributes already in place.

## Acceptance Criteria

AC-001: Given `JWT_REFRESH_COOKIE_MAX_AGE_MS` is unset, when the refresh
cookie's `maxAge` is computed, then the 7-day fallback value must be used.

AC-002: Given `JWT_REFRESH_COOKIE_MAX_AGE_MS` is an empty string, when the
refresh cookie's `maxAge` is computed, then the 7-day fallback value must
be used.

AC-003: Given `JWT_REFRESH_COOKIE_MAX_AGE_MS` is set to a non-numeric
string (resolves to `NaN`), when the refresh cookie's `maxAge` is
computed, then the 7-day fallback value must be used.

AC-004: Given `JWT_REFRESH_COOKIE_MAX_AGE_MS` is set to `"0"`, when the
refresh cookie's `maxAge` is computed, then the 7-day fallback value must
be used.

AC-005: Given `JWT_REFRESH_COOKIE_MAX_AGE_MS` is set to a negative number
(e.g. `"-1000"`), when the refresh cookie's `maxAge` is computed, then the
7-day fallback value must be used.

AC-006: Given `JWT_REFRESH_COOKIE_MAX_AGE_MS` is set to a valid positive
number (e.g. `"3600000"`), when the refresh cookie's `maxAge` is computed,
then the configured value must be used unchanged.

AC-007: A unit test suite exists covering the cases in AC-001 through
AC-006 (absent, empty, `NaN`, zero, negative, and valid positive value).

AC-008: `docs/api-contract.md` is updated to describe the corrected
validation rule for `JWT_REFRESH_COOKIE_MAX_AGE_MS` (referencing only the
variable name, never a real configured value).

## Constraints

- Only the variable name `JWT_REFRESH_COOKIE_MAX_AGE_MS` may be referenced
  in documentation and tests; no real environment value may be committed.
- Must not change the cookie names, `httpOnly`, `secure`, `sameSite`, or
  `path` attributes already defined for the refresh and CSRF cookies.
- Must not change the public HTTP contract (status codes, response body,
  headers) of `/auth/login`, `/auth/refresh`, or `/auth/logout`.
- Must preserve the existing 7-day fallback constant value.

## Dependencies

None declared by the source task.

## Out of Scope

- Changing the default fallback duration (7 days).
- Changing how the refresh token itself is generated, signed, or rotated.
- Changing any other environment variable's validation rules.
- Startup-time (`env.ts`) validation of this variable; the task scope is
  limited to the cookie `maxAge` computation in
  `src/presentation/helpers/auth.cookies.ts`.

## Risks

- Without this fix, a non-positive configured value silently produces a
  session cookie or invalid expiration, breaking refresh/logout — a
  security/session-reliability risk, not merely cosmetic (as stated in the
  source task).

## Open Questions

### Blocking

None.

### Non-blocking

None.

## Traceability

FR-001 → AC-001
FR-002 → AC-003
FR-003 → AC-004, AC-005
FR-004 → AC-006
FR-005 → AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
NFR-001 → AC-004, AC-005
NFR-002 → AC-006
FR-001..FR-005 → AC-007
FR-001..FR-005 → AC-008
