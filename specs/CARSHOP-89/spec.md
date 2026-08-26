# CARSHOP-89 — Corrigir todas as issues do SonarQube no backend

## Status

Ready

## Source

Notion Task:
CARSHOP-89

## Context

SonarQube static analysis has flagged a set of issues in the CarShop
backend, ranging from a BLOCKER-severity security finding to LOW-severity
maintainability cleanups. Notion and the live SonarQube API were not
reachable at specification time, so the enumerated findings below were
supplied directly by the requester as the scope for this task. The
requester has since confirmed directly with the coordinator that this
seven-item export is complete and current: there are no other open
SonarQube findings for the backend in scope at this time. This is a
quality/hardening task: it must not change any existing functional
behavior for legitimate inputs, and it must fix issues at their root
cause instead of suppressing the analyzer.

The following findings are in scope:

1. BLOCKER / Security — `src/infra/repositories/mongo-work.repository.ts`:
   "Change this code to not construct database queries directly from
   user-controlled data."
2. HIGH / Maintainability — `src/infra/database/mongoose.ts`: "Refactor
   this function to reduce its Cognitive Complexity from 26 to the 15
   allowed."
3. MEDIUM / Maintainability — `src/infra/repositories/mongo-comment.repository.ts`:
   "Prefer `node:crypto` over `crypto`."
4. MEDIUM / Maintainability — `src/infra/repositories/mongo-work.repository.ts`:
   "Prefer `node:crypto` over `crypto`."
5. MEDIUM / Maintainability — `src/main/test-portfolio-model.ts`: "Prefer
   `node:crypto` over `crypto`."
6. LOW / Maintainability — `src/infra/docs/swagger.merge.ts`: "The empty
   object is useless."
7. LOW / Maintainability — `src/infra/repositories/mongo-work.repository.ts`:
   "Remove this unused import of `WorkStatus`."

Preliminary repository inspection (informational, not a design decision):

- Every identifier value that currently reaches a Mongo filter in
  `mongo-work.repository.ts` (`id`, `slug`, `workId`, `imageId`) appears, in
  the traced call paths, to originate from route params validated as
  primitive strings or from body fields validated with `typeof === 'string'`
  checks upstream (controllers/use cases). No currently-reachable path was
  found that passes a raw object into a Mongo filter. This does not make
  finding 1 a false positive by itself: the persistence adapter is the
  boundary responsible for not trusting its callers implicitly, per the
  project's persistence and security rules, so hardening at that boundary
  is still warranted as defense-in-depth. The exact mechanism (HOW) is an
  architectural decision, not a specification decision.
- The function most likely responsible for finding 2 is
  `normalizeErrorMessage` in `src/infra/database/mongoose.ts`, a
  cycle-protected BFS-style traversal over nested error causes/reasons with
  multiple nested conditionals inside a `while` loop. Confirming this and
  choosing the refactor shape is an architect responsibility.
- Findings 3, 4 and 5 are import-specifier-only changes
  (`from 'crypto'` → `from 'node:crypto'`), with no behavioral difference in
  Node.js's module resolution for this built-in.
- Finding 6's empty object spread (`...(mergedPaths[path] ?? {})`) in
  `src/infra/docs/swagger.merge.ts` is flagged as unnecessary; the merge
  behavior for repeated paths must be preserved exactly.
- Finding 7's `WorkStatus` type import in
  `src/infra/repositories/mongo-work.repository.ts` is not referenced
  anywhere else in that file's current contents.

## Objective

Resolve all seven enumerated SonarQube findings at their root cause,
without changing observable functional behavior for any currently valid
request, input, or configuration, while preserving existing architecture,
security posture, API contracts, and test coverage. Where a finding cannot
be resolved without an architectural, security, persistence, or contract
decision, that decision must be made explicitly by `architect` rather than
implicitly by whoever fixes the code.

## Functional Requirements

- FR-001: `MongoWorkRepository` must reject, at the persistence boundary,
  any identifier-shaped input (`id`, `slug`, `workId`, `imageId`) that is
  not a plain string before it is used to build a MongoDB query filter,
  regardless of what validation may or may not already have occurred in an
  upstream caller.
- FR-002: For every currently valid string identifier input, all
  `MongoWorkRepository` methods (`findById`, `findByIdIncludingDeleted`,
  `findBySlug`, `softDelete`, `hardDelete`, `hardDeleteData`, `addImage`,
  `removeImage`, `listDeletedBefore`) must continue to produce the exact
  same query results and side effects as before the fix.
- FR-003: When `MongoWorkRepository` receives a non-string or
  operator-shaped value (e.g., a plain object such as
  `{ $ne: null }`) where a string identifier is expected, it must reject
  the input safely (without executing an attacker-influenced query
  structure) rather than silently coercing, ignoring, or forwarding it
  to MongoDB as part of the filter.
- FR-004: The function in `src/infra/database/mongoose.ts` currently
  responsible for the Cognitive Complexity violation (traced to
  `normalizeErrorMessage`) must be refactored so that its Cognitive
  Complexity is 15 or lower, while `connectDatabase` and
  `disconnectDatabase` continue to behave exactly as before, including the
  Atlas "IP not allowed" detection and rethrow-with-cause behavior.
- FR-005: The `crypto` import in `src/infra/repositories/mongo-comment.repository.ts`
  must be changed to `node:crypto` with no change in the module's exported
  behavior.
- FR-006: The `crypto` import in `src/infra/repositories/mongo-work.repository.ts`
  must be changed to `node:crypto` with no change in the module's exported
  behavior.
- FR-007: The `crypto` import in `src/main/test-portfolio-model.ts` must be
  changed to `node:crypto` with no change in the script's behavior.
- FR-008: The useless empty-object construct in
  `src/infra/docs/swagger.merge.ts` must be removed or rewritten so that
  `mergeOpenApiPaths` continues to merge operations for repeated paths
  identically to its current behavior (later groups' operations for the
  same path and same HTTP method still override earlier ones; operations
  for different methods on the same path are still combined).
- FR-009: The unused `WorkStatus` type import must be removed from
  `src/infra/repositories/mongo-work.repository.ts` without affecting any
  other type or value used in that file.

## Non-Functional Requirements

- NFR-001 (Security): No fix in this task may introduce a new BLOCKER or
  HIGH severity issue, weaken input validation, or widen the set of
  accepted identifier shapes at the persistence boundary.
- NFR-002 (Maintainability): No suppression comment (e.g. `// NOSONAR`,
  disabling an ESLint/SonarQube rule inline) may be used to close a
  finding unless the finding is judged a false positive or not applicable,
  and in that case the judgment must be recorded with an explicit written
  justification alongside the suppression.
- NFR-003 (Reliability / Regression): The existing test suite
  (`npm test`, `npm run test:e2e` where applicable) must continue to pass
  unmodified in its assertions, except for tests updated specifically to
  cover the fixes in this task. `npm run build` and `npm run lint` must
  pass.
- NFR-004 (Compatibility): Public API contracts, response shapes, status
  codes, and Swagger-documented behavior must remain unchanged, since this
  is a quality task and not a behavior-change task.
- NFR-005 (Traceability): Any finding resolved as a false positive or
  "not applicable" must be documented with technical justification
  referencing the specific finding number from this specification.

## Acceptance Criteria

- AC-001: Given a valid string `id`, `slug`, `workId`, or `imageId`, when
  any `MongoWorkRepository` method that accepts that identifier is called,
  then the method's return value and any resulting database write are
  identical to its pre-fix behavior.
- AC-002: Given a non-string value (e.g., an object, array, number, or
  `null`) passed as an identifier to any `MongoWorkRepository` method,
  when the method is invoked, then the method must reject the input
  (e.g., by throwing/returning an error consistent with the project's
  existing error-handling conventions) without executing a MongoDB query
  built from that non-string value.
- AC-003: A unit test exists that calls a `MongoWorkRepository` method
  with a non-string/operator-shaped identifier (e.g.,
  `{ $ne: null }`) and asserts that the query is rejected and the
  underlying Mongoose model method is not invoked with that unsafe value.
- AC-004: After the refactor, static analysis (or an equivalent manual
  complexity count using the same Cognitive Complexity rules) reports the
  refactored function in `src/infra/database/mongoose.ts` at Cognitive
  Complexity ≤ 15.
- AC-005: Existing tests covering `connectDatabase`/`disconnectDatabase`
  (including the Atlas IP-not-allowed detection path) continue to pass
  without weakening any assertion.
- AC-006: `src/infra/repositories/mongo-comment.repository.ts`,
  `src/infra/repositories/mongo-work.repository.ts`, and
  `src/main/test-portfolio-model.ts` import `randomUUID` (or equivalent)
  from `node:crypto` instead of `crypto`.
- AC-007: `mergeOpenApiPaths` in `src/infra/docs/swagger.merge.ts` no
  longer contains the flagged useless empty-object construct, and an
  existing or updated test proves that merging two path groups that both
  declare operations for the same path still yields the combined/override
  behavior currently expected.
- AC-008: `src/infra/repositories/mongo-work.repository.ts` no longer
  imports `WorkStatus`, and the file still compiles with no unused-import
  or type errors.
- AC-009: No `// NOSONAR` or equivalent unexplained suppression comment is
  present in any file touched by this task.
- AC-010: `npm test`, `npm run build`, and `npm run lint` all pass after
  all seven findings are addressed.
- AC-011: No public route's request/response contract, status code, or
  Swagger documentation changes as a result of this task.

## Constraints

- Do not introduce a new library or dependency to solve any of these
  findings; Node's built-in `node:crypto` and existing project patterns
  are sufficient for the enumerated scope.
- Do not change the persistence adapter's public port signatures
  (`WorkRepositoryPort`) as part of the injection-hardening fix unless
  `architect` determines a signature change is unavoidable; if so, that is
  a contract change and must be escalated per the NON-TRIVIAL route.
- Do not change Swagger-documented contracts, HTTP status codes, or
  response shapes as a side effect of any fix in this task.
- Do not weaken or remove existing validations (`deletedAt: null` filters,
  soft-delete semantics, uniqueness constraints) while modifying
  `mongo-work.repository.ts`.
- Findings 1 (BLOCKER) and 2 (HIGH) require `architect` involvement before
  implementation, per the NON-TRIVIAL canonical route and per the
  project's Unexpected Change Requests rules, because they affect the
  persistence-security boundary and a shared infrastructure function
  respectively. Findings 3-7 are mechanical, low-risk, and do not
  independently require architectural design, but remain governed by this
  same specification and DoD, and must not be used as a channel to make
  unrelated changes.

## Dependencies

- `src/data/models/work.model.ts` and `src/data/models/comment.model.ts`
  (Mongoose schemas queried by the affected repositories).
- `src/core/domain/repositories/work.repository.ts` (the
  `WorkRepositoryPort` contract implemented by `MongoWorkRepository`).
- Existing unit tests under `test/unit/infra/repositories/` and
  `test/unit/infra/database/` (paths to be confirmed by `architect`/
  `tester` against actual mirrored test locations).
- `src/infra/docs/swagger.merge.ts` consumers in `src/infra/swagger.ts`
  and per-domain fragments under `src/infra/docs/*.swagger.ts`.

## Out of Scope

- Any SonarQube finding not enumerated in the seven items listed in this
  specification's Context section.
- Any behavior change to public API contracts, response formats, or
  status codes.
- Any refactor of files or functions not named in this specification,
  even if related SonarQube findings are discovered incidentally during
  implementation (such findings must be reported back to the coordinator,
  not fixed silently, so they can be classified and routed separately).
- Introducing new dependencies, upgrading existing dependencies, or
  changing build/lint tooling configuration.
- Broader input-validation redesign across the entire codebase beyond the
  persistence boundary named in finding 1.

## Risks

- The exact function responsible for finding 2 was inferred from manual
  inspection (`normalizeErrorMessage`) rather than confirmed against a
  live SonarQube report; `architect` must verify this against the actual
  Cognitive Complexity computation before committing to a refactor shape.
- Hardening the persistence boundary (finding 1) risks accidentally
  rejecting a currently-valid but not-yet-identified caller pattern if the
  validation added is too strict; this must be verified against all
  current call sites of `MongoWorkRepository` methods.
- Because Notion/live SonarQube API access was unavailable at
  specification time, the seven findings above were taken from a
  requester-supplied export rather than a live analysis run. The
  requester has confirmed this export is complete and current for the
  backend as of this specification. If a future live SonarQube report
  surfaces additional or different findings, that new evidence must be
  routed back through the coordinator as a separate/updated task rather
  than folded silently into this one.

## Open Questions

### Blocking

None. (Previously BQ-001 questioned whether the requester-supplied
finding export was complete and current. The coordinator confirmed
directly with the requester that the seven findings listed in this
specification are the complete and current set of open SonarQube
findings in scope for the backend; no other findings are open at this
time. This question is resolved and is not blocking.)

### Non-blocking

- NBQ-001: Should the hardening added at the persistence boundary
  (FR-001/FR-003) throw a domain-level `HttpError` (per existing use-case
  conventions) or a lower-level validation error caught by the repository
  itself? This is an implementation decision for `architect`.
- NBQ-002: Should `normalizeErrorMessage`'s refactor extract helper
  functions within the same file, or move logic into a separate module?
  This is an implementation decision for `architect`.

## Traceability

FR-001 → AC-002, AC-003
FR-002 → AC-001
FR-003 → AC-002, AC-003
FR-004 → AC-004, AC-005
FR-005 → AC-006
FR-006 → AC-006
FR-007 → AC-006
FR-008 → AC-007
FR-009 → AC-008
NFR-001 → AC-002, AC-003, AC-010
NFR-002 → AC-009
NFR-003 → AC-005, AC-010
NFR-004 → AC-011
NFR-005 → AC-009
