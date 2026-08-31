# CARSHOP-106 — Adicionar gate de dependências vulneráveis no CI

## Status

Ready

## Source

Notion Task:
CARSHOP-106

## Context

The backend's CI workflow (`.github/workflows/sonar-backend.yml`) currently
installs dependencies, runs the unit test suite with coverage, runs a
SonarCloud scan, and checks the SonarCloud Quality Gate. It does not
inspect the dependency tree for known vulnerabilities. As a result, a pull
request can introduce a new dependency (or a transitive dependency update)
carrying a high or critical severity advisory without the pipeline
flagging or blocking it.

This task was originally blocked in Notion pending CARSHOP-105 (remediate
the then-current vulnerability baseline). CARSHOP-105 has since been
merged into `master` (PR #38, commit `a854215`).

During investigation of this task, the coordinator additionally found
that, at the time of writing, `master`'s `package-lock.json` still
resolves a high-severity `ip-address` transitive vulnerability (reached
via `express-rate-limit`) at version `10.1.0`, even though a non-breaking,
patch-level fix (`10.7.0`) is available via the standard dependency-fix
tooling. If this residual vulnerability is not resolved, the new CI gate
introduced by this task would fail immediately on `master`. The user was
consulted and explicitly decided that fixing this residual high-severity
vulnerability (updating `package-lock.json` so a clean install resolves a
non-vulnerable `ip-address` version) is in scope for CARSHOP-106, as a
prerequisite so the new gate starts green on `master`.

## Objective

Add a reproducible, documented dependency-vulnerability gate to the
backend CI pipeline that fails the build when a high or critical severity
vulnerability is present in production dependencies, establishes an
explicit and tracked policy for moderate-severity vulnerabilities,
enables an automated mechanism that proposes dependency updates, defines
a controlled exception procedure for cases where a vulnerability cannot
be immediately fixed, and preserves the existing test and SonarCloud
pipeline behavior. As a prerequisite, resolve the currently known
residual high-severity vulnerability on `master` so the new gate is green
from the moment it lands.

## Functional Requirements

- FR-001: The CI pipeline must run a dependency-vulnerability audit step
  against the installed dependency tree after dependencies are installed
  and before (or alongside) the existing test/SonarCloud steps, on every
  pull request and on pushes to the protected branches already covered by
  the workflow.
- FR-002: The audit step must be reproducible: it must run against the
  exact dependency tree resolved by the committed lockfile (i.e. a clean,
  deterministic install), not against a machine-specific or previously
  cached `node_modules` state.
- FR-003: The audit must evaluate production (non-dev) dependencies for
  high and critical severity known vulnerabilities.
- FR-004: When a high or critical severity vulnerability is present in a
  production dependency, the CI job must fail (non-zero exit / failed
  step), blocking the pull request from being reported as green.
- FR-005: When no high or critical severity vulnerability is present in
  production dependencies, the audit step must not fail the build solely
  due to lower-severity findings (see FR-006 for how moderate findings
  are handled).
- FR-006: Moderate-severity vulnerabilities must not silently pass
  unnoticed: the pipeline or accompanying documentation must make
  moderate findings visible (e.g. via a persisted report/log/artifact or
  an explicit output) and the project must document a written policy
  describing how moderate findings are triaged, by whom, and how they are
  tracked for follow-up (e.g. a tracked issue/task per finding or per
  batch of findings).
- FR-007: A full audit report (covering findings at all evaluated
  severities, not only the ones that block the build) must be captured as
  part of the CI run (e.g. as a build log section or a stored artifact),
  so that moderate/low findings remain inspectable even though they do
  not fail the build.
- FR-008: An automated mechanism (e.g. Dependabot or an equivalent
  supported mechanism) must be configured for this repository to
  regularly propose pull requests updating npm dependencies affected by
  known advisories or simply out of date.
- FR-009: A documented exception procedure must exist for cases where a
  known vulnerability (of any severity that would otherwise require
  action per the policy) cannot be immediately fixed. Each exception must
  record, at minimum: the affected package/advisory, a justification for
  why it is not being fixed now, an explicit residual-risk statement, a
  named owner responsible for the exception, and an expiration/review
  date by which the exception must be re-evaluated.
- FR-010: The exception procedure must define how an exception is applied
  in practice (e.g. how the gate is made aware of an approved exception)
  without permanently and silently suppressing the underlying advisory
  from future audit runs once the exception expires.
- FR-011: The existing pipeline behavior — running the unit test suite
  with coverage and running the SonarCloud scan and Quality Gate check —
  must continue to execute and must not lose test coverage reporting as a
  result of adding the new gate.
- FR-012: As a prerequisite for this task, `package-lock.json` on the
  target branch must be updated so that a clean dependency install no
  longer resolves the known high-severity `ip-address` transitive
  vulnerability (reached via `express-rate-limit`) at the vulnerable
  version; the fix must be a non-breaking, patch-level (or otherwise
  compatible) update.

## Non-Functional Requirements

- NFR-001 (Security): The vulnerability gate must evaluate the actual
  dependency tree that would be installed by the pipeline (i.e. consistent
  with the committed lockfile), not a stale or manually-curated list, so
  the gate reflects the real current risk.
- NFR-002 (Reliability): The audit step must produce a deterministic
  result for a given lockfile state (no dependency on external mutable
  state such as developer-local `node_modules`), so that CI outcomes are
  reproducible across runs and across contributors.
- NFR-003 (Maintainability): The moderate-vulnerability policy and the
  exception procedure must be documented in a location a future
  contributor can discover (e.g. project documentation or a CI
  configuration comment/reference), not left as undocumented tribal
  knowledge.
- NFR-004 (Compatibility): Adding the gate must not change the existing
  observable behavior, status checks, or outputs of the unit test and
  SonarCloud steps beyond what is required to accommodate the new step
  (e.g. step ordering).
- NFR-005 (Security): CI workflow changes must not introduce a widening
  of the workflow's existing permissions, and any new or modified GitHub
  Action reference should be pinned in a manner consistent with the
  pinning approach already used for existing steps in this workflow.

## Acceptance Criteria

- AC-001: When a pull request's dependency tree contains a high or
  critical severity vulnerability in a production dependency, the CI
  pipeline run for that pull request fails.
- AC-002: When a pull request's dependency tree contains no high or
  critical severity vulnerability in production dependencies, the audit
  step does not fail the build.
- AC-003: A full dependency audit report (including moderate and lower
  severity findings) is available from the CI run (as a log section or an
  artifact) for every run in which the audit step executes.
- AC-004: A written policy document (or documented section) exists
  describing how moderate-severity vulnerabilities are triaged, tracked,
  and followed up, and it is discoverable in the repository.
- AC-005: An automated dependency-update mechanism configuration (e.g.
  Dependabot) exists in the repository and is configured to target the
  backend's npm dependencies.
- AC-006: A documented exception procedure exists describing the required
  fields (justification, residual risk, owner, expiration date) and how
  an exception is applied and later re-evaluated.
- AC-007: The unit test suite (with coverage) and the SonarCloud scan and
  Quality Gate check continue to run and produce their existing status
  checks after the new gate is added.
- AC-008: Running the production-only dependency audit against `master`
  (or the branch containing this change) after the prerequisite fix
  reports no high-severity `ip-address` vulnerability.
- AC-009: With the prerequisite fix and the new gate both applied, a CI
  run on `master` (or an equivalent baseline branch) passes the new
  dependency-vulnerability gate step.

## Constraints

- No new architectural pattern, application module, or product feature
  may be introduced; scope is limited to CI pipeline configuration,
  dependency-update automation configuration, associated documentation,
  and the specifically identified `package-lock.json` prerequisite fix.
- The exact audit command, its flags, the CI step implementation, and the
  exact Dependabot (or equivalent) configuration are implementation
  details owned by the architect/developer, not fixed by this
  specification. The Notion guidance suggesting
  `npm audit --omit=dev --audit-level=high` as a minimum gate is
  non-binding implementation guidance, not a mandatory requirement.
- Must comply with `.claude/rules/security.md`, `.claude/rules/testing.md`,
  `.claude/rules/openapi.md` (not applicable to CI-only changes beyond
  general contract-preservation intent), and `.claude/rules/spec-security.md`.
- No secrets, credentials, tokens, or real environment values may be
  introduced into version-controlled files (workflow YAML, documentation,
  or this spec) as part of this change.
- The prerequisite `package-lock.json` fix (FR-012) must not introduce an
  unrelated major-version bump or unrelated package changes beyond what
  is needed to resolve the identified `ip-address` advisory.

## Dependencies

- CARSHOP-105 (remediate the dependency-vulnerability baseline) — merged
  into `master` (PR #38, commit `a854215`). This task was previously
  blocked pending that merge; the block is resolved.
- Depends on a residual high-severity `ip-address` vulnerability (via
  `express-rate-limit`) on `master`'s `package-lock.json` being resolved
  as part of this task (FR-012), so the new gate is green from the moment
  it lands.

## Out of Scope

- Fixing vulnerabilities beyond the specifically identified residual
  `ip-address` advisory covered by FR-012; broader vulnerability
  remediation was the scope of CARSHOP-105.
- Introducing new application features, refactoring production code, or
  changing runtime application behavior.
- Selecting or evaluating alternative SCA/vulnerability-scanning products
  beyond `npm audit` (or an equivalent already-available mechanism) and
  Dependabot (or an equivalent already-available mechanism), unless the
  architect determines the guided approach is not feasible.
- Changing SonarCloud project configuration, quality gate thresholds, or
  Sonar-side settings.

## Risks

- A high or critical severity advisory could be found in a package with
  no compatible non-breaking fix available at implementation time,
  requiring the exception procedure (FR-009/FR-010) rather than a direct
  fix; this is expected to be handled by that procedure rather than by
  blocking the whole task.
- The prerequisite `package-lock.json` fix (FR-012), even though expected
  to be a non-breaking patch-level update, must still be validated against
  the existing test suite to avoid an undetected regression, per the
  project's general testing rules.
- If the automated dependency-update mechanism (FR-008) opens PRs faster
  than they can be reviewed, it may create maintenance overhead; this is
  an accepted operational trade-off of enabling the mechanism and is not
  a blocking concern for this specification.

## Open Questions

### Blocking

None.

### Non-blocking

- The exact current `npm audit` output for `master` (beyond the
  specifically identified `ip-address` finding) was not independently
  re-verified at spec-writing time; the architect/developer should pull a
  fresh audit at implementation time to confirm no other high/critical
  finding exists beyond the one described in FR-012.
- The exact tracked-issue mechanism for moderate-severity findings (e.g.
  a dedicated Notion task per finding, a recurring review task, or
  another tracking method) is left to architect/developer judgment,
  provided it satisfies FR-006/AC-004.

## Traceability

FR-001 → AC-001, AC-002, AC-009
FR-002 → AC-001, AC-002, AC-009
FR-003 → AC-001
FR-004 → AC-001
FR-005 → AC-002
FR-006 → AC-004
FR-007 → AC-003
FR-008 → AC-005
FR-009 → AC-006
FR-010 → AC-006
FR-011 → AC-007
FR-012 → AC-008, AC-009
