# CARSHOP-117 — Implementar endpoint GET /works/:slug (detalhe de projeto)

## Status

Ready

## Source

Notion Task:
CARSHOP-117

## Context

Today the API only exposes `GET /works`, which returns an unpaginated array
of `Work` and does not allow fetching a single project by its public
identifier. The `slug` field already exists on the `Work` domain type and on
the persistence schema, and `WorkRepositoryPort.findBySlug` already exists,
but it is currently only used internally by `CreateWorkUseCase` to enforce
slug uniqueness on creation — no route, controller, or use case exposes a
single-work lookup publicly.

The frontend detail page and its metadata/Open Graph generation (CARSHOP-116)
depend on this contract being available.

Repository inspection for this specification confirmed:

- `WorkRepositoryPort.findBySlug(slug)` (declared in
  `src/core/domain/repositories/work.repository.ts`) already filters out
  soft-deleted works (`deletedAt: null`) in its Mongo implementation
  (`src/infra/repositories/mongo-work.repository.ts`), but it does **not**
  filter by `status`. A `draft` work with a matching slug and no
  `deletedAt` is currently returned by `findBySlug` as-is.
- `GET /works` (listing) achieves its public/draft distinction through
  `ListWorksUseCase`, which calls `workRepository.listPublished()`
  (filters `status: 'published' AND deletedAt: null`) by default, and only
  calls `workRepository.listAll()` when the caller is authenticated and
  passes `includeDrafts=true`.
- Therefore, reusing `findBySlug` as-is for the new endpoint would leak
  `draft` works to unauthenticated callers unless the new use case adds an
  explicit `status === 'published'` check on top of it. This is the central
  risk this specification must close.
- `/works` and `/admin/works` are mounted as distinct route bases in
  `src/infra/config/routes.ts`. `buildAdminWorkRouter` only registers
  `DELETE /:workId` under `/admin/works`, and `buildWorkRouter` currently
  registers `GET /`, `POST /`, `POST /:workId/comments`, and
  `GET /:workId/comments` under `/works`. No existing route pattern under
  `/works` collides with a literal or parametrized `/works/:slug` path, and
  `/admin/works` is a separate mount path entirely, so there is no route
  collision risk from adding `GET /works/:slug`.
- The existing `WorkResponse` Swagger schema
  (`src/infra/docs/works.swagger.ts`) only documents `id`, `slug`, `title`,
  `description`, `category`, `tags`, `status` — it omits `images`,
  `createdAt`, `updatedAt`, and `deletedAt`, even though the `Work` domain
  type (`src/core/domain/application/Work/work.types.ts`) and the actual
  `GET /works` response already include them. This is a pre-existing
  documentation gap the task requires fixing regardless of the new
  endpoint.

## Objective

Expose a public `GET /works/:slug` endpoint that returns the full `Work`
representation for a single published, non-deleted work identified by its
slug, following the same visibility rules already enforced for
unauthenticated callers on `GET /works`, and bring the `WorkResponse`
Swagger schema in line with the real `Work` shape.

## Functional Requirements

- **FR-001**: The API must expose `GET /works/:slug`, where `:slug` is the
  work's slug identifier.
- **FR-002**: When `:slug` matches an existing work with `status:
  'published'` and `deletedAt: null`, the endpoint must respond `200 OK`
  with a JSON body representing that single `Work`, with no additional
  envelope (i.e. the same per-item shape already returned inside the
  `GET /works` array, not wrapped in `{ data: ... }` or similar).
- **FR-003**: The response body for a found, published work must include at
  least: `id`, `slug`, `title`, `description`, `category`, `tags`,
  `images`, `status`, `createdAt`, `updatedAt` — matching the `Work` domain
  type used elsewhere in the codebase.
- **FR-004**: When `:slug` does not match any existing work, the endpoint
  must respond `404 Not Found`.
- **FR-005**: When `:slug` matches a work whose `status` is `'draft'`, the
  endpoint must respond `404 Not Found` to an unauthenticated caller (the
  request carries no valid Bearer access token bound to an active
  session).
- **FR-006**: When `:slug` matches a work whose `deletedAt` is not `null`
  (soft-deleted), the endpoint must respond `404 Not Found`, regardless of
  authentication.
- **FR-007**: The endpoint must not require authentication for the
  published/non-deleted case (FR-002); it is public by default, consistent
  with the default (non-`includeDrafts`) behavior of `GET /works`.
- **FR-008**: The error body returned for the `404` cases in FR-004,
  FR-005, and FR-006 must follow the project's existing `HttpError`-based
  error contract (the same JSON error shape already produced by the
  central error handler for other `404` responses in this codebase — a
  `message` field, without leaking internal implementation details).
- **FR-009**: The addition of `GET /works/:slug` must not change the
  request/response contract, status codes, or visibility behavior of the
  existing `GET /works` endpoint, including its `includeDrafts` query
  parameter behavior.
- **FR-010**: The `WorkResponse` schema documented in
  `src/infra/docs/works.swagger.ts` must be corrected to include `images`,
  `createdAt`, `updatedAt`, and `deletedAt` (nullable), in addition to the
  fields it already documents, so that it accurately reflects the real
  `Work` shape returned by both `GET /works` and `GET /works/:slug`.
- **FR-011**: `src/infra/docs/works.swagger.ts` must document the new
  `GET /works/{slug}` path, including its `200` success response (referencing
  the corrected `WorkResponse` schema) and its `404` error response.

## Non-Functional Requirements

- **NFR-001 (Security / Visibility)**: Determining whether a work is
  eligible to be returned to an unauthenticated caller must be based on
  the same visibility rule already used for the public listing (`status:
  'published' AND deletedAt: null`), not solely on whatever filtering
  `WorkRepositoryPort.findBySlug` happens to apply today. This closes the
  draft-leak risk identified in Context.
- **NFR-002 (Layering)**: The lookup-by-slug business rule (published +
  non-deleted only, for unauthenticated access) must live in a use case
  that depends only on `WorkRepositoryPort` through constructor injection,
  consistent with `.claude/rules/usecases.md` and `.claude/rules/architecture.md`.
  No Mongoose model may be imported directly by the controller or use case.
- **NFR-003 (Consistency)**: Field names, date formatting, and error
  contract for the new endpoint must match existing conventions already
  used by `GET /works` and other endpoints in this codebase, so frontend
  consumers do not need endpoint-specific parsing logic.
- **NFR-004 (Test coverage)**: New or changed production code for this
  task must meet the `>= 80%` new/changed-code unit-test coverage target
  defined in `.claude/rules/testing.md`, or record a documented justified
  exception per that same rule.
- **NFR-005 (Compatibility)**: The change must not require breaking
  changes to `GET /works`, `includeDrafts`, or any other currently
  documented contract.

## Acceptance Criteria

- **AC-001**: Given a work exists with `status: 'published'` and
  `deletedAt: null` and slug `example-slug`, when an unauthenticated client
  sends `GET /works/example-slug`, then the response status is `200` and
  the body is a single JSON object (not an array) containing `id`, `slug`,
  `title`, `description`, `category`, `tags`, `images`, `status`,
  `createdAt`, and `updatedAt` matching that work's data.
- **AC-002**: Given no work exists with slug `does-not-exist`, when any
  client (authenticated or not) sends `GET /works/does-not-exist`, then the
  response status is `404` and the body follows the project's standard
  `HttpError` JSON error shape.
- **AC-003**: Given a work exists with `status: 'draft'`, `deletedAt: null`,
  and slug `draft-slug`, when an unauthenticated client sends
  `GET /works/draft-slug`, then the response status is `404`.
- **AC-004**: Given a work exists with `deletedAt` set to a non-null value
  and slug `deleted-slug`, when any client (authenticated or not) sends
  `GET /works/deleted-slug`, then the response status is `404`.
- **AC-005**: Given the existing `GET /works` test suite and behavior
  (default published-only listing and `includeDrafts=true` authenticated
  behavior), after this change is implemented, `GET /works` continues to
  return identical status codes and response shapes for the same inputs
  as before the change (no regression).
- **AC-006**: The OpenAPI document served at `GET /docs.json` includes a
  `/works/{slug}` path with a `get` operation documenting `200` and `404`
  responses, and the `WorkResponse` schema referenced by both `/works` and
  `/works/{slug}` includes `images`, `createdAt`, `updatedAt`, and
  `deletedAt`.
- **AC-007**: Automated tests exist covering, at minimum: controller-level
  handling of found/published (200), not-found (404), and
  draft/soft-deleted-for-unauthenticated-caller (404) cases; the
  corresponding use case's decision logic for the same three cases; and
  route-level wiring of `GET /works/:slug` without `authMiddleware` blocking
  the published/non-deleted case.
- **AC-008**: `npm test` and `npm run build` pass after the change. Since
  this change modifies HTTP routes/contracts, `npm run test:e2e` is also
  run and passes (or any pre-existing, unrelated failure is explicitly
  recorded as evidence, per `.claude/rules/testing.md`).

## Constraints

- The public identifier for this endpoint is the work's `slug`, not its
  `id` — this route decision is already fixed by the originating task and
  is not open for re-evaluation in this specification or by the architect.
- The route must be registered under the existing `/works` base
  (`src/infra/http/routes/work.routes.ts` / `src/infra/config/routes.ts`),
  consistent with how `GET /works` is already mounted, and must not be
  registered under `/admin/works`.
- No new external dependency may be introduced to satisfy this task.
- The response shape for a single work must reuse the same `Work` domain
  representation already used by `GET /works`; no new envelope or
  pagination wrapper is introduced.
- No secrets, credentials, real environment values, or internal/production
  URLs may appear in this specification or in any Swagger fragment
  produced for this task, per `.claude/rules/spec-security.md`.

## Dependencies

- Blocks CARSHOP-116 (frontend detail page and `generateMetadata`/Open
  Graph), which depends on this contract being available.
- Depends on the existing `WorkRepositoryPort.findBySlug` port method and
  its current Mongo implementation (already merged), which this task must
  compose with an explicit status/visibility check rather than replace.

## Out of Scope

- Changing the `WorkRepositoryPort.findBySlug` signature or its underlying
  Mongo query filter. (The new use case is expected to apply the
  published/non-deleted visibility rule itself, on top of whatever
  `findBySlug` returns, rather than changing the port's contract, since
  `findBySlug` is also used internally by `CreateWorkUseCase` for
  uniqueness checks where the draft/published distinction is irrelevant.)
- Adding an authenticated variant of `GET /works/:slug` that would also
  return draft or soft-deleted works to admin callers (not requested by
  the task's Definition of Done).
- Pagination, filtering, or sorting changes to `GET /works` (listing).
- Rate limiting changes beyond the already-configured global rate limit.
- Any change to `POST /works`, `POST /works/:workId/comments`,
  `GET /works/:workId/comments`, or any `/admin/works` route.

## Risks

- Leakage of draft or soft-deleted works to unauthenticated callers if the
  new use case relies solely on `findBySlug`'s current filtering
  (`deletedAt: null` only) without an explicit additional `status ===
  'published'` check. This is the primary risk this specification exists
  to close (see NFR-001, AC-003).
- The pre-existing `WorkResponse` Swagger schema drift (missing
  `images`/`createdAt`/`updatedAt`/`deletedAt`) must be corrected in the
  same change per FR-010, or the documented contract will remain
  inconsistent with the actual API response for both endpoints.
- Route registration order under `/works` must be verified during
  implementation to confirm `GET /works/:slug` does not unintentionally
  shadow or get shadowed by another `/works/*` route.

## Open Questions

### Blocking

None.

### Non-blocking

- The exact wording of the `404` error message is not specified by the
  Notion task; it should follow the existing `HttpError` message
  conventions already used for other "not found" cases in this codebase
  (e.g. `"Trabalho não encontrado."`), to be finalized during
  implementation.
- No dedicated rate limit is specified for this endpoint; the existing
  global rate limit is assumed to apply, per the task-reader output's own
  "Missing Information (non-blocking)" note.

## Traceability

FR-001 → AC-001, AC-002, AC-003, AC-004
FR-002 → AC-001
FR-003 → AC-001
FR-004 → AC-002
FR-005 → AC-003
FR-006 → AC-004
FR-007 → AC-001
FR-008 → AC-002, AC-003, AC-004
FR-009 → AC-005
FR-010 → AC-006
FR-011 → AC-006
NFR-001 → AC-003, AC-004
NFR-002 → AC-007
NFR-003 → AC-001, AC-002
NFR-004 → AC-007, AC-008
NFR-005 → AC-005, AC-008
