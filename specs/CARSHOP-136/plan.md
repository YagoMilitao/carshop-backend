# CARSHOP-136 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-136/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Add a new authenticated admin endpoint `GET /admin/comments` that lists
comments for moderation, optionally filtered by `status`
(`PENDING`/`APPROVED`/`HIDDEN`), with deterministic ordering (newest
first) and pagination, returning the same `Comment`/`CommentResponse`
shape already used elsewhere. Maps to spec.md FR-001..FR-011 /
AC-001..AC-011.

## Current Architecture

Relevant existing pieces inspected by the architect:

- `src/core/domain/application/Work/work.types.ts` — `CommentStatus =
  'PENDING' | 'APPROVED'`.
- `src/data/models/comment.model.ts` — Mongoose enum: `['PENDING',
  'APPROVED']`.
- `src/core/domain/repositories/comment.repository.ts` —
  `CommentRepositoryPort` and `UpdateCommentRepositoryInput.status`
  (same two values).
- `src/infra/repositories/mongo-comment.repository.ts` — existing guard
  helpers: `assertStringIdentifier`, `buildSanitizedIdFilter`,
  `buildAllowlistedUpdate`, `isDangerousKey`, `sanitizeFilter`. No write
  path can ever set a comment to `HIDDEN` today (rejected by
  `buildAllowlistedUpdate`).
- `src/usecase/list-works.use-case.ts` and
  `src/presentation/controllers/work.controller.ts#list` — no pagination
  precedent exists anywhere in `src/usecase` or `src/infra/repositories`
  (confirmed via grep: no page/limit/skip/cursor pattern).
- `src/presentation/controllers/admin-comment.controller.ts` and
  `src/infra/http/routes/admin-comment.routes.ts` — existing admin
  comment routes (`PATCH /:commentId/approve`, `PATCH /:commentId`,
  `DELETE /:commentId`), all behind `router.use(authMiddleware)`.
- `src/infra/docs/admin-comments.swagger.ts` /
  `src/infra/docs/comments.swagger.ts` — hand-written OpenAPI fragments
  and merge mechanism.
- `docs/api-contract.md` and `specs/CARSHOP-124/api-contract.md` — living
  vs. versioned historical contract docs.

## Proposed Solution

Add a fully additive `GET /admin/comments` endpoint, authenticated by the
existing `authMiddleware`, backed by a new repository method
`listForModeration`, a thin pass-through use case, a Zod query-param
validator, and a new controller handler. No existing endpoint's contract,
domain types, or write paths are modified.

## Technical Decisions

### Decision A — HIDDEN status scope

**Decision:** Do not extend the domain/persistence write path in this
task. Only the new listing endpoint's query-filter layer accepts
`HIDDEN` as a valid value. Do NOT modify `CommentStatus` in
`work.types.ts`. Introduce a narrower, purpose-built type for the filter
only, scoped to the comment repository port
(`AdminCommentStatusFilter`).

**Reason:**
- Mongoose's schema enum is a write-time validator; it does not restrict
  `find()`/`countDocuments()` filters. Filtering by `status: 'HIDDEN'`
  works today with zero schema changes — it will just correctly return an
  empty list, since no comment can have that status yet.
- AC-005 explicitly conditions correctness on "quando esse status
  existir em comentários persistidos" — does not require making `HIDDEN`
  assignable, only that the filter behaves correctly if/when such data
  exists.
- Extending the write path would change the behavior/contract of
  `PATCH /admin/comments/{commentId}` — protected by NFR-004/AC-011 (no
  existing admin comment endpoint behavior changes) and marked Out of
  Scope. That is a materially separate feature belonging in its own
  task.

**Alternatives Considered:** Extending `CommentStatus` and the Mongoose
enum to include `HIDDEN` so it becomes assignable end-to-end.

**Trade-offs:** The chosen approach keeps this task additive and
contract-safe, but leaves `HIDDEN` filterable-yet-unreachable through any
write path — an intentional, documented residual behavior, not a defect.

### Decision B — Pagination/ordering shape (no precedent found)

**Decision:** Offset pagination via `page`/`limit` query params,
Zod-coerced, with a paginated envelope response (not a bare array):
- Query params: `page` (default 1, min 1), `limit` (default 20, min 1,
  max 100).
- Response: `{ items: CommentResponse[], page, limit, total, totalPages }`.
- Ordering: `sort({ createdAt: -1, _id: -1 })` — `createdAt` primary,
  Mongo `_id` as secondary tiebreaker for full determinism (uuid-based
  domain id is not monotonic).
- AC-002 satisfied by items inside the envelope; developer/tester must
  assert against `body.items`, not a top-level array.

**Reason:** No existing pagination pattern exists in the codebase to
reuse (confirmed by inspection/grep). NFR-002 requires validated query
params; an envelope response makes total/paging metadata explicit for
the admin UI and matches the deterministic-ordering requirement (AC-007).

**Alternatives Considered:** Cursor-based pagination; returning a bare
array with pagination metadata in headers.

**Trade-offs:** Offset pagination is simpler to implement and test given
no existing precedent, but is less efficient for very large collections
than cursor-based pagination — acceptable for this admin moderation
use case's expected data volume.

## Execution Flow

```text
GET /admin/comments?status=&page=&limit=
    ↓
authMiddleware (existing)
    ↓
listAdminCommentsQuerySchema (Zod validation/coercion)
    ↓
AdminCommentController#list
    ↓
ListCommentsForModerationUseCase#execute
    ↓
CommentRepositoryPort#listForModeration
    ↓
MongoCommentRepository#listForModeration
  - assertValidStatusFilter (guard)
  - assertPositiveInteger (guard, page/limit)
  - sanitizeFilter(status ? { status } : {})
  - CommentModel.find(filter).sort({ createdAt: -1, _id: -1 })
      .skip((page-1)*limit).limit(limit).lean()
  - CommentModel.countDocuments(filter) (in parallel)
  - map via existing toComment
    ↓
{ items, page, limit, total, totalPages }
```

## Files

### Files to Create

- `src/usecase/list-comments-for-moderation.use-case.ts` — thin
  pass-through class, constructor-injected `CommentRepositoryPort`,
  `execute(input): Promise<PaginatedComments>`. No extra business rule
  (no `workId` existence check — endpoint is not scoped to a work).
- `src/infra/presentation/validators/list-admin-comments-query.schema.ts`
  ```ts
  export const listAdminCommentsQuerySchema = z
    .object({
      status: z.enum(['PENDING', 'APPROVED', 'HIDDEN']).optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    })
    .strict();
  export type ListAdminCommentsQueryInput = z.infer<typeof listAdminCommentsQuerySchema>;
  ```
  First Zod query-param schema in the project — justified by NFR-002's
  explicit requirement. Do not retrofit `work.controller.ts`.
- `test/unit/usecase/list-comments-for-moderation.use-case.spec.ts` —
  verifies pass-through to the port.
- `test/unit/infra/presentation/validators/list-admin-comments-query.schema.spec.ts`
  — valid status values, invalid status rejected, default page/limit
  applied, coercion from string query values, bounds (limit > 100
  rejected, page < 1 rejected).
- `test/e2e/admin-comment-list.e2e-spec.ts` — covers AC-001 (401 no
  token), AC-002 (200, no filter, envelope shape), AC-003/AC-004
  (status=PENDING/APPROVED filtering), AC-005 (status=HIDDEN → 200,
  empty items), AC-006 (invalid status → 400, no DB side effects),
  AC-007 (repeat request → identical ordering).

### Files to Modify

- `src/core/domain/repositories/comment.repository.ts` — add
  `export type AdminCommentStatusFilter = 'PENDING' | 'APPROVED' | 'HIDDEN';`
  (local to this port file, not merged into `CommentStatus`); add
  `ListCommentsForModerationInput` and `PaginatedComments` interfaces;
  add `listForModeration(input: ListCommentsForModerationInput):
  Promise<PaginatedComments>;` to `CommentRepositoryPort`.
- `src/infra/repositories/mongo-comment.repository.ts` — implement
  `listForModeration` following existing guard-helper style: new
  private guard `assertValidStatusFilter(value: unknown):
  AdminCommentStatusFilter | undefined` (throws `HttpError(400, ...)` if
  defined and not one of PENDING/APPROVED/HIDDEN — defense-in-depth,
  even though Zod already restricts it upstream); new private guard
  `assertPositiveInteger(value: unknown, fieldName: string): number` for
  page/limit; build filter via `sanitizeFilter(status ? { status } :
  {})`; query in parallel with `countDocuments(filter)`; map documents
  via existing `toComment` (no signature change needed); return
  `{ items, page, limit, total, totalPages: Math.max(1,
  Math.ceil(total / limit)) }`.
- `src/presentation/controllers/admin-comment.controller.ts` — add 4th
  constructor param `listCommentsForModerationUseCase:
  ListCommentsForModerationUseCase`; add `list` handler:
  `validateWithSchema(listAdminCommentsQuerySchema, request.query)` →
  `execute(query)` → `response.status(200).json(result)`, same
  try/catch/`next(error)` pattern as existing handlers.
- `src/infra/http/routes/admin-comment.routes.ts` — instantiate
  `ListCommentsForModerationUseCase(commentRepository)`, pass to
  `AdminCommentController`, add `router.get('/', controller.list)`. No
  collision with existing `PATCH '/:commentId/approve'`, `PATCH
  '/:commentId'`, `DELETE '/:commentId'`. `router.use(authMiddleware)`
  already covers it (AC-001/FR-008 satisfied for free).
- `src/infra/docs/admin-comments.swagger.ts` — add schema
  `AdminCommentListResponse` (items array of
  `#/components/schemas/CommentResponse`, `page`, `limit`, `total`,
  `totalPages`); add path `'/admin/comments': { get: { ... } }` with
  `security: bearerSecurity`, query params `status`
  (enum PENDING/APPROVED/HIDDEN), `page`, `limit`; responses 200
  (`AdminCommentListResponse`), 400 (invalid status/pagination), 401,
  429 (`globalRateLimitResponse`) — mirroring existing fragment style.
  Do NOT add `HIDDEN` to the existing `commentsSchemas.CommentResponse.status`
  enum in `comments.swagger.ts`. No merge conflict: `/admin/comments`
  is a new top-level path key.
- `docs/api-contract.md` — add a `### GET /admin/comments` section under
  "## Admin — Comments" (before the PATCH /approve section), documenting
  query params, response envelope shape, and errors; update the
  cross-reference table row for `/admin/comments/*` if needed. Do NOT
  touch `specs/CARSHOP-124/api-contract.md` — versioned historical spec
  artifact; only the living `docs/api-contract.md` should be updated.
- `test/unit/infra/repositories/mongo-comment.repository.spec.ts` —
  extend: mock `CommentModel.find` chainable (sort/skip/limit/lean
  matching existing `listApprovedByWorkId` mocking style), mock
  `CommentModel.countDocuments`. Cases: filter by each of
  PENDING/APPROVED/HIDDEN, no filter, pagination math (totalPages, skip
  offset), guard rejection for invalid status/non-positive page/limit.
- `test/unit/presentation/controllers/admin-comment.controller.spec.ts`
  — extend with `list` describe block: success mapping query → use case
  → 200 JSON; validation failure → `next(error)` with `HttpError(400)`,
  use case never called. Note: existing controller-construction calls
  in this spec need updating to pass the new 4th constructor arg
  (compile-time break otherwise — flagged as a required, non-behavioral
  test update).
- `test/unit/infra/http/routes/admin-comment.routes.spec.ts` — extend to
  assert `GET /` is wired and passes through `authMiddleware` (401
  without token); update existing controller-construction assertions
  for new 4th dependency.

## Contract Impact

- New endpoint: `GET /admin/comments`, Bearer-authenticated (existing
  `authMiddleware`), query params `status?` (PENDING|APPROVED|HIDDEN),
  `page?` (default 1), `limit?` (default 20, max 100).
- New response envelope `{ items: CommentResponse[], page, limit, total,
  totalPages }` — new endpoint only, not a breaking change.
- No change to any existing endpoint's contract (approve/update/delete
  untouched — AC-011/NFR-004).

## Persistence Impact

- No schema/model changes. No change to `Comment`/`CommentStatus` domain
  types.
- New read-only repository method `listForModeration` on
  `CommentRepositoryPort`, implemented in `mongo-comment.repository.ts`
  using `sanitizeFilter`, `find().sort().skip().limit().lean()`, and
  `countDocuments()` — same guard discipline as existing methods.

## Security Impact

- Reuses existing `authMiddleware` exactly as the other three admin
  comment routes — no new auth mechanism. No CSRF needed (GET, not
  mutating).
- Injection/filter safety: `status`/`page`/`limit` validated twice — Zod
  at the presentation boundary (NFR-002) and repository-boundary guards
  — before reaching `sanitizeFilter`/`CommentModel.find`.
- Data exposure: response built purely from the existing `Comment`
  domain type via `toComment`; no Mongoose internals leak; `_id` used
  only as an internal sort tiebreaker, never mapped into the response
  (AC-008/NFR-003).

## Swagger Impact

- `src/infra/docs/admin-comments.swagger.ts`: new
  `AdminCommentListResponse` schema and new `'/admin/comments'` GET
  path (security, query params, 200/400/401/429 responses).
- `src/infra/docs/comments.swagger.ts` is NOT modified — `HIDDEN` is not
  added to `commentsSchemas.CommentResponse.status`.

## Testing Strategy

Coverage target (verbatim from architect, per `.claude/rules/testing.md`):
`>= 80%` new/changed-code coverage. All new files are small and fully
unit-testable without a real DB (Mongoose model mocked) — `>= 80%`
achievable with no exception needed. Run `npm test` and `npm run build`
after implementation; `npm run test:e2e` required (routes/middleware
touched).

Unit tests (mirrored paths per `.claude/rules/testing.md`):

- `test/unit/infra/repositories/mongo-comment.repository.spec.ts` —
  extend: mock `CommentModel.find` chainable (sort/skip/limit/lean
  matching existing `listApprovedByWorkId` mocking style), mock
  `CommentModel.countDocuments`. Cases: filter by each of
  PENDING/APPROVED/HIDDEN, no filter, pagination math (totalPages, skip
  offset), guard rejection for invalid status/non-positive page/limit.
- `test/unit/usecase/list-comments-for-moderation.use-case.spec.ts`
  (new) — verifies pass-through to the port.
- `test/unit/infra/presentation/validators/list-admin-comments-query.schema.spec.ts`
  (new) — valid status values, invalid status rejected, default
  page/limit applied, coercion from string query values, bounds (limit
  > 100 rejected, page < 1 rejected).
- `test/unit/presentation/controllers/admin-comment.controller.spec.ts`
  — extend with `list` describe block: success mapping query → use case
  → 200 JSON; validation failure → `next(error)` with `HttpError(400)`,
  use case never called.
- `test/unit/infra/http/routes/admin-comment.routes.spec.ts` — extend
  to assert `GET /` is wired and passes through `authMiddleware` (401
  without token), update existing controller-construction assertions
  for new 4th dependency.

E2E (`.claude/rules/testing.md` requires it: routes/middleware/auth
changes):

- New `test/e2e/admin-comment-list.e2e-spec.ts` covering AC-001 (401 no
  token), AC-002 (200, no filter, envelope shape), AC-003/AC-004
  (status=PENDING/APPROVED filtering), AC-005 (status=HIDDEN → 200,
  empty items), AC-006 (invalid status → 400, no DB side effects),
  AC-007 (repeat request → identical ordering).
- Confirm existing `test/e2e/admin-comment-hard-delete.e2e-spec.ts` and
  `admin-comment-update-security.e2e-spec.ts` still pass unmodified
  (AC-011).

## Risks

- Injection/filter safety mitigated by double validation
  (Zod + repository guards) before reaching `sanitizeFilter`/
  `CommentModel.find`.
- Data exposure mitigated: response built purely from the existing
  `Comment` domain type via `toComment`; `_id` never mapped into the
  response (AC-008/NFR-003).
- Compatibility: fully additive. Existing
  `admin-comment.routes.spec.ts` and `admin-comment.controller.spec.ts`
  will need their controller-construction call updated to pass the new
  4th constructor arg (compile-time break otherwise) — flagged for
  developer as required, non-behavioral test update.
- Residual risk: the `HIDDEN` filter is exercisable and correctly
  returns an empty result set today (intentional per Decision A) —
  assert `items: []` for `HIDDEN` given only PENDING/APPROVED fixtures
  in tests.

## Implementation Steps

1. Add `AdminCommentStatusFilter`, `ListCommentsForModerationInput`,
   `PaginatedComments`, and `listForModeration` to
   `src/core/domain/repositories/comment.repository.ts`.
2. Implement `listForModeration` in
   `src/infra/repositories/mongo-comment.repository.ts`, including the
   two new private guards (`assertValidStatusFilter`,
   `assertPositiveInteger`).
3. Create `src/usecase/list-comments-for-moderation.use-case.ts`.
4. Create
   `src/infra/presentation/validators/list-admin-comments-query.schema.ts`.
5. Extend `src/presentation/controllers/admin-comment.controller.ts`
   with the 4th constructor dependency and the `list` handler.
6. Wire `GET /` into `src/infra/http/routes/admin-comment.routes.ts`.
7. Update `src/infra/docs/admin-comments.swagger.ts` with
   `AdminCommentListResponse` and the new `/admin/comments` GET path.
8. Update `docs/api-contract.md` with the new endpoint section.
9. Update/extend unit tests as listed in Testing Strategy, including the
   required controller-construction fixes in the two existing specs.
10. Add the new e2e spec `test/e2e/admin-comment-list.e2e-spec.ts` and
    confirm the two existing admin-comment e2e specs still pass
    unmodified.
11. Run `npm test`, `npm run build`, and `npm run test:e2e`.

## Definition of Done Mapping

- FR-001..FR-011 / AC-001..AC-011 (spec.md) → covered by the endpoint,
  filter, pagination, ordering, auth, and error-handling behavior
  described above; mapped explicitly to unit and e2e test cases in
  Testing Strategy.
- NFR-002 (query-param validation) → `listAdminCommentsQuerySchema`.
- NFR-003 / AC-008 (no internal id leakage) → response built via
  `toComment`, `_id` used only as sort tiebreaker.
- NFR-004 / AC-011 (no existing admin comment endpoint behavior change)
  → confirmed via Decision A (no write-path change) and unmodified
  existing e2e specs.

## Open Non-Blocking Questions

None (architect reported no blocking questions).

## Required Output

Plan:

`specs/CARSHOP-136/plan.md`

Status:

`WRITTEN`
