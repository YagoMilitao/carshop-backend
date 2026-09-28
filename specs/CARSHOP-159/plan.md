# CARSHOP-159 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-159/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

No question blocks implementation. Q-001 (eligible-images listing) is out of
scope, per the coordinator's decision. Q-002 (fallback image) is resolved by
AD-004.

## Existing Knowledge (Obsidian)

None. `knowledge-reader` returned `BLOCKED` (Obsidian unavailable). The plan
is based on the repository alone.

## Objective

- The admin selects, through a protected route, an image already managed by
  the system to be the Home main image.
- The selection is stored in Mongo as a single configuration (singleton).
- The Home reads that configuration through a public route, without
  authentication.
- The read never exposes a removed or ineligible image.
- AC-001 to AC-017 mapping: see Definition of Done Mapping.

## Current Architecture

Repository facts that determine the design:

1. **Images are embedded in the Work.** The real source is `Work.images[]`
   in `src/data/models/work.model.ts`. Each image has an `id` generated with
   `randomUUID()` in `UploadWorkImageUseCase`, plus `url`, `publicId`, `alt`,
   `isCover` and `order`.
   - `WorkImageModel` (collection `work_images`, in
     `src/data/models/work-image.model.ts`) is legacy. It is used only by
     `src/main/create-indexes.ts`. **It must not be referenced.**
2. **No image width/height exists in the system.** `UploadImageResult`
   returns only `url` and `publicId`, and the schema has no
   `width`/`height`.
3. **Soft delete is not triggered by any route or use case.** Only
   `WorkRepositoryPort.softDelete` exists.
   - `findById` filters `deletedAt: null`.
   - `PATCH /admin/works/{workId}` can change `status` to `draft`, which
     affects eligibility.
4. **Hard delete and purge share the same code.** `HardDeleteWorkUseCase` is
   reused by `PurgeExpiredWorksUseCase`, which runs through the script
   `src/main/purge-expired-works.ts`.
   - `DeleteWorkImageUseCase` removes the image via `removeImage` (`$pull`).
5. **CORS does not allow `PUT`.** In `src/infra/config/middleware.ts` the
   allowed methods are `GET, POST, PATCH, DELETE`. A `PUT` route would break
   the frontend preflight (CARSHOP-160).
6. **Mutating admin routes use only two controls:** `buildAuthMiddleware`
   (Bearer + session) and the global `globalRateLimitMiddleware`
   (100 req/15 min, standard message).
   - There is no CSRF on Bearer routes; CSRF exists only on `/auth/refresh`
     and `/auth/logout`.
7. **Swagger assembly lives in another file.** The document is assembled in
   `src/infra/docs/swaggerSingletonArray.ts`, with `mergeOpenApiPaths`.
   - `src/infra/swagger.ts` only serves `/docs` and `/docs.json` and **does
     not need to change**.
   - The test `swaggerSingletonArray.spec.ts` requires a `429` response on
     every operation.
8. **The global rate limiter keeps per-module state.** In e2e,
   `TRUST_PROXY_HOPS` is 0, so `X-Forwarded-For` is ignored and every request
   falls into the loopback key.
   - `comment-rate-limit.e2e-spec.ts` uses `resetKey` to isolate cases; the
     same pattern applies here.

## Proposed Solution

Reference an existing Work image by `{ workId, imageId }` in a singleton Mongo
configuration (AD-001); resolve and revalidate the reference on every public
read, returning `{ "image": null }` when missing or ineligible (AD-002,
AD-003, AD-004); expose `GET /home-image` (public) and
`PATCH /admin/home-image` (protected by `authMiddleware` + global limiter)
(AD-005). No existing endpoint changes status, body or headers.

## Technical Decisions

### AD-001 — Reference strategy

#### Decision

Reference the existing Work image by the pair `{ workId, imageId }`. Do not
create a dedicated Home asset.

What is persisted: only the reference (`workId`, `imageId`) and timestamps.
`url` and `alt` are **not copied**; they are resolved at read time from the
Work, which satisfies FR-002 and FR-007: the URL always comes from the
system.

#### Reason

The pair uses `WorkRepositoryPort.findById`, which already exists, is indexed
and is sanitized. It is the same shape as
`/admin/works/{workId}/images/{imageId}`.

#### Alternatives Considered

- A dedicated asset would duplicate the upload and storage infrastructure,
  violating NFR-004.
- Accepting only `imageId` would require scanning `images.id` across all
  Works, a field with no index and no port method.

#### Trade-offs

See alternatives above; the pair requires the client to send two
identifiers but reuses existing, indexed, sanitized lookups.

### AD-002 — Behavior when the in-use image is removed

#### Decision

"Logical unlinking" resolved at read time. The configuration stores only the
reference, and the public GET revalidates on every read, against the Work's
current state, that:

- the Work exists;
- `deletedAt` is `null`;
- `status` is `published`;
- the image with that `imageId` is in `images`.

If any condition fails, the response is the same as "not configured"
(AD-004).

Effect on each removal path (FR-008):

- `DELETE .../images/{imageId}`: the image leaves `images`, so the read
  returns empty.
- `DELETE /admin/works/{workId}`: `findById` returns `undefined`, so the
  read returns empty.
- Soft delete: `findById` filters `deletedAt`, so the read returns empty.
- Purge: uses the same hard delete.
- `PATCH` to `draft`: becomes ineligible, so the read returns empty.

The GET writes nothing. It does not delete the stale configuration, because
it is a public, idempotent route. The next PATCH simply replaces it.

#### Reason

Covers every path, including future ones and those performed outside the API,
**without changing any existing endpoint**.

#### Alternatives Considered

- Blocking removal (e.g. `409`) would change the contract of two existing
  DELETEs. In addition, the purge would fail forever on that Work (it only
  logs the error), leaving retained garbage.
- Active unlinking would require injecting a new port into
  `DeleteWorkImageUseCase` and `HardDeleteWorkUseCase` (and the purge
  script), increasing coupling. Even so, it would not cover soft delete or
  status change, which have no use case.

#### Trade-offs

Residual risks to document:

- If a `draft` Work returns to `published`, the image reappears on the Home.
  This behavior is deterministic and documented.
- A removed `imageId` never returns, because IDs are UUIDs and are not
  reused.
- There is currently no "restore soft delete". If one ever exists, the image
  would also reappear.

### AD-003 — Eligibility

#### Decision

Only an image of a Work with `status === 'published'` **and**
`deletedAt === null`, and that exists in `work.images`, is eligible.

The rule lives in a pure domain function (`isWorkEligibleForHomeImage`), used
by both use cases, which apply the same rule:

| Moment | Situation | Result |
| --- | --- | --- |
| Selection | Work missing or soft-deleted (`findById` → `undefined`) | `404` "Trabalho não encontrado." (same as `PATCH /admin/works`, which also returns 404 for soft delete) |
| Selection | Image missing from the Work | `404` "Imagem não encontrada." |
| Selection | Work in `draft` | `409` "A imagem selecionada não é elegível: o trabalho não está publicado." |
| Read | Any violation | Empty response (AD-004) |

#### Reason

`409` was chosen instead of `422` because it is already part of the API's
vocabulary for conflict with resource state.

#### Alternatives Considered

`422` for the ineligible case (rejected, see Reason).

#### Trade-offs

Not stated by the architect beyond the above.

### AD-004 — Public response with no configuration or invalid reference

#### Decision

`200` with `{ "image": null }`, always the same (deterministic).

Configured and valid response: `200` with:

```json
{ "image": { "workId": "<uuid>", "imageId": "<uuid>", "url": "<url>", "alt": "<text>" } }
```

Dimensions: not available in the system, so they are **omitted**. Swagger and
`docs/api-contract.md` must state this explicitly.

Never expose: `publicId`, `_id`, `key`, `deletedAt` or `status`.

#### Reason

Deterministic, documented response for the "not configured" case (FR-004)
that does not rely on assets that do not exist.

#### Alternatives Considered

- `404` confuses "route does not exist" with "not configured" and produces a
  console error on the frontend.
- A fallback would require an asset that does not exist, and choosing the
  default image belongs to the frontend (CARSHOP-161).

#### Trade-offs

Including dimensions would require changing `ImageStoragePort`, the
Cloudinary adapter and the schema, which is out of scope.

### AD-005 — Routes, contract and controls

#### Decision

Routes:

- `GET /home-image`: public.
- `PATCH /admin/home-image`: protected by `authMiddleware`.

PATCH body (`application/json`, required):

- Exactly `{ "workId": string, "imageId": string }`.
- Both fields validated by Zod: `trim`, 1–64 characters, pattern
  `^[A-Za-z0-9-]+$` (accepts UUIDs and rejects `:`, `/`, `.`, i.e. URLs).
- Extra keys (including `url`) are rejected: pre-check keys against an
  allowlist, as in `update-work.schema.ts`, then `.strict()`.
- Result: `400` "Payload inválido." via `validateWithSchema`.

PATCH responses:

| Status | Situation |
| --- | --- |
| `200` | `{ "image": {workId,imageId,url,alt} }`, same schema as GET, never `null` |
| `400` | Invalid payload, invalid JSON or disallowed fields |
| `401` | Missing or invalid token, or token of a revoked/expired session |
| `404` | Work or image not found |
| `409` | Not eligible |
| `429` | Global rate limit |
| `500` | Unexpected error |

GET responses: `200` (configured or `null`) and `429`.

Controls:

- `authMiddleware` + global limiter, the same as every existing mutating
  admin route.
- No dedicated limiter.
- CSRF does not apply, because the route uses a Bearer header and not a
  cookie. `refresh` and `logout` remain intact.

#### Reason

- `PATCH` rather than `PUT` because of CORS (repository fact 5).
- A new limiter pattern without justification is unnecessary, and the `429`
  message stays the standard one, as AC-013 requires.

#### Alternatives Considered

- `PUT`: rejected because CORS does not allow it; changing CORS would be a
  cross-cutting security change, out of scope.
- A dedicated rate limiter: rejected (see Reason).

#### Trade-offs

Not stated by the architect beyond the above.

## Execution Flow

Public read:

```text
GET /home-image
    ↓
HomeImageController.get
    ↓
GetHomeImageUseCase
    ├── HomeImageSettingsRepositoryPort.find() → none → { image: null }
    ├── WorkRepositoryPort.findById(workId) → HttpError 400 / undefined → { image: null }
    ├── isWorkEligibleForHomeImage(work) false or image missing → { image: null }
    └── otherwise → { image: { workId, imageId, url, alt } }  (other errors propagate)
```

Admin selection:

```text
PATCH /admin/home-image
    ↓
authMiddleware
    ↓
HomeImageController.update → validateWithSchema(setHomeImageSchema)  (400 on failure)
    ↓
SetHomeImageUseCase
    ├── findById(workId) → undefined → 404 "Trabalho não encontrado." (no save)
    ├── image missing → 404 "Imagem não encontrada." (no save)
    ├── not eligible → 409 (no save)
    ├── HomeImageSettingsRepositoryPort.save({ workId, imageId })
    └── return HomeImage built from the Work read (url/alt)
```

The global rate limiter applies to both routes.

## Files

All paths are relative to the repository root.

### Files to Create

Domain:

- `src/core/domain/application/HomeImage/home-image.types.ts`:
  - `HomeImageSelection { workId; imageId; updatedAt: string (ISO) }`;
  - `HomeImage { workId; imageId; url; alt }`;
  - pure function `isWorkEligibleForHomeImage(work: Work): boolean`,
    returning `status === 'published' && !work.deletedAt`.
- `src/core/domain/repositories/home-image-settings.repository.ts`:
  `HomeImageSettingsRepositoryPort` with:
  - `find(): Promise<HomeImageSelection | undefined>`;
  - `save(input: { workId; imageId }): Promise<HomeImageSelection>`.

Persistence:

- `src/data/models/home-image-setting.model.ts`:
  - model `HomeImageSetting`, collection `home_image_settings`,
    `timestamps: true`, `versionKey: false`;
  - field `key`: String, required, `unique: true`, `enum: ['home']`,
    `default: 'home'`. The single-value enum plus the unique index
    **guarantees the singleton in the database**;
  - `workId` and `imageId`: String, required, trim;
  - no hooks or custom validators.
- `src/infra/repositories/mongo-home-image-settings.repository.ts`:
  - `find()`: `findOne({ key: 'home' }).lean()` and explicit mapping to
    `HomeImageSelection`;
  - `save()`:
    - validates that `workId`/`imageId` are plain strings (no `$`, no `.`);
    - runs
      `findOneAndUpdate({ key: 'home' }, { $set: { workId, imageId } }, { upsert: true, new: true, runValidators: true }).lean()`;
    - on duplicate-key error `11000` (race on first insert), retries
      **once**;
    - maps the result;
  - does not expose `_id` or `key`.

Use cases:

- `src/usecase/set-home-image.use-case.ts`
  (`SetHomeImageUseCase(workRepository, homeImageSettingsRepository)`):
  - applies the AD-003 sequence: 404 / 404 / 409;
  - `save`;
  - returns a `HomeImage` built from the Work read (url/alt);
  - no write when validation fails: this guarantees "configuration
    unchanged".
- `src/usecase/get-home-image.use-case.ts`
  (`GetHomeImageUseCase(workRepository, homeImageSettingsRepository)`):
  - `find` → `null` if there is no configuration;
  - `findById(workId)` → `null` on `HttpError` 400 or `undefined`;
  - `null` if ineligible or if the image is missing;
  - otherwise returns `HomeImage`;
  - other errors propagate.

Presentation:

- `src/infra/presentation/validators/set-home-image.schema.ts`:
  `setHomeImageSchema` and type `SetHomeImageSchemaInput`, per AD-005.
- `src/presentation/controllers/home-image.controller.ts`
  (`HomeImageController(getHomeImageUseCase, setHomeImageUseCase)`), with
  `async` arrow handlers and `next(error)`:
  - `get` → `200 { image }`;
  - `update` → `validateWithSchema` → use case → `200 { image }`;
  - map explicitly to `{ workId, imageId, url, alt }`.

Routes:

- `src/infra/http/routes/home-image.routes.ts`:
  `buildHomeImageRouter(workRepository, homeImageSettingsRepository)` with
  `router.get('/', controller.get)`.
- `src/infra/http/routes/admin-home-image.routes.ts`:
  `buildAdminHomeImageRouter(workRepository, homeImageSettingsRepository, sessionStore, tokenService)`
  with `router.patch('/', authMiddleware, controller.update)`.

Documentation:

- `src/infra/docs/home-image.swagger.ts`:
  - `homeImageTags` (`Home Image`);
  - `homeImageSchemas`:
    - `HomeImage`: `workId`, `imageId`, `url`, `alt`, all required, no
      `publicId`;
    - `HomeImageResponse`: `image` with `$ref` `HomeImage` and
      `nullable: true`;
    - `SetHomeImageRequest`: required `workId`/`imageId`,
      `additionalProperties: false`, `pattern`;
  - `homeImagePaths`:
    - `/home-image` `get`: no security, responses `200` (describe the `null`
      case and the omission of dimensions) and `429`;
    - `/admin/home-image` `patch`: `bearerSecurity`, `requestBody`,
      responses `200/400/401/404/409/429/500`, using the helpers
      `successResponse`, `errorResponse` and `globalRateLimitResponse`;
  - descriptions must explain the eligibility rule and the read-time
    resolution (AD-002/AD-003).

Tests to create are listed under Testing Strategy.

### Files to Modify

- `src/main/create-indexes.ts`: add the new model to `MODELS`, because it
  declares a unique index and the script covers "all models".
- `src/infra/config/routes.ts`:
  - add `homeImageSettingsRepository: HomeImageSettingsRepositoryPort` to
    `RegisterRoutesDependencies`;
  - mount `app.use('/home-image', ...)` and
    `app.use('/admin/home-image', ...)`;
  - update the base comments.
- `src/infra/server.ts`: instantiate `new MongoHomeImageSettingsRepository()`
  and pass it to `registerRoutes`. Do not touch `src/infra/http/server.ts`,
  which is legacy.
- `src/infra/docs/swaggerSingletonArray.ts`: spread tags, schemas and paths
  of the new fragment. `src/infra/swagger.ts` does not change.
- `src/infra/docs/admin-works.swagger.ts` (text only): add to the
  descriptions of `DELETE /admin/works/{workId}`,
  `DELETE .../images/{imageId}` and `PATCH /admin/works/{workId}` that, if
  the image/Work is configured on the Home, `GET /home-image` then returns
  `image: null`. The **status and body of these endpoints do not change**
  (AC-015).
- `docs/api-contract.md`:
  - new "Home Image" section with `GET /home-image` and
    `PATCH /admin/home-image` (auth, body, responses, `null` case, 404/409,
    429);
  - notes on the three removal/change endpoints above;
  - new rows in the "Referência cruzada" table.

Tests to modify are listed under Testing Strategy.

### Unchanged

`src/infra/swagger.ts`, `src/infra/http/server.ts` (legacy),
`src/data/models/work-image.model.ts` (legacy, not referenced), CORS
configuration, auth/CSRF, `purge-expired-works*`, existing removal use cases.

## Contract Impact

- New endpoints: `GET /home-image` (public) and `PATCH /admin/home-image`
  (Bearer), as described in AD-005.
- Existing endpoints: no observable change in status, body or headers. The
  only change is documentary and indirect: removing, unpublishing or
  deleting the Work/image in use makes the public GET return `null`. Only the
  Swagger and `api-contract.md` descriptions of `DELETE /admin/works/{workId}`,
  `DELETE /admin/works/{workId}/images/{imageId}` and
  `PATCH /admin/works/{workId}` gain a note about the effect on
  `GET /home-image`.

## Persistence Impact

- New collection `home_image_settings`, with at most one document
  (`key: 'home'`), singleton guaranteed by the single-value enum + unique
  index on `key`.
- Stores only `workId`, `imageId` and timestamps; `url`/`alt` are resolved
  from the Work at read time.
- New model added to `src/main/create-indexes.ts`.
- Concurrency: upsert with unique index plus one retry guarantees a single
  configuration. Last PATCH wins, which is acceptable.
- Read cost: the public GET performs 2 reads (indexed `findOne` + indexed
  `findById`), which is acceptable.

## Security Impact

- Data exposure: the public response does not include `publicId`, `_id`,
  `status` or `deletedAt`. Errors use `HttpError` with fixed messages;
  unexpected errors fall into the generic `500` (AC-012).
- NoSQL injection: covered by the Zod regex, the string check in the
  repository and the `sanitizeFilter` already present in `findById`.
- Authentication and CSRF: no change to the auth model, cookies or CSRF
  (AC-016). The new mutating route uses `authMiddleware` + global rate
  limiter; CSRF does not apply to Bearer-header routes.
- No arbitrary client URL is accepted (Zod pattern + strict keys; FR-007,
  AC-008).

## Swagger Impact

- New fragment `src/infra/docs/home-image.swagger.ts` (tags, schemas,
  paths) as described under Files to Create.
- `src/infra/docs/swaggerSingletonArray.ts` spreads the new fragment.
- `src/infra/docs/admin-works.swagger.ts`: description-only notes on the
  three removal/change endpoints.
- Every new operation documents `429` (required by
  `swaggerSingletonArray.spec.ts`).
- `src/infra/swagger.ts` unchanged; `/docs` and `/docs.json` gating
  preserved.

## Testing Strategy

### Unit (mirroring `src/`)

| Spec | Covers |
| --- | --- |
| `test/unit/core/domain/application/HomeImage/home-image.types.spec.ts` | published/active → true; draft → false; `deletedAt` → false (AC-006, AC-011) |
| `test/unit/data/models/home-image-setting.model.spec.ts` | validates correct document; requires `workId`/`imageId`; rejects `key` other than `home`; unique index on `key`; collection name (pattern of `health-check-ping.model.spec.ts`) (FR-001) |
| `test/unit/infra/repositories/mongo-home-image-settings.repository.spec.ts` (model mocked with `jest.mock`) | `find` empty/filled and mapping without `_id`/`key`; `save` with correct upsert arguments; retry on `11000`; other error propagated; rejection of identifier with `$` or `.` (AC-004, AC-014) |
| `test/unit/usecase/set-home-image.use-case.spec.ts` | success (AC-003); missing Work → 404 without `save` (AC-005); missing image → 404 without `save`; draft → 409 without `save` (AC-006); response without `publicId` (AC-012) |
| `test/unit/usecase/get-home-image.use-case.spec.ts` | no configuration → `null` (AC-002); valid → `HomeImage` (AC-001); Work removed/soft delete → `null`; image removed → `null` (AC-010); draft → `null` (AC-011); `HttpError` 400 → `null`; other error propagates |
| `test/unit/infra/presentation/validators/set-home-image.schema.spec.ts` | valid; missing field; wrong type; extra key `url`; URL in `imageId`; `__proto__` (AC-007, AC-008) |
| `test/unit/presentation/controllers/home-image.controller.spec.ts` | `get` 200 with image/`null`; `update` 200; invalid payload → `next(HttpError 400)` without calling the use case; use case error → `next` |
| `test/unit/infra/http/routes/home-image.routes.spec.ts` and `admin-home-image.routes.spec.ts` (pattern of `admin-work.routes.spec.ts`) | GET without auth; PATCH with `authMiddleware` before the handler |
| `test/unit/infra/docs/home-image.swagger.spec.ts` | complete fragment; absence of `publicId` in the schema |

Existing specs to update:

- `test/unit/infra/docs/swaggerSingletonArray.spec.ts`: new paths present;
  `429` on every operation.
- `test/unit/infra/config/routes.spec.ts`: new builders and mounts.
- `test/unit/infra/server.spec.ts`: mock of the new repository and
  `registerRoutes` arguments.
- `test/unit/main/create-indexes.spec.ts`: `MODEL_KEYS`,
  `MODEL_EXPORT_NAMES` and the title "8 modelos" → 9 models.

### E2E

New `test/e2e/home-image.e2e-spec.ts`, following
`admin-work-hard-delete.e2e-spec.ts`:

- setup: `FakeImageStorageAdapter`, `VALID_JPEG_BUFFER`, admin email per
  test;
- `beforeEach`: `HomeImageSettingModel.deleteMany({})` and
  `globalRateLimitMiddleware.resetKey` for the loopback keys.

Scenarios:

- AC-002: GET without configuration → `200 {image:null}`, twice.
- AC-001 and AC-003: valid PATCH → 200; then GET returns url/alt; the
  response does not contain `publicId`.
- AC-004: switch the image; `countDocuments` must be 1.
- AC-005: nonexistent image → 404; the previous configuration remains.
- AC-006: Work in draft → 409; the previous configuration remains.
- AC-007 and AC-008: empty body, wrong type, `{url}` and URL in `imageId` →
  400; nothing changes.
- AC-009: no token, invalid token and revoked session (via
  `AuthSessionModel`/logout) → 401; nothing changes.
- AC-010: `DELETE` of the image → `null`; `DELETE` of the Work → `null`.
- AC-011: `PATCH` of the Work to `draft` → `null`; `softDelete` via
  `MongoWorkRepository` → `null`.
- AC-014: a new `createApp()` returns the same image.
- AC-012: no response body contains `publicId`, `stack` or `_id`.
- AC-015: `GET /docs.json` contains both paths.

New `test/e2e/home-image-rate-limit.e2e-spec.ts` (AC-013):

- 101 unauthenticated PATCHes;
- the last must return `429` with
  `{ message: 'Muitas requisições. Tente novamente em alguns minutos.' }`;
- separate file to isolate the limiter, which keeps per-module state.

The purge path (AC-010) is covered indirectly, because the purge uses the same
`HardDeleteWorkUseCase` and resolution happens at read time. No change to
`purge-expired-works*` is needed.

### Coverage `>= 80%` of new/changed code (`.claude/rules/testing.md`)

Architect's rationale, verbatim (original language):

> Todos os arquivos novos de `src/` têm spec unitária dedicada que exercita
> todos os ramos. Nos arquivos alterados (`server.ts`, `routes.ts`,
> `swaggerSingletonArray.ts`, `create-indexes.ts`, texto de
> `admin-works.swagger.ts`), as linhas mudadas são cobertas pelas specs
> atualizadas. A meta é esperada sem exceção.
>
> Medir com `npm run test:coverage`, cruzando `git diff master` com
> `coverage/lcov.info`, conforme `.claude/rules/testing.md`.

English rendering: every new `src/` file has a dedicated unit spec
exercising all branches. In the modified files (`server.ts`, `routes.ts`,
`swaggerSingletonArray.ts`, `create-indexes.ts`, text of
`admin-works.swagger.ts`), the changed lines are covered by the updated
specs. The target is expected to be met with no exception. Measure with
`npm run test:coverage`, cross-referencing `git diff master` with
`coverage/lcov.info`, per `.claude/rules/testing.md`.

### Validation Commands

1. Specific specs first.
2. `npm run lint:check`
3. `npm test`
4. `npm run build`
5. `npm run test:e2e` (mandatory: new routes and composition).
6. `npm run test:coverage`

## Risks

- If a `draft` Work returns to `published`, the configured image reappears
  on the Home (deterministic, documented; AD-002).
- If a "restore soft delete" is ever introduced, the image would also
  reappear (AD-002).
- A removed `imageId` never returns (UUIDs are not reused).
- Stale configuration is not deleted by the GET; it remains until the next
  PATCH replaces it.
- Dimensions are omitted because the system does not store them (AD-004).
- Concurrency: last PATCH wins (acceptable); first-insert race handled by
  unique index + single retry.
- CARSHOP-160 still needs an eligible-images listing, out of this scope. For
  now it can use `GET /works` (public, lists only published works) to build
  the selection.

## Implementation Steps

1. Domain: create `home-image.types.ts` and
   `home-image-settings.repository.ts` (port).
2. Persistence: create `home-image-setting.model.ts`; add it to
   `src/main/create-indexes.ts`; create
   `mongo-home-image-settings.repository.ts`.
3. Use cases: create `set-home-image.use-case.ts` and
   `get-home-image.use-case.ts`.
4. Presentation: create `set-home-image.schema.ts` and
   `home-image.controller.ts`.
5. Routes and composition: create `home-image.routes.ts` and
   `admin-home-image.routes.ts`; modify `src/infra/config/routes.ts` and
   `src/infra/server.ts`.
6. Documentation: create `home-image.swagger.ts`; modify
   `swaggerSingletonArray.ts`, `admin-works.swagger.ts` (text only) and
   `docs/api-contract.md`.
7. Create/update unit and e2e tests per Testing Strategy.
8. Run the validation commands and measure coverage.

## Definition of Done Mapping

| AC | Plan coverage |
| --- | --- |
| AC-001 | `GetHomeImageUseCase` valid → `HomeImage` (unit); e2e PATCH then GET returns url/alt; dimensions omitted (AD-004) |
| AC-002 | `{ "image": null }` (AD-004); unit + e2e GET twice |
| AC-003 | `SetHomeImageUseCase` success (unit); e2e valid PATCH → 200 then GET |
| AC-004 | Singleton upsert (repository unit); e2e switch + `countDocuments` = 1 |
| AC-005 | 404 without `save` (unit); e2e previous configuration remains |
| AC-006 | 409 without `save` (unit); eligibility function unit; e2e |
| AC-007 | Zod schema unit; e2e empty body / wrong type → 400 |
| AC-008 | Zod pattern + strict keys unit; e2e `{url}` / URL in `imageId` → 400 |
| AC-009 | `authMiddleware` on PATCH (route unit); e2e no token / invalid / revoked → 401 |
| AC-010 | Read-time resolution (AD-002); unit + e2e image DELETE and Work DELETE; purge covered indirectly |
| AC-011 | Eligibility rule (AD-003); unit + e2e PATCH to draft and softDelete → `null` |
| AC-012 | Explicit mapping; no `publicId`/`_id`/`stack` (unit + e2e) |
| AC-013 | Global limiter; `test/e2e/home-image-rate-limit.e2e-spec.ts` |
| AC-014 | Mongo persistence; e2e new `createApp()` returns same image |
| AC-015 | Swagger fragment + `admin-works.swagger.ts` notes + `docs/api-contract.md`; unit docs tests + e2e `/docs.json` |
| AC-016 | No auth/CSRF change; existing suites must pass without weakened assertions |
| AC-017 | Validation commands + coverage measurement (no exception expected) |

## Open Non-Blocking Questions

- Q-001: eligible-images listing — out of scope per coordinator decision;
  CARSHOP-160 may use `GET /works` meanwhile.
- Q-002: fallback image — resolved by AD-004 (`200 { "image": null }`;
  fallback choice belongs to the frontend, CARSHOP-161).
- Q-003: the task has no Due Date defined (from spec; not an architectural
  question).

Blocking questions: none.
