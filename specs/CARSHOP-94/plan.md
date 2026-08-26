# CARSHOP-94 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-94/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Document a mandatory branch-naming convention
(`<tipo>/CARSHOP-<numero>-<descricao-curta>`) in a versioned,
repository-tracked location, and make the coordinator (and,
opportunistically, `developer`/`reviewer`) validate the current branch
name against it at two points in the canonical workflow — before
implementation starts and before task completion — reporting mismatches
and blocking task-completion automations on mismatch, without ever
auto-renaming/auto-recreating/auto-pushing a branch and without expanding
any agent's declared tools/permissions.

Acceptance criteria AC-001…AC-011 are all satisfiable purely through
documentation changes (`CLAUDE.md` + a new `.claude/rules/branching.md`);
no `src/`, `test/`, or agent-tool changes are required.

## Current Architecture

Local/remote branch names observed (chronological, via reflog
`checkout: moving from … to …`):

- No-prefix, pre-convention branches: `CARSHOP-2_3`, `CARSHOP-68`,
  `CARSHOP-66`, `CARSHOP-65`, `CARSHOP-67`, `CARSHOP-3`, `CARSHOP-82`
  (stale local refs), plus remote-only `origin/CARSHOP-2`, `CARSHOP-2_1`,
  `CARSHOP-7`, `CARSHOP-8`, `CARSHOP-9`, `CARSHOP-refactor1`, `carshop6`.
- `chore/CARSHOP-1`
- `refacto/CARSHOP-1` (misspelling of "refactor" — historical, not to be
  adopted)
- `refactor/CARSHOP-84`, `refactor/Test-1` (non-CARSHOP, confirms
  `refactor` as a type)
- `feat/CARSHOP-11`, `12`, `69`, `70`, `71`, `81`, `87`, `87_2`, `88`, `89`
  (current branch)

Commit-message evidence: `feat:` prefix used extensively; `chore(deps): …`,
`chore: …`; `refactor: …` (multiple); `test: adicionar testes para o
middleware de upload…`. No colon-form `docs:`/`fix:` commit found, but
free-text "fix …" commits exist, and README-only commits exist unlabeled.

Only `master` exists as a confirmed permanent branch (`.git/packed-refs`,
`.git/refs/heads/master`). CI (`.github/workflows/sonar-backend.yml`)
triggers on push to `main` or `master`, but no `main`/`hom`/`dev`/`prd`
branch currently exists.

No `.claude/rules/branching.md`, `CONTRIBUTING.md`, or prior
branch-naming doc exists.

Session note: current branch is `feat/CARSHOP-89` while implementing
`CARSHOP-94` — flagged as out-of-pattern for the coordinator per
FR-011/AC-008; not to be renamed/recreated by any agent.

## Proposed Solution

Resolve the specification purely through documentation:

1. Create `.claude/rules/branching.md`, defining the mandatory pattern,
   the six-type taxonomy, the required examples, the permanent-branch
   exception list, the validation-responsibility split, the enforcement
   mechanism, the mismatch behavior, and an anti-fabrication clarification.
2. Apply four minimal, additive edits to `CLAUDE.md` wiring the new rule
   file into the "read and follow" list and into Phases 7 and 11 of the
   canonical workflow, plus a new short cross-referencing section.
3. Review all ten `.claude/agents/*.md` files for compliance with
   FR-014/AC-010/AC-011; conclude no edits are required there.

## Technical Decisions

### Decision

Lock the `<tipo>` taxonomy to exactly six mandatory types: `feat`, `fix`,
`refactor`, `chore`, `docs`, `test`.

| Type | Evidence | Strength |
|---|---|---|
| feat | 9+ merged branches, pervasive `feat:` commits | Strong |
| chore | `chore/CARSHOP-1` branch; `chore(deps): …`, `chore: …` commits | Direct |
| refactor | `refactor/CARSHOP-84` branch (+ misspelled `refacto/CARSHOP-1`); multiple `refactor:` commits | Direct |
| test | `test: adicionar testes para o middleware de upload…` commit | Direct (commit-level) |
| fix | No `fix/` branch or `fix:` commit found; only free-text "fix …" summaries | Indirect — mandated by FR-004 regardless |
| docs | No `docs/` branch or `docs:` commit found; only unlabeled README commits | Weakest — mandated by FR-004 regardless |

### Reason

FR-004/AC-003 lock these six types explicitly via the mandated example
list. `chore`, `refactor`, and `feat` have direct repository evidence;
`test` has commit-level evidence; `fix` and `docs` are mandated by
FR-004 despite weaker direct evidence.

### Alternatives Considered

Adding `ci`, `build`, `perf`, `revert`, or `hotfix` to the taxonomy —
explicitly excluded for lack of repository evidence, per NFR-002.
`branching.md` states this exclusion explicitly so a future task can
extend the taxonomy only with real evidence.

### Trade-offs

The list is not to be shrunk or extended now; `fix` and `docs` are
included on the strength of FR-004's mandate rather than strong
independent repository evidence, which is documented transparently
rather than hidden.

---

### Decision

Enforce the convention through documentation plus coordinator/agent-level
manual validation only. No git hook and no CI job are introduced.

### Reason

This satisfies "block automations" via the coordinator refusing to
invoke `task-manager`; NFR-001 forbids expanding agent permissions; the
coordinator already receives a `gitStatus` snapshot (current branch,
diffs, recent commits) at conversation start with no new tooling,
satisfying NFR-005 (deterministic, branch-name-string-only, no external
services).

### Alternatives Considered

A git pre-push/commit-msg hook, or a CI job that fails a build on
branch-name mismatch — both explicitly out of scope per the
specification and rejected here as unnecessary to satisfy the Definition
of Done.

### Trade-offs

The coordinator's branch context is a start-of-conversation snapshot and
does not auto-refresh; `developer`/`reviewer` may get a live
re-confirmation for free via their existing `git status` usage, but no
new Bash invocation should be introduced solely for this check.

---

### Decision

Perform branch-name validation at exactly two coordinator-owned
checkpoints, applied uniformly across TRIVIAL/SMALL/NON-TRIVIAL routes:
(1) immediately before invoking `developer` (Phase 7 entry), and (2)
immediately before invoking `task-manager` (Phase 11 entry).

### Reason

Only the coordinator reliably has branch context and gates
`task-manager`. `task-manager` has no `Bash`/filesystem tool, so it
structurally cannot self-check — the coordinator must gate its
invocation. This satisfies FR-008 (start checkpoint) and FR-009/FR-011
(completion checkpoint, hard block per FR-011 unless the user explicitly
authorizes proceeding).

### Alternatives Considered

Giving `developer`/`reviewer` a new mandatory validation step — rejected;
they already run `git status`/`git diff` and should simply surface the
branch name in their reported summary rather than gaining a new step.
Assigning this responsibility to `task-reader`, `spec-writer`,
`architect`, `plan-writer`, `tester`, `knowledge-reader`, or
`knowledge-manager` — rejected; not given this responsibility.

### Trade-offs

None material.

## Execution Flow

1. Create `.claude/rules/branching.md` with the full structure defined
   below (Files to Create).
2. Apply the four additive edits to `CLAUDE.md` (Files to Modify).
3. Review all `.claude/agents/*.md` files against FR-014/AC-010/AC-011;
   confirm no edits are required.
4. Validate the change against the Testing Strategy checklist below.

## Files

### Files to Create

- `.claude/rules/branching.md` — structure:
  - `# Branch Naming Convention`
  - Mandatory pattern: `<tipo>/CARSHOP-<numero>-<descricao-curta>`, with
    each placeholder defined (`<tipo>`; literal `CARSHOP`; `<numero>` =
    real Notion task number; `<descricao-curta>` = kebab-case, no spaces,
    no unnecessary/sensitive content).
  - Type taxonomy table exactly as in Technical Decisions above (six
    types with evidence notes; explicit statement that `ci`/`build`/
    `perf`/`revert`/`hotfix` are not currently adopted and must not be
    added without new repo evidence).
  - Six mandatory example branch names verbatim (from spec FR-004):
    `feat/CARSHOP-123-add-work-filter`,
    `fix/CARSHOP-124-fix-refresh-session`,
    `refactor/CARSHOP-125-simplify-work-service`,
    `chore/CARSHOP-126-update-dependencies`,
    `docs/CARSHOP-127-update-readme`,
    `test/CARSHOP-128-add-work-tests`.
  - Exception list (not violations): `master` (confirmed existing), plus
    `main`, `hom`, `dev`, `prd` documented as reserved permanent/
    environment branch names for forward compatibility — note only
    `master` currently exists in this repo.
  - Validation-responsibility section describing the two coordinator
    checkpoints, and that `developer`/`reviewer` surface branch name
    from existing `git status` usage rather than adding a new step.
  - Enforcement-mechanism note: documentation + manual
    coordinator/agent-level check only; explicitly not a git hook or CI
    check, with rationale (NFR-001/NFR-005).
  - Mismatch behavior: report the expected pattern; never
    auto-rename/recreate/push; block `task-manager` invocation until the
    user explicitly authorizes proceeding despite the mismatch.
  - Anti-fabrication clarification (closes AC-010): agents must always
    use the CARSHOP task ID explicitly supplied by the
    coordinator/task-reader (via `spec.md`/`plan.md` paths, task-reader
    output, etc.) for their own operations — never an ID inferred solely
    from the current branch name, since the branch may be mismatched or
    stale (as demonstrated by this very task's session context: branch
    `feat/CARSHOP-89` while implementing `CARSHOP-94`).

### Files to Modify

- `CLAUDE.md` — four minimal, additive-only edits, preserving all
  existing lines:
  1. In the "Before implementing anything, read and follow" list at the
     top, append `@.claude/rules/branching.md` after the existing nine
     `@.claude/rules/*.md` references (do not reorder existing lines).
  2. Add a new top-level section `# Branch Naming Validation`, placed
     after `# Agent Workflow` and before
     `# Agent Security and Least Privilege`. Content: one paragraph
     stating the mandatory pattern (cross-referencing
     `.claude/rules/branching.md` for full definitions/taxonomy/
     examples), the two coordinator checkpoints (before Phase 7, before
     Phase 11), and the "report + block task-manager, never auto-fix"
     behavior — do not duplicate the full taxonomy/table, just point to
     the rule file.
  3. In `# Phase 7 — Implementation`, add one sentence to the
     introductory paragraph (before `## TRIVIAL Input`): the coordinator
     must have already checked the current branch name against
     `.claude/rules/branching.md` and, on mismatch, obtained explicit
     user authorization before invoking `developer`.
  4. In `# Phase 11 — Task Completion`, add one sentence to the
     introductory paragraph (before `## TRIVIAL`): the coordinator must
     re-check the current branch name and must not invoke `task-manager`
     if it is out of pattern and unauthorized by the user.

### Files Reviewed — No Edits Required

- `.claude/agents/task-reader.md`, `spec-writer.md`, `architect.md`,
  `plan-writer.md`, `developer.md`, `tester.md`, `reviewer.md`,
  `task-manager.md`, `knowledge-reader.md`, `knowledge-manager.md`
  (FR-014/AC-010/AC-011). None instructs or permits fabricating a
  CARSHOP task ID. `task-reader.md` explicitly forbids fabricating
  missing task information; `task-manager.md` explicitly forbids
  fabricating implementation/test/review evidence, always works from
  the exact ID supplied to it, and has no `git`/filesystem tool. All
  others treat task ID as an input parameter from the
  coordinator/task-reader, never derived from branch name. The residual
  AC-010 gap (no agent file says "don't assume branch name is the task
  ID") is closed centrally via the `branching.md` anti-fabrication
  clarification rather than editing 10 files. This trivially satisfies
  AC-011 (no agent's `tools:`/`permissionMode` changes at all).

No changes under `src/**` or `test/**`.

## Contract Impact

None. No route, controller, use case, port, model, or Swagger fragment is
touched. `src/**` and `test/**` are out of scope.

## Persistence Impact

None. No Mongoose schema, repository, or model is touched.

## Security Impact

- NFR-003 (no branch renaming) — respected; documentation only.
- NFR-001 (no permission expansion) — respected; no agent `tools:`/
  `permissionMode` changes.
- No sensitive information introduced; all examples use fictitious task
  numbers per `.claude/rules/spec-security.md`.

## Swagger Impact

None. No route, controller, or Swagger fragment is touched.

## Testing Strategy

Documentation-only change — no Jest/E2E tests apply. Validation is a
manual/reviewer-level compliance check against AC-001…AC-011:

- AC-001/AC-004/AC-005/NFR-004 → verify `branching.md` contains pattern,
  placeholder definitions, exceptions, kebab-case rule.
- AC-002/NFR-002 → verify each of the six documented types has an
  evidence note; `ci`/`build`/`perf`/`revert`/`hotfix` explicitly
  excluded.
- AC-003 → verify the six FR-004 example strings appear verbatim.
- AC-006/AC-007 → verify `CLAUDE.md` Phase 7 and Phase 11 each reference
  the branch check.
- AC-008/AC-009 → verify "report, never auto-fix, block task-manager
  pending user authorization" language present.
- AC-010 → verify the anti-fabrication clarification is present in
  `branching.md`.
- AC-011 → confirm zero changes under `.claude/agents/*.md`.

`tester` may be skipped or run a lightweight review-style check;
`reviewer` should still perform its normal Phase 9 review focused on
spec compliance and accidental unrelated changes (confirm the
pre-existing unrelated modification to
`test/unit/infra/database/mongoose.spec.ts` shown in git status is left
untouched).

## Risks

- Spec vs. repo divergence (documented, not silently "fixed"): the
  spec's FR-007 exception list (`main`, `hom`, `dev`, `prd`) includes
  branches that don't currently exist (only `master` does); documenting
  all five as reserved exceptions is harmless and satisfies AC-004
  literally, but the divergence is flagged rather than asserted as fact.
- Residual soft risk: the coordinator's branch context is a
  start-of-conversation snapshot, not live-polled; documented as a known
  limitation in `branching.md`.
- No sensitive information introduced; all examples use fictitious task
  numbers per `.claude/rules/spec-security.md`.

## Implementation Steps

1. Create `.claude/rules/branching.md` with the full structure described
   in Files to Create above.
2. Edit `CLAUDE.md`: append `@.claude/rules/branching.md` to the "read
   and follow" list at the top (do not reorder existing lines).
3. Edit `CLAUDE.md`: add the new `# Branch Naming Validation` section
   after `# Agent Workflow` and before
   `# Agent Security and Least Privilege`.
4. Edit `CLAUDE.md`: add the one-sentence branch-check requirement to
   the introductory paragraph of `# Phase 7 — Implementation`.
5. Edit `CLAUDE.md`: add the one-sentence branch-check requirement to
   the introductory paragraph of `# Phase 11 — Task Completion`.
6. Review all ten `.claude/agents/*.md` files against
   FR-014/AC-010/AC-011; confirm and record that no edits are required.
7. Run the validation checklist listed in Testing Strategy above.

## Definition of Done Mapping

| Acceptance Criteria | Plan Coverage |
|---|---|
| AC-001, AC-004, AC-005, NFR-004 | `.claude/rules/branching.md` documents the mandatory pattern, placeholder definitions, exceptions, and the kebab-case rule (Files to Create) |
| AC-002, NFR-002 | Type taxonomy table with evidence notes; `ci`/`build`/`perf`/`revert`/`hotfix` explicitly excluded (Technical Decisions, Files to Create) |
| AC-003 | Six FR-004 example strings included verbatim (Files to Create) |
| AC-006, AC-007 | `CLAUDE.md` Phase 7 and Phase 11 each reference the coordinator branch check (Files to Modify, Implementation Steps 4-5) |
| AC-008, AC-009 | "Report, never auto-fix, block task-manager pending user authorization" language documented in `branching.md` (Files to Create) |
| AC-010 | Anti-fabrication clarification in `branching.md`, plus agent-file review (Files to Create, Files Reviewed) |
| AC-011 | Zero changes under `.claude/agents/*.md`, confirmed by review (Files Reviewed — No Edits Required) |

FR-to-AC and NFR-to-AC traceability is defined in the Traceability
section of `specs/CARSHOP-94/spec.md` and is not duplicated here.

## Open Non-Blocking Questions

None. NBQ-001, NBQ-002, and NBQ-003 from the specification have been
resolved by the architect (see Technical Decisions above):

- NBQ-001 (enforcement mechanism) — resolved as documentation plus
  coordinator/agent-level manual validation only; no git hook, no CI job.
- NBQ-002 (which stages perform the check) — resolved as two
  coordinator-owned checkpoints (before Phase 7, before Phase 11),
  applied uniformly across all three route classifications.
- NBQ-003 (final `<tipo>` taxonomy) — resolved as the six types locked
  by spec FR-004/AC-003 (`feat`, `fix`, `refactor`, `chore`, `docs`,
  `test`), with `ci`/`build`/`perf`/`revert`/`hotfix` explicitly excluded
  for lack of repository evidence.
