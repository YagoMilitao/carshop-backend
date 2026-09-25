# CARSHOP-156 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-156/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

Gate caveat for the coordinator: from the repository alone, the observed
`400` is caused by the shape of the multipart body forwarded by the frontend
proxy, not by a backend defect. Therefore AC-002 ("replay succeeds") cannot
be met in the backend without violating FR-002/FR-006. This plan fixes the
real backend defects in error classification (FR-005, AC-007, AC-008,
AC-011), pins the canonical request shape in tests, and documents the cause
(AC-010). The tester must report AC-002 as
`NOT SATISFIABLE IN THIS REPOSITORY` (FR-006), a scenario foreseen in the
spec's "Risks". A frontend follow-up is recommended (Q-002 = yes).

## Existing Knowledge (Obsidian)

None. `knowledge-reader` returned `BLOCKED` (Obsidian not running). Prior
specs CARSHOP-81, CARSHOP-109, CARSHOP-111 and CARSHOP-127 agree with the
current code. The mapping "other `MulterError` → generic `400`" came from
CARSHOP-81 (`specs/CARSHOP-81/plan.md:413`).

## Objective

- Identify why a valid ~115 KB upload via the frontend proxy returns `400`
  `{"message":"Falha ao processar o upload da imagem."}`.
- Fix at the source; if the source is outside this repository, report it
  without masking it.
- Make real upload failures return specific, non-sensitive messages.
- Preserve limits, MIME types, the `file` field, `alt`/`isCover`, and
  auth/CSRF.

## Current Architecture

### Confirmed flow

`src/infra/http/routes/work-image.routes.ts:96-103`:

```text
authMiddleware
    ↓
uploadMiddleware.single('file')
    ↓
imageContentValidationMiddleware
    ↓
normalizeUploadError (4-arg error handler)
    ↓
controller.upload
    ↓
UploadWorkImageUseCase
    ↓
ImageStoragePort (Cloudinary) + WorkRepositoryPort
```

- Mounted at `/admin/works` (`src/infra/config/routes.ts`), composed in
  `src/infra/server.ts`.
- `multer` 2.3.0 (`package.json:43` `^2.2.0`), `busboy` 1.6.
- Global middleware (`src/infra/config/middleware.ts:43-55`): helmet, cors,
  global rate limit, `express.json` (only `application/json`) — none of them
  consume multipart.

### Root cause analysis

Sole origin of the message: `work-image.routes.ts:46-52`, reached only when
`error instanceof multer.MulterError && code !== 'LIMIT_FILE_SIZE'`.

Proven NOT to produce this `400`:

- Storage/Cloudinary failure → `500` "Erro interno no servidor."
  (`upload-work-image.use-case.ts:43-48`, `cloudinary-storage.service.ts:76-78`;
  occurs after `normalizeUploadError`; central handler
  `error-handler.middleware.ts:53-57`; confirmed by
  `test/e2e/security-error-leakage.e2e-spec.ts:161-193`).
- Truncated body / boundary mismatch / malformed part header / missing
  boundary → `415` "Tipo de arquivo não suportado" (plain busboy `Error`s,
  `busboy/lib/types/multipart.js:588,605,612`;
  `multer/lib/make-middleware.js:196-205`; fall into
  `work-image.routes.ts:56-64`). This is a masking defect, but not the
  observed `400`.
- Disallowed MIME → `415` (`fileFilter`, `upload.middleware.ts:49-57`).
- `> 5 MB` → `413` (`work-image.routes.ts:47-49`).
- No Bearer / revoked session → `401` (`auth.middleware.ts:44-58`).
- No file or non-multipart `Content-Type` → `400` "Imagem é obrigatória."
  (`make-middleware.js:68`, `work-image.controller.ts:41-43`).
- Extra text fields → `400` "Payload inválido." (Zod `.strict()`:
  `upload-work-image-body.schema.ts:20`, `zod-validation.helper.ts:18`).
- `refresh_token`/`csrf_token` cookies and `X-CSRF-Token` header → ignored
  by the upload flow.

Reachable `MulterError` codes with the current config
(`limits { files: 1, fileSize }`; no `fields`/`parts`/`fieldSize`/
`fieldNameSize`; busboy defaults `multipart.js:251-265`):

- `LIMIT_UNEXPECTED_FILE` (`multer/index.js:39-41`; `single` → `maxCount 1`,
  `index.js:61-63`): a file part whose name is not `file` (`image`,
  `images`, `files`, `file[]`), or an extra differently-named file part
  before the image. A "file part" is any part with a `filename` or with
  `Content-Type: application/octet-stream` even without `filename`
  (`multipart.js:337`), including a Blob appended as a text field.
- `LIMIT_FILE_COUNT` (`make-middleware.js:346`, `multipart.js:340-346`):
  more than one file part, e.g. the file appended twice, or an empty
  `<input type=file>` serialized by `new FormData(form)` as
  `application/octet-stream` without `filename` (counted by busboy although
  discarded by multer, `make-middleware.js:268`), so the real image arrives
  second.
- `MISSING_FIELD_NAME` (`make-middleware.js:211,265`): part without `name`
  in `Content-Disposition`; unlikely with `FormData`.
- `STREAM_DESTROYED` (`multer/storage/disk.js:44`): client aborts mid-file.
- Impossible here: `LIMIT_FIELD_VALUE` (needs a > 1 MB field; body is
  ~115 KB); `LIMIT_PART_COUNT`, `LIMIT_FIELD_COUNT`, `LIMIT_FIELD_KEY`
  (unconfigured → `Infinity`); `LIMIT_FIELD_NESTING`,
  `LIMIT_FIELD_ARRAY_INDEX` (unconfigured); `INVALID_FIELD_NAME`
  (`append-field` does not throw).

### Conclusion (AC-010 / FR-006)

The proxied multipart contains a file part not named `file` (H1, most
likely) or more than one file part (H2). The equivalent direct request with
`file` → `201` in `test/e2e/work-image-upload.e2e-spec.ts:174-199`.

- Proven: the backend does not convert a storage failure into `400`; the
  `400` comes only from `MulterError`; the observed headers/cookies do not
  affect the upload.
- Not proven: which of H1/H2 — this requires capturing the forwarded
  request or reading the proxy code (other repository).
- Accepting another field name or removing `files: 1` would mask the
  frontend defect and violate FR-002, FR-006 and NFR-003 — DO NOT DO.

### Real backend defects fixed by this plan

1. All non-size `MulterError`s collapse into the same generic message —
   violates FR-005/AC-007.
2. busboy multipart parse errors surface as `415` "unsupported type",
   hiding the real cause (what a proxy with a wrong boundary/truncated body
   gets today).
3. `normalizeUploadError` is a route error handler, so it also intercepts
   non-`HttpError` errors from `authMiddleware` (e.g. session store failure)
   and `imageContentValidationMiddleware` (`fs.readFile` failure,
   `image-content-validation.middleware.ts:757-759`) and rewrites them as
   `415`.
4. Storage provider failure becomes a generic `500` "Erro interno no
   servidor." with no category — violates AC-007.

## Proposed Solution

Replace the route-level error handler with a wrapper scoped to the Multer
middleware that translates only errors produced by Multer/busboy into
specific, fixed, non-sensitive messages (D1, D3); introduce a dedicated
invalid-type error class (D2); make storage-provider failure return `502`
with a fixed message (D4); leave every other control unchanged (D5).

## Technical Decisions

### D1 — Error translation scoped to Multer

#### Decision

Replace the `normalizeUploadError` error handler with a `RequestHandler`
wrapper around `uploadMiddleware.single('file')`, which invokes the multer
handler with its own callback and translates only the errors it produces.

#### Reason

It is the only reliable way to distinguish busboy errors (`400`) from server
errors (`500`) from authentication or content validation.

#### Alternatives Considered

Keeping the route-level 4-arg error handler (current approach), which
intercepts errors from `authMiddleware` and
`imageContentValidationMiddleware` as well.

#### Trade-offs

Changes the `router.post` signature and the route test; not a new pattern,
just local composition.

### D2 — Dedicated invalid-type error

#### Decision

In `upload.middleware.ts`, export
`class UnsupportedImageTypeError extends Error` (explicit `name`).
`fileFilter` rejects with it, keeping the current internal message
"Formato inválido. Envie uma imagem JPEG, PNG ou WebP.". The translator maps
`instanceof UnsupportedImageTypeError` → `415` with the same current public
message.

#### Reason

Allows the translator to identify invalid-type rejections without relying
on generic `Error` handling.

#### Alternatives Considered

Not stated by the architect beyond the current generic-`Error` rejection.

#### Trade-offs

`upload.middleware.ts` still does not import `HttpError`;
`test/unit/infra/middleware/upload.middleware.spec.ts:152-176` stays valid.

### D3 — Translation table

#### Decision

Exported pure function `translateUploadError(error: unknown): unknown`. All
responses are `{ message }`, with no details:

| Input | Result |
| --- | --- |
| `HttpError` | unchanged (pass through) |
| `UnsupportedImageTypeError` | `415` "Tipo de arquivo não suportado. Envie JPEG, PNG ou WebP." (unchanged) |
| `LIMIT_FILE_SIZE` | `413` "A imagem ultrapassa o limite de 5 MB." (unchanged) |
| `LIMIT_UNEXPECTED_FILE` | `400` 'Campo de arquivo inesperado. Envie a imagem no campo "file".' |
| `LIMIT_FILE_COUNT` | `400` "Envie apenas uma imagem por requisição." |
| `LIMIT_FIELD_KEY`, `LIMIT_FIELD_VALUE`, `LIMIT_FIELD_COUNT`, `LIMIT_PART_COUNT`, `LIMIT_FIELD_NESTING`, `LIMIT_FIELD_ARRAY_INDEX` | `400` "Os campos do formulário excedem os limites permitidos." |
| `MISSING_FIELD_NAME`, `INVALID_FIELD_NAME`, `STREAM_DESTROYED`, any other `MulterError` code | `400` "Corpo multipart malformado. Verifique o formato da requisição." |
| System `Error` (numeric `errno` or string `syscall`, e.g. write failure in `tmp/uploads`) | pass through unchanged → central handler `500` "Erro interno no servidor." |
| Other `Error` (busboy "Unexpected end of form", "Malformed part header", "Multipart: Boundary not found"; "Request aborted"/"Request closed") | `400` "Corpo multipart malformado. Verifique o formato da requisição." |
| Non-`Error` value | pass through to central handler |

#### Reason

Satisfies FR-005/AC-007 (distinct categories) and NFR-002/AC-008 (fixed
messages).

#### Alternatives Considered

The current single generic message for all non-size `MulterError`s.

#### Trade-offs

Security rules: never echo `error.field` or busboy/multer `error.message`
(NFR-002). The generic message "Falha ao processar o upload da imagem." no
longer exists. The `errno`/`syscall` classification is heuristic (see
Risks).

### D4 — Q-001: storage provider failure → `502`

#### Decision

`UploadWorkImageUseCase` wraps only `this.imageStorage.upload(...)` in
`try/catch`; in the `catch`:
`console.error('Falha no upload da imagem para o storage externo.', error)`
(log only) and
`throw new HttpError(502, 'Falha ao enviar a imagem para o armazenamento externo. Tente novamente.')`.

Unchanged: `404`, persistence `500` with compensation (lines 50-83),
temp-file cleanup `finally`, generic `500` on `fs.readFile` failure.
`cloudinary-storage.service.ts` unchanged; the provider `error.message` only
goes to logs.

#### Reason

Precedent: `src/usecase/hard-delete-work.use-case.ts:46-68` and `502`
documented at `src/infra/docs/admin-works.swagger.ts:414-417`.

#### Alternatives Considered

Keeping the current generic `500` "Erro interno no servidor." (no category,
violates AC-007).

#### Trade-offs

Contract change (`500` → `502`) requires Swagger and tests (AC-011).

### D5 — No change to other controls

#### Decision

No change to limits, MIME types, `files: 1`, binary content validation,
auth/CSRF, CORS, Zod schema, controller, or persistence.

#### Reason

Required by FR-002, FR-003, FR-006, NFR-001 and NFR-003.

#### Alternatives Considered

Accepting other field names or removing `files: 1` — rejected because it
would mask the frontend defect.

#### Trade-offs

AC-002 cannot be satisfied in this repository (see Architect Verdict).

## Execution Flow

```text
authMiddleware
    ↓
withUploadErrorTranslation(uploadMiddleware.single('file'))
    ↓   (on Multer/busboy error → next(translateUploadError(error)))
imageContentValidationMiddleware
    ↓
controller.upload
    ↓
UploadWorkImageUseCase
    ├── imageStorage.upload(...) — failure → HttpError 502 (D4)
    └── WorkRepositoryPort (unchanged, incl. compensation on 500)
```

## Files

### Files to Create

None.

### Files to Modify

1. `src/infra/middleware/upload.middleware.ts` — add/export
   `UnsupportedImageTypeError`; `fileFilter` uses it; no change to limits,
   MIME types, `dest`, or internal message.
2. `src/infra/http/routes/work-image.routes.ts` — remove
   `normalizeUploadError`; add/export `translateUploadError` (D3); add
   internal `withUploadErrorTranslation(handler: RequestHandler): RequestHandler`
   calling
   `handler(request, response, (error?: unknown) => error ? next(translateUploadError(error)) : next())`;
   route:
   `router.post('/:workId/images', authMiddleware, withUploadErrorTranslation(uploadMiddleware.single('file')), imageContentValidationMiddleware, controller.upload)`;
   update the module comment; DELETE route unchanged; use `unknown` and type
   guards, no `any`/unsafe casts; system-error guard via `'errno' in error` /
   `'syscall' in error` with validated types.
3. `src/usecase/upload-work-image.use-case.ts` — D4.
4. `src/infra/docs/admin-works.swagger.ts` (post block of
   `/admin/works/{workId}/images`, lines 134-256):
   - `400` description lists categories: missing file; unexpected file field
     — image must be in `file`; more than one image; fields over limit;
     malformed multipart; invalid payload; `alt` > 160;
   - add `'502': errorResponse('Falha ao enviar a imagem para o armazenamento externo.')`;
   - `500` description → "Falha inesperada ao ler o arquivo temporário ou ao
     persistir os metadados da imagem.";
   - optionally add to "Regras do upload" that the multipart body must
     contain a single file part;
   - reuse `errorResponse`, no new schema.

Test files to modify are listed under Testing Strategy.

### Unchanged

Controller, Zod schema, `error-handler.middleware.ts`, `server.ts`,
`routes.ts`, Cloudinary adapter, models, ports, ambient `Request.auth`
declarations.

## Contract Impact

- Request unchanged (multipart, `file`, `alt`, `isCover`).
- `201`/`401`/`404`/`413`/`415`/`429` unchanged.
- `400`: same status, specific messages per category; generic message
  removed.
- New `502` for storage provider failure (previously `500`).
- Collateral: multipart parse errors `415` → `400`; server errors from
  auth/content validation/disk `415` → `500`.

## Persistence Impact

No model or index changes. Persistence `500` with compensation is unchanged.

## Security Impact

- NFR-002: fixed messages; nothing echoes client input or provider text;
  the server log still receives the original storage error.
- NFR-003: no control removed (`files: 1`, `fileSize`, MIME allowlist,
  content validation, temp cleanup; multer cleans partial files on abort,
  `make-middleware.js:141-168`).
- Auth/CSRF: `authMiddleware` still runs before multer; refresh/logout
  untouched (AC-009).

## Swagger Impact

`src/infra/docs/admin-works.swagger.ts`, post operation of
`/admin/works/{workId}/images`: updated `400` description (categories), new
`502`, updated `500` description, optional single-file-part rule; reuse
`errorResponse`. Covered by a docs test (AC-011).

## Testing Strategy

### Unit

- `test/unit/infra/http/routes/work-image.routes.spec.ts` (rewrite the
  errors part):
  - mock of `single` returns a function; adjust the expected `router.post`
    signature (4 handlers + controller);
  - test `translateUploadError` directly with real
    `new multer.MulterError(code)` for every D3 row (AC-007);
  - `UnsupportedImageTypeError` → `415`;
    `Error('Unexpected end of form')` → `400` malformed;
    `errno`/`syscall` error → passed through identical; `HttpError` →
    passed through identical; non-`Error` → passed through;
  - assertions that messages contain no field name or internal text
    (AC-008);
  - wrapper: no error calls `next()`, error calls `next(translated)`;
  - regression that fails without the fix: `LIMIT_UNEXPECTED_FILE` and
    `LIMIT_FILE_COUNT` produce messages distinct from each other and
    different from "Falha ao processar o upload da imagem.".
- `test/unit/infra/middleware/upload.middleware.spec.ts`: existing tests
  stay; add `fileFilter` error `instanceof UnsupportedImageTypeError`; add
  two `file` parts → `LIMIT_FILE_COUNT`.
- `test/unit/usecase/upload-work-image.use-case.spec.ts`: update the case at
  lines 140-154: storage failure rejects with `HttpError` `502` and the
  fixed message, not exposing "cloudinary offline", no `addImage`, `unlink`
  called. Other cases (`404`, persistence `500` with compensation,
  `readFile` failure) remain.

### E2E

- `test/e2e/work-image-upload.e2e-spec.ts`:
  - AC-001/AC-002 canonical proxy shape: multipart with
    `Authorization: Bearer`, `refresh_token`/`csrf_token` cookies from
    login, `X-CSRF-Token` header, valid ~115 KB JPEG in `file`, with `alt`
    and `isCover=true` → `201` and image associated with the work (JPEG
    inflated by inserting COM segments `0xFFFE` ≤ 65533 bytes each right
    after SOI of `VALID_JPEG_BUFFER`, still passing `detectImageMimeType`);
    also covers AC-003 with and without optional fields.
  - AC-007: file in `image` → `400` unexpected-field message; two file
    parts → `400` "apenas uma imagem"; truncated multipart (raw body with
    boundary and no terminator via
    `.set('Content-Type', 'multipart/form-data; boundary=X').send(rawBody)`)
    → `400` malformed (was `415`). In all, storage is not called.
  - Respect the login budget (existing token cache).
  - Existing tests cover AC-004 (`415`), AC-005 (`413` in
    security-error-leakage), AC-006 (`401`, revoked session), and missing
    file (`400`).
- `test/e2e/security-error-leakage.e2e-spec.ts:161-193`: update the storage
  scenario to `.expect(502)` and body
  `{ message: 'Falha ao enviar a imagem para o armazenamento externo. Tente novamente.' }`
  (AC-007/AC-008), keep `assertNoLeakage`. Optional: `assertNoLeakage` on a
  malformed `400`.
- AC-009: run the existing refresh/logout CSRF auth e2e suites; nothing
  changes.

### Swagger (AC-011)

Test in `test/unit/infra/docs/admin-works.swagger.spec.ts` that the post
operation of `/admin/works/{workId}/images` documents `400`, `413`, `415`,
`500` and `502`.

### Commands (AC-012)

Most specific test first, then `npm run lint:check`, `npm test`,
`npm run build`, `npm run test:e2e` (route and HTTP contract change),
`npm run test:coverage`.

### Coverage `>= 80%` (`.claude/rules/testing.md`)

New/changed code in `work-image.routes.ts` (translator + wrapper),
`upload.middleware.ts` (class + `fileFilter`), `upload-work-image.use-case.ts`
(try/catch); small/pure functions with unit tests covering all D3 rows and
the catch; expected near 100% of changed lines; Swagger fragment is
declarative data covered by the docs test; no exception expected; measure
via lcov and `git diff master` per the rule.

## Risks

- Clients depending on `415` for a malformed body or `500` for storage now
  get `400`/`502` — unlikely; the frontend should handle `502` (part of the
  frontend follow-up).
- The `errno`/`syscall` classification is heuristic; a server error without
  these properties coming from multer would become `400` malformed; small
  surface (disk storage only does `fs`).
- NFR-002 / NFR-003 / auth-CSRF: see Security Impact.
- Gate: AC-002 cannot be met in the backend; the coordinator decides at the
  quality gate; do not change the spec.

## Implementation Steps

1. `src/infra/middleware/upload.middleware.ts`: add/export
   `UnsupportedImageTypeError`; use it in `fileFilter` (D2).
2. `src/infra/http/routes/work-image.routes.ts`: remove
   `normalizeUploadError`; add `translateUploadError` (D3) and
   `withUploadErrorTranslation` (D1); update the POST route composition and
   module comment.
3. `src/usecase/upload-work-image.use-case.ts`: wrap
   `imageStorage.upload(...)` with the `502` translation and log (D4).
4. `src/infra/docs/admin-works.swagger.ts`: update `400`/`500`
   descriptions, add `502`.
5. Update/add unit, e2e and Swagger tests per Testing Strategy.
6. Run the commands listed under AC-012 and measure coverage.

## Definition of Done Mapping

| AC | Plan coverage |
| --- | --- |
| AC-001 | E2E canonical proxy-shape upload → `201` |
| AC-002 | NOT SATISFIABLE IN THIS REPOSITORY (FR-006); canonical shape pinned in e2e; coordinator decides at quality gate |
| AC-003 | E2E with and without `alt`/`isCover` |
| AC-004 | Existing `415` tests; D2 preserves message |
| AC-005 | Existing `413` test (security-error-leakage) |
| AC-006 | Existing `401` / revoked-session tests |
| AC-007 | D3 + D4; unit translator tests and e2e category tests |
| AC-008 | Fixed messages; no-leakage assertions (unit + e2e) |
| AC-009 | Existing refresh/logout CSRF e2e suites |
| AC-010 | Root cause documented above (H1/H2 in frontend proxy) |
| AC-011 | Swagger `400`/`500`/`502` updates + docs test |
| AC-012 | lint:check, `npm test`, build, `test:e2e`, coverage |

## Open Non-Blocking Questions

- Q-001: decided `502` (D4), consistent with the hard-delete precedent;
  documented contract change with Swagger and tests.
- Q-002: recommend a frontend follow-up to verify that the api-proxy route
  sends exactly one file part with `name="file"`, does not duplicate the
  file nor include empty file inputs or Blobs as text fields, and forwards
  the body and `Content-Type` (boundary) without inconsistent
  reconstruction. After the backend fix, the returned `400` indicates which
  category occurred, helping confirm H1 vs H2.

Blocking questions: none for backend implementation. The AC-002 gate
decision and the frontend follow-up belong to the coordinator and do not
change this plan.
