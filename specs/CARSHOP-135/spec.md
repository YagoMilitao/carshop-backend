# CARSHOP-135 — Implementar endpoint de atualização de work para edição no admin

## Status

Ready

## Source

Notion Task:
CARSHOP-135

## Context

CARSHOP-32 (frontend admin edit page) plans an administrative work-editing
page and assumes the existence of an update endpoint for a work. The API
contract consolidated in CARSHOP-124 currently documents:

- `GET /works/{slug}`
- `POST /works`
- `DELETE /admin/works/{workId}`

but does not document any work-update endpoint. This task closes that gap
so that CARSHOP-32 has a real, documented contract to consume instead of
inventing its own.

## Objective

Provide a protected, partial-update endpoint for an existing `Work` that
allows the admin to edit the editable domain fields of a work already
created via `POST /works`, and document that endpoint so it becomes the
single canonical contract consumed by CARSHOP-32.

## Functional Requirements

FR-001
The system must expose an endpoint that performs a partial update
(only the fields sent in the payload are changed) of an existing work
identified by a stable identifier (work id or slug, as determined during
implementation, consistent with the existing routing convention observed
in `POST /works`, `GET /works/{slug}` and `DELETE /admin/works/{workId}`).

FR-002
The endpoint must accept a JSON payload containing a subset of the
editable domain fields of `Work`. At minimum, the fields already listed in
the source requirement — `slug`, `title`, `description`, `category`,
`tags`, `status` — must be updatable. The full, exhaustive list of
editable fields (including whether fields such as `metadata`, `seo`, or
`images` are in scope) must be defined by consulting the current `Work`
domain model and is not fixed by this specification; any field not
explicitly declared editable is out of scope for this task.

FR-003
The payload must be validated with a schema before being applied. Fields
not present in the payload must remain unchanged. Fields present with an
invalid value (wrong type, exceeding length limits, invalid enum value,
etc.) must cause the request to be rejected without partial persistence.

FR-004
The endpoint must require authentication (Bearer access token) using the
project's existing authentication mechanism. Unauthenticated requests
must not update anything.

FR-005
When the referenced work does not exist (or is otherwise not eligible for
update, e.g. previously soft-deleted), the request must fail with a "not
found" response and no data must be changed.

FR-006
When the payload attempts to change the `slug` to a value that would
collide with another existing work's slug, the request must fail, the
work's persisted data must remain unchanged, and no duplicate/ambiguous
slug state must be introduced. The exact HTTP status code used for this
conflict must be consistent with the existing slug-uniqueness handling
already implemented for `POST /works`.

FR-007
On success, the endpoint must persist only the fields sent in the
validated payload and must return a representation of the updated work
that reflects the persisted values.

FR-008
Existing business rules and normalizations already enforced for work
creation (e.g. trimming and lowercasing of `slug`, `category`, and
`tags`; the "at most one cover image" rule; any other invariant already
enforced by the current `Work` domain model) must continue to be enforced
when those fields are edited through this endpoint.

FR-009
The endpoint, its request/response contract, authentication requirement,
and error responses must be documented in the project's OpenAPI/Swagger
fragments and in `docs/api-contract` (or equivalent contract
documentation already consulted by CARSHOP-124), so that CARSHOP-32 can
consume it without inventing its own contract.

## Non-Functional Requirements

NFR-001
The implementation must preserve the project's hexagonal architecture
boundaries: business rules must not live in the controller, and any use
case involved must depend only on injected ports, reusing the existing
`Work` domain model, ports, and repository rather than introducing a
parallel/duplicate editing model.

NFR-002
The implementation must not weaken or duplicate the existing
authentication/session model (short-lived access token, session
validation) used by other protected admin routes.

NFR-003
The endpoint's contract (route shape, field names, status codes) must be
treated as final/canonical once documented, since CARSHOP-32 depends on
it directly.

## Acceptance Criteria

AC-001
Given a valid Bearer access token and an existing work, when a partial
update payload containing only allowed editable fields with valid values
is sent, then the response indicates success and the returned work
reflects the updated values while unspecified fields remain unchanged.

AC-002
Given no Authorization header or an invalid/expired Bearer token, when
the update endpoint is called, then the response status is `401` and the
work is not modified.

AC-003
Given a work identifier that does not correspond to any existing work,
when the update endpoint is called with a valid token, then the response
status is `404` and no work is modified.

AC-004
Given an existing work and a payload that attempts to change its `slug`
to a value already used by a different existing work, when the update
endpoint is called, then the request is rejected with a documented
conflict status code consistent with the existing slug-uniqueness
behavior of `POST /works`, and neither work's data changes.

AC-005
Given a payload containing an invalid value for an editable field (wrong
type, value outside allowed constraints, or an unrecognized field
depending on validation strictness decided at implementation time), when
the update endpoint is called, then the request is rejected before any
persistence occurs and no partial update is applied.

AC-006
Given a successful update, when the endpoint's OpenAPI/Swagger
documentation and `docs/api-contract` are inspected, then they describe
the route, method, authentication requirement, request payload shape,
success response shape, and the documented error status codes (401, 404,
and the slug-conflict status code) consistently with the implemented
behavior.

AC-007
Given the test suite, when unit and E2E tests are run, then they cover:
successful partial update, unauthenticated rejection (401), work-not-found
rejection (404), slug-conflict rejection, and payload-validation
rejection.

## Constraints

- Must reuse the existing `Work` domain model, ports, and repository;
  must not introduce a second/parallel editing model.
- Must follow the existing routing convention already used for work
  endpoints (`POST /works`, `GET /works/{slug}`, `DELETE
  /admin/works/{workId}`); the exact final route path is an implementation
  decision, not fixed by this specification.
- Must reuse the project's existing Bearer token authentication strategy;
  no new authentication mechanism may be introduced.
- Payload validation must be implemented with the project's existing
  validation approach (Zod), consistent with other endpoints.
- The API base URL is provided through the `API_URL` environment
  variable name only; no concrete environment-specific URL value may
  appear in this specification or its documentation deliverables.
- No secrets, tokens, or real credential values may appear in any
  documentation produced for this task.

## Dependencies

- CARSHOP-13 — Works CRUD/base functionality must actually exist in the
  repository (not just in Notion) as a prerequisite; this must be
  verified against the current codebase before implementation.
- CARSHOP-2 — Authentication (JWT/session middleware) must actually exist
  in the repository as a prerequisite; this must be verified against the
  current codebase before implementation.
- CARSHOP-124 — API contract consolidation; this task's documentation
  output must be reconciled with that existing contract.
- CARSHOP-32 — Frontend admin edit page; it is the consumer of the
  contract produced by this task, though it is not implemented by this
  task.

## Out of Scope

- Any change to the frontend admin edit page (CARSHOP-32); this task only
  provides and documents the backend endpoint it will consume.
- Adding or modifying work-image management endpoints (already covered
  by the existing work-image upload flow).
- Changing the `POST /works` (create) or `DELETE /admin/works/{workId}`
  contracts, except where strictly needed to keep slug-uniqueness
  handling consistent.
- Introducing bulk/batch update of multiple works in a single request.
- Full replacement (PUT-style, all-fields-required) semantics; this task
  covers partial update only.

## Risks

- Risk of introducing a second/duplicate editing model instead of
  reusing existing ports/use cases/repository, violating hexagonal
  architecture boundaries.
- Risk of choosing a route or field-naming convention inconsistent with
  the existing `/works` and `/admin/works` patterns, which would create
  ambiguity for CARSHOP-32 and for the CARSHOP-124 contract.
- Risk of the slug-conflict status code being decided inconsistently
  with the existing `POST /works` behavior, producing two different
  conventions for the same underlying rule within the same API.
- Since the exact contract becomes canonical for CARSHOP-32, any late
  change after CARSHOP-32 begins consuming it would require coordinated
  rework on the frontend side.

## Open Questions

### Blocking

None.

### Non-blocking

- Exact HTTP status code for slug-conflict-on-update (e.g. `409` vs
  `400`) is not specified in Notion; it should be determined by
  inspecting the existing repo convention used for slug uniqueness on
  `POST /works`.
- The exhaustive list of editable fields beyond the illustrative examples
  (`slug`, `title`, `description`, `category`, `tags`, `status`) is not
  fixed in Notion; it should be determined from the current `Work`
  domain model (e.g. whether `metadata`, `seo`, or `images` are in
  scope for this endpoint).
- The exact route path (e.g. `PATCH /works/{slug}` vs `PATCH
  /admin/works/{workId}`) is not dictated by Notion; it should follow the
  existing routing convention, consistent with `DELETE
  /admin/works/{workId}` suggesting admin-mutation routes live under
  `/admin/works`.

## Traceability

FR-001 → AC-001, AC-003
FR-002 → AC-001
FR-003 → AC-005
FR-004 → AC-002
FR-005 → AC-003
FR-006 → AC-004
FR-007 → AC-001
FR-008 → AC-001
FR-009 → AC-006
NFR-001 → AC-001, AC-007
NFR-002 → AC-002
NFR-003 → AC-006
