# CARSHOP-93 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-93/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Establish, across `CLAUDE.md`, `.claude/rules/testing.md`, and the relevant
agent definitions under `.claude/agents/`, a consistent >= 80% unit-test
coverage standard for new/changed production code, measured against the
task's own diff (not global/historical coverage), with a narrow
justified-exception path whose acceptance must be recorded (% obtained,
uncovered parts, reason, residual risk). The policy must distinguish unit
coverage from E2E/integration coverage, forbid coverage-gaming tests, and
must not alter TRIVIAL/SMALL/NON-TRIVIAL classification/routing, agent tool
lists, or `permissionMode` values. Full FR/AC traceability is in
`specs/CARSHOP-93/spec.md` and is mapped per file below. This is
documentation-only work; no `src/` or `test/` changes.

## Current Architecture

Tooling verification performed by the architect against the current
repository state:

- `package.json`'s embedded jest config already sets
  `collectCoverage: true`, `collectCoverageFrom: ["src/**/*.ts",
  "!src/**/*.d.ts"]`, `coverageReporters: ["text", "lcov"]`,
  `coverageDirectory: "coverage"`. `npm run test:coverage` (`jest
  --coverage`) already produces `coverage/lcov.info`.
- There is no diff-coverage tool in this repo. "New/changed code coverage"
  must be approximated using existing artifacts:
  - Added files: use the file's own aggregate line/statement coverage %
    from the text summary or the file's `SF:`/`LH:`/`LF:` block in
    `coverage/lcov.info`.
  - Modified (pre-existing) files: cross-reference `git diff` line ranges
    for that file against `DA:<line>,<hits>` records in
    `coverage/lcov.info` to approximate coverage of just the changed
    lines, rather than the whole-file percentage.
  - This is an approximation, not a precision diff-coverage engine — the
    rule file must say so, and this imprecision is itself a legitimate
    (not automatic) input to the exception path.
- No new tool/dependency is required — achievable with Bash/Read/Grep,
  which `tester` and `reviewer` already hold.
- `test/e2e/*.e2e-spec.ts` has a known unresolved rootDir/path-alias issue
  — context only, reinforces (does not change) that E2E must never be
  treated as unit-coverage evidence (FR-013).

## Proposed Solution

Update `CLAUDE.md`, `.claude/rules/testing.md`, and the agent definitions
under `.claude/agents/` so that the >= 80% new/changed-code unit-coverage
standard is documented once (in `.claude/rules/testing.md`) and referenced
consistently everywhere else, while every agent that produces, plans,
implements, tests, or reviews code reinforces the policy within its
existing role and permission boundaries. No new agent, tool, CI job, git
hook, or dependency is introduced. The exact set of files to edit, and the
rationale for going beyond the ADR-004 minimal-footprint precedent for six
of the agent files, is detailed below.

### Existing Knowledge (Obsidian) Evaluation

ADR-004
(`CarShop/ADR/ADR-004-coordinator-gated-enforcement-over-git-hooks.md`) set
precedent for CARSHOP-94 (branch naming): add governance rules via ONE new
`.claude/rules/` file + one `CLAUDE.md` reference, no agent-file edits,
because that was a passive coordinator-checked precondition. CARSHOP-93 is
different in kind: the spec (FR-003–FR-006, AC-003/004/006/007) requires
`developer`/`tester`/`reviewer`/`architect`/`plan-writer` to change what
they actively do (consider testability, measure/pursue coverage, flag
missing coverage as a finding, address coverage in the plan's Testing
Strategy) — a coordinator-only check cannot make `tester` measure coverage
or make `reviewer` flag it. This plan therefore diverges from ADR-004's "no
agent-file edits" default for the five agents the spec's own Dependencies
section names as the minimum set, plus one narrow justified addition to
`task-manager` (see Technical Decisions). For `task-reader`, `spec-writer`,
`knowledge-reader`, `knowledge-manager`: no edit, ADR-004's narrow-footprint
spirit preserved, no conflict found.

The Mongoose pre-save-hook-unit-testing-without-DB pattern
(`CarShop/Troubleshooting/`) is used to narrow exception criteria so "it's a
Mongoose model" is never by itself a valid excuse to skip unit coverage —
only genuinely pure passthrough schema declarations without custom
hook/validation logic may qualify.

The jest-e2e rootDir/path-alias bug is feasibility context only — confirms
E2E should not be treated as coverage evidence (already required by FR-013
regardless).

## Technical Decisions

### Decision

Extend the >= 80% coverage policy beyond a coordinator-only check into six
`.claude/agents/*.md` files (`developer`, `tester`, `reviewer`,
`architect`, `plan-writer`, and a narrow addition to `task-manager`),
rather than following ADR-004's no-agent-edit minimal footprint.

### Reason

The spec requires `developer`/`tester`/`reviewer`/`architect`/`plan-writer`
to change what they actively do (consider testability, measure/pursue
coverage, flag missing coverage, address coverage in the plan's Testing
Strategy). A coordinator-only precondition check, as used for branch
naming, cannot make `tester` measure coverage or make `reviewer` flag it.

### Alternatives Considered

ADR-004's coordinator-gated enforcement pattern (single new rule file plus
one `CLAUDE.md` reference, no agent-file edits), as used for CARSHOP-94
branch-naming governance.

### Trade-offs

Broader footprint of edits than the ADR-004 precedent; requires an explicit
diff review of every edited agent file to confirm no `tools` or
`permissionMode` change and no removed boundary statement (AC-013).

---

### Decision

Approximate "new/changed code coverage" using the existing
`coverage/lcov.info` output cross-referenced with `git diff` line ranges,
instead of adopting a diff-coverage tool.

### Reason

No diff-coverage tool exists in this repository; the jest configuration
already produces `coverage/lcov.info` via `npm run test:coverage`, so no
new tool/dependency is required.

### Alternatives Considered

Introducing a new diff-coverage tool or dependency — rejected as
unnecessary per the Constraints section of the specification (no new
toolchain).

### Trade-offs

The approximation is not a precision diff-coverage engine. This must be
documented as a known limitation in `.claude/rules/testing.md` and treated
as a legitimate (but not automatic) input to the justified-exception path.

---

### Decision

Narrow the exception criteria so that "it's a Mongoose model" is never, by
itself, a valid reason to skip unit coverage; only genuinely pure
passthrough schema declarations without custom hook/validation logic may
qualify for an exception.

### Reason

Prevents the exception path from being used as a blanket excuse for model
files, consistent with the existing Mongoose pre-save-hook
unit-testing-without-DB pattern recorded in
`CarShop/Troubleshooting/`.

### Alternatives Considered

None — this is a refinement of the exception criteria closing a known
loophole, not a choice between competing approaches.

### Trade-offs

None identified.

---

### Decision

Add a narrow addition to `.claude/agents/task-manager.md`, beyond the
spec's explicitly named minimum set of five agents.

### Reason

`task-manager` is the sole place the workflow's outcome is persisted into
Notion; when a coverage exception was accepted for a task, its presence as
recorded evidence must be confirmed before marking the task Done.

### Alternatives Considered

Leaving `task-manager` unedited, matching the spec's named minimum set
exactly.

### Trade-offs

Deviates further from ADR-004's minimal-footprint precedent, but is
narrowly scoped (Quality Gate bullet + one optional Technical Notes line)
and does not add tools or widen `permissionMode`.

---

### Decision

Do not edit `task-reader.md`, `spec-writer.md`, `knowledge-reader.md`, or
`knowledge-manager.md`.

### Reason

No conflict with the coverage policy was found in these agents' current
definitions; their existing generic principles (e.g., testable/verifiable
specification content, generic knowledge classification) already
accommodate this policy without needing an explicit reference.

### Alternatives Considered

Editing all `.claude/agents/*.md` files uniformly for completeness —
rejected as unnecessary scope expansion (FR-007 requires updates only where
a file conflicts with, or is silent in a way that undermines, the policy).

### Trade-offs

None identified; preserves ADR-004's narrow-footprint spirit for these four
files.

## Execution Flow

This is a documentation-only governance change; there is no runtime
request/response flow to modify. The execution flow is the sequence of
per-file textual edits below (see Implementation Steps), followed by a
consistency/verification pass (see Testing Strategy) that checks:
cross-file wording consistency (NFR-001), preservation of classification
and routing order (FR-014, AC-012), absence of `tools`/`permissionMode`
changes or removed boundaries (FR-015, AC-013), and absence of secrets or
placeholders (NFR-003, AC-014, AC-015).

## Files

### Files to Create

None. All work targets existing governance/workflow files.

### Files to Modify

1. `CLAUDE.md`
   - Section "Testing Conventions": add a new subsection (e.g. "## Unit-Test
     Coverage Policy") stating new/changed production code introduced by a
     task is expected to carry >= 80% unit-test coverage, evaluated against
     the new/changed code of that task, not the repo's historical/global
     number; cross-reference `.claude/rules/testing.md` for
     target/measurement/exception details; explicitly state E2E/integration
     tests do not automatically substitute for unit tests when the behavior
     is reasonably unit-testable. → FR-001, FR-013, AC-001, AC-011.
   - Phase 10 "SMALL Quality Gate" bullet list: add a bullet requiring the
     >= 80% new-code coverage target be met, or a documented justified
     exception recorded (% obtained, uncovered parts, reason, residual
     risk), citing `.claude/rules/testing.md`. → FR-008, FR-009, AC-008,
     AC-009.
   - Phase 10 "NON-TRIVIAL Quality Gate" bullet list: same addition. →
     FR-008, AC-008.
   - Do NOT touch: Canonical Workflow, classification rules, Phase 2
     routing, stage ordering, TRIVIAL Completion Gate (coverage gate
     applies only to SMALL/NON-TRIVIAL). → preserves FR-014, AC-012.

2. `.claude/rules/testing.md`
   Add a new section documenting: the 80% target and scope (new/changed
   `src/**/*.ts` only, task-diff-based, not historical); the concrete
   measurement method (`npm run test:coverage`, `coverage/lcov.info`,
   added-file vs modified-file approximation via `git diff` + `DA:`
   records); explicit exception criteria (technically infeasible /
   disproportionate / not applicable) with concrete examples, including
   that Mongoose model files with custom hook/validation logic are NOT
   automatically exempt; the rule that exceptions must never be used
   merely to avoid reasonably implementable tests (FR-010); prohibition on
   artificial/assertion-less/coverage-gaming tests, and requirement that
   tests validate behavior/requirements/AC rather than irrelevant
   internals (FR-011, FR-012); the unit-vs-E2E distinction (FR-013). →
   FR-002, FR-009 (measurement basis), FR-010, FR-011, FR-012, FR-013;
   AC-002, AC-005, AC-010, AC-011.

3. `.claude/agents/developer.md`
   Add a bullet under Implementation (or a short new "Testability"
   subsection): consider testability while implementing; do not introduce
   new production code that is deliberately hard to unit-test unless a
   specific architectural justification is recorded in the delivered
   summary; cross-reference `.claude/rules/testing.md`. No changes to
   tools/permissionMode. → FR-003, AC-003; NFR-002 preserved.

4. `.claude/agents/tester.md`
   - Extend Process: pursue >= 80% coverage on new/changed code whenever
     technically applicable, using the measurement method in
     `.claude/rules/testing.md`; when not achievable, document a justified
     exception. → FR-004, AC-004.
   - Add explicit prohibition on artificial/assertion-less/coverage-gaming
     tests and requirement that tests validate behavior/requirements/AC
     (reinforcing existing "do not remove assertions" boundary). → FR-011,
     FR-012, AC-005.
   - Extend Required output: coverage obtained on new/changed code, and —
     when below 80% — uncovered parts, exception reason, residual risk. →
     FR-009, AC-009.
   No tool/permission change. → NFR-002 preserved.

5. `.claude/agents/reviewer.md`
   - Extend Review steps: verify existence and quality of tests for
     new/changed behavior (meaningful assertions, not coverage-gaming);
     check reported new/changed-code coverage against >= 80% target or
     confirm a documented exception (%, uncovered parts, reason, residual
     risk) exists; report unjustified missing/insufficient coverage as a
     finding using the existing severity scale. → FR-005, AC-006.
   - Optionally add a short illustrative note under Response format
     mapping typical coverage gaps to existing severities (non-binding;
     scale unchanged).
   No tool/permission change; reviewer stays read-only per FR-015. →
   NFR-002 preserved.

6. `.claude/agents/architect.md`
   Expand the Required output bullet "test and validation strategy" to
   explicitly require addressing how the >= 80% new-code coverage target
   is expected to be met, or stating a justified-exception rationale, for
   NON-TRIVIAL plans. No change to Boundaries, tools, or permissionMode. →
   FR-006, AC-007.

7. `.claude/agents/plan-writer.md`
   Minimal addition: annotate the existing "Testing Strategy" heading in
   "Required Plan Structure" to state this section must preserve,
   verbatim, the architect's coverage-target/exception rationale (not
   summarize it away); add one line under "Existing Plan" reinforcing
   coverage-strategy content must not be silently dropped when updating an
   existing `plan.md`. Does not grant plan-writer new decision-making
   power. No tool/permission change. → supports FR-006, AC-007; NFR-002
   preserved.

8. `.claude/agents/task-manager.md`
   Narrow, justified addition (the one deviation beyond the spec's
   explicitly named minimum set, justified because this is the sole place
   the workflow's outcome is persisted into Notion):
   - Under Quality Gate → Testing: add a bullet — when a coverage
     exception was accepted for the task, confirm % obtained, uncovered
     parts, exception reason, and residual risk are available as evidence
     before marking Done.
   - Under Technical Notes: add one optional line to the Validation block
     for recording unit-test coverage on new/changed code (percentage;
     exception/residual risk if applicable).
   No tool/permission change. → reinforces FR-009, AC-009; NFR-002
   preserved.

### Files Reviewed, No Edit (FR-007 justification)

- `.claude/agents/task-reader.md` — retrieves Notion requirements only; no
  conflict.
- `.claude/agents/spec-writer.md` — writes `spec.md` only; existing
  testable/verifiable principles already generically cover this; no
  conflict.
- `.claude/agents/knowledge-reader.md` — read-only Obsidian research; no
  conflict.
- `.claude/agents/knowledge-manager.md` — existing generic classification
  logic already covers a future reusable coverage pattern; no conflict.

## Contract Impact

None. Governance/workflow markdown only; no HTTP contract or public API
change.

## Persistence Impact

None. No changes to Mongoose schemas, models, or data mappings; this task
does not touch `src/` or `test/`.

## Security Impact

- No secrets/credentials/env values introduced; prose/markdown only
  (NFR-003).
- No new automation: no CI job, git hook, or new dependency; measurement
  stays inside `npm run test:coverage`/`coverage/lcov.info`.
- No agent's declared `tools` or `permissionMode` may be widened, and no
  existing boundary (reviewer read-only, plan-writer non-implementing,
  architect non-editing) may be weakened, without explicit documented
  justification (FR-015, AC-013).

## Swagger Impact

None. This task does not touch any HTTP endpoint, controller, route, or
OpenAPI fragment; `/docs` and `/docs.json` are unaffected.

## Testing Strategy

This is a documentation-only change — no `src/` or `test/` files change,
so Jest/build are not applicable as validation here. Validation instead
means:

- Textual/consistency review confirming AC-001 through AC-011 and AC-015
  wording appears in the correct file, and NFR-001 (no conflicting
  thresholds across files).
- Diff review per AC-013/FR-015 confirming no `tools:` or `permissionMode:`
  line changed in any of the 6 edited agent files, and no declared boundary
  (reviewer read-only, plan-writer non-implementing, architect
  non-editing) was weakened.
- Structural check per AC-012/FR-014 confirming `CLAUDE.md`'s
  classification section and canonical route stage-orders are unchanged
  outside the two named gate bullet-lists and the new Testing Conventions
  subsection.
- Final scan for leftover TODO/placeholder markers per AC-015.
- Spec-security scan of every touched file per NFR-003/AC-014 (no secrets/
  env values/credentials).

Given this is NON-TRIVIAL by routing (cross-cutting governance change
spanning multiple agent definitions and `CLAUDE.md`) but documentation-only
in implementation mechanics, tester and reviewer still run in this
NON-TRIVIAL route, but their activity here is documentation-consistency
verification, not Jest execution — the developer's summary should say so
explicitly.

## Risks

- Consistency risk (NFR-001): every edited file must cross-reference
  `.claude/rules/testing.md` as the single normative source rather than
  restating divergent numbers.
- Approximation risk: lcov-based new/changed-code measurement is not a
  precise diff-coverage tool; document as a known limitation and legitimate
  (not automatic) input to the exception path.
- Scope-creep risk: strictly avoid touching classification/routing text,
  TRIVIAL gate, or any `tools`/`permissionMode` field — verify via explicit
  per-file diff review (AC-012, AC-013).
- Risk of an agent-definition change intended to reinforce the coverage
  policy inadvertently broadening that agent's tools or weakening an
  existing boundary.

## Implementation Steps

1. Update `CLAUDE.md` — Testing Conventions subsection, SMALL Quality Gate
   bullet, NON-TRIVIAL Quality Gate bullet (see Files to Modify #1).
2. Update `.claude/rules/testing.md` with the full coverage policy section
   (see Files to Modify #2).
3. Update `.claude/agents/developer.md` (see Files to Modify #3).
4. Update `.claude/agents/tester.md` (see Files to Modify #4).
5. Update `.claude/agents/reviewer.md` (see Files to Modify #5).
6. Update `.claude/agents/architect.md` (see Files to Modify #6).
7. Update `.claude/agents/plan-writer.md` (see Files to Modify #7).
8. Update `.claude/agents/task-manager.md` (see Files to Modify #8).
9. Confirm no edit is needed for `task-reader.md`, `spec-writer.md`,
   `knowledge-reader.md`, `knowledge-manager.md` (Files Reviewed, No Edit).
10. Run the verification pass described in Testing Strategy: cross-file
    consistency, diff review for `tools`/`permissionMode`/boundary
    preservation, classification/routing structural check, placeholder
    scan, and spec-security scan.

## Definition of Done Mapping

| Spec Item | Delivered By |
|---|---|
| FR-001, AC-001 | `CLAUDE.md` Testing Conventions subsection |
| FR-002, AC-002 | `.claude/rules/testing.md` new coverage policy section |
| FR-003, AC-003 | `.claude/agents/developer.md` testability bullet |
| FR-004, AC-004 | `.claude/agents/tester.md` Process update |
| FR-005, AC-006 | `.claude/agents/reviewer.md` Review steps update |
| FR-006, AC-007 | `.claude/agents/architect.md` + `.claude/agents/plan-writer.md` Testing Strategy updates |
| FR-007, AC-013 (agent-inventory aspect) | Files Reviewed, No Edit list |
| FR-008, AC-008 | `CLAUDE.md` SMALL/NON-TRIVIAL Quality Gate bullets |
| FR-009, AC-009 | `.claude/agents/tester.md` Required output + `.claude/agents/task-manager.md` Quality Gate/Technical Notes |
| FR-010, AC-010 | `.claude/rules/testing.md` exception-misuse statement |
| FR-011, FR-012, AC-005 | `.claude/rules/testing.md` + `.claude/agents/tester.md` anti-gaming prohibition |
| FR-013, AC-011 | `CLAUDE.md` + `.claude/rules/testing.md` unit-vs-E2E distinction |
| FR-014, AC-012 | `CLAUDE.md` — classification/routing left untouched |
| FR-015, AC-013 | Diff review of all 6 edited agent files (no tool/permissionMode/boundary change) |
| FR-016 | Cross-file consistency across `CLAUDE.md`, `.claude/rules/testing.md`, reviewed agent files |
| NFR-001 | Consistency review (Testing Strategy) |
| NFR-002 | No `tools`/`permissionMode` change verified per file |
| NFR-003, AC-014 | Spec-security scan of all touched files |
| AC-015 | Final placeholder/TODO scan |

## Open Non-Blocking Questions

The architect's plan records no blocking questions ("Blocking Questions:
None"). The specification's non-blocking open question regarding the exact
inventory of `.claude/agents/*.md` files requiring an edit (beyond the
named minimum set) has been resolved by this plan: the concrete set is the
eight files listed under Files to Modify, with the remaining four files
listed under Files Reviewed, No Edit. The specification's other
non-blocking notes (Notion due date not set; `AC-*` items derived from
Definition of Done bullets rather than originally tagged in Notion) are
informational and require no plan action.
