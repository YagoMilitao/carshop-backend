# CARSHOP-94 — Padronizar nomenclatura de branches com prefixo e CARSHOP-XX

## Status

Ready

## Source

Notion Task:
CARSHOP-94

## Context

The CarShop project currently has no formally documented, mandatory
branch-naming convention. Work branches are created without a required
structure linking them to the originating Notion task, which weakens
traceability between git history and Notion.

Evidence already observable in the repository (recent commit history and
the current branch context at specification time) shows an informal
pattern already in partial use: commits authored with a Conventional
Commits-style `feat:` prefix, and branches merged as
`feat/CARSHOP-88`, `feat/CARSHOP-87_2`, with the branch active at
specification time named `feat/CARSHOP-89`. This confirms `feat` is
already an adopted type and that a `<tipo>/CARSHOP-<numero>` shape is
already informally understood, but it is not documented anywhere, is not
validated, and no other type (`fix`, `refactor`, `chore`, `docs`, `test`,
`ci`, `build`, `perf`, `revert`) has direct repo evidence available at
specification time. The final authoritative type list must be validated
by `architect`/`developer` against a fuller history scan
(`git log --oneline`, `git branch -a`) before being treated as closed,
per the task's own "Missing Information" note.

This task also touches the project's agent-workflow documentation
(`CLAUDE.md`) and agent definitions (`.claude/agents/*.md`), since the
convention must be enforced at the workflow/validation level, not only as
prose documentation. It is classified `NON-TRIVIAL` because it changes
cross-cutting workflow rules and the declared behavior of multiple
agents (developer, reviewer, and others), even though it does not touch
application code in `src/`.

**Requirement clarification (2026-08-26, task owner):** `<descricao-curta>`
is optional. Only `<tipo>` and `CARSHOP-<numero>` are mandatory. A branch
name such as `feat/CARSHOP-94` (no description suffix) is valid on its
own; the description, when present, must still follow the kebab-case
rule. This supersedes any earlier reading of the format as requiring the
description segment.

**Requirement addition (2026-08-26, task owner):** the coordinator should
also suggest a `<tipo>` for the branch, based on the nature of the task,
after classifying it. This suggestion is non-binding: it is informational
guidance only, never enforced, and the coordinator must not create,
rename, or check out a branch based on it.

## Objective

Define and document a mandatory branch-naming convention for the CarShop
project, and ensure the coordinator/agents validate the current branch
name against that convention before starting or completing a CARSHOP
implementation workflow (when branch context is available), reporting
clear guidance and blocking dependent automations on mismatch — without
ever auto-renaming, auto-recreating, or auto-pushing branches, and
without expanding any agent's permissions.

## Functional Requirements

- FR-001: The project must document a mandatory branch-naming convention,
  in `CLAUDE.md` or in a dedicated versioned rule file (e.g. under
  `.claude/rules/`), using the format
  `<tipo>/CARSHOP-<numero>[-<descricao-curta>]`, where `<tipo>` and
  `CARSHOP-<numero>` are mandatory and `-<descricao-curta>` is optional.
- FR-002: The documentation must define each placeholder:
  `<tipo>` (the type/nature of the change, mandatory), `CARSHOP` (fixed
  literal project identifier, mandatory), `<numero>` (the real Notion
  task number, mandatory), and `<descricao-curta>` (a short, objective,
  kebab-case description, optional — when present it must still follow
  the kebab-case rule).
- FR-003: The documented `<tipo>` taxonomy must be derived from types
  already adopted/observable in the project's history, not invented from
  scratch. The final list must be validated against repo evidence
  (commit messages, branch names, any existing convention docs) before
  being finalized.
- FR-004: The documentation must include, at minimum, the following
  valid examples, each conforming to the documented pattern:
  `feat/CARSHOP-123-add-work-filter`,
  `fix/CARSHOP-124-fix-refresh-session`,
  `refactor/CARSHOP-125-simplify-work-service`,
  `chore/CARSHOP-126-update-dependencies`,
  `docs/CARSHOP-127-update-readme`,
  `test/CARSHOP-128-add-work-tests`.
- FR-005: The documentation must state that `<descricao-curta>` must use
  kebab-case, contain no spaces, no unnecessary characters, and no
  sensitive information.
- FR-006: The documentation must state that `CARSHOP-<numero>` must
  correspond to the real originating Notion task number for the branch.
- FR-007: The documentation must explicitly list permanent/environment
  branches (e.g. `main`, `hom`, `dev`, `prd`) as explicit exceptions to
  the pattern, not violations.
- FR-008: The coordinator and relevant agents must validate the current
  branch name against the documented convention before starting a
  CARSHOP implementation workflow, whenever branch context is available
  to them.
- FR-009: The coordinator and relevant agents must validate the current
  branch name against the documented convention before completing a
  CARSHOP implementation workflow (i.e. before invoking `task-manager`
  for completion), whenever branch context is available to them.
- FR-010: When the current branch name does not match the documented
  convention and is not a documented exception branch, the workflow must
  report the expected branch name pattern for the task instead of
  silently proceeding as though the branch were compliant.
- FR-011: When the current branch name is out of pattern, the workflow
  must block automations that depend on correct task identification
  (e.g. task completion, task-manager updates) unless the user explicitly
  authorizes proceeding despite the mismatch.
- FR-012: No agent may automatically rename or recreate a branch to
  correct a naming-convention violation; correction requires an explicit
  user decision.
- FR-013: No agent may issue an automatic `git push` (or equivalent) as
  part of enforcing, checking, or correcting this convention.
- FR-014: `.claude/agents/developer.md`, `.claude/agents/reviewer.md`,
  and any other agent definition whose responsibility could plausibly
  involve identifying or reporting a CARSHOP task ID must be reviewed and,
  where necessary, updated so they never instruct or permit fabricating a
  CARSHOP task ID, and so their documented behavior remains consistent
  with this branch-naming convention.
- FR-015: After classifying a CARSHOP task, the coordinator should suggest
  a `<tipo>` for the branch based on the task's nature. This suggestion is
  non-binding: it must not block anything, must not be enforced, and the
  coordinator must never create, rename, or check out a branch based on
  it — the user decides the actual branch name.

## Non-Functional Requirements

- NFR-001 (Security / Least Privilege): This change must not expand any
  agent's declared tools, permissions, or capabilities beyond what
  already exists today.
- NFR-002 (Maintainability): The documented `<tipo>` taxonomy must be
  traceable to actual project usage (commit/branch history or existing
  docs), not an arbitrarily invented list.
- NFR-003 (Compatibility): This task must not require renaming any
  existing branch already present in the repository or rewriting git
  history.
- NFR-004 (Traceability): The convention must be documented in a
  versioned, repository-tracked location (`CLAUDE.md` or a dedicated
  `.claude/rules/*.md` file), consistent with how other project rules are
  organized.
- NFR-005 (Reliability): Branch-name validation behavior must be
  deterministic and based only on the branch name string and the
  documented pattern/exception list — it must not depend on external
  services.

## Acceptance Criteria

- AC-001: Given `CLAUDE.md` or a dedicated `.claude/rules/*.md` file,
  when reviewed, then it documents the pattern
  `<tipo>/CARSHOP-<numero>[-<descricao-curta>]` with each placeholder
  defined, and states clearly that `<tipo>` and `CARSHOP-<numero>` are
  mandatory while `-<descricao-curta>` is optional.
- AC-002: Given the documented convention, when the `<tipo>` list is
  reviewed, then every listed type is traceable to evidence of actual
  project usage (repo history or existing docs) rather than invented
  without justification.
- AC-003: Given the documentation, when read, then it contains at least
  the six example branch names listed in FR-004, each conforming to the
  documented pattern.
- AC-004: Given the documentation, when read, then it explicitly states
  that permanent/environment branches (`main`, `hom`, `dev`, `prd`) are
  exceptions to the naming rule, not violations.
- AC-005: Given the documentation, when read, then it states
  `<descricao-curta>` is optional and, when present, must be kebab-case,
  without spaces or sensitive information.
- AC-006: Given the canonical workflow description, when a CARSHOP
  implementation workflow starts and branch context is available, then
  the documentation specifies that the coordinator/agents must validate
  the current branch name against the convention before proceeding.
- AC-007: Given the canonical workflow description, when a CARSHOP
  implementation workflow is about to complete and branch context is
  available, then the documentation specifies that the coordinator/agents
  must validate the current branch name against the convention before
  invoking task completion.
- AC-008: Given a branch name that does not match the convention and is
  not a documented exception, when the documented validation behavior is
  applied, then it specifies: report the expected branch name, and block
  automations dependent on correct task identification, pending explicit
  user authorization — never auto-rename, auto-recreate, or auto-push.
- AC-009: Given the documented rule, when inspected, then it explicitly
  states that no agent may automatically rename, recreate, or push a
  branch to correct a naming violation.
- AC-010: Given `.claude/agents/developer.md`, `.claude/agents/reviewer.md`,
  and other relevant agent definitions, when reviewed against this
  convention, then none of them instructs or permits fabricating a
  CARSHOP task ID, and each remains consistent with this naming
  convention where relevant to its responsibility.
- AC-011: Given the full diff produced for this task, when inspected,
  then no agent's declared tool list or capabilities in
  `.claude/agents/*.md` have been broadened as a side effect of this
  change.
- AC-012: Given the documented convention, when a CARSHOP task is
  classified, then the documentation specifies that the coordinator
  suggests a `<tipo>` for the branch based on the task's nature, and
  states explicitly that the suggestion is non-binding, informational
  only, and never acted upon automatically (no auto-create/rename/
  checkout).

## Constraints

- No agent may automatically rename or recreate a git branch as part of
  enforcing this convention.
- No agent may introduce an automatic `git push` command as part of this
  convention's implementation or enforcement.
- This task must not expand the declared permissions/tools of any agent.
- The final `<tipo>` taxonomy must be validated against actual repo
  history before being treated as closed; it must not be invented from
  scratch independent of that evidence.
- This specification does not mandate a specific enforcement mechanism
  (e.g. a git hook). Whether and how validation is technically
  implemented (documentation-only vs. an agent-level check vs. a local
  git hook) is an implementation decision left to `architect`.

## Dependencies

- `CLAUDE.md` — canonical workflow document where the convention and its
  validation checkpoints (start/completion of a CARSHOP workflow) must be
  reflected.
- `.claude/agents/developer.md`, `.claude/agents/reviewer.md`, and other
  agent definitions under `.claude/agents/` — must be reviewed for
  consistency with this convention and for absence of task-ID
  fabrication instructions.
- `.claude/rules/` — existing location for dedicated, versioned project
  rules, if a dedicated file is chosen instead of extending `CLAUDE.md`
  directly.
- Existing repository git history (commit messages, merged branch names)
  used as evidence for the adopted `<tipo>` taxonomy.

## Out of Scope

- Enforcing the convention through an automated git hook (e.g.
  `pre-push`, `commit-msg`). The Definition of Done requires
  documentation and agent-level validation, not necessarily a hook; this
  remains an open implementation decision for `architect`.
- Renaming any branch that currently exists in the repository.
- Rewriting git history.
- Adding a CI pipeline check that fails a build solely due to branch-name
  mismatch, unless `architect` determines this is required to satisfy the
  "block automations" requirement within existing conventions.
- Defining or changing commit-message conventions beyond what is needed
  to justify the `<tipo>` taxonomy for branch names.

## Risks

- The `<tipo>` taxonomy evidence available at specification time is
  limited to what was directly observable from the session's git status
  snapshot (`feat:` commits, `feat/CARSHOP-*` branch names). The other
  candidate types (`fix`, `refactor`, `chore`, `docs`, `test`, `ci`,
  `build`, `perf`, `revert`) are requester-supplied candidates aligned
  with the Conventional Commits standard but are not yet individually
  confirmed against a full `git log`/`git branch -a` history scan of this
  repository. `architect`/`developer` should confirm this before treating
  the type list as final.
- It may not be equally meaningful for every agent in the canonical
  workflow to perform branch-name validation (e.g. read-only agents such
  as `knowledge-reader` have no direct reason to check it). Scoping which
  specific workflow stages perform the check is left to `architect`.
- Overly strict enforcement could block legitimate, already-in-flight
  work if applied retroactively to branches created before this
  convention existed; the convention should apply going forward and must
  not require retroactively renaming existing branches (see
  Out of Scope).

## Open Questions

### Blocking

None.

### Non-blocking

- NBQ-001: Should validation be implemented purely as documented
  agent/coordinator behavior, or should it also include a lightweight,
  optional local git hook? The Definition of Done only requires
  documentation and agent-level validation; the hook question is left for
  `architect` to decide within existing conventions.
- NBQ-002: Which specific stages/agents in the canonical workflow
  (coordinator only, or also `developer`/`reviewer` individually) must
  perform the branch-name check "when branch context is available"? Left
  to `architect` to define precisely, consistent with least-privilege and
  existing agent boundaries.
- NBQ-003: Should the final `<tipo>` taxonomy include all nine
  requester-supplied candidates, or a subset confirmed by a full history
  scan? Left to `architect`/`developer` to confirm against
  `git log --oneline` / `git branch -a` before finalizing the documented
  list.

## Traceability

FR-001 → AC-001
FR-002 → AC-001
FR-003 → AC-002
FR-004 → AC-003
FR-005 → AC-005
FR-006 → AC-001
FR-007 → AC-004
FR-008 → AC-006
FR-009 → AC-007
FR-010 → AC-008
FR-011 → AC-008
FR-012 → AC-009
FR-013 → AC-009
FR-014 → AC-010
FR-015 → AC-012
NFR-001 → AC-011
NFR-002 → AC-002
NFR-003 → AC-004
NFR-004 → AC-001
NFR-005 → AC-008
