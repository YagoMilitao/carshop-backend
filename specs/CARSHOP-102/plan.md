# CARSHOP-102 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-102/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Close the broken-access-control gap on `GET /works?includeDrafts=true`: an
unauthenticated/invalid/expired-session caller must get `401` (no draft
leakage), while `GET /works` (no `includeDrafts` or `includeDrafts` not
`'true'`) must stay fully public and byte-for-byte unchanged.

Acceptance criteria `AC-001`..`AC-007` from `specs/CARSHOP-102/spec.md` are
the authoritative checklist; `FR-006` (live-verify the flaw first) and
`NFR-003` (retain that evidence) are binding process steps, not just
documentation.

## Current Architecture

Confirmed in the repository:

- `src/infra/http/routes/work.routes.ts:49` — `router.get('/',
  workController.list)`, no middleware at all.
- `src/presentation/controllers/work.controller.ts:53-69` — `list` reads
  `request.query.includeDrafts === 'true'` and calls
  `ListWorksUseCase.execute({ includeDrafts })` unconditionally; no auth
  awareness.
- `src/usecase/list-works.use-case.ts` — pure `includeDrafts ? listAll() :
  listPublished()`, has no concept of `Request`/auth (correctly, per
  `.claude/rules/usecases.md`).
- `src/infra/presentation/middleware/auth.middleware.ts` —
  `buildAuthMiddleware(sessionStore, tokenService)` returns a
  `RequestHandler` that throws `HttpError(401, ...)` for missing/invalid
  token or inactive session, then sets `request.auth`. This is exactly the
  mechanism `FR-004` requires reusing.
- Sibling middleware (`csrf-protection.middleware.ts`) shows the
  established single-responsibility pattern: a standalone file under
  `src/infra/presentation/middleware/`, exporting a `RequestHandler`, doing
  its own try/catch → `next(error)`.
- `test/unit/infra/http/routes/work.routes.spec.ts` mocks `express.Router()`
  and `buildAuthMiddleware`, and asserts exactly which handlers are
  registered on which paths — this test must be updated to match the new
  registration on `GET /`.
- `test/unit/presentation/controllers/work.controller.spec.ts` already
  covers `list` (published-only default, `includeDrafts=true` passthrough,
  error passthrough) — unaffected because auth won't live in the
  controller.
- `test/e2e/app.e2e-spec.ts` is the only e2e file, covers only `/auth/*`,
  using `createApp()` + supertest + Mongo-memory-backed `connectDatabase`.
  No e2e file exists yet for `/works`.
- `src/infra/docs/works.swagger.ts` documents `GET /works` with no
  security, no `includeDrafts` parameter, and only a `200` response —
  currently under-documents the endpoint even before this bug fix (no
  `401` at all).

### Historical Knowledge (Obsidian) vs. Current Code

- `CarShop/Troubleshooting/works-includeDrafts-missing-auth-middleware.md`
  proposes exactly the two options weighed here: (1) conditional
  `authMiddleware` at the route layer, or (2) enforcement inside the
  controller/use case. Confirmed still applicable.
- `CarShop/Learnings/e2e-coverage-gap-beyond-auth-flow.md` — confirmed
  still true: `test/e2e/` only has `app.e2e-spec.ts` covering auth. No
  `/works` e2e coverage exists.

## Proposed Solution

Conditional route-level auth gate (Obsidian option 1), not use-case-level
enforcement: a new, single-purpose middleware that inspects
`request.query.includeDrafts` and only delegates to the existing
`authMiddleware` when it equals `'true'`; otherwise it calls `next()`
immediately, leaving the route public.

## Technical Decisions

### Decision

Add a conditional route-level middleware
(`require-auth-for-drafts.middleware.ts`) that wraps the existing
`authMiddleware`, invoked only when `includeDrafts === 'true'`, rather than
enforcing auth inside the controller or use case.

### Reason

Reuses `buildAuthMiddleware` itself; zero changes to `WorkController` and
`ListWorksUseCase`; keeps `GET /works` trivially public by default
(`NFR-002`) by construction; matches the established one-file-per-middleware
convention already used by `csrf-protection.middleware.ts`.

### Alternatives Considered

Rejected alternative (Obsidian option 2 / "optional auth + use-case
check"): would require a new "best-effort" auth middleware, controller
logic to read `request.auth`, and a `HttpError(401)` thrown from
`ListWorksUseCase`.

### Trade-offs

The rejected alternative pushes an HTTP-shaped decision into the
domain-adjacent use case, requires the controller to inspect auth state,
and touches three files/layers instead of one, with no behavioral
advantage. The chosen route-gate approach confines the change to a single
new middleware file plus one line of wiring in the route builder.

## Execution Flow

1. Live-verify the current vulnerability first (`FR-006`/`NFR-003`): write
   a failing e2e test asserting `401` where the unfixed code currently
   returns `200` with draft data. This failing-then-passing test is the
   required evidence.
2. Create `require-auth-for-drafts.middleware.ts`.
3. Wire it into `work.routes.ts` ahead of `workController.list` on `GET /`.
4. Update Swagger documentation for `GET /works`.
5. Update/add unit and e2e tests until the FR-006 e2e test passes and all
   other AC/unit coverage is green.
6. Run validation commands (see Testing Strategy).

## Files

### Files to Create

- `src/infra/presentation/middleware/require-auth-for-drafts.middleware.ts`
  — export `buildRequireAuthForDraftsMiddleware(authMiddleware:
  RequestHandler): RequestHandler`. Logic: if
  `request.query.includeDrafts === 'true'`, call `authMiddleware(request,
  response, next)`; else call `next()`. No try/catch needed — it does not
  itself throw; if `authMiddleware` rejects, it already calls
  `next(error)` internally, so the 401 propagates unchanged. Keep the same
  single-line doc-comment style already used in that directory.
- `test/unit/infra/presentation/middleware/require-auth-for-drafts.middleware.spec.ts`
- `test/e2e/works.e2e-spec.ts`

### Files to Modify

- `src/infra/http/routes/work.routes.ts` — after `const authMiddleware =
  buildAuthMiddleware(sessionStore, tokenService);`, add: `const
  requireAuthForDraftsMiddleware =
  buildRequireAuthForDraftsMiddleware(authMiddleware);`. Change
  `router.get('/', workController.list);` to `router.get('/',
  requireAuthForDraftsMiddleware, workController.list);`. Update the
  doc-comment above that line to reflect the conditional behavior. No
  other route in this file changes.
- `src/infra/docs/works.swagger.ts` (`FR-007` / `AC-006`) — add an
  `includeDrafts` query parameter to the `GET /works` path entry: `{ in:
  'query', name: 'includeDrafts', required: false, schema: { type:
  'boolean', default: false }, description: '...' }`, clarifying `true`
  requires an authenticated admin session and returns drafts. Add
  `security: [{}, { bearerAuth: [] }]` to represent optional-for-default,
  effectively-required-for-drafts auth. Construct the two-alternative
  array explicitly rather than reusing `bearerSecurity` verbatim (only add
  a shared `optionalBearerSecurity` helper if a second use site already
  exists; otherwise keep it local to avoid premature abstraction). Add a
  `401` response to the existing responses block, reusing
  `errorResponse` from `swagger.helpers.ts` (import it into
  `works.swagger.ts`).
- `test/unit/infra/http/routes/work.routes.spec.ts` — assert `mockGet` was
  called with the new middleware in the chain (mock
  `buildRequireAuthForDraftsMiddleware`, assert invoked with the
  `authMiddleware` instance).

### Explicitly Not Changed

- `src/presentation/controllers/work.controller.ts` and
  `src/usecase/list-works.use-case.ts`: no changes. Intentional —
  developer should not "improve" these files.
- `test/unit/presentation/controllers/work.controller.spec.ts`: no changes
  required, re-run to confirm no regression.

## Contract Impact

No change to response shape, status codes for already-correct scenarios,
cookies, or headers. New: `GET /works?includeDrafts=true` without a valid
Bearer token/session now returns `401` with the project's standard
`ErrorResponse` shape instead of silently returning published-only `200`
or drafts. This is a documented, accepted contract change: callers relying
on the leaked drafts-without-auth `200` now get `401` — intentional fix,
not a regression.

## Persistence Impact

No data model changes.

## Security Impact

No weakening of CSRF, cookie attributes, rate limiting, or token
validation. `GET /works` default remains reachable with zero added
middleware overhead. Placing the check in the route/middleware layer,
consistent with `POST /` in the same router, mitigates future
regressions.

## Swagger Impact

`src/infra/docs/works.swagger.ts` gains an `includeDrafts` query parameter,
an optional-vs-required `security` alternative
(`[{}, { bearerAuth: [] }]`), and a `401` response reusing `errorResponse`
from `swagger.helpers.ts`. See Files to Modify above for full detail.

## Testing Strategy

`FR-006` prerequisite: live-verify the current vulnerability with a real
HTTP request via supertest against `createApp()`, following
`specs/CARSHOP-101/validation-report.md`'s harness pattern, BEFORE/alongside
implementation — write the new e2e test first with an assertion that
currently fails (`expect(401)` where unfixed code returns `200` with draft
data); that failing-then-passing test is the `FR-006`/`NFR-003` evidence.

Unit tests (mandatory, `AC-007` minimum):

1. `test/unit/infra/presentation/middleware/require-auth-for-drafts.middleware.spec.ts`
   (new): (a) `includeDrafts` absent/`'false'`/anything other than
   `'true'` → delegates straight to `next()`, `authMiddleware` mock not
   called; (b) `includeDrafts === 'true'` → delegates to the injected
   `authMiddleware` mock; (c) `includeDrafts === 'true'` and injected
   `authMiddleware` mock calls `next(new HttpError(401,...))` → verify
   error propagates unchanged. Covers `AC-002` and `AC-003` at unit level.
2. `test/unit/infra/http/routes/work.routes.spec.ts` (update): assert
   `mockGet` was called with the new middleware in the chain (mock
   `buildRequireAuthForDraftsMiddleware`, assert invoked with the
   `authMiddleware` instance).
3. `test/unit/presentation/controllers/work.controller.spec.ts`: no
   changes required, re-run to confirm no regression.

E2E test (new) `test/e2e/works.e2e-spec.ts`, following
`app.e2e-spec.ts`'s harness (`createApp()`, `connectDatabase`, admin login
for Bearer token). Scenarios:

- (a) `GET /works` no auth/no query → `200` published-only (`AC-001`/`AC-005`).
- (b) create draft via authenticated `POST /works`, then `GET
  /works?includeDrafts=true` with valid token → `200` including draft
  (`AC-002`).
- (c) `GET /works?includeDrafts=true` with no `Authorization` header →
  `401`, no draft data in body (`AC-003`/`AC-004`).

### Coverage Target (verbatim from architect)

Coverage target: only new production file is
`require-auth-for-drafts.middleware.ts` (~10 lines, fully branch-coverable
by the three unit cases, both branches plus error-propagation path).
Changed lines in `work.routes.ts` are pure wiring, covered by the updated
route spec. Realistically 100% achievable for the new file; no exception
needed.

This satisfies the `>= 80%` new/changed-code unit-test coverage target
defined in `.claude/rules/testing.md` without requiring a justified
exception.

### Validation Commands

Most-specific new specs first, then `npm test`, `npm run build` (TS
change), and `npm run test:e2e` (routes/middleware/auth composition
changed).

## Risks

- Documented, accepted contract change: callers relying on the leaked
  drafts-without-auth `200` now get `401` — intentional fix, not a
  regression.
- No weakening of CSRF, cookie attributes, rate limiting, or token
  validation identified.

## Implementation Steps

1. Add the failing e2e test in `test/e2e/works.e2e-spec.ts` demonstrating
   the current vulnerability (FR-006 evidence).
2. Create
   `src/infra/presentation/middleware/require-auth-for-drafts.middleware.ts`.
3. Wire the new middleware into
   `src/infra/http/routes/work.routes.ts` on `GET /`.
4. Update `src/infra/docs/works.swagger.ts` (`includeDrafts` param,
   `security` alternative, `401` response).
5. Add
   `test/unit/infra/presentation/middleware/require-auth-for-drafts.middleware.spec.ts`.
6. Update `test/unit/infra/http/routes/work.routes.spec.ts`.
7. Re-run `test/unit/presentation/controllers/work.controller.spec.ts` to
   confirm no regression (no changes expected).
8. Run the most-specific new specs, then `npm test`, `npm run build`, and
   `npm run test:e2e`.

## Definition of Done Mapping

- `AC-001`/`AC-005` → e2e scenario (a): `GET /works` public default
  unchanged.
- `AC-002` → e2e scenario (b) + unit test 1(b): authenticated
  `includeDrafts=true` returns drafts.
- `AC-003`/`AC-004` → e2e scenario (c) + unit test 1(a)/1(c): unauthenticated
  `includeDrafts=true` returns `401`, no draft leakage.
- `AC-006` → Swagger update in `works.swagger.ts`.
- `AC-007` → unit test suite for the new middleware and updated route spec.
- `FR-006`/`NFR-003` → failing-then-passing e2e test as evidence,
  retained in `test/e2e/works.e2e-spec.ts`.

## Open Non-Blocking Questions

None — architect reported no blocking questions.
