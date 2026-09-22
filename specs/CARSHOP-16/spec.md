# CARSHOP-16 — Sanitizar inputs de comentários

## Status

Ready

## Source

Notion Task:
CARSHOP-16

## Context

Visitors can submit comments on published works through the public comment
submission endpoint. The submitted fields — currently named `authorName`
and `content` in the existing request contract (`src/infra/presentation/
validators/comment.schema.ts`), corresponding to the Notion task's
generic `name`/`message` wording — are persisted and later rendered to
other visitors once an admin approves the comment. Today, `authorName`
and `content` are only validated for length (`trim()`, `min`, `max`) via
the existing Zod schema; no check exists to detect or block HTML markup
or script content. This creates a stored/persistent XSS risk: malicious
markup or script content submitted by one visitor could be persisted and
later delivered to other visitors or to the admin moderation view.

## Objective

Ensure that HTML markup and script content submitted in the comment
`authorName` and `content` fields cannot be persisted by the comment
creation flow, so that no comment stored by the system — and later
returned by the API — contains executable or renderable HTML.

## Functional Requirements

FR-001: When a comment submission's `authorName` or `content` field
contains HTML markup (e.g. any `<tag>`-shaped construct such as
`<script>`, `<img>`, `<b>`, or an HTML entity used to encode such a
construct), the system must not persist the submission as provided.

FR-002: When a comment submission's `authorName` or `content` field
contains a `<script>` element or another construct commonly used for
script injection (e.g. an `on*` event-handler attribute or a
`javascript:` URI), the system must not persist the submission as
provided.

FR-003: When a comment submission is rejected under FR-001 or FR-002, the
system must respond with a `4xx` client error status and a validation
error message consistent with the existing error contract used by the
comment creation endpoint (i.e. the same error-handling mechanism already
used for the existing length-based validation on `authorName`/`content`),
and must not create a comment record.

FR-004: Existing validation behavior (required fields, `authorName`
length between 2 and 80 characters, `content` length between 3 and 1000
characters, and trimming of surrounding whitespace) must remain unchanged
for submissions that do not contain HTML or script content.

FR-005: A comment submission consisting solely of plain text (no HTML
tags, entities, or script constructs) must continue to be accepted and
persisted exactly as today, subject to the existing length rules.

## Non-Functional Requirements

NFR-001 (Security): The chosen detection/rejection approach must not rely
on the frontend for protection; the backend must independently guarantee
that no comment containing HTML or script markup is ever persisted or
returned by the API, regardless of what any client renders.

NFR-002 (Compatibility): The fix must not change the comment creation
endpoint's route, method, request field names, or response shape for
accepted submissions; it must only add rejection behavior for the cases
described in FR-001–FR-003.

NFR-003 (Maintainability): The detection logic must be centralized (e.g.
at the validation layer already responsible for `authorName`/`content`
constraints) rather than duplicated across multiple call sites.

## Acceptance Criteria

AC-001: Given a comment submission where `content` is
`"<script>alert(1)</script>"`, when the submission is processed, then the
system must respond with a `4xx` status and must not create a comment
record.

AC-002: Given a comment submission where `authorName` is
`"<img src=x onerror=alert(1)>"`, when the submission is processed, then
the system must respond with a `4xx` status and must not create a comment
record.

AC-003: Given a comment submission where `content` contains an inline
event handler (e.g. `"<div onclick=\"alert(1)\">hi</div>"`), when the
submission is processed, then the system must respond with a `4xx` status
and must not create a comment record.

AC-004: Given a comment submission where `content` contains a
`javascript:` URI (e.g. `"<a href=\"javascript:alert(1)\">click</a>"`),
when the submission is processed, then the system must respond with a
`4xx` status and must not create a comment record.

AC-005: Given a comment submission where `authorName` is `"Maria Silva"`
and `content` is `"Ótimo trabalho, ficou excelente!"` (plain text, no
markup), when the submission is processed, then the comment must be
created exactly as under current behavior (subject to existing length
rules).

AC-006: Given a comment submission where `content` is shorter than 3
characters or `authorName` is shorter than 2 characters (with no HTML
present), when the submission is processed, then the existing
length-validation rejection behavior must remain unchanged.

AC-007: No comment persisted by the system, when later retrieved through
the public "list approved comments" endpoint, contains an unescaped
`<`/`>`-delimited HTML tag in `authorName` or `content`.

## Constraints

- Must not mandate a specific third-party sanitization library; no such
  library is currently present in `package.json`. The implementation
  approach (regex-based detection, an allow-list/deny-list check, or a
  sanitization dependency) is left to the architect, provided the
  observable behavior in FR-001–FR-005 and AC-001–AC-007 holds.
- Must preserve the existing request/response contract, status codes, and
  field names of the comment creation endpoint for accepted submissions.
- Must follow the existing project convention of validating invariants
  before persisting and signaling expected failures via the same
  validation-error mechanism already used for `authorName`/`content`
  length checks (see `.claude/rules/usecases.md`), rather than silently
  stripping tags before persisting.
- Must not introduce any frontend rendering change; this repository is
  backend-only and does not render HTML from these fields.

## Dependencies

- The comment creation endpoint, its controller, use case, and validation
  schema already exist (`src/presentation/controllers/comment.controller.ts`,
  `src/usecase/create-comment.use-case.ts`,
  `src/infra/presentation/validators/comment.schema.ts`), confirmed present
  in the current repository.

## Out of Scope

- Sanitizing or validating any field other than `authorName`/`content` on
  the comment creation endpoint.
- Retroactively sanitizing or migrating comments already persisted before
  this change.
- Any frontend-side rendering safeguard (e.g. avoiding
  `dangerouslySetInnerHTML`), since this repository does not contain
  frontend rendering code.
- Comment moderation/approval workflow changes.

## Risks

- If detection logic is too permissive, malicious markup could still be
  persisted, reintroducing the stored-XSS risk this task exists to close.
- If detection logic is overly strict, legitimate plain-text comments
  containing characters like `<` or `>` in non-HTML contexts (e.g. "5 < 10
  segundos") could be incorrectly rejected; the implementation should aim
  to reject actual HTML/script constructs rather than any bare `<`/`>`
  character, but the exact boundary is an implementation decision for the
  architect.

## Open Questions

### Blocking

None.

### Non-blocking

- Whether a bare `<`/`>` character used in ordinary prose (not forming a
  tag-like construct) should be rejected or preserved as plain text is
  left to the architect's implementation choice, provided it does not
  contradict AC-001–AC-007.

## Traceability

FR-001 → AC-001, AC-002, AC-007
FR-002 → AC-001, AC-002, AC-003, AC-004, AC-007
FR-003 → AC-001, AC-002, AC-003, AC-004
FR-004 → AC-006
FR-005 → AC-005
NFR-001 → AC-007
NFR-002 → AC-005, AC-006
NFR-003 → AC-001, AC-002, AC-003, AC-004
