---
paths:
  - 'src/**/*.ts'
  - 'test/**/*.ts'
---

# Testing and validation

- Unit tests live in `test/unit`, mirroring the file's path under `src`; E2E tests live in `test/e2e/*.e2e-spec.ts`.
- Use Jest and follow the mocking patterns already present. Mongo repositories are tested by mocking the Mongoose models, without a real connection by default.
- Set test environment variables before importing modules that read `process.env`, and restore global state after each scenario.
- Every bug fix must include a test that fails without the fix. Every feature must cover the happy path, validation, and the main error case.
- Test observable behavior and contracts; avoid coupling tests to internal details that aren't part of the requirement.
- Run the most specific test first. Then run `npm test` and `npm run build` when there's a TypeScript change.
- Run `npm run test:e2e` when routes, middlewares, authentication, cookies, server composition, or end-to-end HTTP contracts change.
- Do not remove assertions, skip tests, or reduce coverage just to make the suite pass. If a failure is pre-existing, record evidence in the final result.

## Unit-Test Coverage Policy

This section is the single normative source for the new/changed-code unit-test
coverage target, its measurement method, and its exception criteria. Every
other document (`CLAUDE.md`, `.claude/agents/*.md`) must cross-reference this
section rather than restating a different threshold or scope.

### Target and Scope

- New or changed production code under `src/**/*.ts` (excluding `*.d.ts`) is
  expected to carry `>= 80%` unit-test coverage.
- The target applies to the new/changed code produced by the task itself
  (task-diff-based), not to the repository's historical or global coverage
  number. A task must not be blocked by pre-existing, unrelated coverage
  gaps elsewhere in the codebase.
- This target governs unit-test coverage. It is distinct from E2E/integration
  coverage under `test/e2e/*.e2e-spec.ts`: E2E/integration tests do not
  automatically substitute for unit tests when the behavior in question is
  reasonably unit-testable.

### Measurement Method

- Run `npm run test:coverage` to produce `coverage/lcov.info` (the project's
  existing Jest coverage tooling; no new tool or dependency is introduced).
- For **added files** (new in this task): use the file's own aggregate
  coverage — either the per-file line in the `text` summary or the file's
  `SF:`/`LH:`/`LF:` block in `coverage/lcov.info` (`LH` = lines hit, `LF` =
  lines found; the file's coverage percentage is `LH / LF`).
- For **modified (pre-existing) files**: cross-reference the line ranges
  changed by `git diff` for that file against the file's `DA:<line>,<hits>`
  records in `coverage/lcov.info`, to approximate coverage of just the
  changed lines rather than the whole-file percentage.
- This method is an approximation, not a precision diff-coverage tool. There
  is no diff-coverage engine wired into this repository. The imprecision
  inherent in this approximation is itself a legitimate — but not
  automatic — input to the exception path below; it must never be invoked
  merely to avoid measuring or writing reasonably implementable tests.

### Exception Criteria

An exception to the `>= 80%` target may be accepted only when reaching it is:

- **Technically infeasible** — e.g., the remaining uncovered lines require
  a real network/database connection or third-party SDK behavior that
  cannot be reasonably mocked given existing project patterns.
- **Disproportionate** — e.g., trivial generated/boilerplate code where
  writing a unit test would not exercise any real branching or business
  logic beyond what is already covered.
- **Not applicable** — e.g., pure type-only declaration files, or a schema
  file containing no custom logic at all.

Mongoose model files with custom hook or validation logic (e.g. pre-save
hooks, custom validators, virtuals with logic) are **not automatically
exempt**. Only genuinely pure passthrough schema declarations — with no
custom hook, validator, or derived-field logic — may qualify for this
exception; the presence of a `pre`/`post` hook or a custom `validate`
function requires that logic to be unit-tested like any other business
rule (see the existing Mongoose pre-save-hook unit-testing-without-DB
pattern used elsewhere in this project).

An exception must never be used merely to avoid writing tests that are
reasonably implementable. Reaching the numeric target is also not a proxy
for test quality: 80% coverage obtained through tests that do not validate
relevant behavior does not satisfy this policy.

When an exception is accepted for a task, the workflow's recorded result
must include: the coverage percentage actually obtained, the uncovered
parts of the new/changed code, the stated reason for the exception, and the
residual risk.

### Prohibited Test Practices

- Do not write artificial tests, tests without meaningful assertions, or
  tests written solely to inflate a coverage metric.
- Tests must validate observable behavior, requirements, or acceptance
  criteria (`FR-*`/`AC-*` when a specification exists) — not irrelevant
  internal implementation details.
- Coverage-gaming (e.g., calling a function only to satisfy a line-coverage
  counter, without asserting on its result or effects) is prohibited under
  the same "do not remove assertions ... reduce coverage" boundary already
  stated above.
