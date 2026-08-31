# CARSHOP-105 — Remediar vulnerabilidades conhecidas nas dependências do backend

## Status

Ready

## Source

Notion Task:
CARSHOP-105

## Context

A local dependency audit identified known, publicly disclosed vulnerabilities
in the backend's npm dependency tree, with patched versions available for
all of them.

Baseline captured 2026-08-27:

- Production (runtime) dependencies: 1 high, 4 moderate, 1 low.
- Full project (including dev dependencies): 5 high, 4 moderate, 2 low.

Affected package families noted in the baseline: `express-rate-limit` /
`ip-address`, `mongoose`, `morgan`, `body-parser` / `express`, and `qs`.

Observed dependency versions at the time the task was written:
`express-rate-limit@8.3.2`, `ip-address@10.1.0`, `mongoose@9.4.1`,
`morgan@1.10.1`, `body-parser@2.2.2`, `qs@6.15.0`.

Dependency versions in the repository may have drifted since the
2026-08-27 baseline. The exact current audit output must be pulled fresh
from the repository at implementation time rather than assumed from this
document. This specification defines the required end state (a clean
audit and a green build/test suite), not a fixed list of exact version
numbers to install.

This work is a prerequisite for a separate, later task that will add an
automated dependency-vulnerability gate to CI.

## Objective

Remediate all currently known, fixable vulnerabilities in the backend's
npm dependency tree — prioritizing production dependencies and
high-severity issues — while keeping regression risk as low as
practical, and explicitly documenting any advisory that cannot be fixed
and is judged not exploitable in this application's context, rather than
silently leaving it unaddressed.

## Functional Requirements

- FR-001: All production (non-dev) dependencies affected by a known
  vulnerability that has an available compatible patched version must be
  updated to a version that resolves the advisory.
- FR-002: All dev dependencies affected by a high-severity vulnerability
  that has an available compatible update must be updated to a version
  that resolves the advisory.
- FR-003: For any known vulnerability (production or dev dependency)
  that is not fixed as part of this task — because no compatible update
  exists — the advisory must be explicitly documented, including: the
  affected package, the advisory, why it was not fixed, and a statement
  of whether it is judged exploitable in this application's runtime
  context and why.
- FR-004: After the dependency updates, the application's existing
  automated test suite (unit and E2E) must be run and must pass,
  confirming no observable behavioral regression was introduced by the
  updates.
- FR-005: After the dependency updates, the project must still build
  successfully via the existing build command.
- FR-006: Lockfile changes resulting from the updates must be reviewed
  by a human or the responsible agent before completion, to confirm no
  unintended package downgrade or unexpected/unrelated package addition
  was introduced.

## Non-Functional Requirements

- NFR-001 (Security): After remediation, running the production-only
  dependency audit must report zero high-severity and zero
  moderate-severity vulnerabilities.
- NFR-002 (Security): After remediation, running the full-project
  dependency audit (including dev dependencies) must report zero
  high-severity vulnerabilities.
- NFR-003 (Reliability/Compatibility): Any dependency update that
  involves a major-version bump (e.g. packages such as `mongoose` or
  `express-rate-limit`, if applicable at implementation time) must be
  validated against the full existing automated test suite before being
  considered safe; behavior-changing major upgrades must not be adopted
  without that validation passing.
- NFR-004 (Maintainability): The remediation must not silently skip a
  known, currently-unfixable advisory — every such case must be recorded
  per FR-003 so it remains visible for future follow-up (including the
  planned CI dependency gate task).

## Acceptance Criteria

- AC-001: Running the production-only dependency audit command reports
  no high-severity and no moderate-severity vulnerabilities.
- AC-002: Running the full-project dependency audit command (including
  dev dependencies) reports no high-severity vulnerabilities.
- AC-003: The project build command completes successfully after the
  dependency updates.
- AC-004: The full unit test suite passes after the dependency updates.
- AC-005: The full E2E test suite passes after the dependency updates.
- AC-006: The lockfile diff has been reviewed and contains no downgraded
  package version and no unexpected/unrelated package addition relative
  to the intended remediation.
- AC-007: For every known vulnerability not fixed by this task (no
  compatible update available), a documented record exists stating the
  affected package, the reason it was not fixed, and an explicit
  exploitability judgment for this application's context.

## Constraints

- No new architectural pattern, module, or feature may be introduced as
  part of this task; scope is limited to dependency version updates and
  their direct compatibility fallout.
- The exact list of packages and target versions is not fixed by this
  specification — the affected packages named in the Context section
  reflect the 2026-08-27 baseline and are guidance, not a mandatory or
  exhaustive list. The actual current state must be determined from a
  fresh audit of the repository at implementation time.
- Any change to shared middleware behavior (e.g. rate limiting, request
  logging, body parsing) caused by a major-version dependency bump must
  preserve existing observable request/response contracts unless a
  breaking change is unavoidable to fix the vulnerability, in which case
  it must be explicitly reported, not silently absorbed.
- Must comply with `.claude/rules/security.md`, `.claude/rules/testing.md`,
  and `.claude/rules/spec-security.md`.
- No secrets, credentials, or real environment values may be introduced
  into version-controlled files as part of this change.

## Dependencies

- None stated as blocking this task.
- This task precedes a separate, related task ("Adicionar gate de
  dependências vulneráveis no CI") that is out of scope here.

## Out of Scope

- Adding an automated dependency-vulnerability gate to CI (tracked as a
  separate task).
- Introducing new dependencies unrelated to fixing an existing
  vulnerability.
- Refactoring unrelated code, architecture, or features beyond what is
  strictly necessary to accommodate a dependency update.
- Fixing low-severity advisories that are not required by the acceptance
  criteria (production audit clean of high/moderate; full audit clean of
  high) unless a compatible fix is trivially available alongside a
  required update.

## Risks

- Major-version bumps (e.g. potentially affecting packages such as
  `mongoose` or `express-rate-limit`) can introduce breaking API changes;
  this risk is mitigated by validating against the full build and test
  suite before acceptance, per NFR-003 and AC-003/AC-004/AC-005.
- Some advisories affecting dev-only dependencies may not be exploitable
  in the production runtime context; where no compatible update exists,
  these must be explicitly documented per FR-003/AC-007 rather than
  silently left unresolved.
- Lockfile changes may introduce unintended transitive dependency
  downgrades or unexpected packages if not carefully reviewed; mitigated
  by the explicit lockfile review requirement in FR-006/AC-006.

## Open Questions

### Blocking

None.

### Non-blocking

- The exact current `npm audit` output (packages, versions, and
  severities) was not re-verified at spec-writing time; the baseline
  from 2026-08-27 may be stale. The implementer must pull a fresh audit
  from the repository before determining the actual upgrade path.
- No explicit rollback/contingency plan is defined if a required
  major-version bump proves incompatible; left to architect/developer
  judgment during implementation.

## Traceability

FR-001 → AC-001, AC-006
FR-002 → AC-002, AC-006
FR-003 → AC-007
FR-004 → AC-004, AC-005
FR-005 → AC-003
FR-006 → AC-006
