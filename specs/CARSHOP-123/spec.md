# CARSHOP-123 — Corrigir backlog de ESLint pré-existente para viabilizar gate bloqueante no CI

## Status

Ready

## Source

Notion Task:
CARSHOP-123

## Context

CARSHOP-120 introduced a blocking lint step in CI
(`.github/workflows/sonar-backend.yml`) plus a `lint:check` script in
`package.json`, on branch `chore/CARSHOP-120`. That change is not yet
merged/activated because `npm run lint:check` currently fails against the
repository's existing state (including on `master`, unrelated to
CARSHOP-120's own change) due to a pre-existing ESLint backlog.

CARSHOP-123 is the blocking dependency of CARSHOP-120: the CI gate cannot
be safely activated until this backlog is cleared.

At the time the task was created, running `npm run lint:check` reported
130 errors and 5 warnings, concentrated mostly in test files, in these
categories:

- Prettier formatting;
- `@typescript-eslint/no-unused-vars`;
- `require-await`;
- `no-floating-promises`;
- other similar type-safety rules.

These counts may have shifted since task creation. Implementation must
re-run `npm run lint:check` at execution time to obtain current ground
truth rather than trusting the numbers above.

For factual context only (not a specification requirement): by explicit
user decision, implementation for this task will happen on the existing
`chore/CARSHOP-120` branch (shared with CARSHOP-120), not on a new branch.

## Objective

Eliminate the current ESLint backlog so that `npm run lint:check` exits
with status `0` against the target branch, without changing any
production behavior, so that the blocking CI lint gate added by
CARSHOP-120 can be safely merged and reactivated without breaking
in-flight PRs.

## Functional Requirements

FR-001: Running `npm run lint:check` against the target branch must
produce zero ESLint errors and zero ESLint warnings.

FR-002: All safely auto-fixable violations must be corrected using
ESLint's `--fix` capability (or equivalent existing tooling, e.g.
`npm run lint` / `npm run format`), consistent with the project's
existing lint/format scripts.

FR-003: All violations that cannot be safely auto-fixed must be corrected
manually, preserving the original intent and correctness of the affected
code — in particular, for test files affected by `no-floating-promises`
or `require-await`, the fix must preserve the test's real async behavior
(e.g. an added `await` must not hide or skip an assertion that was
previously actually executed).

FR-004: The cleanup must not alter observable production behavior. No
change to `src/**` may alter runtime behavior, public contracts, or
business logic as a side effect of a lint fix.

## Non-Functional Requirements

NFR-001 (Maintainability): The fix must not introduce new ESLint
suppressions (e.g. `eslint-disable` comments) as a way to silence
findings, unless a genuine, justified exception already accepted by the
project's existing conventions applies.

NFR-002 (Reliability): Existing test suites (`npm test`, and
`npm run test:e2e` when applicable) must continue to pass after the
cleanup, with no reduction in assertions or test coverage caused by the
cleanup itself.

## Acceptance Criteria

AC-001: When `npm run lint:check` is executed against the target branch
after the change, the command must exit with status code `0` and report
zero errors and zero warnings.

AC-002: When the diff introduced by this task is reviewed, no file under
`src/**` may show a behavioral change (only formatting/lint-motivated
changes are acceptable); any behavioral change found must be treated as
out of scope and reverted or escalated.

AC-003: When `npm test` is executed after the cleanup, all previously
passing tests must still pass, and no test assertion present before the
cleanup may be missing afterward.

AC-004: When a test file's `no-floating-promises` or `require-await`
violation is fixed, the corrected test must still exercise and assert the
same behavior it did before the fix (verified by manual inspection of the
diff for each such fix).

AC-005: Once AC-001 through AC-004 are satisfied, the CI blocking lint
step added by CARSHOP-120 (on branch `chore/CARSHOP-120`) must be mergeable
and activatable without failing due to pre-existing backlog.

## Constraints

- This is a lint/formatting-only cleanup task; it must not expand into
  refactoring, feature work, or dependency changes.
- The exact current error/warning count must be obtained by running
  `npm run lint:check` locally at implementation time; the stale
  130 errors / 5 warnings figures from task creation are not to be relied
  upon as ground truth.
- No secrets, credentials, or environment values are involved in this task.
- Per `.claude/rules/spec-security.md`, this document intentionally omits
  the raw file/line-level lint violation list; only the category summary
  is recorded here.

## Dependencies

- Blocks completion/activation of CARSHOP-120 (blocking CI lint gate and
  `lint:check` script, implemented on branch `chore/CARSHOP-120`).
- Depends on the current repository state (`master` and
  `chore/CARSHOP-120`) as the source of the actual backlog to be fixed.

## Out of Scope

- Changing or expanding the CI workflow itself (`.github/workflows/sonar-backend.yml`)
  — that is owned by CARSHOP-120.
- Introducing new ESLint rules or changing existing rule configuration.
- Any production behavior change, refactor, or feature work not strictly
  required to satisfy a lint/formatting rule.

## Risks

- Backlog is concentrated in test files with type-safety rules
  (`no-floating-promises`, `require-await`). Careless manual fixes could
  mask real async test behavior (e.g., adding a missing `await` in a way
  that causes an assertion to no longer actually run). Fixes must
  preserve genuine test intent and correctness, not just silence the
  linter.
- Exact counts (130 errors / 5 warnings) may have already shifted since
  task creation; implementation must re-run `npm run lint:check` to
  confirm current ground truth.

## Open Questions

### Blocking

None.

### Non-blocking

- None identified beyond the risks noted above.

## Traceability

FR-001 → AC-001
FR-002 → AC-001, AC-002
FR-003 → AC-001, AC-004
FR-004 → AC-002
NFR-001 → AC-001, AC-002
NFR-002 → AC-003, AC-004
