# CARSHOP-8 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-8/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Reintroduce Zod-based `body`/`params`/`query` validation at the HTTP
boundary for the plain Express stack (post-NestJS-removal), reusing
existing partial infrastructure (`validateWithSchema` +
`src/infra/presentation/validators/`), so that FR-001 through FR-008 and
AC-001 through AC-007 (`specs/CARSHOP-8/spec.md`) are satisfied without
introducing a parallel/duplicated validation mechanism.

## Current Architecture

Route inventory produced from `src/infra/http/routes/*.routes.ts`:

| Route | Method | body | params | query | Current validation |
|---|---|---|---|---|---|
| /works | GET | — | — | includeDrafts | Manual (`=== 'true'`), tolerant |
| /works | POST | slug/title/description/category/tags/status | — | — | Manual `typeof` check in controller (non-Zod) |
| /works/:workId/comments | POST | authorName/content | workId | — | Zod (`createCommentSchema`, NO `.strict()`) + `requireStringRouteParam` |
| /works/:workId/comments | GET | — | workId | — | `requireStringRouteParam` |
| /works/:slug | GET | — | slug | — | `requireStringRouteParam` |
| /admin/comments/:commentId/approve | PATCH | — | commentId | — | `requireStringRouteParam` |
| /admin/comments/:commentId | PATCH | authorName/content/status | commentId | — | Zod (`updateCommentSchema`, already `.strict()`) + `requireStringRouteParam` |
| /admin/comments/:commentId | DELETE | — | commentId | — | `requireStringRouteParam` |
| /admin/works/:workId/images | POST | alt/isCover (multipart) + file | workId | — | Manual `typeof`/`=== 'true'` in controller |
| /admin/works/:workId/images/:imageId | DELETE | — | workId/imageId | — | `requireStringRouteParam` x2 |
| /admin/works/:workId | DELETE | — | workId | — | `requireStringRouteParam` |
| /auth/login | POST | email/password | — | — | Custom `validateLoginPayload` (non-Zod) |
| /auth/refresh | POST | — (cookies/header) | — | — | N/A |
| /auth/logout | POST | — (cookies/header) | — | — | N/A |
| /auth/session | GET | — | — | — | N/A |

## Proposed Solution

Reuse `validateWithSchema` (called inline inside the controller's
try/catch), following the existing pattern already used in
`comment.controller.ts` and `admin-comment.controller.ts`. Do **not**
create a new generic Express validation middleware — that would itself
introduce the parallel validation mechanism NFR-004 warns against.

Definitive "relevant" endpoint set (rule: every endpoint accepting
`body` needs an explicit Zod schema per FR-001's literal wording; for
`params`, the existing `requireStringRouteParam` helper already counts
as FR-002's "explicit equivalent validation", so routes already using it
do not need to migrate to Zod):

Endpoints requiring a new/fixed Zod schema (in scope):

1. `POST /works` — new schema (`createWorkSchema`); today only manual
   type checking.
2. `POST /works/:workId/comments` — reuse `createCommentSchema`, ADD
   `.strict()` (currently silently drops unknown properties — violates
   FR-005).
3. `PATCH /admin/comments/:commentId` — `updateCommentSchema` already
   compliant (`.strict()` present); NO change.
4. `POST /admin/works/:workId/images` — new schema
   (`uploadWorkImageBodySchema`) for multipart text fields (`alt`,
   `isCover`), replacing manual `typeof`/`=== 'true'` checks in the
   controller.
5. `POST /auth/login` — migrate `validateLoginPayload` to a Zod schema
   (`loginSchema`); the only remaining body endpoint without Zod.

Explicitly OUT of the relevant set (documented, not a silent gap):

- `GET /works` (`query.includeDrafts`): value only compared to
  `=== 'true'` in `require-auth-for-drafts.middleware.ts` and the
  controller; never feeds persistence or is trusted as a type without
  checking. Any non-`'true'` value is already safely treated as
  "public". Adding Zod here would require reordering validation before
  the conditional auth middleware (new coupling) and would change
  today's tolerated behavior (`?includeDrafts=xyz` responds 200 today,
  would become 400) with no real security gain.
- `GET /works/:slug`, `GET /works/:workId/comments`,
  `PATCH /admin/comments/:commentId/approve`,
  `DELETE /admin/comments/:commentId`,
  `DELETE /admin/works/:workId/images/:imageId`,
  `DELETE /admin/works/:workId`: params-only, already covered by
  `requireStringRouteParam` (explicit equivalent validation, allowed by
  FR-002). No change.
- `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/session`: no
  relevant body/params/query (rely on cookies/headers); out of scope,
  and changing their behavior is explicitly forbidden by the spec's Out
  of Scope section (auth/session/CSRF behavior).

## Technical Decisions

### Decision

Reuse `validateWithSchema` called inline inside controllers; do not
introduce a new generic Express validation middleware.

### Reason

The Obsidian pattern about isolated middlewares
(`post-multer-content-validation-middleware.md`) was established for a
different concern (binary image-content inspection after Multer, no
JSON "schema" involved). The pattern actually used today for JSON body
shape validation is inline `validateWithSchema(schema, request.body)`
inside the controller's try/catch (seen in `comment.controller.ts`,
`admin-comment.controller.ts`). `validateWithSchema` is already
generic/reusable (accepts any `ZodType`) — FR-007 is already satisfied
by it; what's missing is using it in the 5 endpoints listed, not a new
middleware factory.

### Alternatives Considered

- New generic Express validation middleware wrapping Zod schemas per
  route: rejected — would be the "parallel validation mechanism" that
  NFR-004/Risks explicitly warns against, and would duplicate an
  already-generic helper.

### Trade-offs

Keeping validation inline in controllers means controllers retain a
try/catch validation call, but this is consistent with the existing,
already-tested pattern and avoids introducing a second abstraction for
the same concern.

### Decision

Apply Zod's `.strict()` uniformly across all 5 schemas in the relevant
set (new schemas + `comment.schema.ts`'s fix), rejecting unknown
properties rather than silently stripping them.

### Reason

Zod's default behavior silently strips unknown keys rather than
rejecting — this is why `createCommentSchema` currently violates
FR-005. No documented Swagger contract was found that depends on
silently accepting extra fields, so FR-005's exception clause doesn't
apply to any case found. Validated against existing tests
(`comment.controller.spec.ts`) — none send extra fields, so adding
`.strict()` to `createCommentSchema` doesn't break AC-007.

### Alternatives Considered

- Apply `.strict()` only to newly created schemas, leaving
  `createCommentSchema` as-is: rejected — would leave FR-005 unsatisfied
  for an existing "relevant" endpoint (`POST /works/:workId/comments`).

### Trade-offs

None material; strict rejection of unknown properties on
`POST /works/:workId/comments` is a behavior change for any caller
sending extra fields today, but no such usage is present in tests or
documented contracts.

### Decision

`createWorkSchema` validates only shape/type (`z.string()` for
slug/title/description/category, no business-rule for
emptiness/duplication); `tags: z.array(z.string()).optional().default([])`;
`status: z.enum(['draft','published']).optional().default('draft')`.

### Reason

"Non-empty after trim" checks for slug/title/description/category are
already `CreateWorkUseCase`'s responsibility (specific tested messages,
e.g. "Slug é obrigatório."). Per `usecases.md`, business rules belong in
the use case; duplicating them in the Zod schema would risk divergence.
This preserves exactly today's tested behavior
(`work.controller.spec.ts`: "uses empty tags and draft status when
absent").

### Alternatives Considered

- Encode emptiness/business validation directly in the Zod schema:
  rejected — duplicates and risks diverging from the use case's already
  tested business rule.

### Trade-offs

A non-array `tags` value, which is silently coerced to `[]` today, will
now be rejected with 400 (see Risks below) — an intentional, documented
contract tightening, not an accidental regression.

### Decision

`uploadWorkImageBodySchema` keeps `alt` OPTIONAL (default `''`, no
`minLength`), and `isCover` remains tolerant
(`z.string().optional()`, any non-`'true'` value treated as false).

### Reason

The current Swagger (`admin-works.swagger.ts`) documents `alt` as
required (`required: ['file','alt']`, `minLength: 2`), but the real code
treats `alt` as optional. This is a pre-existing Swagger/code
divergence. To avoid an FR-008 regression for today-valid requests, the
schema must match the real code behavior; the Swagger is fixed instead
(see Files to Modify).

### Alternatives Considered

- Make `alt` required in the schema to match the (incorrect) Swagger
  doc: rejected — would reject requests that are valid under today's
  actual code behavior, violating FR-008 (no regression for
  already-conformant requests).

### Trade-offs

None; this decision is a pure alignment of documentation to actual
behavior, per the architect's explicit direction to fix the Swagger
rather than the code/schema.

### Decision

Migrate `POST /auth/login` from `validateLoginPayload` to a Zod
`loginSchema`, reusing the same existing ReDoS-safe email regex.

### Reason

`validateLoginPayload` is the only remaining body-accepting endpoint
without Zod. Reusing the existing regex avoids duplicating/diverging
security-sensitive email-validation logic. Compatible with NFR-003
(only requires preserving the `{message, details}` format, not exact
text) and with the current Swagger for `/auth/login` (400: generic
"Body inválido", no exact-message example) — no Swagger change needed
for login's 400 shape.

### Alternatives Considered

- Keep `validateLoginPayload` alongside new Zod schemas elsewhere:
  rejected — would leave one body endpoint without Zod, contrary to
  FR-001's uniform application across the relevant set, and would keep
  two different validation mechanisms live simultaneously.

### Trade-offs

Error messages for login validation failures change from specific
("Email inválido.", "Senha obrigatória.") to generic "Payload inválido."
plus Zod-flattened details — acceptable per NFR-003's format-only
compatibility requirement.

## Execution Flow

1. Create the three new Zod schema files.
2. Add `.strict()` to `comment.schema.ts`.
3. Update the four controllers to call `validateWithSchema` with the
   corresponding schema instead of manual checks.
4. Remove `login.validator.ts` and its spec, replacing usage with
   `loginSchema`.
5. Update Swagger fragments (`works.swagger.ts`, `admin-works.swagger.ts`).
6. Update/create the corresponding unit tests (tester phase).
7. Run `npm run test:e2e` for login, works, comments, admin-works flows.

## Files

### Files to Create

- `src/infra/presentation/validators/create-work.schema.ts`
- `src/infra/presentation/validators/upload-work-image-body.schema.ts`
- `src/infra/presentation/validators/login.schema.ts`

### Files to Modify

- `src/infra/presentation/validators/comment.schema.ts` — add `.strict()`
- `src/presentation/controllers/work.controller.ts` — replace manual
  check with `validateWithSchema(createWorkSchema, request.body)`
- `src/presentation/controllers/work-image.controller.ts` — replace
  manual `alt`/`isCover` extraction with
  `validateWithSchema(uploadWorkImageBodySchema, request.body)`; `workId`
  may switch to `requireStringRouteParam` (optional standardization, low
  risk)
- `src/presentation/controllers/auth.controller.ts` — replace
  `validateLoginPayload(request.body)` with
  `validateWithSchema(loginSchema, request.body)`
- `src/presentation/helpers/login.validator.ts` — REMOVE (logic migrated
  to `login.schema.ts`, reusing the same ReDoS-safe email regex)
- `src/infra/docs/works.swagger.ts` — ADD the `POST /works` operation
  (currently entirely absent from Swagger despite the route existing and
  being mutating) with `CreateWorkRequest`, responses 201/400/401/409,
  `security: bearerSecurity`
- `src/infra/docs/admin-works.swagger.ts` — fix `alt` from required to
  optional and remove `minLength` (align doc to real behavior)

Note (tests, mapped for the tester's reference, not decided here):

- `test/unit/infra/presentation/validators/create-work.schema.spec.ts` (new)
- `test/unit/infra/presentation/validators/upload-work-image-body.schema.spec.ts` (new)
- `test/unit/infra/presentation/validators/login.schema.spec.ts` (new,
  replaces `test/unit/presentation/helpers/login.validator.spec.ts`,
  which must be REMOVED along with the production file)
- `test/unit/infra/presentation/validators/comment.schema.spec.ts`
  (update/create, covering unknown-property rejection)
- `test/unit/presentation/controllers/work.controller.spec.ts` — adjust
  400 scenario, add an unknown-property case
- `test/unit/presentation/controllers/work-image.controller.spec.ts` —
  adjust for new validation path
- `test/unit/presentation/controllers/auth.controller.spec.ts` — adjust
  for new `loginSchema`
- Relevant `test/e2e/*.e2e-spec.ts` (login, works, comments, admin-works)

## Contract Impact

- `POST /works`: previously untyped/manually-checked body now validated
  by `createWorkSchema`. A non-array `tags` value, silently coerced to
  `[]` today, will be rejected with 400 (intentional, documented
  tightening — see Risks). `POST /works` gains Swagger documentation for
  the first time.
- `POST /works/:workId/comments`: unknown body properties now rejected
  (400) instead of silently stripped.
- `POST /admin/works/:workId/images`: body validation logic moves from
  manual controller checks to `uploadWorkImageBodySchema`, preserving
  today's actual (optional `alt`, tolerant `isCover`) behavior; no
  behavior change for currently-valid requests.
- `POST /auth/login`: 400 error message text changes from specific
  field-level messages to generic "Payload inválido." plus Zod-flattened
  details; the `{message, details}` shape and status code are unchanged
  (NFR-003 preserved).
- `admin-works.swagger.ts`: `alt` documented as optional, `minLength`
  removed, aligning the doc to actual code behavior (no code behavior
  change).
- No change to `GET /works`, `GET /works/:slug`,
  `GET /works/:workId/comments`,
  `PATCH /admin/comments/:commentId/approve`,
  `DELETE /admin/comments/:commentId`,
  `DELETE /admin/works/:workId/images/:imageId`,
  `DELETE /admin/works/:workId`, `PATCH /admin/comments/:commentId`,
  `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/session`.

## Persistence Impact

None. No Mongoose schema, model, or repository change. All changes are
confined to the presentation/infrastructure validation boundary; use
cases (`CreateWorkUseCase`, `UploadWorkImageUseCase`, `AuthService`)
keep receiving plain domain types via constructor injection, with no
Express/Zod knowledge (NFR-002 preserved).

## Security Impact

- `POST /auth/login` (authentication) validation logic changes from a
  custom validator to `loginSchema`, reusing the existing ReDoS-safe
  email regex — no new regex/security logic introduced.
- No change to CSRF protection, cookies, rate limiting, or auth
  middlewares (`csrfProtectionMiddleware`, `authMiddleware`,
  `rate-limit.middleware.ts` untouched).
- Per `.claude/rules/security.md`, the login change requires
  success+rejection tests and a Swagger review — both included in the
  testing/files plan above.
- Standardized 400 mapping already works correctly with no fix needed:
  `validateWithSchema` throws `HttpError(400, 'Payload inválido.', z.flattenError(result.error))`;
  `error-handler.middleware.ts` treats `error instanceof HttpError` as
  the first branch, responding `{ message, details }` with the error's
  status code, no stack trace leak. Confirmed by direct inspection that
  `errorHandlerMiddleware` is registered last (`registerTerminalMiddlewares`,
  called after `registerRoutes` in `src/infra/server.ts`), with the
  4-arg `ErrorRequestHandler` signature preserved — the historical
  arity bug from a prior troubleshooting note is not present in current
  code.

## Swagger Impact

- `src/infra/docs/works.swagger.ts`: add the `POST /works` operation
  (`CreateWorkRequest`, responses 201/400/401/409,
  `security: bearerSecurity`) — currently entirely absent despite the
  route existing and being mutating.
- `src/infra/docs/admin-works.swagger.ts`: fix `alt` from required to
  optional, remove `minLength`, aligning documentation to the real,
  already-tested code behavior.
- `POST /auth/login`'s existing Swagger 400 documentation (generic
  "Body inválido") remains compatible with the new generic
  "Payload inválido." message; no further Swagger change needed for
  login's 400 shape.

## Testing Strategy

All new/changed code is pure schema logic (Zod) or thin controllers
already following the established test pattern (mock use case + fake
Request/Response/next) — 100% unit-testable without I/O, no justified
exception needed. Target: `>= 80%` new/changed-code unit-test coverage
per `.claude/rules/testing.md`.

For each new schema, cover: valid happy path, missing required field,
wrong type, unknown property (`.strict()`).

For changed controllers, cover: 400 with `next(expect.any(HttpError))`
and non-invocation of the use case when invalid (AC-001/002/003),
success with typed data (AC-004), absence of `any`/cast (static review,
AC-006).

Run `npm run test:coverage` and cross-reference `coverage/lcov.info` for
the files listed in Files to Create/Modify, per `.claude/rules/testing.md`'s
normative diff-coverage measurement method (base revision, new-file line
numbering, exclusion of unrelated lines).

Run `npm run test:e2e` for login, works, comments, and admin-works flows,
since routes/middlewares/HTTP contracts are involved, per
`.claude/rules/testing.md`.

No coverage exception is anticipated for this task; if the tester finds
any uncovered line that is technically infeasible, disproportionate, or
not applicable to test (per `.claude/rules/testing.md`'s exception
criteria), it must be documented with: the coverage percentage actually
obtained, the uncovered parts, the stated reason, and the residual risk.

## Risks

- Regression risk on `POST /works`: today a non-array `tags` is silently
  coerced to `[]`; after the schema, it will be rejected with 400. This
  is an intentional fix of a type-trust gap (exactly what the spec asks
  to close), documented here as a conscious, minimal contract change,
  not covered by any documented client relying on the old behavior.
- Login error-message duplication risk: mitigated by reusing the same
  existing ReDoS-safe email regex, not reimplementing email logic.
- Broken-test risk: `login.validator.spec.ts` must be removed together
  with the production file; if the tester doesn't coordinate this
  removal, CI will fail on an orphaned file referencing a deleted
  module — explicitly flagged to developer/tester to remove both
  together.
- Security: the change to `/auth/login` (authentication) requires, per
  `.claude/rules/security.md`, success+rejection tests and Swagger
  review — already covered in the test plan above.
- No change to CSRF, cookies, rate limiting, or auth middlewares.
- Partial/inconsistent adoption risk (spec's own documented risk) is
  mitigated by the definitive relevant-endpoint inventory in this plan's
  "Current Architecture"/"Proposed Solution" sections.

## Implementation Steps

1. Create `create-work.schema.ts`, `upload-work-image-body.schema.ts`,
   `login.schema.ts` under `src/infra/presentation/validators/`.
2. Add `.strict()` to `comment.schema.ts`'s `createCommentSchema`.
3. Update `work.controller.ts` to call `validateWithSchema(createWorkSchema, request.body)`.
4. Update `work-image.controller.ts` to call
   `validateWithSchema(uploadWorkImageBodySchema, request.body)`.
5. Update `auth.controller.ts` to call
   `validateWithSchema(loginSchema, request.body)`.
6. Remove `src/presentation/helpers/login.validator.ts` and its spec.
7. Update `works.swagger.ts` (add `POST /works`) and
   `admin-works.swagger.ts` (fix `alt`).
8. Hand off to `tester` for unit test creation/adjustment per the Files
   section, and `npm run test:e2e` execution.
9. Hand off to `reviewer` for full independent review (architecture,
   persistence, contracts, security).

## Definition of Done Mapping

- FR-001 → `createWorkSchema`, `createCommentSchema` (`.strict()`),
  `uploadWorkImageBodySchema`, `loginSchema` — AC-001, AC-004.
- FR-002 → no change needed; `requireStringRouteParam` already in place
  for all params-bearing relevant routes — AC-002, AC-004.
- FR-003 → `GET /works` `query.includeDrafts` explicitly out of scope
  (documented above) — AC-003, AC-004 not applicable to any in-scope
  query.
- FR-004 → confirmed already correct via `validateWithSchema` +
  `error-handler.middleware.ts` — AC-001, AC-002, AC-003, AC-005.
- FR-005 → `.strict()` applied uniformly across the 5 relevant schemas —
  AC-001.
- FR-006 → Zod-inferred types flow into controllers without `any`/cast —
  AC-004, AC-006.
- FR-007 → reuse of `validateWithSchema` across all 5 endpoints, no new
  middleware — AC-004, AC-007.
- FR-008 → `uploadWorkImageBodySchema` keeps `alt` optional/tolerant;
  login format-only change; `tags` tightening is the one documented,
  intentional exception — AC-004, AC-007.
- NFR-001 → all externally supplied data validated via Zod before use —
  AC-001, AC-002, AC-003.
- NFR-002 → schemas live in `src/infra/presentation/validators/`; no
  use case gains Express/Zod knowledge — AC-006.
- NFR-003 → `{message, details}` format preserved for all 400 responses —
  AC-005.
- NFR-004 → `validateWithSchema` reused, no parallel mechanism
  introduced — AC-007.

## Open Non-Blocking Questions

None. Per the architect's analysis, the spec's non-blocking open
questions (relevant-endpoint set, 400 body shape, uniform `.strict()`
application) were all resolved by direct repository inspection during
this planning phase, with no further product decision required.
