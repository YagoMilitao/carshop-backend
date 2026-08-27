# CARSHOP-102 — Corrigir falta de autenticação em GET /works?includeDrafts=true

## Status

Ready

## Source

Notion Task:
CARSHOP-102

Origin task: CARSHOP-101 (diagnosis-only; this bug was found but explicitly
left unfixed there — see `specs/CARSHOP-101/validation-report.md`, "Note on
row 6" and the `GET /works?includeDrafts=true` row in the
Endpoint → Scenario → Result Matrix).

Related historical knowledge:
Obsidian note `CarShop/Troubleshooting/works-includeDrafts-missing-auth-middleware.md`.

## Context

`GET /works` is a public endpoint used to list works. It accepts an optional
`includeDrafts` query parameter. Source inspection during CARSHOP-101 (and
confirmed again while writing this specification) shows:

- `src/infra/http/routes/work.routes.ts` registers `router.get('/',
  workController.list)` with no `authMiddleware` applied, unlike every other
  mutating/admin route in the same router and in sibling routers
  (`admin-comment.routes.ts`, `work-image.routes.ts`, `admin-work.routes.ts`),
  which all attach `authMiddleware`.
- `src/presentation/controllers/work.controller.ts`'s `list` handler reads
  `request.query.includeDrafts === 'true'` and passes the resulting boolean
  straight to `ListWorksUseCase.execute({ includeDrafts })` with no
  authorization check of any kind.

As a result, any unauthenticated caller can currently request
`GET /works?includeDrafts=true` and receive draft/unpublished works. This is
an information-disclosure / broken-access-control defect: draft works are,
by product intent, not meant to be visible to the public before publication.

This was independently confirmed by the developer, tester, and reviewer
during CARSHOP-101, but CARSHOP-101's scope was diagnosis-only (no backend
contract changes were allowed in that task), so the fix was deferred to this
follow-up task.

## Objective

Ensure that `includeDrafts=true` on `GET /works` only ever returns draft
works to a caller who is authenticated as an admin (i.e., presents a valid
Bearer access token bound to an active session, per the project's existing
authentication model). Unauthenticated or non-admin callers must never
receive draft works through this endpoint, regardless of what query
parameters they supply.

The endpoint must remain publicly reachable for its existing published-only
behavior; only the drafts-disclosure path is being restricted.

## Functional Requirements

FR-001. When `GET /works` is called without `includeDrafts=true` (or without
the parameter at all), the response must continue to return only published
works, unchanged from current behavior, regardless of authentication state.

FR-002. When `GET /works?includeDrafts=true` is called by a caller that
presents a valid Bearer access token bound to an active session, the
response must include draft works alongside published works, as it does
today for the underlying use case.

FR-003. When `GET /works?includeDrafts=true` is called by a caller that does
not present a valid Bearer access token bound to an active session
(no `Authorization` header, malformed header, expired/invalid token, or a
token whose session is no longer active), the response must be an explicit
`401` error, consistent with this codebase's existing `authMiddleware`
conventions (`src/infra/presentation/middleware/auth.middleware.ts`, which
raises `HttpError(401, ...)` uniformly for a missing token, an invalid
token, and an invalid/expired session — there is no existing `403` usage in
that middleware). The response body must not contain any draft work or any
other draft data. This resolves the product decision that a caller must not
receive a silent published-only `200` fallback when requesting drafts
without authorization.

FR-004. The authorization check introduced by this task must reuse the
project's existing authentication mechanism (`authMiddleware` /
`TokenServicePort` / `SessionStorePort`), consistent with how every other
authenticated route in this codebase is protected. No new authentication
mechanism may be introduced.

FR-005. The fix must not change the response shape, status codes, or
contract of `GET /works` for any scenario that is already correctly handled
today (i.e., published-only listing for any caller, and drafts-included
listing for an authenticated caller), except to close the unauthorized-access
gap described in FR-003.

FR-006. Before any code change is designed, the vulnerability described in
this specification must be live-verified with a real unauthenticated HTTP
request against the running application (e.g., via `supertest` against
`createApp()`, following the harness pattern already used in
`specs/CARSHOP-101/validation-report.md`), producing evidence that draft
works are returned to an unauthenticated caller under current behavior.

FR-007. If the documented authentication requirement for `GET /works`
(specifically the `includeDrafts=true` path) changes as a result of this
fix, the corresponding Swagger fragment under `src/infra/docs/*.swagger.ts`
must be updated in the same change to keep the documented contract
synchronized with actual behavior.

## Non-Functional Requirements

NFR-001 (Security). The fix must close the information-disclosure gap without
weakening any other existing security control (CSRF protection, cookie
attributes, token validation, rate limiting) defined in
`.claude/rules/security.md`.

NFR-002 (Compatibility). The published-only listing behavior of `GET /works`
for anonymous callers must remain publicly accessible; this task must not
turn the entire `GET /works` endpoint into an authenticated-only endpoint.

NFR-003 (Traceability). The evidence produced while live-verifying the flaw
(FR-006) must be retained as part of the delivered change (e.g., referenced
in test descriptions or a short validation note), so the fix is traceable to
a concretely reproduced defect rather than a purely theoretical one.

## Acceptance Criteria

AC-001. Given no `Authorization` header, when `GET /works` is called with no
`includeDrafts` parameter, then the response is `200` and contains only
published works. (FR-001)

AC-002. Given a valid Bearer access token for an active admin session, when
`GET /works?includeDrafts=true` is called, then the response includes at
least one draft work that exists in the data set at call time. (FR-002)

AC-003. Given no `Authorization` header (or an invalid/expired token, or a
token whose session has been revoked), when `GET /works?includeDrafts=true`
is called, then the response status is `401`, and no draft work (or any
other draft data) appears anywhere in the response body. (FR-003)

AC-004. Given the same unauthenticated request as AC-003, when compared
against the current (pre-fix) behavior reproduced under FR-006, then the
draft-disclosure that was present before the fix no longer occurs. (FR-003,
FR-006)

AC-005. Given the fix is implemented, when `GET /works` is called without
`includeDrafts` by any caller (authenticated or not), then the response
status, shape, and content remain identical to current behavior. (FR-005)

AC-006. Given the Swagger/OpenAPI documentation for `GET /works`, when the
authentication requirement for the `includeDrafts=true` path changes, then
the corresponding fragment in `src/infra/docs/*.swagger.ts` reflects the new
requirement accurately. (FR-007)

AC-007. Given the delivered test suite, when it is inspected, then it
contains at least one unit test asserting an authenticated caller can
receive draft works via `includeDrafts=true`, and at least one unit test
asserting an unauthenticated caller cannot receive draft works via the same
parameter. E2E coverage for the same two scenarios is added if the
architecture/implementation decision affects routing/middleware composition
in a way reasonably covered by the existing `test/e2e/*.e2e-spec.ts` pattern.

## Constraints

- No new authentication mechanism, dependency, or library may be introduced;
  the existing Bearer-token + session-store model must be reused (see
  `.claude/rules/security.md`, `.claude/rules/architecture.md`).
- The API base URL is provided via the `API_URL` environment variable in any
  example or test harness reference; no concrete environment-specific URL
  may appear in this specification or its implementation artifacts.
- Authenticated requests referenced by this specification use the project's
  existing Bearer token strategy; no token value is part of this
  specification.
- Controllers must remain thin per `.claude/rules/controllers.md`; the
  authorization decision logic belongs in the appropriate layer (route
  middleware and/or use case), not hardcoded ad hoc inside the controller
  beyond adapting the request.
- Public contract compatibility must be preserved except for the specific
  drafts-disclosure gap being closed (`.claude/rules/architecture.md`,
  `.claude/rules/controllers.md`).

## Dependencies

- Existing `authMiddleware` (`src/infra/presentation/middleware/auth.middleware.ts`).
- Existing `TokenServicePort` and `SessionStorePort` implementations already
  wired into `src/infra/server.ts` and `src/infra/http/routes/work.routes.ts`.
- `ListWorksUseCase` (`src/usecase/list-works.use-case.ts`) and
  `WorkRepositoryPort`.
- Swagger fragment(s) covering `GET /works` under `src/infra/docs/*.swagger.ts`.
- Findings and harness pattern from `specs/CARSHOP-101/validation-report.md`.

## Out of Scope

- Any change to `POST /works`, `/works/:workId/comments`, or other routes
  not related to the `includeDrafts` authorization gap.
- Adding new draft-related business rules beyond restricting who can request
  them (e.g., no new draft states, no new roles/permission levels beyond the
  existing single-admin model).
- Building the permanent E2E automation suite recommended generally in
  `specs/CARSHOP-101/validation-report.md` beyond what is needed to cover
  this specific authorization fix (AC-007).
- Introducing a role-based access control system; the project currently has
  a single admin identity, and this task does not change that model.

## Risks

- This is a deliberate, decided contract change: any existing client that
  currently relies on the unintended unauthenticated-drafts-leak behavior
  (i.e., calling `GET /works?includeDrafts=true` without credentials and
  receiving a silently-filtered `200` published-only response) will now
  receive a `401` error instead. This is an accepted, intentional
  consequence of closing a genuine security/information-disclosure gap, not
  an open risk about which behavior to choose.
- If the fix is implemented only in the controller without also covering the
  route/middleware layer consistently with sibling routers, a future
  refactor could reintroduce the same gap; the implementation should follow
  the same protective pattern already used elsewhere in this codebase.

## Open Questions

### Blocking

None.

### Resolved

1. For an unauthenticated/non-admin caller that passes
   `includeDrafts=true`, must the endpoint (a) silently fall back to
   published-only results with `200`, or (b) return an explicit `401`/`403`?

   **Decision (product owner): explicit `401`.** An unauthenticated/non-admin
   caller (no `Authorization` header, malformed/expired/invalid token, or a
   revoked session) passing `includeDrafts=true` must receive `401` with no
   draft data in the response body, instead of a silent published-only `200`
   fallback. `401` (rather than `403`) was chosen for consistency with this
   codebase's existing `authMiddleware` conventions, which use `401`
   uniformly for missing token, invalid token, and invalid/expired session
   cases. The mechanism (e.g., applying `authMiddleware` conditionally when
   `includeDrafts=true` is present, vs. another approach consistent with
   `.claude/rules/security.md` and `.claude/rules/controllers.md`) is an
   implementation decision left to the architect/developer, not a product
   requirement.

### Non-blocking

- Whether the eventual permanent E2E suite recommended in
  `specs/CARSHOP-101/validation-report.md` should include this endpoint's
  scenarios as part of this task's delivery or a separate follow-up; AC-007
  requires unit coverage as a minimum and defers the E2E-suite-wide question.

## Traceability

FR-001 → AC-001, AC-005
FR-002 → AC-002
FR-003 → AC-003, AC-004
FR-004 → AC-002, AC-003
FR-005 → AC-005
FR-006 → AC-004
FR-007 → AC-006
NFR-001 → AC-003, AC-004
NFR-002 → AC-001, AC-005
NFR-003 → AC-004
