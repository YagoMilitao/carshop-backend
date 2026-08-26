# CARSHOP-88 — Arrumar testes unitários no backend

## Status

Ready

## Source

Notion Task:
CARSHOP-88

## Context

The backend's unit test suite does not currently provide adequate code
coverage. Coverage is measured via `npm run test:coverage`, which runs the
Jest unit suite (`test/unit/**/*.spec.ts`) and produces `coverage/lcov.info`,
the same artifact consumed by the Sonar quality-gate pipeline
(`.github/workflows/sonar-backend.yml`, `sonar-project.properties`).

A coverage baseline was captured by running `npm run test:coverage` against
the current `master` branch. The aggregated summary reported by Istanbul is:

| Metric     | Coverage | Covered / Total |
|------------|----------|------------------|
| Statements | 58.61%   | 602 / 1027       |
| Branches   | 54.51%   | 187 / 343        |
| Functions  | 62.06%   | 108 / 174        |
| Lines      | 58.42%   | 593 / 1015       |

Per-directory coverage (statements), from the same run, ranked lowest to
highest among directories below the 80% target:

| Directory                              | Statements |
|-----------------------------------------|-----------:|
| `infra/gateway/cloudinary`              | 0%         |
| `infra/http` (entrypoint file)          | 0%         |
| `infra/presentation/helpers`            | 0%         |
| `infra/presentation/validators`         | 0%         |
| `data/models`                           | 25%        |
| `infra/config`                          | 39.7%      |
| `main`                                  | 42.02%     |
| `infra/http/routes`                     | 46.39%     |
| `presentation/controllers`              | 50.38%     |
| `usecase`                               | 50.75%     |
| `infra/repositories`                    | 61.45%     |
| `infra` (root-level files)              | 69.44%     |
| `infra/database`                        | 72.34%     |
| `infra/services`                        | 75%        |
| `core/domain/application/Auth`          | 85.24%     |

Directories already at or above 80% (`core/domain/application/ApplicationError`,
`infra/docs`, `infra/middleware`, `infra/presentation/middleware`,
`presentation/helpers`) are not part of the gap and must not regress.

This baseline is provided to scope the work and identify where additional
tests are most needed. It is informational context, not a prescriptive list
of files the developer must edit one-by-one; the binding requirement is the
overall coverage threshold defined below.

## Objective

Raise the backend unit test suite to a healthy, fully-passing state and
increase overall code coverage to at least 80%, using the existing testing
conventions described in `.claude/rules/testing.md`, without weakening
existing assertions or altering production behavior.

## Functional Requirements

FR-001: Running the unit test command (`npm test`, equivalently
`npm run test:coverage`) must execute the full suite under
`test/unit/**/*.spec.ts` and complete with zero failing tests and zero
suite-level errors.

FR-002: New or modified unit tests must be added/edited following the
existing conventions in `.claude/rules/testing.md` (mirrored path under
`test/unit/`, mocking Mongoose models directly, setting required
`process.env` values before importing modules that read `env`).

FR-003: Coverage improvements must prioritize the currently low/zero
coverage areas identified in the Context baseline
(`data/models`, `infra/gateway/cloudinary`, `infra/http` entrypoint,
`infra/presentation/helpers`, `infra/presentation/validators`,
`infra/config`, `main`, `infra/http/routes`, `presentation/controllers`,
`usecase`), to the extent needed to reach the overall 80% target.

FR-004: Any bug uncovered while writing or fixing a test must not be fixed
silently inside this task. If a test reveals a genuine production defect,
the finding must be reported to the coordinator rather than patched as a
side effect of the test change (per existing project convention of not
performing direct production fixes during test/validation work).

FR-005: Existing passing tests must remain passing; existing assertions
must not be removed or weakened solely to make the suite pass or to reach
the coverage target.

## Non-Functional Requirements

NFR-001 (Reliability): The unit suite must run deterministically without a
real MongoDB connection or real Cloudinary/network calls, consistent with
the existing mocking patterns already used by repository and service specs.

NFR-002 (Maintainability): New tests must assert observable behavior and
public contracts, not internal implementation details that are not part of
the requirement being tested.

NFR-003 (Compatibility): No production code behavior, public API contract,
HTTP status, response shape, cookie, or header may change as a result of
this task. This is a test-only task.

## Acceptance Criteria

AC-001: When `npm test` is run, the command exits successfully with zero
failing test suites and zero failing test cases.

AC-002: When `npm run test:coverage` is run, the Istanbul/Jest summary
reports overall **Statements** coverage of at least 80%.

AC-003: When `npm run test:coverage` is run, the Istanbul/Jest summary
reports overall **Lines** coverage of at least 80% (this is the metric
consumed by the Sonar pipeline via `coverage/lcov.info`).

AC-004: Directories that were already at or above 80% statement coverage in
the baseline (see Context table) do not drop below their baseline
percentage after the change.

AC-005: `npm run build` completes without TypeScript errors after the test
changes (test files must not break the existing build; if test-only files
are excluded from `tsconfig.build.json`, this criterion applies to
`npm test`/`tsc` type-checking as configured in the repository).

## Constraints

- This is a test-only task: no production code in `src/` may be modified to
  make a test pass, except where a change is purely test-support scaffolding
  already sanctioned by existing conventions (e.g., no new production
  dependency, no new environment variable, no behavior change).
- Do not introduce a real database or real third-party network call in unit
  tests; continue using the existing Mongoose-model-mocking approach.
- Do not modify `sonar-project.properties` or the Sonar quality gate
  configuration hosted on SonarCloud as part of this task.
- Do not commit or push changes (per standard workflow rules); implementation
  is validated locally via `npm test` and `npm run test:coverage`.
- Branch and Function coverage percentages are reported for context but are
  not gating criteria for this task; the binding thresholds are Statements
  and Lines (AC-002, AC-003), matching the metric Sonar consumes.

## Dependencies

- `.claude/rules/testing.md` — testing conventions to follow.
- Existing Jest configuration in `package.json` (`collectCoverageFrom`,
  `coverageReporters`, `moduleNameMapper`).
- `coverage/lcov.info`, generated by `npm run test:coverage`, consumed by
  `.github/workflows/sonar-backend.yml`.

## Out of Scope

- Adding or modifying E2E tests under `test/e2e/` (the Notion task and DoD
  refer specifically to the unit test suite and unit coverage).
- Changing the Sonar quality gate threshold or CI workflow configuration.
- Refactoring production code for testability beyond what is strictly
  necessary to write a test against existing, unchanged behavior.
- Adding a `coverageThreshold` enforcement block to the Jest config (an
  implementation detail left to the developer's discretion, within existing
  conventions, if useful to prevent regression; not a requirement of this
  spec).

## Risks

- The 80% target is measured in aggregate across `src/**/*.ts`
  (`collectCoverageFrom` in `package.json`); reaching it may require touching
  many low-coverage areas, several of which currently have 0% coverage
  (`infra/gateway/cloudinary`, `infra/presentation/helpers`,
  `infra/presentation/validators`, and the `infra/http` entrypoint file).
- Some low-coverage modules integrate with external services (Cloudinary)
  or process wiring (`main`, `infra/http` entrypoint); tests for these must
  rely on mocking to stay within NFR-001 and may require more setup effort
  than modules with simpler dependencies.
- Coverage percentages will shift as new files are added by unrelated work;
  the baseline in this spec reflects the state of `master` at the time this
  spec was written and is a scoping aid, not a frozen target list.

## Open Questions

### Blocking

None.

### Non-blocking

- Should Branch and/or Function coverage also be required to reach 80%, in
  addition to Statements and Lines? The Notion task only states "80% do
  código," and Sonar's coverage widget is driven by `coverage/lcov.info`
  (line/condition based). This spec treats Statements and Lines as the
  binding metrics (AC-002, AC-003) and leaves Branches/Functions as
  informational. Confirm with the task owner if a stricter interpretation is
  required.
- Should a `coverageThreshold` be added to the Jest config to enforce the
  80% floor going forward (regression prevention), or is this a one-time
  clean-up task with enforcement left entirely to the Sonar quality gate?
  Not required for this task's Definition of Done; noted for the developer/
  architect to consider if it fits within existing conventions.

## Traceability

FR-001 → AC-001
FR-002 → AC-001, AC-002, AC-003
FR-003 → AC-002, AC-003
FR-004 → AC-001
FR-005 → AC-001, AC-004
NFR-001 → AC-001
NFR-002 → AC-004
NFR-003 → AC-005
