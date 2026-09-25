# CARSHOP-156 — Corrigir falha 400 no upload de imagem pelo painel Admin

## Status

Ready

## Source

Notion Task:
CARSHOP-156

- Type: Bug
- Priority: High
- Sprint: 5
- Epic: Frontend Admin
- Stack: Fullstack
- Components: Images, Admin UI
- Points: 3

## Context

The admin uploads work photos from the admin panel (works management
screen). The frontend sends the upload through its API proxy to the backend
endpoint `POST /admin/works/{workId}/images`.

In a reproduction performed on 2026-09-25, a request to
`{FRONTEND_BASE_URL}/api-proxy/admin/works/<WORK_ID>/images` returned
HTTP `400` with the body:

```json
{ "message": "Falha ao processar o upload da imagem." }
```

Observed request characteristics (values omitted):

- `Content-Type: multipart/form-data` with a boundary;
- Bearer access token in the `Authorization` header;
- `refresh_token` and `csrf_token` cookies present;
- `X-CSRF-Token` header present;
- body size of roughly 115 KB, well below the 5 MB limit.

As a result, the admin cannot add photos to works.

In the current repository, the message above is the generic error the
backend returns for upload-processing (multipart) failures other than the
file-size limit. The message alone does not reveal which step of the flow
failed.

Flow to be investigated (guidance from the task, not a mandated
architecture): frontend form data → frontend API proxy route → multipart
forwarding (boundary/body) → backend multipart parsing and validation →
image storage adapter → image metadata persistence.

Points explicitly raised by the task for investigation:

- whether the proxy rebuilds or consumes the multipart body incorrectly;
- whether the file field is really sent as `file`;
- whether the backend converts an internal/storage exception into a
  generic `400`.

## Objective

A valid image uploaded by an authenticated admin from the admin panel is
stored and associated with the target work, the root cause of the HTTP
`400` is identified and fixed, and genuine upload/validation failures
return specific, useful, non-sensitive error messages.

## Functional Requirements

### FR-001 — Successful upload of a valid image

When an authenticated admin sends a valid image for an existing work to
`POST /admin/works/{workId}/images` (directly or forwarded by the frontend
API proxy), the backend must accept the upload, store the image and
associate it with the work, returning the success response defined by the
current contract.

### FR-002 — Request contract preserved

The upload request must remain `multipart/form-data`, with the image sent
in the field named `file`, plus the optional fields supported by the
current repository contract (`alt` and `isCover`, when applicable). The
field names and their semantics must not change.

### FR-003 — Accepted formats and size preserved

Valid JPEG, PNG and WebP images up to 5 MB must continue to be accepted,
exactly as in the current contract. Files outside these types or above
this size must continue to be rejected.

### FR-004 — Root cause identified and fixed

The root cause of the HTTP `400` observed in the reproduction must be
identified and fixed at its origin. Changing only the error message or
status code without fixing the cause does not satisfy this requirement.

The identified root cause must be documented in the task's technical
outcome (e.g., which step of the flow failed and why).

### FR-005 — Specific error feedback for real failures

When an upload genuinely fails (e.g., missing file, unexpected field,
malformed multipart body, unsupported type, size above the limit, storage
failure, persistence failure), the response must carry a message specific
enough for the admin to understand what went wrong, instead of a single
generic message for distinct failure causes.

### FR-006 — Root cause outside this repository

If investigation determines that the root cause lies outside the
carshop-backend repository (for example, only in the frontend API proxy),
this must be explicitly reported to the coordinator. The backend must not
be changed to mask or work around a defect that belongs to another
component.

## Non-Functional Requirements

### NFR-001 — Authentication and session/CSRF compatibility

The upload endpoint must keep requiring authentication with a Bearer
access token, validated against the existing server-side session model.
The existing session and CSRF flow must keep working without regression.

### NFR-002 — No sensitive information in errors

Error responses must not expose sensitive information, including internal
stack traces, raw storage-provider responses, credentials, tokens, cookie
values, file-system paths or internal hostnames.

### NFR-003 — Security validations preserved

Existing upload security validations (authentication, size limit, explicit
MIME type list, file-content validation, temporary-file cleanup) must not
be removed or weakened.

### NFR-004 — Quality checks

Lint, typecheck, build and relevant tests must pass. The unit-test coverage
policy in `.claude/rules/testing.md` applies to new/changed code.

### NFR-005 — Contract documentation consistency

If any observable part of the upload endpoint contract changes (status
codes, error messages exposed as contract, fields), the corresponding
OpenAPI/Swagger documentation and tests must be updated in the same change.

## Acceptance Criteria

### AC-001

When an authenticated admin sends a `multipart/form-data` request to
`POST /admin/works/{workId}/images` for an existing work, with a valid
JPEG, PNG or WebP image of at most 5 MB in the field `file`, the backend
must respond with the success status and body defined by the current
contract, and the image must be associated with the work.

### AC-002

When the request conditions that reproduced the HTTP `400` (as identified
by the root-cause investigation) are replayed after the fix, the upload
must succeed instead of returning `400` with
`"Falha ao processar o upload da imagem."`. An automated test must cover
this regression and must fail without the fix.

### AC-003

When the optional fields `alt` and/or `isCover` are sent together with a
valid image, they must be accepted and processed according to the current
contract; when they are omitted, the upload must still succeed.

### AC-004

When a file whose type is not JPEG, PNG or WebP is sent, the upload must
be rejected with the error status and message defined by the current
contract.

### AC-005

When a file larger than 5 MB is sent, the upload must be rejected with the
error status and message defined by the current contract.

### AC-006

When the request has no valid Bearer access token, or the access token is
bound to an invalid/revoked session, the upload must be rejected with the
authentication error defined by the current contract, and no image must be
stored.

### AC-007

When a request reaches the backend with a distinct real failure cause
(at least: missing `file` field, file sent under an unexpected field name,
malformed multipart body, and storage-provider failure), the response
message must identify the category of failure, and distinct causes must not
all collapse into the same generic message.

### AC-008

For every error response produced by the upload endpoint, the response body
must not contain stack traces, raw storage-provider responses, credentials,
tokens, cookie values, file-system paths or internal hostnames.

### AC-009

After the change, `POST /auth/refresh` and `POST /auth/logout` must still
require the `X-CSRF-Token` header to match the `csrf_token` cookie, and
their existing tests must pass.

### AC-010

The task's technical outcome must state the identified root cause. If the
root cause is outside this repository, the outcome must state so explicitly
and no backend change may be used to mask it.

### AC-011

If the upload endpoint's observable contract changed, the Swagger
fragment for the endpoint must document the new/changed responses and the
corresponding tests must be updated in the same change.

### AC-012

Lint, typecheck, `npm test`, `npm run build` and, when routes, middlewares
or HTTP contracts change, `npm run test:e2e` must pass.

## Constraints

- Do not hide the problem by only changing the error message.
- Do not remove security validations.
- Do not raise the size limit or extend the accepted MIME types just to
  make the upload pass.
- Investigate the complete flow before changing code.
- Handle separately from CARSHOP-33.
- The field name `file` and the optional fields `alt`/`isCover` are
  defined by the current repository contract and must not be renamed.
- The API base URL is provided through configuration (`API_URL`); no
  environment-specific URL is part of this specification.
- Authenticated requests use the existing Bearer token strategy.

## Dependencies

- Frontend admin panel and its API proxy route (separate repository),
  which build and forward the multipart request.
- Image storage provider adapter (Cloudinary) used by the backend.
- Existing authentication middleware and server-side session store.
- MongoDB persistence for works and work images.

## Out of Scope

- Work tracked under CARSHOP-33.
- Changing the accepted MIME types or the 5 MB size limit.
- Changing the authentication, session or CSRF model.
- Fixing frontend-repository code from within this repository.

## Risks

- The root cause may lie only in the frontend API proxy (separate
  repository). In that case, the backend-side outcome may be limited to
  reporting the finding plus any improvement in error specificity
  (FR-005), without a backend fix for FR-001 through the proxy.
- Changing the backend HTTP status code for storage failures (e.g., from a
  client-error status to a server-error status) would be a public contract
  change requiring Swagger and test updates.
- Making error messages more specific could leak internal details if not
  constrained (mitigated by NFR-002/AC-008).
- The reproduction evidence comes from a request through the frontend
  proxy; reproducing the exact failing request against the backend alone
  may require capturing the forwarded request shape.

## Open Questions

### Blocking

None.

### Non-blocking

- Q-001: Which HTTP status should storage-provider failures return? If the
  current status changes, it is a contract change (see Risks / AC-011).
- Q-002: If the root cause is confirmed to be in the frontend proxy, should
  a follow-up task be opened in the frontend repository? (Coordinator
  decision.)

## Traceability

| Requirement | Acceptance Criteria |
| --- | --- |
| FR-001 | AC-001, AC-002 |
| FR-002 | AC-001, AC-003 |
| FR-003 | AC-001, AC-004, AC-005 |
| FR-004 | AC-002, AC-010 |
| FR-005 | AC-007 |
| FR-006 | AC-010 |
| NFR-001 | AC-006, AC-009 |
| NFR-002 | AC-008 |
| NFR-003 | AC-004, AC-005, AC-006 |
| NFR-004 | AC-012 |
| NFR-005 | AC-011 |
