# CARSHOP-103 — Ampliar cobertura de testes E2E além do fluxo de autenticação

## Status

Ready

## Source

Notion Task:
CARSHOP-103

Originating task:
CARSHOP-101 (`specs/CARSHOP-101/validation-report.md`)

Related historical knowledge:
Obsidian note `CarShop/Learnings/e2e-coverage-gap-beyond-auth-flow.md`

## Context

CARSHOP-101 performed a full validation of every registered backend
endpoint and compared the result against the project's permanent
automated E2E suite. Its final verdict was **E2E COVERAGE GAP**: the only
permanent E2E spec present at the time, `test/e2e/app.e2e-spec.ts`,
exercised exclusively the auth flow (login → session → refresh →
logout).

At the time this specification is written, a second permanent E2E spec,
`test/e2e/works.e2e-spec.ts`, already exists in the repository and covers
the `GET /works` authorization boundary introduced by CARSHOP-102
(`includeDrafts` auth gating). That coverage is preserved as-is by this
task; it must not be removed, weakened, or duplicated.

The following areas identified in the CARSHOP-101 validation report still
have no permanent, automated E2E coverage:

- Work create/update/delete (beyond the existing `GET /works` /
  `includeDrafts` coverage) — success paths, validation errors, and
  not-found paths.
- Public comment creation and listing, and the admin comment-approval
  flow.
- Work-image upload, including its interaction with the Cloudinary
  integration — success path and validation-failure paths.
- Admin work hard-delete, including the image-cascade branch.

This task closes that gap by adding permanent E2E specs under
`test/e2e/`, using the project's existing harness
(`mongodb-memory-server`, wired through `test/jest-e2e.json` and
`test/e2e/setup/*`), following the same stateful-flow ordering already
validated in CARSHOP-101 to avoid ordering-related flakiness.

## Objective

Add permanent, automated E2E test coverage under `test/e2e/` for the four
areas listed above (works CRUD, comment create/approve, work-image
upload, admin work hard-delete), reusing the existing project harness and
conventions, so that these behaviors are protected against regressions in
CI/local runs without relying on manual or throwaway validation scripts.

The concrete mechanism used to exercise the Cloudinary-dependent
success/failure paths safely (e.g., a mock/stub adapter, dependency
injection of a test double, or a dedicated non-production sandbox
account) is an implementation decision left to the architect. This
specification defines the required observable behavior and safety
constraints only.

## Functional Requirements

### Work CRUD

- **FR-001**: A permanent E2E spec must verify that `POST /works` with a
  valid payload and a valid Bearer access token creates a work and
  returns `201` with the created work's identifying fields (at minimum
  `id` and `slug`).
- **FR-002**: A permanent E2E spec must verify that `POST /works` without
  an `Authorization` header is rejected with `401` and does not create a
  work.
- **FR-003**: A permanent E2E spec must verify that `POST /works` with a
  slug that already exists is rejected with `409`.
- **FR-004**: A permanent E2E spec must verify that `POST /works` with a
  payload missing required fields (e.g. `slug`, `title`, `description`,
  or `category`) is rejected with `400`.
- **FR-005**: A permanent E2E spec must verify that an authenticated
  update of an existing work (e.g. `PATCH`/equivalent update endpoint
  exposed by the current routes) succeeds and that the returned/persisted
  work reflects the updated fields. If no dedicated update endpoint
  exists in the current route inventory, this requirement is satisfied by
  documenting that observation and covering the update behavior that
  does exist (e.g. via the admin comment-style partial update pattern),
  consistent with FR-013.
- **FR-006**: A permanent E2E spec must verify that operating on a
  non-existent work identifier (for whichever mutating work endpoints
  exist) returns `404`.
- **FR-007**: A permanent E2E spec must verify that `DELETE
  /admin/works/:workId` (admin work hard-delete) without authentication
  is rejected with `401`.
- **FR-008**: A permanent E2E spec must verify that `DELETE
  /admin/works/:workId` performed by an authenticated caller on an
  existing work succeeds (`200`) and that the work is no longer returned
  by subsequent reads (e.g. `GET /works` or a not-found response on
  direct access).
- **FR-009**: A permanent E2E spec must verify that `DELETE
  /admin/works/:workId` on an already-deleted or never-existing work
  identifier returns `404`.
- **FR-010**: A permanent E2E spec must verify the image-cascade branch
  of admin work hard-delete: deleting a work that has at least one
  associated image completes successfully and removes the associated
  image metadata, without requiring a real production Cloudinary call
  (see FR-016–FR-019 for the Cloudinary safety constraints that also
  apply here).

### Comment create → admin approve flow

- **FR-011**: A permanent E2E spec must verify that `POST
  /works/:workId/comments` with a valid payload on an existing work
  creates a comment and returns `201`.
- **FR-012**: A permanent E2E spec must verify that `POST
  /works/:workId/comments` with an invalid payload (e.g. content or
  author name violating validation rules) is rejected with `400`.
- **FR-013**: A permanent E2E spec must verify that `POST
  /works/:workId/comments` on a non-existent work returns `404`.
- **FR-014**: A permanent E2E spec must verify that a newly created
  comment does not appear in `GET /works/:workId/comments` (public list)
  until it has been approved.
- **FR-015**: A permanent E2E spec must verify the full stateful flow:
  create work → create comment on that work → approve the comment via
  `PATCH /admin/comments/:commentId/approve` (authenticated) → confirm
  the comment now appears in the public `GET /works/:workId/comments`
  listing.
- **FR-015a**: A permanent E2E spec must verify that
  `PATCH /admin/comments/:commentId/approve` without authentication is
  rejected with `401`, and that approving a non-existent comment
  identifier returns `404`.

### Work-image upload

- **FR-016**: A permanent E2E spec must verify that `POST
  /admin/works/:workId/images` without authentication is rejected with
  `401`.
- **FR-017**: A permanent E2E spec must verify that `POST
  /admin/works/:workId/images` from an authenticated caller with no file
  attached (or an invalid file, e.g. disallowed MIME type or
  oversized file) is rejected with `400`, without making a network call
  to the image-storage provider.
- **FR-018**: A permanent E2E spec must verify that `POST
  /admin/works/:workId/images` from an authenticated caller with a valid
  image file succeeds (`201`/`200`, per current contract) and that the
  resulting work/image state reflects a newly stored image, using a
  safe, non-production strategy for the image-storage dependency (the
  exact mechanism — e.g. a substitutable test double for the storage
  port, or a dedicated non-production Cloudinary sandbox — is an
  architecture decision; see Objective).
- **FR-019**: A permanent E2E spec must verify that `DELETE
  /admin/works/:workId/images/:imageId` without authentication is
  rejected with `401`, and that deleting a non-existent image identifier
  on an existing work returns `404` without reaching the image-storage
  provider.

### General

- **FR-020**: All new E2E specs must be added under `test/e2e/` matching
  the `*.e2e-spec.ts` naming convention already used by
  `test/jest-e2e.json`.
- **FR-021**: All new E2E specs must use the project's existing
  `mongodb-memory-server` harness (`test/e2e/setup/*`,
  `connectDatabase`/`disconnectDatabase` from
  `src/infra/database/mongoose`) and the existing pattern of setting
  disposable, non-real in-process environment variables (e.g.
  `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
  `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`) before creating the app via
  `createApp()`, consistent with `test/e2e/app.e2e-spec.ts` and
  `test/e2e/works.e2e-spec.ts`.
- **FR-022**: The stateful flow ordering validated in CARSHOP-101 (create
  work → upload image / create comment → approve → delete) must be
  followed within the relevant new specs to avoid ordering-related
  flakiness, as already required by the Definition of Done.

## Non-Functional Requirements

- **NFR-001 (Security)**: No production Cloudinary credentials, no real
  `.env` values, and no other real secret or credential may be read,
  logged, committed, or otherwise exposed by any new test file or by this
  specification, per `.claude/rules/security.md` and
  `.claude/rules/spec-security.md`.
- **NFR-002 (Isolation)**: Any Cloudinary-dependent success-path test must
  run against a mechanism that cannot write to, read from, or otherwise
  touch a production or production-equivalent Cloudinary account. If a
  real Cloudinary sandbox account is used, its credentials must be
  supplied only via named, non-committed environment variables (name
  only, never a value, referenced in code and docs) and must never be
  hardcoded.
  the concrete mechanism is an architect decision within this
  constraint.
- **NFR-003 (Reliability)**: New E2E specs must be deterministic and
  independent of external network conditions for their auth/validation/
  not-found scenarios; only the deliberately-scoped Cloudinary
  success-path scenario(s) may depend on an external or test-double
  Cloudinary boundary, and that dependency must be explicit.
- **NFR-004 (Maintainability)**: New E2E specs must align with the
  conventions in `.claude/rules/testing.md` (mirrored structure,
  meaningful assertions, no coverage-gaming, happy path + validation +
  main error case per feature).
- **NFR-005 (Unit coverage)**: If this task introduces or changes any
  `src/**/*.ts` production code (e.g. a test-support fixture point, a
  storage-port test double wiring, or similar), that changed production
  code is subject to the `>= 80%` new/changed-code unit-test coverage
  policy defined in `.claude/rules/testing.md`. E2E coverage does not
  substitute for this expectation.

## Acceptance Criteria

- **AC-001**: `POST /works` success, no-auth, duplicate-slug, and
  validation-error scenarios are each covered by at least one E2E test
  and pass (FR-001–FR-004).
- **AC-002**: An authenticated work update (or the closest currently
  existing update behavior) is covered by at least one E2E test that
  asserts the updated state is observable afterward (FR-005).
- **AC-003**: A not-found scenario is covered for at least one mutating
  work-identifier endpoint, returning `404` (FR-006).
- **AC-004**: `DELETE /admin/works/:workId` no-auth, success (work
  disappears from subsequent reads), and not-found scenarios are each
  covered by at least one E2E test and pass (FR-007–FR-009).
- **AC-005**: The image-cascade branch of admin work hard-delete is
  covered by at least one E2E test that creates a work with an image and
  confirms deletion succeeds and the image metadata no longer exists
  (FR-010).
- **AC-006**: `POST /works/:workId/comments` success, validation-error,
  and work-not-found scenarios are each covered by at least one E2E test
  and pass (FR-011–FR-013).
- **AC-007**: A pending comment is confirmed absent from the public
  comment listing, and present after admin approval, within a single
  stateful E2E flow (FR-014–FR-015).
- **AC-008**: `PATCH /admin/comments/:commentId/approve` no-auth and
  not-found scenarios are each covered by at least one E2E test and pass
  (FR-015a).
- **AC-009**: `POST /admin/works/:workId/images` no-auth and
  invalid-file/no-file validation scenarios are each covered by at least
  one E2E test and pass, without reaching the image-storage provider
  (FR-016–FR-017).
- **AC-010**: A successful work-image upload scenario is covered by at
  least one E2E test using a documented safe non-production mechanism,
  and the test does not use or expose production Cloudinary credentials
  (FR-018, NFR-001, NFR-002).
- **AC-011**: `DELETE /admin/works/:workId/images/:imageId` no-auth and
  not-found scenarios are each covered by at least one E2E test and pass,
  without reaching the image-storage provider for the not-found case
  (FR-019).
- **AC-012**: All new E2E spec files are located under `test/e2e/`, follow
  the `*.e2e-spec.ts` naming convention, and are picked up by
  `npx jest --config ./test/jest-e2e.json` (FR-020).
- **AC-013**: All new E2E specs use `mongodb-memory-server` via the
  existing harness and set only disposable, non-real in-process
  environment values before calling `createApp()` — no real `.env` file
  is read by any new test (FR-021, NFR-001).
- **AC-014**: The combined create → upload/comment → approve → delete
  stateful flow is exercised in dependency order within the new specs,
  matching the ordering validated in CARSHOP-101 (FR-022).
- **AC-015**: `npm run test:e2e` (i.e. `npx jest --config
  ./test/jest-e2e.json`) passes, including the pre-existing
  `app.e2e-spec.ts` and `works.e2e-spec.ts`, after the new specs are
  added.
- **AC-016**: `npm run build` and `npm test` (unit suite) both pass after
  the change.
- **AC-017**: If any `src/**/*.ts` production code is added or changed by
  this task, its new/changed lines meet the `>= 80%` unit-test coverage
  target defined in `.claude/rules/testing.md`, or a documented exception
  is recorded per that policy (NFR-005).
- **AC-018**: No secret, credential, real `.env` value, or production
  Cloudinary credential appears in any new test file, fixture, or commit
  produced by this task (NFR-001).

## Constraints

- New tests must be added under `test/e2e/` only; they must not be placed
  under `test/unit/`.
- New tests must reuse the existing `mongodb-memory-server` harness
  (`test/e2e/setup/*`) and the existing `createApp()` composition root
  (`src/infra/server.ts`) — no parallel test harness may be introduced.
- The existing `test/e2e/app.e2e-spec.ts` and `test/e2e/works.e2e-spec.ts`
  behavior and coverage must be preserved; this task must not weaken,
  remove, or duplicate their scenarios.
- No production Cloudinary credentials, and no other real secret or
  credential, may be used, referenced by value, or exposed anywhere in
  the new tests, fixtures, or this specification.
- The concrete mechanism for safely exercising the Cloudinary-dependent
  upload success path (mock/stub adapter vs. a dedicated non-production
  sandbox account) is not decided by this specification; it is an
  architecture decision to be resolved in the corresponding
  `plan.md`.
- Stateful test ordering (create → upload/comment → approve → delete)
  must be followed for the relevant flows to avoid flakiness, per the
  Definition of Done.
- This task does not fix the `GET /works?includeDrafts=true` behavior;
  that authorization boundary is already covered separately in
  `test/e2e/works.e2e-spec.ts` (CARSHOP-102) and is out of scope here.

## Dependencies

- `specs/CARSHOP-101/validation-report.md` — endpoint inventory and gap
  analysis this task closes.
- Obsidian note `CarShop/Learnings/e2e-coverage-gap-beyond-auth-flow.md`
  — historical context on the identified gap.
- Existing E2E harness: `test/jest-e2e.json`,
  `test/e2e/setup/mongo-memory-server.global-setup.ts`,
  `test/e2e/setup/mongo-memory-server.global-teardown.ts`,
  `test/e2e/setup/mongo-memory-server.context.ts`.
- Existing composition root: `src/infra/server.ts` (`createApp()`).
- No external dependency introduction is anticipated by this
  specification; if the architect determines a new test-only dependency
  (e.g. an HTTP-mocking library for Cloudinary) is necessary, that
  decision and its justification belong to the architecture phase, per
  `.claude/rules/typescript.md`'s "do not add a library" constraint.

## Out of Scope

- Fixing the `GET /works?includeDrafts=true` authorization behavior
  itself — already addressed by CARSHOP-102 and covered in
  `test/e2e/works.e2e-spec.ts`.
- Adding E2E coverage for `GET /`, `GET /docs`, or `GET /docs.json` —
  these are informational/static endpoints not listed in this task's
  original Definition of Done. (Note: `GET /` and `GET /docs.json`
  specifically were later brought into scope by Addendum A below, based
  on a 2026-08-27 residual-gap finding; `GET /docs` remains out of scope.)
- Provisioning or managing a real Cloudinary sandbox account outside of
  the test code itself (e.g. creating the account, configuring its
  dashboard) — if the architect selects a real-sandbox strategy, account
  provisioning is an out-of-band operational activity, not part of this
  task's deliverable.
- Performance, load, or concurrency testing of any endpoint.
- Changing production business logic or contracts; this task adds test
  coverage only, unless a test-support seam in production code is
  explicitly justified by the architect (subject to NFR-005).

## Risks

- Cloudinary integration testing must use a non-production sandbox or
  equivalent isolation mechanism; production credentials must never be
  used or exposed (aligns with `.claude/rules/security.md` and
  `.claude/rules/spec-security.md`).
- Stateful test ordering across create → upload/comment → approve →
  delete must be handled carefully to avoid flakiness, consistent with
  the ordering already validated in CARSHOP-101.
- E2E coverage does not automatically substitute for unit-test coverage;
  if implementation touches production `src/` code (e.g. fixtures,
  test-only seams), the usual `>= 80%` new/changed-code unit-coverage
  expectation still applies (NFR-005).

## Open Questions

### Blocking

None.

### Non-blocking

- Concrete Cloudinary sandbox mechanism (mock/stub adapter vs. a real,
  dedicated non-production Cloudinary test account) — left to the
  architect to resolve during the architecture phase, within the
  constraints of NFR-001 and NFR-002.
- Whether the current route inventory exposes a dedicated work "update"
  endpoint distinct from create/delete; if not, FR-005/AC-002 should be
  satisfied against whatever update-capable behavior currently exists,
  to be confirmed by the architect against the actual routes in
  `src/infra/http/routes/*.routes.ts`.

## Traceability

- FR-001 → AC-001
- FR-002 → AC-001
- FR-003 → AC-001
- FR-004 → AC-001
- FR-005 → AC-002
- FR-006 → AC-003
- FR-007 → AC-004
- FR-008 → AC-004
- FR-009 → AC-004
- FR-010 → AC-005
- FR-011 → AC-006
- FR-012 → AC-006
- FR-013 → AC-006
- FR-014 → AC-007
- FR-015 → AC-007
- FR-015a → AC-008
- FR-016 → AC-009
- FR-017 → AC-009
- FR-018 → AC-010
- FR-019 → AC-011
- FR-020 → AC-012
- FR-021 → AC-013
- FR-022 → AC-014
- NFR-001 → AC-010, AC-013, AC-018
- NFR-002 → AC-010
- NFR-003 → AC-015
- NFR-004 → AC-015, AC-016
- NFR-005 → AC-017

Additional whole-suite criteria not tied to a single FR:
- AC-015 (E2E suite passes)
- AC-016 (build and unit suite pass)

## Addendum A — Residual E2E Gaps (from CARSHOP-101 re-execution, 2026-08-27)

### Status

Ready

### Source

Notion Task:
CARSHOP-103 (test-only addition to the same scope lineage)

Originating finding:
CARSHOP-101 re-execution dated 2026-08-27, performed after CARSHOP-103 was
already marked Done, identified 5 residual E2E gaps not covered by the
original CARSHOP-103 implementation described above.

### Context

This addendum does not reopen or contradict the specification above. All
E2E coverage delivered by the original CARSHOP-103 implementation
(`work-crud.e2e-spec.ts`, `admin-work-hard-delete.e2e-spec.ts`,
`comment-moderation-flow.e2e-spec.ts`, `work-image-upload.e2e-spec.ts`,
plus the pre-existing `app.e2e-spec.ts`/`works.e2e-spec.ts`) remains valid
and must be preserved as-is.

The 2026-08-27 re-execution of CARSHOP-101 found that 5 specific behaviors
still have no permanent, automated E2E coverage:

1. `GET /` (health check).
2. `GET /docs.json` (OpenAPI JSON document).
3. Login failure (wrong password) — only the success path is currently
   covered by `test/e2e/app.e2e-spec.ts`.
4. `DELETE /admin/comments/:commentId` (admin comment hard-delete) — the
   route exists (`src/infra/http/routes/admin-comment.routes.ts:42`,
   `router.use(authMiddleware)` applied to the whole router) and is backed
   by `DeleteCommentUseCase`, but `comment-moderation-flow.e2e-spec.ts`
   only exercises `PATCH .../approve` and `PATCH .../:commentId`, never
   `DELETE`.
5. Standalone image-delete success path — `DELETE
   /admin/works/:workId/images/:imageId` is a real, already-existing
   standalone route (`src/infra/http/routes/work-image.routes.ts:103`,
   distinct from the admin work hard-delete cascade), and
   `work-image-upload.e2e-spec.ts` already covers its no-auth (401) and
   not-found (404) guard cases, but never exercises the success branch
   (delete an image that actually exists on a work, and confirm the work
   itself is preserved while the specific image is removed).

Item 5 was verified directly against the current route inventory
(`src/infra/http/routes/work-image.routes.ts`) and the existing spec
(`test/e2e/work-image-upload.e2e-spec.ts`): the endpoint is real and
already partially tested (guard cases only). No new endpoint or backend
contract change is required to close this gap — only an additional test
case for the already-existing success branch.

This addendum closes all 5 gaps with additive, test-only E2E coverage. No
backend contract change is introduced or required by this addendum.

### Objective

Add permanent, automated E2E coverage under `test/e2e/` for the 5 residual
gaps listed above, reusing the existing project harness
(`mongodb-memory-server`, `createApp()`, `connectDatabase`/
`disconnectDatabase`) and conventions established by the original
CARSHOP-103 implementation, without modifying any existing passing test
scenario and without any backend contract change.

### Functional Requirements

- **FR-A01**: A permanent E2E spec must verify that `GET /` returns `200`
  with the currently-implemented response body (plain-text `"Hello
  World!"`, per `src/infra/config/routes.ts`), confirming the health-check
  endpoint is reachable and returns its documented shape.
- **FR-A02**: A permanent E2E spec must verify that `GET /docs.json`
  returns `200` with a JSON body that is valid JSON and contains, at
  minimum, the top-level OpenAPI keys `openapi` and `paths`, confirming
  the assembled OpenAPI document is served correctly. The spec must
  explicitly enable Swagger for its own run (e.g. by setting
  `ENABLE_SWAGGER=true` before calling `createApp()`) rather than relying
  on an ambient `NODE_ENV` default, so the test result does not depend on
  how the test runner's environment happens to be configured.
- **FR-A03**: A permanent E2E spec must verify that `POST /auth/login`
  with a valid email and an incorrect password is rejected with the
  correct error status/body (per the current `AuthService`/
  `auth.controller.ts` contract) and that no `refresh_token` or
  `csrf_token` cookie is set and no session is created as a result of the
  failed attempt.
- **FR-A04**: A permanent E2E spec must verify that `DELETE
  /admin/comments/:commentId` performed by an authenticated caller on an
  existing comment succeeds and that the comment is no longer returned by
  subsequent reads (e.g. it no longer appears in the approved public
  listing after having been approved, or is otherwise confirmed absent
  per the currently-implemented contract).
- **FR-A05**: A permanent E2E spec must verify that `DELETE
  /admin/comments/:commentId` without authentication is rejected (`401`
  per the existing `authMiddleware` contract already validated for the
  sibling `PATCH` routes on the same router).
- **FR-A06**: A permanent E2E spec must verify the success path of `DELETE
  /admin/works/:workId/images/:imageId`: deleting an image that actually
  exists on a work returns the currently-implemented success status
  (`200`, per `WorkImageController.delete`) and, on a subsequent read, the
  work itself still exists while the deleted image is no longer present in
  its image list. This must use the existing `FakeImageStorageAdapter`
  test double (no real Cloudinary network call), consistent with
  NFR-001/NFR-002 above.

### Non-Functional Requirements

- **NFR-A01 (Security)**: No production Cloudinary credentials, no real
  `.env` values, and no other real secret or credential may be used,
  logged, committed, or otherwise exposed by any new test file or by this
  addendum, per `.claude/rules/security.md` and
  `.claude/rules/spec-security.md`. This is the same constraint as
  NFR-001 above, restated for this addendum's scope.
- **NFR-A02 (No contract change)**: This addendum must not require any
  change to `src/**` production code, HTTP status codes, response bodies,
  headers, or cookie names. If implementing any of FR-A01–FR-A06 is found
  to require such a change, implementation must stop and the affected item
  must be raised as an open question rather than silently expanding scope.
- **NFR-A03 (Reliability)**: The new specs must be deterministic and must
  not depend on external network conditions, consistent with NFR-003
  above.
- **NFR-A04 (Maintainability)**: The new specs must follow the same
  conventions already established by the original CARSHOP-103 E2E specs
  (mirrored `beforeAll`/`beforeEach`/env-var pattern, uniquely-suffixed
  identifiers, meaningful assertions, no coverage-gaming), consistent with
  NFR-004 above.

### Acceptance Criteria

- **AC-A01**: `GET /` is covered by at least one E2E test asserting `200`
  and the current response body shape, and it passes (FR-A01).
- **AC-A02**: `GET /docs.json` is covered by at least one E2E test
  asserting `200`, a valid JSON body, and the presence of the `openapi`
  and `paths` top-level keys, with Swagger explicitly enabled for the
  test's own app instance, and it passes (FR-A02).
- **AC-A03**: A wrong-password login attempt is covered by at least one
  E2E test asserting the correct rejection status/body and the absence of
  any issued session cookie, and it passes (FR-A03).

  **Known Deviation (2026-08-27):** the delivered test asserts only the
  rejection status (`401`) and the absence of session cookies. It does
  **not** assert the response body shape. While implementing this AC, a
  pre-existing bug was found: `errorHandlerMiddleware`
  (`src/infra/presentation/middleware/error-handler.middleware.ts`) is
  declared with 3 parameters instead of the 4 Express requires to be
  recognized as error-handling middleware, so it is never invoked — every
  `HttpError`, including this one, currently falls through to Express's
  default HTML error page (leaking a stack trace and server file paths)
  instead of the intended `{ message, details }` JSON body. Fixing that
  middleware is out of this task's scope (test-only, no backend contract
  changes). The fix is tracked separately as **CARSHOP-104**. Once
  CARSHOP-104 lands, this test should be tightened back to also assert the
  JSON error body, and this deviation note should be removed.
- **AC-A04**: `DELETE /admin/comments/:commentId` success and no-auth
  scenarios are each covered by at least one E2E test and pass
  (FR-A04–FR-A05).
- **AC-A05**: The standalone success path of `DELETE
  /admin/works/:workId/images/:imageId` is covered by at least one E2E
  test that creates a work, uploads an image via the existing
  `FakeImageStorageAdapter`, deletes that specific image, and confirms the
  work still exists with the image removed, and it passes (FR-A06).
- **AC-A06**: All new E2E spec files (or additions to existing ones) are
  located under `test/e2e/`, follow the `*.e2e-spec.ts` naming convention
  (for new files) or extend an existing convention-compliant file, and are
  picked up by `npx jest --config ./test/jest-e2e.json`.
- **AC-A07**: `npx jest --config ./test/jest-e2e.json` passes, including
  all pre-existing specs (`app.e2e-spec.ts`, `works.e2e-spec.ts`,
  `work-crud.e2e-spec.ts`, `admin-work-hard-delete.e2e-spec.ts`,
  `comment-moderation-flow.e2e-spec.ts`, `work-image-upload.e2e-spec.ts`)
  unchanged in their existing passing behavior, plus the new coverage
  added by this addendum.
- **AC-A08**: `npm run build` and `npm test` (unit suite) both pass
  unchanged, since this addendum is not expected to introduce any
  `src/**` production code change (NFR-A02).
- **AC-A09**: No secret, credential, real `.env` value, or production
  Cloudinary credential appears in any new or modified test file produced
  by this addendum (NFR-A01).

### Constraints

- New/modified tests must be added under `test/e2e/` only, reusing the
  existing `mongodb-memory-server` harness and `createApp()` composition
  root — no parallel test harness may be introduced.
- All 5 pre-existing, still-passing E2E specs listed in AC-A07 must not be
  weakened, removed, or have their existing assertions altered by this
  addendum.
- This addendum is test-only. If closing any of the 5 items is found to
  genuinely require a backend contract or `src/**` production code change
  (beyond what NFR-A02 permits), implementation must stop for that item
  and the coordinator must be informed via an open question rather than
  silently expanding scope or inventing a nonexistent endpoint.
- No production Cloudinary credentials or other real secrets may be used,
  referenced by value, or exposed anywhere in the new tests or this
  addendum.

### Dependencies

- The original CARSHOP-103 specification and implementation described
  above, including the existing `FakeImageStorageAdapter`
  (`test/e2e/support/fake-image-storage.adapter.ts`) and the
  `createApp({ imageStorage })` overrides seam
  (`src/infra/server.ts`).
- `src/infra/config/routes.ts` (health check and route registration),
  `src/infra/swagger.ts` (`GET /docs.json` gating via `ENABLE_SWAGGER`/
  `NODE_ENV`), `src/infra/http/routes/admin-comment.routes.ts`
  (`DELETE /:commentId`), `src/infra/http/routes/work-image.routes.ts`
  (`DELETE /:workId/images/:imageId`).

### Out of Scope

- Adding E2E coverage for `GET /docs` (the Swagger UI HTML page itself) —
  only `GET /docs.json` was identified as a residual gap.
- Any behavior change to the health-check response, the OpenAPI document
  assembly, the login failure contract, the comment-delete contract, or
  the image-delete contract. This addendum verifies existing behavior; it
  does not change it.
- Re-testing scenarios already covered by the original CARSHOP-103
  implementation (e.g. image-delete no-auth/not-found guards, comment
  approve/update flows) — those remain valid and are not duplicated here.

### Risks

- `GET /docs.json` coverage depends on Swagger being enabled for the
  test's app instance; if `ENABLE_SWAGGER` is not explicitly set by the
  new test, the result could vary with the ambient `NODE_ENV`. FR-A02
  requires the test to set `ENABLE_SWAGGER=true` explicitly to avoid this
  risk.
- None of the 5 items are currently expected to require a backend
  contract change; if the developer discovers otherwise during
  implementation, per NFR-A02 that item must be flagged as an open
  question rather than resolved by expanding scope.

### Open Questions

#### Blocking

None.

#### Non-blocking

- Exact response-body assertion for FR-A03 (wrong-password login) should
  be confirmed against the current `AuthService`/`auth.controller.ts`
  error-mapping behavior during implementation, since this specification
  does not prescribe a specific error message string (only that rejection
  occurs with the correct status and no session/cookies are issued).
- Exact response-body assertion for FR-A04 (comment delete success) should
  be confirmed against `AdminCommentController`'s actual delete response
  shape during implementation; this specification only requires that the
  comment becomes unavailable afterward, not a specific response body.

### Traceability

- FR-A01 → AC-A01
- FR-A02 → AC-A02
- FR-A03 → AC-A03
- FR-A04 → AC-A04
- FR-A05 → AC-A04
- FR-A06 → AC-A05
- NFR-A01 → AC-A09
- NFR-A02 → AC-A08
- NFR-A03 → AC-A07
- NFR-A04 → AC-A06, AC-A07

Additional whole-suite criteria not tied to a single FR:
- AC-A06 (file location/naming convention)
- AC-A07 (full E2E suite passes, including pre-existing specs unchanged)
- AC-A08 (build and unit suite pass, unchanged)
