# CARSHOP-89 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-89/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Fix the 7 confirmed SonarQube findings enumerated in `specs/CARSHOP-89/spec.md`
at root cause, with zero observable behavior change, no new dependencies, no
contract change, and no suppression comments. Acceptance is fully mapped by
AC-001…AC-011.

## Current Architecture

- `MongoWorkRepository` (`src/infra/repositories/mongo-work.repository.ts`)
  implements `WorkRepositoryPort` and exposes identifier-accepting methods:
  `findById`, `findBySlug`, `findByIdIncludingDeleted`, `softDelete`,
  `hardDelete`, `hardDeleteData`, `addImage`, `removeImage`, plus
  `listDeletedBefore` (Date-based, not identifier-based) and `create`
  (insert data, not a query filter).
- All current call sites of these identifier-accepting methods originate
  from `requireStringRouteParam` (route params) or use-case DTOs typed as
  `string`. No reachable path passes a non-string today — the guard being
  added is genuine defense-in-depth, not a fix for a currently-exploitable
  bug, and not a false positive (per `.claude/rules/persistence.md`, the
  persistence adapter must not blindly trust callers).
- `mongo-comment.repository.ts` has the same identifier-query shape but is
  explicitly OUT OF SCOPE per spec (only its `crypto` import, finding 3, is
  in scope) — its query logic must not be touched.
- `src/infra/database/mongoose.ts`: `normalizeErrorMessage` is the only
  function of meaningful complexity in the file (cycle-protected BFS-style
  traversal over nested error causes/reasons inside a `while` loop);
  `connectDatabase`/`disconnectDatabase` are trivial and must remain
  behaviorally identical, including the Atlas "IP not allowed" detection
  and rethrow-with-cause behavior. `isAtlasIpNotAllowedError` already exists
  in this file as an unexported private helper — an established pattern to
  follow.
- Findings 3/4/5 are pure `crypto` → `node:crypto` import-specifier swaps
  with zero behavioral difference in Node.js's module resolution.
  `upload-work-image.use-case.ts` already imports from `'node:crypto'`
  while its test still does `jest.mock('crypto', ...)` and passes — this is
  existing proof that Jest 30 unifies both specifiers in its module
  registry.
- Finding 6 (`src/infra/docs/swagger.merge.ts`): the construct
  `...(mergedPaths[path] ?? {})` is redundant — spreading `undefined` in an
  object literal is already a no-op in JS. No existing test exercises
  `mergeOpenApiPaths`'s combine/override semantics directly.
- Finding 7: `WorkStatus` type import in `mongo-work.repository.ts` is
  unused and safe to remove; no other reference to it exists in the file.
- No finding is a false positive; no finding requires a contract, route, or
  controller change.

## Proposed Solution

Resolve each of the 7 findings at root cause, in place, with no behavioral
change for currently valid inputs:

1. Harden `MongoWorkRepository`'s identifier-accepting methods with an
   explicit runtime type guard before any Mongo filter is built.
2. Decompose `normalizeErrorMessage` into small, unexported, side-effect-free
   helper functions within the same file to bring Cognitive Complexity to
   ≤ 15, without touching `connectDatabase`/`disconnectDatabase`.
3. Swap `crypto` → `node:crypto` import specifiers in the three named files.
4. Remove the redundant `?? {}` empty-object spread in
   `swagger.merge.ts`'s `mergeOpenApiPaths`.
5. Remove the unused `WorkStatus` import from `mongo-work.repository.ts`.

## Technical Decisions

### Decision

Resolve NBQ-001: the persistence-boundary identifier guard in
`MongoWorkRepository` throws `HttpError(400, ...)` from
`src/core/domain/application/ApplicationError/http-error.ts`.

### Reason

This is the same class already used by `requireStringRouteParam` for
identical "identifier must be a string" violations. It is not a new
pattern; the infra → domain import direction is already allowed project-wide;
the central `errorHandlerMiddleware` already special-cases
`instanceof HttpError` regardless of the throwing layer.

### Alternatives Considered

A lower-level validation error caught and translated by the repository
itself (rejected: would introduce a new error shape/pattern not aligned
with the existing convention already used one layer up for the same class
of violation).

### Trade-offs

None material — reusing `HttpError` keeps the error contract consistent
end-to-end with no additional translation layer needed.

---

### Decision

Resolve NBQ-002: refactor `normalizeErrorMessage` by extracting helper
functions within the same file (`src/infra/database/mongoose.ts`), as
unexported module-private functions.

### Reason

Matches the existing pattern already present in the file
(`isAtlasIpNotAllowedError` is already a private helper here). No new
module is warranted for this scope.

### Alternatives Considered

Moving the traversal logic into a separate module (rejected: adds an
unnecessary abstraction/module boundary for logic that is only consumed
inside `mongoose.ts`; not proportionate to the finding).

### Trade-offs

None material — keeps the change localized and minimizes diff surface and
review risk.

---

### Decision

No signature change to `WorkRepositoryPort` is required.

### Reason

The identifier guard lives entirely inside `MongoWorkRepository` method
bodies; it does not need to be expressed in the port contract.

### Alternatives Considered

Changing the port signature to force stricter typing at the boundary
(rejected: spec explicitly disallows changing `WorkRepositoryPort` unless
architecturally unavoidable; it is avoidable here).

### Trade-offs

None material.

## Execution Flow

1. Implement Finding 7 (remove unused `WorkStatus` import) in
   `mongo-work.repository.ts`.
2. Implement Finding 1 (identifier guard) in `mongo-work.repository.ts`,
   reusing the same file already touched by Finding 7.
3. Implement Finding 4 (`node:crypto` swap) in `mongo-work.repository.ts`,
   same file.
4. Implement Finding 3 (`node:crypto` swap) in
   `mongo-comment.repository.ts`.
5. Implement Finding 5 (`node:crypto` swap) in
   `src/main/test-portfolio-model.ts`.
6. Implement Finding 2 (extract-function refactor of
   `normalizeErrorMessage`) in `src/infra/database/mongoose.ts`.
7. Implement Finding 6 (remove redundant `?? {}`) in
   `src/infra/docs/swagger.merge.ts`.
8. Update `test/unit/infra/repositories/mongo-work.repository.spec.ts`:
   change `jest.mock('crypto', ...)` specifier to `jest.mock('node:crypto', ...)`
   and add rejection tests for the new guard.
9. Create `test/unit/infra/docs/swagger.merge.spec.ts` with 3 test cases.
10. Optionally extend `test/unit/infra/database/mongoose.spec.ts` with one
    additional nested cause/reason chain case (not required).
11. Run the full validation strategy (see Testing Strategy).

## Files

### Files to Create

- `test/unit/infra/docs/swagger.merge.spec.ts`

### Files to Modify

- `src/infra/repositories/mongo-work.repository.ts` (guard method — F1;
  `node:crypto` — F4; remove `WorkStatus` import — F7)
- `src/infra/database/mongoose.ts` (extract-function refactor of
  `normalizeErrorMessage` — F2)
- `src/infra/repositories/mongo-comment.repository.ts` (`node:crypto` — F3)
- `src/main/test-portfolio-model.ts` (`node:crypto` — F5)
- `src/infra/docs/swagger.merge.ts` (remove useless `?? {}` — F6)
- `test/unit/infra/repositories/mongo-work.repository.spec.ts` (update
  `jest.mock` specifier; add ~7 rejection tests)
- `test/unit/infra/database/mongoose.spec.ts` (optional extra case, not
  required)

No changes to: `src/core/domain/repositories/work.repository.ts` (port
unchanged), Swagger fragments in `src/infra/docs/*.swagger.ts`, any
route/controller file, `src/core/domain/application/Gateway/cloudinary/*`
(untouched, out of scope).

## Contract Impact

None. No route, controller, status code, cookie, header, or
Swagger-documented schema changes.

## Persistence Impact

`MongoWorkRepository`'s identifier-accepting methods (`findById`,
`findByIdIncludingDeleted`, `findBySlug`, `softDelete`, `hardDelete`,
`hardDeleteData`, `addImage`, `removeImage`) gain a pre-query runtime guard
that rejects non-string identifier values before a Mongo filter is
constructed, using the validated value when building the filter. No change
to filter shapes, `deletedAt: null` semantics, or `.lean()` usage. `create`
(slug is insert data, not a query filter) and `listDeletedBefore` (takes a
`Date`, not an identifier) are not guarded. No emptiness/trim checks are
added — scope is "not a plain string" only.

## Security Impact

Finding 1 closes a BLOCKER-severity SonarQube finding by adding
defense-in-depth at the persistence boundary against operator-shaped or
non-string values (e.g. `{ $ne: null }`) reaching a MongoDB filter,
consistent with `.claude/rules/security.md` and
`.claude/rules/persistence.md`. The guard reuses the existing `HttpError`
pattern already used by `requireStringRouteParam` for the same class of
violation, so no new error-handling pattern is introduced. No suppression
comments are introduced for any finding.

## Swagger Impact

None. Finding 6's fix (`mergeOpenApiPaths` in `swagger.merge.ts`) does not
change the observable merge behavior for repeated paths: operations for
different HTTP methods on the same path are still combined, and later
groups' operations for the same path and method still override earlier
ones. No Swagger fragment content changes.

## Testing Strategy

- `test/unit/infra/repositories/mongo-work.repository.spec.ts`: update the
  `jest.mock` specifier from `'crypto'` to `'node:crypto'` to match the new
  import exactly. Add one rejection test per guarded method, asserting
  (a) the call rejects with an `HttpError` of status 400, and (b) the
  corresponding `WorkModel`/mocked method is `not.toHaveBeenCalled()`. Use
  `{ $ne: null } as unknown as string` as the offending value (an
  established cast pattern already in this test suite). Minimum coverage:
  `findById`, `findBySlug`, `softDelete`, `hardDelete`, `hardDeleteData`,
  `addImage`, `removeImage` (guarding both `workId` and `imageId` in at
  least one case each). No existing assertion in this file may be modified
  — all currently-passing tests use string ids and must keep passing
  unmodified.
- `test/unit/infra/database/mongoose.spec.ts`: no existing assertion needs
  to change. Existing Atlas-IP-not-allowed and rethrow tests must keep
  passing unmodified. Optional: one additional nested cause/reason chain
  case (tester's discretion, not blocking).
- `test/unit/infra/docs/swagger.merge.spec.ts` (new file), covering:
  1. Two groups with disjoint paths → both appear.
  2. Two groups declaring different HTTP methods on the same path → merged
     result has both methods.
  3. Two groups declaring the same method on the same path → later group's
     operation object wins (override), matching current behavior.
- Validation command sequence:
  1. `npx jest test/unit/infra/repositories/mongo-work.repository.spec.ts`
     (most specific, most changed)
  2. `npx jest test/unit/infra/database/mongoose.spec.ts`
  3. `npx jest test/unit/infra/docs/swagger.merge.spec.ts` (new)
  4. `npx jest test/unit/infra/repositories/mongo-comment.repository.spec.ts`
     (regression check for F3)
  5. `npm test`
  6. `npm run build`
  7. `npm run lint`
  8. `npm run test:e2e` — recommended as a final safety net (not strictly
     required by trigger rules, low-cost)

## Risks

- Finding 1's guard is defense-in-depth against a currently-unreachable
  path; the risk of over-rejecting legitimate calls is low, and has been
  checked against every current call site.
- The `normalizeErrorMessage` refactor is purely internal; verified
  branch-by-branch equivalence with the original is required. Must run
  `test/unit/infra/database/mongoose.spec.ts` and confirm Cognitive
  Complexity ≤ 15 (AC-004).
- `node:crypto` swaps carry no runtime risk; the only risk is a Jest mock
  specifier mismatch, addressed explicitly by updating the spec file.
- No new suppression comments anywhere (NFR-002/AC-009) — must be
  confirmed in review.
- The exact function responsible for finding 2 was inferred from manual
  inspection (`normalizeErrorMessage`) rather than confirmed against a live
  SonarQube report; this has now been confirmed by architect repository
  inspection as the only function of meaningful complexity in the file.

## Implementation Steps

1. Remove the unused `WorkStatus` type import from
   `src/infra/repositories/mongo-work.repository.ts` (Finding 7).
2. Add a private `assertStringIdentifier(value: unknown, fieldName: string): string`
   method to `MongoWorkRepository` that throws
   `HttpError(400, `${fieldName} deve ser uma string válida.`)` when
   `typeof value !== 'string'`, importing `HttpError` from
   `'../../core/domain/application/ApplicationError/http-error'` (Finding 1).
3. Call `assertStringIdentifier` as the first line of: `findById(id)`,
   `findByIdIncludingDeleted(id)`, `findBySlug(slug)`, `softDelete(id)`,
   `hardDelete(id)`, `hardDeleteData(id)`, `addImage(workId, image)`
   (guard `workId` only), `removeImage(workId, imageId)` (guard both). Use
   the validated value when building the Mongoose filter. Do not guard
   `create` or `listDeletedBefore`.
4. Swap `import { randomUUID } from 'crypto'` to `'node:crypto'` in
   `mongo-work.repository.ts` (Finding 4).
5. Swap the same import in `src/infra/repositories/mongo-comment.repository.ts`
   (Finding 3).
6. Swap the same import in `src/main/test-portfolio-model.ts` (Finding 5).
7. In `src/infra/database/mongoose.ts`, extract `normalizeErrorMessage`
   into three small, unexported, side-effect-free helpers:
   `shouldSkipVisited(current: unknown, visited: Set<unknown>): boolean`,
   `extractMessage(current: unknown): string | undefined`, and
   `extractNextCandidates(current: unknown): unknown[]` (preserving push
   order: cause before reason). `normalizeErrorMessage` becomes a thin loop
   that shifts, skips falsy/visited values, extracts a message, and queues
   next candidates. Leave `connectDatabase`/`disconnectDatabase` untouched
   (Finding 2).
8. In `src/infra/docs/swagger.merge.ts`, change
   `mergedPaths[path] = { ...(mergedPaths[path] ?? {}), ...operations };`
   to `mergedPaths[path] = { ...mergedPaths[path], ...operations };`
   (Finding 6).
9. Update `test/unit/infra/repositories/mongo-work.repository.spec.ts`:
   change the `jest.mock('crypto', ...)` specifier to
   `jest.mock('node:crypto', ...)`, and add rejection tests per the
   Testing Strategy section above.
10. Create `test/unit/infra/docs/swagger.merge.spec.ts` with the 3 cases
    described in the Testing Strategy section.
11. Optionally extend `test/unit/infra/database/mongoose.spec.ts` with an
    additional nested cause/reason chain case.
12. Run the full validation command sequence listed in Testing Strategy.

## Definition of Done Mapping

| Requirement | Plan Coverage |
|---|---|
| FR-001 | Step 2, 3 — `assertStringIdentifier` guard added to all identifier-accepting methods |
| FR-002 | Step 3 — guard uses validated value, preserves existing filter shape/results for valid strings |
| FR-003 | Step 2, 3 — non-string/operator-shaped values rejected via `HttpError(400, ...)` before query construction |
| FR-004 | Step 7 — `normalizeErrorMessage` decomposed into helpers, Cognitive Complexity ≤ 15 |
| FR-005 | Step 5 — `node:crypto` swap in `mongo-comment.repository.ts` |
| FR-006 | Step 4 — `node:crypto` swap in `mongo-work.repository.ts` |
| FR-007 | Step 6 — `node:crypto` swap in `test-portfolio-model.ts` |
| FR-008 | Step 8 — redundant `?? {}` removed, merge semantics preserved and tested |
| FR-009 | Step 1 — unused `WorkStatus` import removed |
| NFR-001 | Steps 2-3, 7 — no accepted-shape widening; no new BLOCKER/HIGH introduced |
| NFR-002 | All steps — no suppression comments used anywhere |
| NFR-003 | Step 12 — full validation sequence (`npm test`, `npm run build`, `npm run lint`, `npm run test:e2e`) |
| NFR-004 | No route/controller/Swagger fragment touched — verified in Contract Impact and Swagger Impact |
| NFR-005 | N/A — no finding resolved as false positive; all seven confirmed genuine by architect |
| AC-001 | Step 3 — valid string inputs produce identical results/side effects (existing tests unmodified) |
| AC-002 | Step 2, 3 — non-string identifiers rejected without executing the query |
| AC-003 | Step 9 — new rejection tests assert `HttpError` and `not.toHaveBeenCalled()` on the underlying model method |
| AC-004 | Step 7 — Cognitive Complexity ≤ 15 confirmed for refactored function |
| AC-005 | Step 7, 11 — `connectDatabase`/`disconnectDatabase` tests, including Atlas IP-not-allowed path, kept passing unmodified |
| AC-006 | Steps 4-6 — `node:crypto` import confirmed in all three files |
| AC-007 | Step 8, 10 — construct removed, new test proves combine/override behavior preserved |
| AC-008 | Step 1 — `WorkStatus` import removed, file compiles cleanly |
| AC-009 | All steps — no `// NOSONAR` or equivalent suppression comment introduced |
| AC-010 | Step 12 — `npm test`, `npm run build`, `npm run lint` all pass |
| AC-011 | Contract Impact / Swagger Impact — no route, status code, or Swagger doc changes |

## Open Non-Blocking Questions

None. NBQ-001 and NBQ-002 from the specification have been resolved by
architect (see Technical Decisions above): the persistence-boundary guard
throws `HttpError(400, ...)`, and the `normalizeErrorMessage` refactor
extracts helper functions within the same file.
