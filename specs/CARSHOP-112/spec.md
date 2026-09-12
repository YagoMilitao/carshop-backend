# CARSHOP-112 — Bloquear merge de PR até a pipeline do Codex passar

## Status

Ready

## Source

Notion Task:
CARSHOP-112

## Context

The repository does not yet have a "Codex pipeline" — a CI quality-gate
workflow dedicated to validating pull requests before merge. GitHub branch
protection for the repository's main branch (`master`) does not currently
require any such check to pass before a pull request can be merged. As a
result, a pull request can be merged into `master` without an automated
build/test quality gate having run and succeeded.

This was clarified with the user during specification: the Codex pipeline
must be **created** as part of this task's scope, as a new GitHub Actions
workflow file (e.g. `.github/workflows/codex.yml`), separate from the
existing `sonar-backend.yml` workflow. It must run the project's existing
build and test commands (`npm run build`, `npm test`, as already documented
in `CLAUDE.md`) as a quality gate, triggered on `pull_request` events
targeting `master`. Once created, `master`'s branch protection must be
configured to require that workflow's status check before allowing merge.

This task spans two parts: (1) creating a new CI workflow file, and (2)
configuring GitHub branch protection/ruleset settings on `master`. It does
not include changes to the application's business logic under `src/`.

## Objective

Create a Codex pipeline (a GitHub Actions workflow) that runs the
project's build and test commands on every pull request targeting
`master`, and configure `master`'s branch protection/ruleset so that a
pull request cannot be merged unless that pipeline's status check has
completed successfully. Pull requests must remain blocked from merging
while that check is pending, running, has failed, or was cancelled.

## Functional Requirements

- FR-001: A new GitHub Actions workflow (the "Codex pipeline") must be
  added to the repository (e.g. `.github/workflows/codex.yml`), separate
  from the existing `sonar-backend.yml` workflow.
- FR-002: The Codex pipeline workflow must trigger on the `pull_request`
  event for pull requests targeting the `master` branch.
- FR-003: The Codex pipeline workflow must execute, at minimum: checking
  out the repository, setting up the Node.js version required by the
  project, installing dependencies, running `npm run build`, and running
  `npm test`.
- FR-004: The Codex pipeline workflow must report a distinct, identifiable
  status check to GitHub for each pull request it runs against, separate
  from the status check reported by `sonar-backend.yml`.
- FR-005: The `master` branch's protection rules must designate the Codex
  pipeline's status check as a required status check for pull requests
  targeting `master`.
- FR-006: A pull request targeting `master` must be blocked from merging
  while the required Codex status check is in a pending or in-progress
  state.
- FR-007: A pull request targeting `master` must be blocked from merging
  when the required Codex status check reports a failed or cancelled
  outcome (i.e., when `npm run build` or `npm test` fails, or the workflow
  run is cancelled).
- FR-008: A pull request targeting `master` must be allowed to merge only
  after the required Codex status check reports a successful outcome
  (i.e., both `npm run build` and `npm test` complete successfully).

## Non-Functional Requirements

- NFR-001 (Reliability): The required-check configuration on `master` must
  reference the exact status-check name published by the newly created
  Codex pipeline workflow, so GitHub can match and enforce it without
  ambiguity.
- NFR-002 (Security): Only users with repository administrator access may
  configure or modify the `master` branch protection rule. No credentials,
  tokens, or secrets are introduced or exposed by the new workflow or by
  this change.
- NFR-003 (Maintainability): The Codex pipeline workflow and the
  `master` branch protection rule must be kept in sync; if the workflow or
  job name is later renamed or restructured, the required-check
  configuration must be updated accordingly. Keeping them in sync going
  forward is a residual risk, not a one-time requirement of this task (see
  Risks).
- NFR-004 (Consistency): The Codex pipeline workflow's build/test commands
  and Node.js setup must be consistent with the commands and conventions
  already documented in `CLAUDE.md` (`npm run build`, `npm test`), so its
  results are meaningful and reproducible with what a developer runs
  locally.

## Acceptance Criteria

- AC-001: After the Codex pipeline workflow is added, opening or updating
  a pull request targeting `master` must trigger a run of that workflow,
  visible as a distinct status check on the pull request.
- AC-002: The Codex pipeline workflow run must execute `npm run build` and
  `npm test`; if either command fails, the workflow run/status check must
  report a failed outcome.
- AC-003: When a pull request is opened or updated against `master` and
  the Codex pipeline status check is pending or running, the PR's merge
  option must be blocked by GitHub with the Codex check shown as a
  required, not-yet-satisfied check.
- AC-004: When the Codex pipeline status check fails on a pull request
  targeting `master`, the PR's merge option must remain blocked by GitHub
  until the check is re-run and succeeds.
- AC-005: When the Codex pipeline status check is cancelled on a pull
  request targeting `master`, the PR's merge option must remain blocked by
  GitHub.
- AC-006: When the Codex pipeline status check completes successfully on a
  pull request targeting `master`, and no other required check is
  outstanding, the PR's merge option must become available.
- AC-007: The behavior described in AC-003 through AC-006 must be
  demonstrated on at least one test pull request that exercises a success
  scenario (merge allowed after `npm run build`/`npm test` succeed) and one
  that exercises a failure scenario (merge blocked while pending, or after
  `npm run build`/`npm test` fails).

## Constraints

- This task includes creating one new GitHub Actions workflow file plus
  GitHub repository configuration (branch protection/ruleset settings on
  `master`). It does not include changes to application business logic
  under `src/`.
- The specification does not prescribe the exact GitHub mechanism (classic
  branch protection rules vs. GitHub rulesets, UI vs. API vs. CLI/IaC) used
  to configure the required-check requirement; selecting that mechanism is
  an implementation decision for the architect/developer phase.
- The specification does not prescribe the exact workflow YAML structure,
  job/step names, or the specific Node.js setup action version; those are
  implementation decisions for the architect/developer phase, as long as
  FR-001 through FR-004 are satisfied.
- No secrets, tokens, or credentials are part of this specification or its
  implementation.

## Dependencies

- Requires GitHub repository administrator access to configure branch
  protection/ruleset settings on `master`.
- Requires the ability to add a new workflow file under
  `.github/workflows/` and to have it execute in the repository's GitHub
  Actions environment.

## Out of Scope

- Defining a rollback or emergency-merge exception path for cases where
  the Codex pipeline is unavailable. This was not part of the stated
  Definition of Done and is not addressed by this specification.
- Changing the required-check configuration for branches other than
  `master`.
- Modifying the existing `sonar-backend.yml` workflow's logic, steps, or
  triggers.
- Adding checks beyond `npm run build` and `npm test` (e.g., lint,
  coverage thresholds, security scanning) to the Codex pipeline, unless
  later requested.

## Risks

- No rollback/exception path exists for legitimate emergency merges if the
  Codex pipeline becomes unavailable. This is a residual risk, not a
  requirement of this task (see Out of Scope).
- If the Codex pipeline workflow or job name changes in the future without
  a corresponding update to the branch protection configuration, the
  required check may stop being enforced or may block merges unexpectedly.
- If the workflow's Node.js setup, dependency installation, or environment
  does not match what is needed to run `npm run build`/`npm test`
  successfully (e.g., missing required environment variables for tests per
  `CLAUDE.md`'s testing conventions), the check could fail for reasons
  unrelated to actual code quality, blocking legitimate merges until
  corrected.

## Open Questions

### Blocking

None. Both previously blocking questions have been resolved:

- The Codex pipeline does not yet exist and must be created as part of
  this task, as a new GitHub Actions workflow (e.g.
  `.github/workflows/codex.yml`) separate from `sonar-backend.yml`.
- The new workflow's trigger and content are defined: it triggers on
  `pull_request` events targeting `master`, and runs `npm run build` and
  `npm test` as its quality gate.

### Non-blocking

- Does this requirement apply only to `master` (this repository's actual
  primary branch), or should it also apply to other long-lived branches?
  The Definition of Done refers to "branch principal," which in this
  repository is `master`; no other branch was named as in scope.

## Traceability

FR-001 → AC-001
FR-002 → AC-001, AC-007
FR-003 → AC-002, AC-007
FR-004 → AC-001, AC-003
FR-005 → AC-003, AC-006
FR-006 → AC-003
FR-007 → AC-004, AC-005
FR-008 → AC-006

AC-007 validates FR-002, FR-003, FR-006, FR-007, and FR-008 end-to-end via
test pull requests.
