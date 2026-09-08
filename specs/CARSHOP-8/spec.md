# CARSHOP-8 — Configurar validação global de requests com Zod

## Status

Ready

## Source

Notion Task:
CARSHOP-8

## Context

The API previously relied on NestJS's `ValidationPipe` to validate incoming
HTTP requests. Since the project moved off NestJS to a plain Express stack,
that automatic validation layer no longer exists. Request `body`, `params`
and `query` must be validated explicitly using Zod schemas plus a reusable,
strongly-typed Express middleware, so controllers can trust the shape of
the data they receive without relying on `any` or unsafe type casts.

This task was reopened because the previous implementation attempt assumed
the removed NestJS pipe. The replacement strategy is Zod-based validation
at the HTTP boundary.

The repository already contains partial validation infrastructure that
predates this task, including (but not necessarily limited to):

- `src/infra/presentation/helpers/zod-validation.helper.ts` — a
  `validateWithSchema` helper that runs `schema.safeParse`, maps a failure
  to the project's existing `HttpError(400, ...)` contract, and returns
  typed data on success.
- `src/infra/presentation/validators/comment.schema.ts` and
  `update-comment.schema.ts` — existing Zod schemas.
- `src/presentation/helpers/login.validator.ts` — existing login payload
  validation.
- Zod usage already present in `admin-comment.controller.ts` and
  `comment.controller.ts`.

This task is therefore a consolidation/expansion of existing, partial work
rather than a greenfield implementation. The current state of this
infrastructure, and how far it already covers the relevant endpoints, must
be verified against the actual repository by the architect before any
implementation decision is made.

## Objective

Ensure that `body`, `params` and `query` of the relevant HTTP endpoints are
validated against explicit Zod schemas before reaching controller business
logic, using a reusable and strongly-typed validation mechanism, so that:

- invalid or out-of-contract payloads are rejected with a standardized
  `400` response;
- controllers receive already-validated, typed data without needing `any`
  or unsafe casts.

## Functional Requirements

- FR-001: Every relevant endpoint (see Open Questions — Blocking, for the
  exact endpoint set) must validate its request `body` against an explicit
  Zod schema before the corresponding controller/use-case logic executes.
- FR-002: Every relevant endpoint that accepts route `params` must validate
  those `params` against an explicit Zod schema (or equivalent explicit
  validation) before use.
- FR-003: Every relevant endpoint that accepts a `query` string must
  validate `query` against an explicit Zod schema before use.
- FR-004: When validation fails for `body`, `params`, or `query`, the API
  must respond with a standardized `400` error response consistent with
  the project's existing error contract (see `error-handler.middleware.ts`
  and `HttpError`), and must not execute the endpoint's business logic.
- FR-005: Schemas must reject unknown/extra properties that are not part
  of the declared contract for `body` payloads (i.e., an out-of-contract
  property causes a validation failure, not silent stripping or silent
  acceptance), unless a specific endpoint's existing documented contract
  requires otherwise.
- FR-006: Data delivered to a controller after successful validation must
  be typed according to the corresponding Zod schema's inferred output
  type; controllers must not need `any` or an unsafe cast to use that
  data.
- FR-007: The validation mechanism must be reusable across endpoints
  (i.e., not re-implemented ad hoc per route), consistent with the
  "middleware reutilizável" requirement from the task.
- FR-008: Existing valid payloads for the relevant endpoints must continue
  to be accepted after this change (no behavioral regression for
  already-conformant requests).

## Non-Functional Requirements

- NFR-001 (Security): No request data may be trusted based on a
  TypeScript type annotation or cast alone; all externally supplied
  `body`/`params`/`query` data is untrusted until it passes Zod
  validation.
- NFR-002 (Maintainability): Validation schemas must be reusable and must
  not force the domain/use-case layer to depend on Express or on
  Zod-specific types, consistent with `.claude/rules/architecture.md` and
  `.claude/rules/usecases.md`.
- NFR-003 (Compatibility): The standardized `400` error response format
  must not diverge from the existing error contract already produced by
  `error-handler.middleware.ts` and `HttpError` for other validation
  failures in the codebase, unless the architect explicitly documents and
  justifies a contract change.
- NFR-004 (Maintainability): The solution must reuse existing validation
  infrastructure already present in the repository (e.g.
  `zod-validation.helper.ts`, existing schemas under
  `src/infra/presentation/validators/`) rather than introducing a
  duplicate or parallel validation mechanism, unless the architect
  documents a concrete reason the existing mechanism cannot be reused/
  extended.

## Acceptance Criteria

- AC-001: For each relevant endpoint, sending a `body` that violates its
  schema (missing required field, wrong type, or unknown property when
  rejection of unknown properties applies) results in an HTTP `400`
  response, and no business-logic side effect (e.g., no database write)
  occurs.
- AC-002: For each relevant endpoint with `params`, sending a `params`
  value that violates its schema (e.g., a non-conforming identifier)
  results in an HTTP `400` response, and no business-logic side effect
  occurs.
- AC-003: For each relevant endpoint with a `query` contract, sending a
  `query` value that violates its schema results in an HTTP `400`
  response, and no business-logic side effect occurs.
- AC-004: For each relevant endpoint, sending a valid `body`/`params`/
  `query` conforming to its schema results in the endpoint's normal
  successful behavior (unchanged from before this task), and the
  controller receives typed data.
- AC-005: The `400` response body returned for a validation failure
  matches the project's existing standardized error shape (as already
  produced by `HttpError`/`error-handler.middleware.ts`) and does not leak
  internal implementation details (e.g., stack traces).
- AC-006: A static/type-level review of the modified controllers shows no
  new usage of `any`, `as any`, `@ts-ignore`, or `@ts-nocheck` introduced
  to work around request typing, consistent with
  `.claude/rules/typescript.md`.
- AC-007: Existing automated tests for previously-validated endpoints
  (e.g. comment creation/update/approval flows already using
  `zod-validation.helper.ts` or `comment.schema.ts`) continue to pass
  unmodified in their expected behavior.

## Constraints

- Must use Zod as the validation library (already a project convention;
  no new validation library may be introduced).
- Must not couple the domain/use-case layer to Express or Zod; validation
  belongs at the HTTP/presentation boundary, consistent with
  `.claude/rules/architecture.md` and `.claude/rules/usecases.md`.
- Must not weaken or bypass authentication, CSRF, or rate-limiting
  controls already present on the affected routes.
- Must not introduce secrets, credentials, or real environment values
  anywhere in this specification or its examples (per
  `.claude/rules/spec-security.md`); this task involves no such values.
- Must preserve the public HTTP contract (status codes, response shape)
  for already-valid requests; only newly-invalid requests should be
  affected by any new rejection behavior introduced by this task.

## Dependencies

- Express application already configured and running (confirmed
  satisfied per task-reader output).
- Existing error-handling middleware (`error-handler.middleware.ts`) and
  `HttpError` contract.
- Existing partial Zod validation infrastructure already present in the
  repository (see Context section) — to be inventoried and reused/
  extended by the architect rather than replaced wholesale.

## Out of Scope

- Defining the exact shape of the standardized `400` error body beyond
  "consistent with the existing `error-handler.middleware.ts`/`HttpError`
  contract" — this is an architectural/implementation detail.
- Deciding the exact middleware function signature or where exactly new
  schema files should live within the presentation layer — architectural
  decision.
- Introducing validation for endpoints outside the "relevant" set once
  defined by the architect based on repository inspection.
- Any change to authentication, session, or CSRF behavior.
- Any change to non-HTTP-boundary business rules already implemented in
  use cases.

## Risks

- Relying on TypeScript type casts instead of real runtime validation
  would leave the API trusting untrusted external input (explicitly
  flagged as a risk in the original task).
- Partial/inconsistent adoption (some endpoints validated, others not)
  could create a false sense of global coverage; the architect must
  produce a definitive list of "relevant" endpoints against the current
  routes to avoid this gap.
- Introducing a second, parallel validation mechanism alongside the
  existing `zod-validation.helper.ts`/schema files could create
  duplicated abstractions, contrary to `.claude/rules/architecture.md`.

## Open Questions

### Blocking

None.

### Non-blocking

- Which endpoints count as "relevant" for this task: all currently
  existing mutating endpoints (e.g. the `POST`/`PATCH`/`DELETE` routes
  observed under `src/infra/http/routes/*.routes.ts`, including
  `work.routes.ts`, `work-image.routes.ts`, `admin-comment.routes.ts`,
  `admin-work.routes.ts`, and `auth.routes.ts`), a subset of them, or also
  read (`GET`) endpoints that accept `query`/`params`? The task-reader
  output flagged this as open, and the coordinator has explicitly
  confirmed (not a spec-writer assumption) that the definitive endpoint
  set does not need to be fixed in this specification: the architect is
  authorized to inventory all current routes (e.g. via
  `src/infra/http/routes/*.routes.ts`) and propose the definitive
  "relevant" endpoint set, with justification, as part of the
  architectural plan, before the developer starts implementation. This is
  a deliberate, coordinator-authorized deferral of an implementation-scope
  decision to the architect, not an unresolved product ambiguity, and does
  not block starting architectural analysis. FR-001 through FR-003 refer
  to this same "relevant endpoint" set and will be scoped accordingly by
  the architect's proposal.
- Exact response body shape for the standardized `400` error (field
  names, whether Zod's flattened error detail is included) — to be
  verified by the architect against `error-handler.middleware.ts`'s
  current behavior; does not block starting architectural analysis.
- Whether unknown-property rejection (FR-005) should apply uniformly to
  every schema or only to newly created ones, given that some existing
  schemas (e.g. `comment.schema.ts`, `update-comment.schema.ts`) may
  already have a defined behavior for extra properties that should be
  preserved for compatibility (NFR-003).

## Traceability

FR-001 → AC-001, AC-004
FR-002 → AC-002, AC-004
FR-003 → AC-003, AC-004
FR-004 → AC-001, AC-002, AC-003, AC-005
FR-005 → AC-001
FR-006 → AC-004, AC-006
FR-007 → AC-004, AC-007
FR-008 → AC-004, AC-007
NFR-001 → AC-001, AC-002, AC-003
NFR-002 → AC-006
NFR-003 → AC-005
NFR-004 → AC-007
