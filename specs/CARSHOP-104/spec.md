# CARSHOP-104 — Corrigir errorHandlerMiddleware não reconhecido pelo Express (vazamento de stack trace)

## Status

Ready

## Source

Notion Task:
CARSHOP-104

Related task referenced as origin/evidence: CARSHOP-103.

## Context

`errorHandlerMiddleware` (`src/infra/presentation/middleware/error-handler.middleware.ts`)
is declared with only 3 parameters: `(error, _request, response) => {...}`.
Express identifies an error-handling middleware exclusively by strict function
arity — it must declare exactly 4 parameters `(error, req, res, next)`. Because
this handler has arity 3, Express never registers it as an error handler and
it is never invoked for errors thrown or forwarded via `next(error)`,
including every `HttpError` raised across controllers.

As a consequence, all API error responses (401, 400, 404, 500, and any other
`HttpError`) currently fall through to Express's default error handler, which
returns an HTML page containing the full exception message and stack trace,
absolute server file paths, and internal module/dependency paths. This
directly violates `.claude/rules/security.md` ("do not expose internal
details in error messages").

This was confirmed by invoking the login endpoint with wrong credentials
against the real `createApp()`: the response was `text/html`, ~3.6KB,
containing a full stack trace, instead of the intended JSON contract
`{ message, details }` already implemented in the body of
`error-handler.middleware.ts`.

The JSON response contract implemented in the middleware body is already
correct and already the intended/documented public contract; it is simply
unreachable today due to the arity bug. This task does not introduce a new
contract — it makes the existing, intended code path reachable.

## Objective

Ensure that `errorHandlerMiddleware` is correctly recognized and invoked by
Express as the application's error-handling middleware for every error
thrown or forwarded via `next(error)`, so that API clients consistently
receive the intended JSON error contract instead of Express's default HTML
error page, without changing any other backend contract, route, or business
rule.

## Functional Requirements

- FR-001: `errorHandlerMiddleware` must be registered and invoked by Express
  for any error thrown in a route handler or passed to `next(error)`,
  regardless of route or controller.
- FR-002: When the forwarded error is an instance of `HttpError`, the
  response must have the error's `statusCode` as HTTP status and a JSON body
  containing `message` and `details` sourced from the error, matching the
  behavior already coded in the middleware body.
- FR-003: When the forwarded error is a `SyntaxError` produced by invalid
  JSON in the request body, the response must have HTTP status `400` and a
  JSON body with a `message` field, matching the behavior already coded in
  the middleware body.
- FR-004: When the forwarded error is an unexpected/unhandled error (neither
  `HttpError` nor the invalid-JSON `SyntaxError` case), the response must
  have HTTP status `500` and a generic JSON body with a `message` field, and
  must not include the error's stack trace, message internals, or any
  server-side file/module path in the response body.
- FR-005: The server-side `console.error(error)` logging call for unexpected
  errors must remain present and must continue to execute before the generic
  500 JSON response is sent.

## Non-Functional Requirements

- NFR-001 (Security): No HTTP error response emitted by the application may
  contain a stack trace, an absolute server file path, or an internal
  module/dependency path, for any error scenario covered by FR-002 through
  FR-004.
- NFR-002 (Compatibility): The change must not alter the response contract
  (status codes, JSON body shape, headers, cookies) for any endpoint beyond
  making the already-implemented JSON error contract reachable. No new
  public contract is introduced.

## Acceptance Criteria

- AC-001: Given a request that causes a controller/use case to raise an
  `HttpError` (e.g., login with an incorrect password), when the request is
  processed, then the HTTP response status must equal the `HttpError`'s
  `statusCode` and the response body must be JSON containing `message` (and
  `details` when applicable) — not an HTML page.
- AC-002: Given a request with a malformed JSON body, when the request is
  processed, then the HTTP response status must be `400` and the response
  body must be JSON containing a `message` field describing invalid JSON —
  not an HTML page.
- AC-003: Given a request that triggers an unexpected/unhandled error, when
  the request is processed, then the HTTP response status must be `500`, the
  response body must be a generic JSON object containing a `message` field,
  and the response body must not contain the error's stack trace or any
  server file/module path.
- AC-004: Given the same unexpected-error scenario in AC-003, the server-side
  process must still invoke `console.error` with the error, verifiable by a
  test asserting this side effect (e.g., via a spy), without that error
  detail being present in the HTTP response body.
- AC-005: At least one automated test (E2E and/or unit) must assert on the
  JSON error response body/shape for an `HttpError` scenario (e.g., login
  with incorrect password), replacing/strengthening any existing test that
  was intentionally weakened to avoid asserting on the previously-broken
  HTML body.

## Constraints

- The fix must be minimal and non-disruptive: it must only correct the
  handler's arity/registration so Express recognizes it as an error handler.
- No new public contract may be introduced.
- No other backend contract, route, or business rule may change.
- The server-side `console.error(error)` logging line must remain and must
  not be removed.
- Test coverage validating the JSON error contract (E2E and/or unit) is
  mandatory, not optional.

## Dependencies

- `src/infra/presentation/middleware/error-handler.middleware.ts`
- `test/e2e/app.e2e-spec.ts` (existing "rejects login with an incorrect
  password" test, currently intentionally weakened per an inline comment
  describing this bug)
- `specs/CARSHOP-103/spec.md` (Addendum A), which documents the discovery of
  this bug

## Out of Scope

- Any change to the JSON error body shape, field names, or status-code
  mapping already implemented in the middleware (these are being made
  reachable, not redesigned).
- Any change to authentication, session, CSRF, upload, or other business
  rules unrelated to error-response delivery.
- Introducing new error types, new HTTP status codes, or new endpoints.

## Risks

- If the arity fix is applied incorrectly (e.g., the added `next` parameter
  is used to forward the error further, or the parameter order is wrong),
  Express may still fail to recognize the handler, silently preserving the
  current vulnerability.
- Existing tests or Swagger error-response documentation could already
  assume the current (broken) behavior; these must be reviewed for
  consistency once the fix lands.

## Open Questions

### Blocking

None.

### Non-blocking

- Whether additional error scenarios beyond login-with-incorrect-password
  should also gain dedicated JSON-contract test coverage is left to the
  implementer's judgment, consistent with existing testing conventions.

## Traceability

FR-001 → AC-001, AC-002, AC-003
FR-002 → AC-001, AC-005
FR-003 → AC-002
FR-004 → AC-003
FR-005 → AC-004
