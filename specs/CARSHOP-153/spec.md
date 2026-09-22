# CARSHOP-153 — Corrigir path dos cookies refresh_token/csrf_token (bloqueia sessão admin em /admin)

## Status

Ready

## Source

Notion Task:
CARSHOP-153

## Context

The backend issues two authentication-related cookies on login (`refresh_token`
and `csrf_token`) via `setAuthCookies` in
`src/presentation/helpers/auth.cookies.ts`, and clears them via
`clearAuthCookies` in the same file. Both cookies are currently set with
`path: '/auth'`.

Per RFC 6265, a browser only attaches a cookie to a request when the
request path matches (or is a sub-path of) the cookie's declared `Path`
attribute. Because the cookie path is restricted to `/auth`, the browser
never sends these cookies on requests to other paths, such as `/admin/*`
used by the admin frontend.

Observed effect: an admin logs in successfully (success toast, access
token returned in the response body), but when navigating to the admin
area the session is not recognized, and the user is redirected back to
the login screen indefinitely. This was reproduced in two different
browsers (Safari and Chrome) against the real deployed backend.

This was discovered during manual testing of CARSHOP-152 (admin
dashboard) and had also been noted as an additional finding on CARSHOP-138
(already Done), which addressed a related but distinct `SameSite`
concern for the same cookie. CARSHOP-153 addresses the `Path` attribute
specifically and must not be confused with the `SameSite` fix.

The scope of this specification is limited to this backend repository.
The frontend (proxy layer and server-side session check) depends on the
browser actually receiving and sending these cookies, but frontend code
changes are out of scope here.

## Objective

Ensure that `refresh_token` and `csrf_token`, once set by
`setAuthCookies`, are sent by the browser on every request path that the
backend's own auth-dependent routes require (at minimum, the routes that
issue/consume them today and any route the admin frontend relies on for
session verification), so that a successfully authenticated admin session
is recognized consistently across navigation, without weakening any
existing cookie security attribute.

## Functional Requirements

- FR-001: `setAuthCookies` must set the `refresh_token` and `csrf_token`
  cookies with a `Path` attribute that is not narrower than what is
  required for the backend's own routes that read these cookies (at
  minimum `/auth/refresh` and `/auth/logout`), and that also covers
  requests made to `/admin` paths so that admin session verification can
  observe the cookies.
- FR-002: `clearAuthCookies` must clear the `refresh_token` and
  `csrf_token` cookies using the exact same `Path` value used when the
  cookies were set by `setAuthCookies`. A mismatched `Path` between set
  and clear must not result in the cookie surviving logout.
- FR-003: `POST /auth/refresh` must continue to successfully read the
  `refresh_token` and `csrf_token` cookies and rotate the session
  (access token, refresh token, csrf token) exactly as before this
  change, with no change to response body shape, cookie names, or status
  codes.
- FR-004: `POST /auth/logout` must continue to successfully read the
  `refresh_token` and `csrf_token` cookies, revoke the session, and clear
  both cookies exactly as before this change, with no change to response
  body shape, cookie names, or status codes.
- FR-005: The `HttpOnly` attribute on `refresh_token`, the non-`HttpOnly`
  readable nature of `csrf_token`, the `Secure` attribute, and the
  `SameSite=None` attribute on both cookies must remain unchanged by this
  fix. Only the `Path` attribute is in scope for modification.
- FR-006: The double-submit CSRF validation behavior (comparing the
  `csrf_token` cookie value against the `X-CSRF-Token` header) on
  `/auth/refresh` and `/auth/logout` must continue to function exactly as
  before.

## Non-Functional Requirements

- NFR-001 (Security): The chosen `Path` value must not be broader than
  necessary to satisfy FR-001. Widening the path is an explicit,
  reviewed trade-off (see Constraints), not an incidental side effect.
- NFR-002 (Compatibility): The fix must not change the `refresh_token` or
  `csrf_token` cookie names, nor any other already-documented cookie
  attribute (`HttpOnly`, `Secure`, `SameSite`, `maxAge` semantics).
- NFR-003 (Reliability): The fix must be verifiable through automated
  tests that fail without the fix and pass with it (regression test for
  the bug), consistent with the project's bug-fix testing convention.

## Acceptance Criteria

- AC-001: When `setAuthCookies` is invoked, the `Set-Cookie` header for
  `refresh_token` and for `csrf_token` must declare a `Path` attribute
  that includes `/admin` as a matching or prefixed path (i.e., a request
  to a path starting with `/admin` would have the cookie attached by a
  spec-compliant browser).
  When `clearAuthCookies` is invoked, the `Set-Cookie` header used to
  clear `refresh_token` and `csrf_token` must declare the same `Path`
  value used in AC-001.
  When `POST /auth/refresh` is called with a valid `refresh_token`
  cookie and a matching `X-CSRF-Token` header/`csrf_token` cookie pair,
  the response must return a rotated access token, a rotated
  `refresh_token` cookie, and a rotated `csrf_token` cookie, with status
  code unchanged from current behavior.
  When `POST /auth/logout` is called with a valid `refresh_token` cookie
  and a matching `X-CSRF-Token` header/`csrf_token` cookie pair, the
  session must be revoked and both cookies must be cleared, with status
  code unchanged from current behavior.
  When `POST /auth/refresh` or `POST /auth/logout` is called with a
  missing or mismatched CSRF token, the request must continue to be
  rejected exactly as before this change.
  When the `HttpOnly`, `Secure`, and `SameSite` attributes of both
  cookies are inspected after the fix, they must be identical to their
  pre-fix values.

## Constraints

- The `refresh_token` cookie must remain `HttpOnly`.
- The `Secure` and `SameSite=None` attributes on both cookies must not be
  weakened or removed.
- The cookie names (`refresh_token`, `csrf_token`, as resolved by
  `getRefreshCookieName()` / `getCsrfCookieName()`) must not change.
- The exact `Path` value (e.g. `/`, or an explicit path covering both
  `/admin` and `/auth`) is an implementation decision owned by the
  architect/developer within the bounds of FR-001 and NFR-001, and is
  intentionally not locked in by this specification.
- Scope is limited to this backend repository. Frontend changes (proxy
  layer, server-side session check) needed for full end-to-end effect are
  a known dependency but are explicitly out of scope for this task.

## Dependencies

- Related to CARSHOP-138 (Done): same cookies, different root cause
  (`SameSite`, already fixed there). This task addresses `Path` only.
- Depends on a coordinated frontend change (outside this repository) for
  the admin session issue to be fully resolved end-to-end from the user's
  perspective; that frontend change is not part of this specification's
  scope.

## Out of Scope

- Any change to `SameSite` behavior (already addressed in CARSHOP-138).
- Any change to the frontend proxy layer or `getSession()` server
  component logic.
- Any change to cookie names, `HttpOnly` status, `Secure` status, or
  token expiration/rotation logic beyond what is strictly needed to keep
  current behavior working after the `Path` change.
- Any change to the login (`POST /auth/login`) response body contract.

## Risks

- Both cookies carry authentication (`refresh_token`) and CSRF
  double-submit (`csrf_token`) responsibilities. Widening `Path`
  increases the set of routes where the cookie is automatically attached
  by the browser, which must be evaluated for unintended exposure beyond
  what is operationally necessary.
- The bug was reproduced against a real deployed backend in two browsers;
  a fix validated only through isolated unit tests may not fully confirm
  the observable browser behavior. A unit test is the minimum required
  validation per the Definition of Done; equivalent broader validation
  (e.g., e2e coverage of the cookie attributes) is expected per project
  testing conventions for changes to cookies/authentication.

## Open Questions

### Blocking

None.

### Non-blocking

- Exact final `Path` value (`/` vs. an explicit path covering `/admin`
  and `/auth`) is left to the architect's judgment, balancing NFR-001
  against FR-001.

## Traceability

FR-001 → AC-001
FR-002 → AC-001
FR-003 → AC-001
FR-004 → AC-001
FR-005 → AC-001
FR-006 → AC-001
