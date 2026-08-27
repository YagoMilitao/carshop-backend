# CARSHOP-103 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-103/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Close the permanent E2E coverage gap identified by CARSHOP-101 (E2E
COVERAGE GAP verdict) by adding permanent E2E specs under `test/e2e/`
covering work CRUD, admin hard-delete (including the image-cascade
branch), comment creation/listing/moderation, and work-image
upload/delete — without depending on real Cloudinary network calls and
without weakening or duplicating the existing `app.e2e-spec.ts` /
`works.e2e-spec.ts` coverage.

## Current Architecture

- Composition root: `src/infra/server.ts` → `createApp()` unconditionally
  instantiates `new CloudinaryStorageService()` (line 47) with no
  injection seam.
- `CloudinaryStorageService`'s constructor
  (`src/infra/gateway/cloudinary/cloudinary-storage.service.ts:20-29`)
  throws synchronously if `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/
  `CLOUDINARY_API_SECRET` are empty, but performs no network call at
  construction time — only `cloudinary.config()` (local). Network calls
  happen only inside `.upload()`/`.delete()`.
- Neither existing e2e spec (`app.e2e-spec.ts`, `works.e2e-spec.ts`) sets
  Cloudinary env vars, so they must already rely on a developer's local
  `.env` containing some non-empty Cloudinary credentials. CI
  (`.github/workflows/sonar-backend.yml`) runs only `npm run
  test:coverage` (unit tests) — it does not run `npm run test:e2e` today.
  This is a pre-existing condition, not introduced by this task.
- `env.ts` (`getRequiredEnv`) does not validate Cloudinary vars — only
  `MONGO_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- `ImageStoragePort`
  (`src/core/domain/application/Storage/image-storage.port.ts`) is a
  clean two-method port (`upload`, `delete`) — the correct fake seam.
- `HardDeleteWorkUseCase`
  (`src/usecase/hard-delete-work.use-case.ts`) calls
  `imageStorage.delete(publicId)` per image, aborting with 502 before any
  Mongo write on genuine failure; the adapter (not the use case) treats
  "not found" as success — confirms ADR-002 is still accurate and
  binding on any test fake.
- `UploadWorkImageUseCase`
  (`src/usecase/upload-work-image.use-case.ts`) performs external upload
  before the Mongo write, with a best-effort compensating
  `imageStorage.delete()` on DB-write failure (without masking the
  original error), and a `finally`-block temp-file cleanup.
- Routes/controllers confirm auth/validation short-circuit before
  reaching `ImageStoragePort` for: no-auth (401), no-file (400,
  `WorkImageController.upload`), wrong MIME type (415, via
  `uploadMiddleware` `fileFilter` → `normalizeUploadError` in
  `work-image.routes.ts`), oversized (413, same path), not-found
  image/work on delete (404, inside `DeleteWorkImageUseCase.execute`
  before `imageStorage.delete`).
- Deviation from spec text: FR-017 says generic "400" but the actual
  contract is 400 (no file) / 415 (bad MIME) / 413 (oversized) — three
  different codes. Tests must assert the actual per-case status per
  `.claude/rules/openapi.md`, not force a uniform 400.
- No work "update" endpoint exists anywhere in
  `src/infra/http/routes/*` (confirmed via `work.routes.ts`,
  `admin-work.routes.ts`). This validates the spec's documented fallback
  for FR-005/AC-002: satisfy it via `PATCH /admin/comments/:commentId`
  (`UpdateCommentUseCase`/`AdminCommentController.update`).
- `Work.id` is a `randomUUID()` string field
  (`mongo-work.repository.ts`), not a Mongo `ObjectId` — arbitrary
  not-found identifiers are safe, no `CastError`, cleanly produce
  `HttpError(404)`.
- `test/jest-e2e.json` has no `runInBand`/testSequencer restriction —
  Jest runs spec files in parallel workers against the same shared
  `mongodb-memory-server` instance (set up once in `globalSetup`). New
  specs must use uniquely-suffixed identifiers like the existing
  `works.e2e-spec.ts` pattern.

## Proposed Solution

Add a fake/stub `ImageStoragePort` test double, injected at the
composition root via a new optional overrides parameter on
`createApp()`. Add four new permanent E2E spec files under `test/e2e/`
covering work CRUD, admin hard-delete (incl. image cascade), comment
creation/listing/moderation, and work-image upload/delete, all using the
fake adapter — no real Cloudinary sandbox account, no network I/O.

## Technical Decisions

### Decision

Use a fake/stub `ImageStoragePort` test double (`FakeImageStorageAdapter`
under `test/e2e/support/`), injected into `createApp()` via a new
optional `overrides.imageStorage` parameter, instead of a real
non-production Cloudinary sandbox account.

### Reason

- `.claude/rules/security.md` forbids any production credential
  exposure; a fully deterministic fake is strictly safer than the
  permitted minimum and avoids credential/account management entirely
  (matches the spec's Out-of-Scope note that account provisioning is not
  part of this deliverable).
- `ImageStoragePort` is exactly the boundary `.claude/rules/
  architecture.md` says should be isolated/faked — not Mongoose, not
  Express internals. The plan never imports/references the legacy
  Cloudinary duplicate under `src/core/domain/application/Gateway`.
- The fake can faithfully reproduce ADR-002's idempotent
  "not found → success" `delete()` contract, essentially free with a
  stub, which a flaky real network call cannot guarantee test-to-test.

### Alternatives Considered

A real, non-production Cloudinary sandbox account. Rejected because it
would require: provisioning (out of scope), injecting credentials into
every developer's and CI's environment (CI has no such secret and no e2e
job at all today — introducing that is a much larger, unapproved infra
change), and tolerating real network flakiness in a suite whose explicit
goal is to avoid flakiness.

### Trade-offs

The fake adapter does not exercise real Cloudinary network behavior or
the genuine-storage-failure 502 path (no FR requires exercising that
branch). This is an accepted, explicitly justified test-support seam per
the spec's Out-of-Scope section ("unless a test-support seam in
production code is explicitly justified by the architect, subject to
NFR-005").

## Execution Flow

1. Add the minimal `CreateAppOverrides` seam to `src/infra/server.ts`.
2. Extend `test/unit/infra/server.spec.ts` to cover both the
   no-overrides and overrides-supplied branches.
3. Add `test/e2e/support/fake-image-storage.adapter.ts`.
4. Add the four new E2E spec files under `test/e2e/`.
5. Run the full validation commands (unit, e2e, build, coverage).

## Files

### Files to Create

- `test/e2e/support/fake-image-storage.adapter.ts` — implements
  `ImageStoragePort`. `upload(input)` synchronously builds a
  deterministic fake result (`publicId: carshop/e2e/${randomUUID()}`,
  `url: https://fake-cloudinary.e2e.test/${publicId}.jpg` — placeholder
  domain, never a real Cloudinary/production host), no network call,
  `await Promise.resolve()` to preserve the async contract.
  `delete(publicId)` always resolves successfully whether or not
  `publicId` was ever "uploaded" — mirrors the idempotent
  "not found → success" semantics required by ADR-002. No throwing
  branch needed (no FR requires exercising the 502 genuine-storage-
  failure path). No `src/**` import beyond the `ImageStoragePort` type
  import. Lives under `test/e2e/support/`, not `src/`, so it is not
  subject to the `>=80%` coverage policy, but is exercised implicitly by
  the e2e specs using it. No separate unit spec required (consistent
  with no unit tests existing for other e2e-only fixtures).
- `test/e2e/work-crud.e2e-spec.ts` — FR-001–FR-004:
  - `POST /works` success (201, id+slug present) — FR-001/AC-001.
  - `POST /works` no `Authorization` header → 401, follow-up read
    confirms nothing created — FR-002/AC-001.
  - `POST /works` with existing slug (create twice) → 409 on second call
    — FR-003/AC-001.
  - `POST /works` missing required field (e.g. omit title) → 400 —
    FR-004/AC-001.
- `test/e2e/admin-work-hard-delete.e2e-spec.ts` — FR-006 (partial),
  FR-007–FR-010:
  - `DELETE /admin/works/:workId` no auth → 401 — FR-007/AC-004.
  - Stateful flow: create work → `DELETE` authenticated → 200 →
    subsequent `GET /works` confirms gone — FR-008/AC-004.
  - `DELETE` on random/never-existing id → 404 — FR-009/AC-004; same
    assertion is evidence for FR-006/AC-003 (documented via comment
    cross-reference).
  - Image-cascade branch (FR-010/AC-005): create work → upload image via
    `POST /admin/works/:workId/images` (`FakeImageStorageAdapter`, real
    multipart buffer) → hard-delete work → assert 200 and work/image
    metadata gone on subsequent read. No real Cloudinary call; the
    fake's idempotent `delete()` satisfies `HardDeleteWorkUseCase`'s
    per-image loop.
- `test/e2e/comment-moderation-flow.e2e-spec.ts` — FR-005 (via
  comment-update fallback)/AC-002, FR-011–FR-015a:
  - `POST /works/:workId/comments` valid payload on existing work → 201
    — FR-011/AC-006.
  - `POST /works/:workId/comments` invalid payload (content under 3
    chars per `createCommentSchema`) → 400 — FR-012/AC-006.
  - `POST /works/:workId/comments` on non-existent work → 404 —
    FR-013/AC-006.
  - Full stateful flow (FR-014, FR-015/AC-007): create work → create
    comment → `GET /works/:workId/comments` confirms pending comment
    absent → admin login → `PATCH /admin/comments/:commentId/approve`
    (authenticated) → 200 → `GET /works/:workId/comments` confirms now
    appears.
  - `PATCH /admin/comments/:commentId/approve` no auth → 401; approving
    non-existent comment id → 404 — FR-015a/AC-008.
  - `PATCH /admin/comments/:commentId` (authenticated, valid partial
    body) on existing comment → 200, persisted state reflects new value
    — documented AC-002/FR-005 evidence (no work-update endpoint exists;
    closest existing "update" pattern per the spec's fallback text).
- `test/e2e/work-image-upload.e2e-spec.ts` — FR-016–FR-019:
  - `POST /admin/works/:workId/images` no auth → 401 — FR-016/AC-009.
  - `POST` authenticated, no file attached → 400 (matches FR-017 literal
    text) — AC-009.
  - `POST` authenticated, disallowed MIME type → 415 (documented
    deviation from FR-017's literal "400" wording; actual contract per
    `work-image.routes.ts`'s `normalizeUploadError` is 415 for MIME
    rejection, 413 for oversized — both satisfy AC-009's substance).
    Assert the fake adapter's `upload()` is never invoked
    (`jest.spyOn`) to make "without reaching the image-storage provider"
    directly observable.
  - `POST` authenticated, valid small JPEG buffer → 201/200 per current
    contract, using `FakeImageStorageAdapter` — FR-018/AC-010. Assert
    response and/or follow-up read reflects the newly stored image
    (confirm exact response shape from `WorkImageController.upload` —
    currently `{ message: '...' }` with 201; if image metadata isn't in
    the upload response, verify via authenticated
    `GET /works?includeDrafts=true` or equivalent read exposing images).
  - `DELETE /admin/works/:workId/images/:imageId` no auth → 401; on
    existing work with non-existent imageId → 404, with the fake's
    `delete()` spied to confirm it is never called for the not-found
    case — FR-019/AC-011.

All new spec files construct the app as
`createApp({ imageStorage: new FakeImageStorageAdapter() })` uniformly,
even in files that never touch image routes, so no new spec depends on
any Cloudinary env var. All identifiers use timestamp/uuid suffixes for
collision-safety under parallel execution. Files follow the existing
`beforeAll`/`beforeEach`/env pattern (`connectDatabase`/
`disconnectDatabase`, disposable `JWT_SECRET`/`ADMIN_EMAIL`/
`ADMIN_PASSWORD`/`JWT_EXPIRES_IN`/`JWT_REFRESH_EXPIRES_IN` set in
`beforeEach`).

### Files to Modify

- `src/infra/server.ts` — add an exported `CreateAppOverrides` interface
  and a default-parameter fallback:

```ts
// src/infra/server.ts
export interface CreateAppOverrides {
  imageStorage?: ImageStoragePort;
}

export function createApp(overrides: CreateAppOverrides = {}): Express {
  ...
  const imageStorage = overrides.imageStorage ?? new CloudinaryStorageService();
  ...
}
```

  No other line changes. Default behavior for `src/main/index.ts` (which
  calls `createApp()` with no arguments) is byte-for-byte unchanged.
- `test/unit/infra/server.spec.ts` — extend with two branch-covering
  cases: (a) no-overrides path still constructs
  `CloudinaryStorageService` (already covered); (b) when
  `overrides.imageStorage` is supplied, `CloudinaryStorageService`'s
  mocked constructor is NOT called and `registerRoutes` receives the
  supplied instance as `imageStorage`.

### Files explicitly NOT modified

- `test/e2e/app.e2e-spec.ts`, `test/e2e/works.e2e-spec.ts` — preserved
  as-is per the spec's constraint. Their latent dependency on a
  developer-provided Cloudinary env value is pre-existing, not
  introduced/worsened by this task. Not fixed here — out of this task's
  explicit scope.
- No Swagger fragment changes — no HTTP contract/status/header/payload
  changes are introduced; the one documented FR-017-vs-actual-code
  status-code discrepancy is captured in the tests, not in
  `src/infra/docs`.
- No other `src/**` files besides `src/infra/server.ts`.

## Contract Impact

None. `createApp()`'s new `overrides` parameter is purely
additive/optional; zero behavior change for `src/main/index.ts`, zero
HTTP contract change (status codes, headers, payloads, cookie names all
unchanged). The one documented discrepancy (FR-017 literal "400" vs.
actual 400/415/413 split) is a pre-existing contract fact captured by
the new tests, not a contract change introduced by this task.

## Persistence Impact

None. No schema, mapping, or repository changes.

## Security Impact

No production Cloudinary credentials or `.env` values are read,
referenced, or required by any new file. The fake adapter never performs
network I/O. NFR-001/NFR-002/AC-018 are satisfied by construction. The
`createApp()` overrides seam does not weaken auth, CSRF, upload
validation, or any existing security control.

## Swagger Impact

None. No endpoint, payload, response, status code, authentication
requirement, cookie, or header changes.

## Testing Strategy

Only `src/**/*.ts` production change: a ~3-line `CreateAppOverrides`
addition in `src/infra/server.ts`. `test/unit/infra/server.spec.ts` must
be extended with the two branch-covering cases described above.
Realistically achievable at 100% coverage for the changed lines. All
other new code is e2e test files (exempt from the unit-coverage policy
by definition per `.claude/rules/testing.md`) or the e2e-only fixture
(also outside `src/**`).

This satisfies the `>= 80%` new/changed-code unit-test coverage target
defined in `.claude/rules/testing.md`: the only in-scope `src/**`
production change is the small, fully-testable `server.ts` seam, and no
justified exception is needed given 100% coverage is realistically
achievable for those changed lines.

After implementation, run:

- `npx jest --config ./test/jest-e2e.json` (full new+old e2e suite)
- `npm test` (unit suite incl. extended `server.spec.ts`)
- `npm run build` (TypeScript change in `server.ts`)
- `npm run test:coverage` (confirm `server.ts` diff lines covered)

## Risks

- Pre-existing Cloudinary-env dependency on the 2 existing specs:
  `npm run test:e2e` today already requires some non-empty
  `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`
  for `app.e2e-spec.ts`/`works.e2e-spec.ts` to pass (plain
  `createApp()`). AC-015 requires the full suite (old+new) to pass.
  Developer/tester must confirm the CI/local environment used to
  validate this task has these set (even harmless non-secret dummy
  strings, e.g. `CLOUDINARY_CLOUD_NAME=e2e-local`) — an operational, not
  architectural, action; not silently "fixed" by editing those two
  files.
- Cross-file parallelism against shared in-memory Mongo: mitigated by
  uniquely-suffixed identifiers in every new spec.
- `createApp()` overrides parameter: purely additive/optional; zero
  behavior change for `src/main/index.ts`, zero contract change.
- FR-017 status-code wording vs. actual code: documented above; tests
  assert real 400/415/413 split, not blanket 400.

## Implementation Steps

1. Add the `CreateAppOverrides` interface and default-parameter fallback
   to `src/infra/server.ts`.
2. Extend `test/unit/infra/server.spec.ts` with the two overrides-branch
   test cases.
3. Add `test/e2e/support/fake-image-storage.adapter.ts`.
4. Add `test/e2e/work-crud.e2e-spec.ts`.
5. Add `test/e2e/admin-work-hard-delete.e2e-spec.ts`.
6. Add `test/e2e/comment-moderation-flow.e2e-spec.ts`.
7. Add `test/e2e/work-image-upload.e2e-spec.ts`.
8. Confirm (do not silently fix) that the local/CI environment has
   non-empty (dummy) Cloudinary env vars so the two pre-existing specs
   continue to pass.
9. Run `npx jest --config ./test/jest-e2e.json`, `npm test`,
   `npm run build`, `npm run test:coverage`.

## Definition of Done Mapping

- FR-001–FR-004 → `test/e2e/work-crud.e2e-spec.ts`
- FR-005/AC-002 → `test/e2e/comment-moderation-flow.e2e-spec.ts`
  (`PATCH /admin/comments/:commentId` fallback)
- FR-006 (partial)/FR-007–FR-010 →
  `test/e2e/admin-work-hard-delete.e2e-spec.ts`
- FR-011–FR-015a → `test/e2e/comment-moderation-flow.e2e-spec.ts`
- FR-016–FR-019 → `test/e2e/work-image-upload.e2e-spec.ts`
- NFR-001/NFR-002/AC-018 (no production Cloudinary dependency) →
  `FakeImageStorageAdapter` + `createApp()` overrides seam
- NFR-005 (unit coverage for changed production code) →
  extended `test/unit/infra/server.spec.ts`
- AC-015 (full suite passes) → validation commands in Testing Strategy,
  contingent on the pre-existing Cloudinary-env risk noted above

## Open Non-Blocking Questions

None — architect verdict recorded no blocking questions.
