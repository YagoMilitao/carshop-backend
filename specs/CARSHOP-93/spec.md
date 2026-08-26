# CARSHOP-93 — Update agents to require >= 80% unit-test coverage on new code

## Status

Ready

## Source

Notion Task:
CARSHOP-93

## Context

The carshop-backend workflow is governed by `CLAUDE.md`, the rule files under
`.claude/rules/`, and the specialized agent definitions under
`.claude/agents/`. Today these documents describe testing conventions (unit
tests mirror `src/`, E2E under `test/e2e/`) but do not establish an explicit,
measurable unit-test coverage objective for new or changed production code.

Without an explicit, agreed coverage standard:

- the `developer` agent has no stated obligation to keep new code testable;
- the `tester` agent has no explicit coverage target to pursue for new/changed
  behavior;
- the `reviewer` agent has no explicit basis to flag missing test coverage as
  a quality finding;
- the quality gates (SMALL / NON-TRIVIAL) have no consistent way to weigh
  coverage when deciding whether a task is complete.

This task establishes >= 80% unit-test coverage on new/changed production
code as the workflow's standard quality objective, evaluated against the
change itself (new/changed code), not the repository's historical or global
coverage, with an explicit, justified-exception mechanism for cases where the
target is not technically achievable, proportional, or applicable.

This specification governs updates to the project's AI-agent
governance/workflow documents (`CLAUDE.md`, `.claude/rules/*.md`,
`.claude/agents/*.md`). It does not describe or require changes to
application source code under `src/`.

## Objective

Update `CLAUDE.md`, `.claude/rules/testing.md`, and all relevant agent
definitions under `.claude/agents/` so that:

1. new/changed production code is expected to carry >= 80% unit-test
   coverage, measured on the new/changed code produced by a task;
2. the 80% target is documented as a strong, default standard with a
   narrow, explicit, justified-exception path — not an unconditional
   blocking gate;
3. every agent that produces, plans, implements, tests, or reviews code
   respects and reinforces this policy, each within its existing role and
   permission boundaries;
4. the existing TRIVIAL / SMALL / NON-TRIVIAL classification and routing,
   and each agent's declared tools/permissions, are preserved unchanged
   except where this policy requires new textual guidance.

## Functional Requirements

FR-001
`CLAUDE.md` must state that new or changed production code introduced by a
task is expected to carry >= 80% unit-test coverage, and that this
expectation is evaluated against the new/changed code of the task ("new
code" / "change coverage"), not the repository's historical or global
coverage.

FR-002
`.claude/rules/testing.md` must document the new-code coverage policy,
including the 80% target and explicit, verifiable exception criteria for
when the target is technically unfeasible, disproportionate, or not
applicable to the change.

FR-003
The `developer` agent definition must instruct the developer to consider
testability while implementing, and to avoid introducing new production
code that is deliberately hard to unit-test unless an explicit architectural
justification is recorded.

FR-004
The `tester` agent definition must instruct the tester to create or update
unit tests for new or changed behavior, to measure coverage relevant to the
change, and to pursue >= 80% coverage on new/changed code whenever
technically applicable.

FR-005
The `reviewer` agent definition must instruct the reviewer to verify the
existence and quality of tests for new/changed behavior, and to report
unjustified absence of coverage as an explicit quality finding, using the
reviewer's existing severity scale (`BLOCKER`/`HIGH`/`MEDIUM`/`LOW`).

FR-006
For NON-TRIVIAL tasks, the plan produced by `architect` and persisted by
`plan-writer` must address, within its existing "Testing Strategy" content,
how the >= 80% new-code coverage target is expected to be met, or note that
an exception may be needed and why, so the developer and tester have a
documented basis to follow.

FR-007
Any other agent under `.claude/agents/` that produces, plans, validates, or
reviews code or tests must be reviewed for consistency with this policy.
Such an agent's definition must be updated only if it currently conflicts
with, or is silent in a way that undermines, the coverage policy where its
role would otherwise be expected to reference it.

FR-008
The quality gate descriptions in `CLAUDE.md` for the SMALL and NON-TRIVIAL
routes must incorporate the >= 80% new-code coverage target as a factor the
gate weighs, while explicitly allowing a justified exception when the
target is not technically achievable, disproportionate, or not applicable.

FR-009
When an exception to the >= 80% target is accepted for a task, the
documentation must require that the workflow's result explicitly records:
the coverage percentage actually obtained, the uncovered parts of the
new/changed code, the stated reason for the exception, and the residual
risk.

FR-010
The documentation must explicitly state that an exception must not be used
merely to avoid writing tests that are reasonably implementable.

FR-011
The documentation governing test creation (`tester`) and test review
(`reviewer`) must explicitly prohibit artificial tests, tests without
meaningful assertions, and tests written solely to inflate coverage
metrics.

FR-012
The documentation must state that tests are expected to validate behavior,
requirements, or acceptance criteria, rather than irrelevant internal
implementation details.

FR-013
The documentation must explicitly distinguish unit-test coverage from
E2E/integration-test coverage, stating that E2E/integration tests do not
automatically substitute for unit tests when the behavior in question is
reasonably unit-testable.

FR-014
The updated `CLAUDE.md` must preserve the existing TRIVIAL / SMALL /
NON-TRIVIAL classification rules and canonical routing (including stage
order for each route) without introducing a new or conflicting pipeline.

FR-015
Changes made to any agent definition under `.claude/agents/` to satisfy
this policy must not add a tool, widen a `permissionMode`, or remove an
existing declared boundary (e.g., `reviewer` remaining read-only,
`plan-writer` remaining non-implementing, `architect` remaining
non-editing), unless a specific capability gap is identified and explicitly
justified in the change.

FR-016
The final, updated set of documents (`CLAUDE.md`, `.claude/rules/testing.md`,
and the reviewed agent files) must consistently and unambiguously state that
>= 80% new/changed-code unit coverage is the expected standard, and that
exceptions are permitted only via explicit, verifiable justification
recorded in the workflow output.

## Non-Functional Requirements

NFR-001 (Consistency / Maintainability)
All updated documents must express the coverage policy (target, scope of
measurement, exception criteria) consistently. No two documents may state a
materially different threshold, measurement scope, or exception standard for
the same policy.

NFR-002 (Security / Least Privilege)
Agent permission declarations (`tools`, `permissionMode`) must remain
unchanged by this task unless a specific, documented capability gap
directly required by the coverage policy is identified and explicitly
justified in the change.

NFR-003 (Public Repository Safety)
All content added or modified under `specs/CARSHOP-93/`, `CLAUDE.md`,
`.claude/rules/`, and `.claude/agents/` as part of this task must contain no
secrets, credentials, tokens, real `.env` values, connection strings, or
other sensitive information, per `.claude/rules/spec-security.md`.

## Acceptance Criteria

AC-001
`CLAUDE.md` contains an explicit statement that new/changed production code
is expected to carry >= 80% unit-test coverage, evaluated on the new/changed
code of the task rather than the repository's historical/global coverage.

AC-002
`.claude/rules/testing.md` contains the new-code coverage policy, including
the 80% target and explicit exception criteria (technically infeasible,
disproportionate, or not applicable).

AC-003
`developer.md` instructs the developer to consider testability during
implementation and requires a recorded architectural justification before
introducing new code that is deliberately hard to unit-test.

AC-004
`tester.md` instructs the tester to create/update unit tests for
new/changed behavior, measure coverage relevant to the change, and pursue
>= 80% new-code coverage whenever technically applicable.

AC-005
The documentation governing the tester's output explicitly prohibits
artificial tests, assertion-less tests, and tests written solely to raise
coverage metrics.

AC-006
`reviewer.md` instructs the reviewer to verify the existence and quality of
tests for new/changed behavior and to report unjustified missing coverage
as an explicit finding using the reviewer's existing severity scale.

AC-007
For NON-TRIVIAL tasks, the architect/plan-writer testing-strategy content
addresses how the coverage target is expected to be met, or how a coverage
exception will be evaluated and documented.

AC-008
`CLAUDE.md`'s SMALL and NON-TRIVIAL quality gate descriptions reference the
>= 80% new-code coverage target as a factor, with an explicit justified
exception path documented alongside it.

AC-009
The documentation specifies that when coverage below 80% is accepted for a
task, the recorded workflow result includes: the percentage obtained, the
uncovered parts of the new/changed code, the stated exception reason, and
the residual risk.

AC-010
The documentation explicitly states that exceptions must not be used to
avoid writing tests that are reasonably implementable.

AC-011
The documentation distinguishes unit-test coverage from E2E/integration
coverage and states that E2E/integration tests do not automatically
substitute for unit tests when the behavior is reasonably unit-testable.

AC-012
A review of the updated `CLAUDE.md` confirms the TRIVIAL/SMALL/NON-TRIVIAL
classification rules and the stage order of each canonical route are
unchanged, and no conflicting or parallel pipeline was introduced.

AC-013
A diff review of every modified file under `.claude/agents/` shows no added
tool, no widened `permissionMode`, and no removed boundary statement,
compared to the pre-change version, unless the change is accompanied by an
explicit, documented justification.

AC-014
A security review of all files created or modified under
`specs/CARSHOP-93/`, `CLAUDE.md`, `.claude/rules/`, and `.claude/agents/`
finds no secrets, credentials, tokens, or real environment values, per
`.claude/rules/spec-security.md`.

AC-015
No unresolved placeholder, "TODO", or open item related to this task's
documentation changes remains in the final delivered files (reflecting the
task instruction to leave no open issue).

## Constraints

- This task modifies governance/workflow documentation
  (`CLAUDE.md`, `.claude/rules/*.md`, `.claude/agents/*.md`) only. It must
  not modify application source code under `src/` or `test/`.
- The existing TRIVIAL / SMALL / NON-TRIVIAL classification and canonical
  routing defined in `CLAUDE.md` must be preserved; no new or conflicting
  pipeline may be introduced.
- No agent's declared `tools` or `permissionMode` may be broadened, and no
  existing boundary (read-only, non-implementing, non-editing, etc.) may be
  weakened, without an explicit, documented justification tied to a
  concrete capability gap required by this policy.
- No new specialized agent may be created solely to enforce or measure
  coverage; the policy must be integrated into existing agents and rules.
- No new automation (git hook, CI job, or external tooling) is introduced by
  this task; enforcement remains at the level of agent instructions and the
  coordinator-owned quality gates, consistent with how branch-naming
  enforcement is handled in `.claude/rules/branching.md`.
- Where a measurement mechanism is referenced, it should be compatible with
  the project's existing coverage tooling (Jest, `npm run test:coverage`,
  `coverage/lcov.info`, Sonar) rather than introducing a new toolchain.
- Coverage percentage is not a proxy for test quality: reaching 80% does not
  satisfy this policy if the tests do not validate relevant behavior.
- All content must comply with `.claude/rules/spec-security.md` and the
  "Public Repository Safety" section of `CLAUDE.md`.

## Dependencies

- `.claude/rules/testing.md` (existing testing conventions to be extended).
- `.claude/agents/developer.md`, `.claude/agents/tester.md`,
  `.claude/agents/reviewer.md`, `.claude/agents/architect.md`,
  `.claude/agents/plan-writer.md` (minimum named set to update).
- Other files under `.claude/agents/` (`task-reader.md`, `spec-writer.md`,
  `knowledge-reader.md`, `task-manager.md`, `knowledge-manager.md`) must be
  reviewed for consistency; the exact subset requiring an actual edit is
  determined during architecture/implementation, not by this specification.
- `CLAUDE.md` sections: "SMALL Quality Gate", "NON-TRIVIAL Quality Gate",
  "Canonical Workflow", and "Testing Conventions".
- Existing coverage tooling: `npm run test:coverage` and
  `coverage/lcov.info`.

## Out of Scope

- Changes to application source code under `src/`.
- Remediation of the repository's historical/global coverage number.
- Introducing a CI job, git hook, or other automated enforcement mechanism
  for the coverage target.
- Creating a new dedicated agent for coverage classification or
  measurement.
- Changing any agent's tools or permission mode beyond what this policy
  strictly requires.
- Redesigning the TRIVIAL/SMALL/NON-TRIVIAL classification system itself.
- Defining the exact wording or internal structure the architect/developer
  must use inside each document — that is an implementation ("HOW") detail
  owned by the architect's plan.

## Risks

- Accepting coverage below 80% on a task carries residual risk that must be
  explicitly recorded (percentage, uncovered parts, reason, residual risk)
  rather than silently waived.
- Cross-cutting risk: this task touches `CLAUDE.md` and multiple agent
  definitions simultaneously; inconsistent wording across documents could
  leave agents operating under conflicting rules.
- Risk of scope creep into rewriting unrelated workflow behavior beyond the
  coverage policy itself.
- Risk that an agent definition change intended to reinforce the coverage
  policy inadvertently broadens that agent's tools or weakens an existing
  boundary.

## Open Questions

### Blocking

None.

### Non-blocking

- Exact inventory of `.claude/agents/*.md` files requiring an edit (beyond
  the named minimum set: `developer`, `tester`, `reviewer`, `architect`,
  `plan-writer`) is to be determined by the architect during repository
  inspection.
- Due date for this task was not set in Notion.
- No formally tagged `AC-*` acceptance criteria existed in the original
  Notion task; this specification derives `AC-*` items directly from the
  Definition of Done bullets.

## Traceability

FR-001 → AC-001
FR-002 → AC-002
FR-003 → AC-003
FR-004 → AC-004
FR-005 → AC-006
FR-006 → AC-007
FR-007 → AC-013
FR-008 → AC-008
FR-009 → AC-009
FR-010 → AC-010
FR-011 → AC-005
FR-012 → AC-005, AC-011
FR-013 → AC-011
FR-014 → AC-012
FR-015 → AC-013
FR-016 → AC-001, AC-002, AC-008, AC-015
NFR-001 → AC-001, AC-002, AC-008, AC-012
NFR-002 → AC-013
NFR-003 → AC-014
