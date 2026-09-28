# CARSHOP-159 — Criar configuração backend para imagem principal da Home

## Status

Ready

## Source

Notion Task:
CARSHOP-159

- Type: Feature
- Priority: High
- Sprint: 6
- Epic: Works
- Stack: Backend
- Components: Images, Admin UI
- Points: 5

## Context

The public Home page of the shop's site shows a main (hero) image. Today
there is no backend-managed way for the administrator to choose which
image is shown there, so changing it would require a code change or a
hardcoded URL in the frontend.

The backend must store a persistent configuration that lets the
administrator choose the Home main image, pointing to an image that is
managed by the system (not an arbitrary external URL). This task provides
the HTTP contract consumed by related frontend tasks:

- CARSHOP-160 (Frontend, Admin selection of the Home image) — blocked by
  this task.
- CARSHOP-161 (Frontend, Home rendering) — consumes the public read
  contract.

The repository already has system-managed images: work images uploaded by
the admin through `POST /admin/works/{workId}/images`, stored by the
existing image storage adapter, with metadata persisted alongside works.
Works have a `status` of `draft` or `published`, can be removed logically
(soft delete), can be permanently deleted through
`DELETE /admin/works/{workId}`, and individual images can be removed
through `DELETE /admin/works/{workId}/images/{imageId}`. These existing
lifecycle operations are relevant to how a Home image reference behaves
over time.

## Objective

The administrator can select, through a protected admin endpoint, which
system-managed image is the Home main image; the selection is persisted
as a single configuration; the public Home can read the current
configuration without authentication; and the configuration remains safe
and well-defined when the referenced image is removed — all without a
deploy or code change to switch images.

## Functional Requirements

### FR-001 — Single persistent Home image configuration

The system must maintain at most one Home main image configuration
(singleton). The configuration must persist across application restarts.
Selecting a new image replaces the current selection; it must never
produce more than one active configuration.

### FR-002 — Reference to a system-managed image

The configuration must reference an image managed by the system, using a
stable backend-side reference. It must store only the metadata it needs
to serve the Home. The concrete reference strategy is an architect
decision (see AD-001).

### FR-003 — Public read of the current configuration

A public endpoint, requiring no authentication, must return the current
Home main image configuration, including the data the Home needs to
render it: at least the image URL and its alternative text/description,
and image dimensions when they are available in the system.

### FR-004 — Defined response when no image is configured

When no Home image is configured (never configured, or no longer valid
per FR-008), the public read endpoint must return a single,
deterministic, documented response. The exact form (for example, `200`
with an empty/`null` configuration, `404`, or a fallback) is an architect
decision (see AD-004) and must be documented in Swagger and
`docs/api-contract.md`.

### FR-005 — Protected admin selection/change

A protected admin endpoint must allow the administrator to select or
change the Home main image. The request must identify the image through
the backend-side reference defined for FR-002. The endpoint's method,
route, body, success status and error statuses must be fully documented.

### FR-006 — Validation before persisting

Before persisting a selection, the backend must verify that the selected
image exists and is valid/eligible. When it is not, the request must be
rejected with a documented error and the current configuration must
remain unchanged.

### FR-007 — No arbitrary client URL

The selection endpoint must not accept an arbitrary client-supplied image
URL as the source of the Home image. The image URL returned by the public
read endpoint must be derived from the system-managed image, not from a
value provided by the client in the selection request.

### FR-008 — Safe behavior when an in-use image is deleted

When the image currently referenced by the Home configuration is removed
through any existing removal path, the system must follow a single,
explicitly defined, safe behavior (block the removal, unlink the
configuration, or fall back). The behavior is an architect decision (see
AD-002). Regardless of the chosen behavior, the public read endpoint must
never return a reference to an image that no longer exists.

The removal paths to consider are, at least:

- image removal (`DELETE /admin/works/{workId}/images/{imageId}`);
- permanent work removal (`DELETE /admin/works/{workId}`);
- logical (soft) removal of a work;
- the existing purge of expired/removed works.

### FR-009 — Eligibility of images from unpublished or removed works

The rules that decide which images are eligible to be selected — in
particular images belonging to `draft`/unpublished works or to logically
removed works — must be explicitly defined and enforced both at selection
time (FR-006) and at public read time (FR-003/FR-004). The rule is an
architect decision (see AD-003). The public endpoint must not expose an
image in a way that contradicts the chosen rule.

### FR-010 — No deploy or code change to switch images

Changing the Home main image must be possible solely through the admin
endpoint (FR-005), without a deploy, code change, or configuration-file
change.

### FR-011 — Contract documentation

The Swagger/OpenAPI fragments and `docs/api-contract.md` must document
the new public read endpoint and the admin selection endpoint (and any
changed behavior of existing endpoints resulting from FR-008), including
parameters, body, success responses, error responses, and authentication
requirements.

## Non-Functional Requirements

### NFR-001 — Existing authentication/authorization

The admin selection endpoint must require the project's existing admin
authentication (Bearer access token validated against the server-side
session), exactly like other admin routes. Requests without a valid
authenticated admin session must be rejected and must not change the
configuration. No new authentication mechanism may be introduced.

### NFR-002 — Controls for a new mutating route

The admin selection endpoint is a new mutating route and must be covered
by rate limiting and any other controls appropriate to the
authentication mechanism, consistent with `.claude/rules/security.md`
and with the controls already applied to existing admin mutating routes.
The existing CSRF protection on `POST /auth/refresh` and
`POST /auth/logout` must not regress.

### NFR-003 — Minimal data exposure

Public and admin responses must not expose unnecessary internal data,
including internal storage-provider identifiers or raw provider
responses, internal database fields not required by the contract,
credentials, tokens, stack traces, file-system paths or internal
hostnames. Error messages must not reveal internal details.

### NFR-004 — Reuse of existing image infrastructure

The feature must not duplicate the existing upload/storage infrastructure
when it can be reused.

### NFR-005 — Backward compatibility

Existing public contracts (works, work images, comments, auth) must remain
compatible, except for changes explicitly required by the behavior chosen
for FR-008, which must then be documented (FR-011).

### NFR-006 — Quality checks

Lint, typecheck, build, `npm test` and `npm run test:e2e` must pass. The
unit-test coverage policy in `.claude/rules/testing.md` applies to
new/changed code.

## Acceptance Criteria

### AC-001

When a Home image has been configured, an unauthenticated request to the
public read endpoint must return a success response containing at least
the image URL and alternative text/description of the configured image,
and dimensions when available in the system.

### AC-002

When no Home image is configured, an unauthenticated request to the
public read endpoint must return the response documented for this case
(FR-004), and the response must be the same on repeated requests.

### AC-003

When an authenticated admin selects an existing, eligible image through
the admin endpoint, the request must succeed with the documented success
status, and a subsequent public read must return that image.

### AC-004

When an authenticated admin selects a different image after one is
already configured, a subsequent public read must return only the new
image, and there must still be exactly one configuration.

### AC-005

When an authenticated admin selects an image reference that does not
exist, the request must be rejected with the documented error status and
message, and a subsequent public read must return the previous
configuration unchanged.

### AC-006

When an authenticated admin selects an image that exists but is not
eligible under the rule defined for FR-009, the request must be rejected
with the documented error, and the configuration must remain unchanged.

### AC-007

When the admin selection request has a missing or malformed body (e.g.,
no image reference, wrong type, or unexpected fields), it must be rejected
with a documented `400`-class error and the configuration must remain
unchanged.

### AC-008

When the admin selection request carries an arbitrary URL instead of a
system image reference, it must be rejected with a documented
`400`-class error, the configuration must remain unchanged, and the
public read must never return that client-supplied URL.

### AC-009

When the admin selection endpoint is called without a Bearer access token,
with an invalid/expired token, or with a token bound to a revoked session,
it must return `401` and the configuration must remain unchanged.

### AC-010

When the configured image is removed through each removal path listed in
FR-008, the system must follow the behavior chosen in AD-002, and a
subsequent public read must not return a reference to the removed image.
Automated tests must cover at least image removal and permanent work
removal.

### AC-011

When the configured image belongs to a work whose state later changes so
that the image is no longer eligible under FR-009 (e.g., soft removal, or
change to unpublished if the rule excludes it), the public read must
behave according to the documented rule.

### AC-012

Public and admin response bodies (success and error) must not contain
internal storage-provider identifiers not required by the contract, raw
provider responses, credentials, tokens, stack traces, file-system paths
or internal hostnames.

### AC-013

When the admin selection endpoint exceeds its rate limit, it must return
`429` with the project's standard rate-limit error response.

### AC-014

The configuration must survive an application restart: after a selection
succeeds, the public read must return the same image after the
application is restarted (verifiable by the configuration being read from
persistent storage rather than process memory).

### AC-015

`GET /docs.json` (when Swagger is enabled) and `docs/api-contract.md`
must document both new endpoints with their authentication requirement,
body, success responses and error responses (including the empty
configuration case and the nonexistent-image case), plus any changed
behavior of existing removal endpoints resulting from AD-002.

### AC-016

Existing tests for works, work images, comments and auth — including the
CSRF checks on `POST /auth/refresh` and `POST /auth/logout` — must pass
without weakening assertions.

### AC-017

Lint, typecheck, `npm test`, `npm run build` and `npm run test:e2e` must
pass, and new/changed code must meet the coverage policy in
`.claude/rules/testing.md` or record a justified exception.

## Constraints

- Selection must not accept an arbitrary client-supplied URL unless an
  approved contract explicitly allows it (none does in this task).
- Do not duplicate the existing upload/storage infrastructure when it can
  be reused.
- Admin change must use the existing authentication/authorization; no new
  authentication mechanism.
- The API base URL is provided through configuration (`API_URL`); no
  environment-specific URL is part of this specification.
- Authenticated requests use the project's existing Bearer token strategy.
- Swagger/OpenAPI and `docs/api-contract.md` must be updated in the same
  change.

## Decisions Delegated to the Architect

These are explicitly left open by the task and must be decided and
justified by `architect`, then reflected in the plan and contract
documentation. This specification does not make them.

- AD-001 — Image reference strategy: reference an existing work image
  (e.g., by its image identifier) versus a dedicated Home asset. The task
  prefers a stable reference to a backend-managed image over a
  client-supplied URL, and asks that the existing work image/storage model
  be evaluated first.
- AD-002 — Deletion-in-use behavior: block, unlink, or fallback when the
  referenced image (or its work) is removed through any path listed in
  FR-008, including soft removal and the expired-works purge.
- AD-003 — Eligibility of images from `draft`/unpublished works and from
  logically removed works, at selection time and at public read time.
- AD-004 — Public response when no image is configured (e.g., `200` with
  empty/`null` configuration, `404`, or fallback).
- AD-005 — Exact routes, HTTP method and request/response shapes for the
  public read and admin selection endpoints, and the controls applied to
  the admin mutating route (NFR-002).

## Dependencies

- Existing work image model and image storage adapter (Cloudinary).
- Existing admin authentication middleware and server-side session store.
- Existing work lifecycle operations: status (`draft`/`published`), soft
  removal, permanent removal, image removal, and the expired-works purge.
- MongoDB persistence.
- Downstream: CARSHOP-160 (Admin selection UI) is blocked by this task;
  CARSHOP-161 (Home rendering) consumes the public read contract.

## Out of Scope

- Frontend implementation of the Admin selection UI (CARSHOP-160) and the
  Home rendering (CARSHOP-161).
- Changes to the authentication, session or CSRF model.
- Changes to the upload endpoint's accepted types or size limit.
- An endpoint that lists selectable images (requested in the CARSHOP-160
  page body, not in this task's Definition of Done) — unless its inclusion
  is confirmed (see Q-001).

## Risks

- Cascade removal (image removal, work permanent removal, soft removal,
  expired-works purge) can leave a dangling reference if any path is not
  handled (mitigated by FR-008/AC-010).
- A new public endpoint plus a new admin mutating endpoint expand the
  contract surface (authentication, rate limiting, Swagger accuracy).
- Images from `draft`/unpublished works could be exposed publicly through
  the Home if eligibility is not enforced (mitigated by FR-009/AC-011).
- CARSHOP-160 expects an eligible-images listing that is outside this
  task's Definition of Done; leaving it out may block or delay the
  frontend task.
- Choosing to block removal of an in-use image would change the observable
  behavior of existing removal endpoints (contract change requiring
  documentation and tests).

## Open Questions

### Blocking

None. The open technical decisions (AD-001 to AD-005) are explicitly
delegated to the architect by the task.

### Non-blocking

- Q-001: Is the eligible-images listing endpoint requested by CARSHOP-160
  (paginated/filterable, with preview data) in scope for this task, or
  for a follow-up? It is not part of the Definition of Done. (Coordinator
  / product decision.)
- Q-002: Should the public response for the "no image configured" case
  use a specific fallback image? (AD-004; the task lists fallback, `404`
  or `null` as options.)
- Q-003: The task has no Due Date defined.

## Traceability

| Requirement | Acceptance Criteria |
| --- | --- |
| FR-001 | AC-003, AC-004, AC-014 |
| FR-002 | AC-003, AC-005 |
| FR-003 | AC-001 |
| FR-004 | AC-002 |
| FR-005 | AC-003, AC-004, AC-007 |
| FR-006 | AC-005, AC-006, AC-007 |
| FR-007 | AC-008 |
| FR-008 | AC-010 |
| FR-009 | AC-006, AC-011 |
| FR-010 | AC-003, AC-004 |
| FR-011 | AC-015 |
| NFR-001 | AC-009 |
| NFR-002 | AC-013, AC-016 |
| NFR-003 | AC-012 |
| NFR-004 | AC-003 |
| NFR-005 | AC-015, AC-016 |
| NFR-006 | AC-017 |
