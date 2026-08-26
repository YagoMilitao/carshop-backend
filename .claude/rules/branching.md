# Branch Naming Convention

This rule defines the mandatory branch-naming convention for the CarShop
project and the workflow checkpoints that validate it.

## Mandatory Pattern

Every work branch must follow:

`<tipo>/CARSHOP-<numero>[-<descricao-curta>]`

`<tipo>` and `CARSHOP-<numero>` are mandatory. `-<descricao-curta>` is
optional — a branch such as `feat/CARSHOP-94` (no description suffix) is
valid on its own.

Placeholder definitions:

- `<tipo>` — the type/nature of the change. Mandatory. Must be one of the
  six types defined in the Type Taxonomy below.
- `CARSHOP` — a fixed literal project identifier. Mandatory. Always
  written exactly as `CARSHOP`.
- `<numero>` — the real Notion task number the branch implements (e.g.
  `94`). Mandatory. Must correspond to the actual originating Notion
  task, not a placeholder or invented number.
- `<descricao-curta>` — a short, objective description in kebab-case:
  lowercase words separated by hyphens, no spaces, no unnecessary
  characters, and no sensitive information (no secrets, credentials, or
  internal-only details). Optional — when present, it must still follow
  this kebab-case rule.

## Type Taxonomy

The `<tipo>` taxonomy is locked to exactly six types, derived from
evidence observed in this repository's commit and branch history. `ci`,
`build`, `perf`, `revert`, and `hotfix` are **not currently adopted** and
must not be added to this taxonomy without new, direct repository
evidence (a merged branch and/or commit history using that type).

| Type | Evidence | Strength |
|---|---|---|
| `feat` | 9+ merged branches, pervasive `feat:` commits | Strong |
| `chore` | `chore/CARSHOP-1` branch; `chore(deps): …`, `chore: …` commits | Direct |
| `refactor` | `refactor/CARSHOP-84` branch; multiple `refactor:` commits | Direct |
| `test` | `test: adicionar testes...` commit | Direct (commit-level) |
| `fix` | No `fix/` branch or `fix:` commit found; only free-text "fix ..." summaries | Indirect — mandated by spec regardless |
| `docs` | No `docs/` branch or `docs:` commit found; only unlabeled README commits | Weakest — mandated by spec regardless |

`fix` and `docs` have weaker direct repository evidence than the other
four types, but they are required by the specification's mandatory
example list and remain part of the taxonomy.

## Examples

The following branch names conform to the documented pattern:

- `feat/CARSHOP-123-add-work-filter`
- `fix/CARSHOP-124-fix-refresh-session`
- `refactor/CARSHOP-125-simplify-work-service`
- `chore/CARSHOP-126-update-dependencies`
- `docs/CARSHOP-127-update-readme`
- `test/CARSHOP-128-add-work-tests`

The description suffix is optional, so a branch without it is equally
valid, e.g. `feat/CARSHOP-94`.

## Exceptions

The following branch names are explicit exceptions to the pattern, not
violations:

- `master` — confirmed to exist in this repository today.
- `main`, `hom`, `dev`, `prd` — reserved permanent/environment branch
  names, documented for forward compatibility. None of these currently
  exist in this repository; only `master` does.

## Suggested Type (Non-Binding)

After `task-reader` retrieves a CARSHOP task and the coordinator classifies
it (TRIVIAL/SMALL/NON-TRIVIAL), the coordinator should suggest a `<tipo>`
for the branch, based on the nature of the task, as part of reporting the
classification. This is guidance only:

- The suggestion is informational — it is not enforced and does not block
  anything.
- The user decides the actual branch name and may pick a different type.
- The coordinator must not create, rename, or check out a branch based on
  the suggestion; it only surfaces the recommendation in its response.

Suggestion heuristic, based on the taxonomy above:

- New behavior/endpoint/capability → `feat`
- Bug fix / incorrect behavior correction → `fix`
- Internal restructuring with no behavior change → `refactor`
- Dependency bump, tooling, config, maintenance → `chore`
- Documentation-only change → `docs`
- Test-only addition/change → `test`

If a task doesn't clearly fit one type (e.g. mixed scope), the coordinator
should say so and suggest the closest match rather than guessing silently.

## Validation Responsibility

Branch-name validation against this convention is performed at exactly
two coordinator-owned checkpoints in the canonical workflow:

1. Before invoking `developer` (Phase 7 entry).
2. Before invoking `task-manager` (Phase 11 entry).

The coordinator owns both checkpoints. No other agent is assigned this
responsibility. `developer` and `reviewer` already run `git status`/
`git diff` as part of their normal work; they should surface the current
branch name as part of their reported summary rather than adding a new,
dedicated validation step.

## Enforcement Mechanism

Enforcement is documentation plus a manual coordinator/agent-level check
only. This is explicitly **not** a git hook and **not** a CI check.

A git hook or CI job would expand tooling/permissions unnecessarily. The
"block automations on mismatch" requirement is already fully satisfiable
by the coordinator gating the `task-manager` invocation, without
introducing new tooling.

## Mismatch Behavior

When the current branch name does not match the documented pattern and
is not a documented exception:

- Report the expected branch name pattern for the task.
- Never auto-rename or auto-recreate the branch.
- Never auto-push.
- Block the `task-manager` invocation until the user explicitly
  authorizes proceeding despite the mismatch.

## Anti-Fabrication Clarification

Agents must always use the CARSHOP task ID explicitly supplied by the
coordinator/`task-reader` (via `spec.md`/`plan.md` paths, task-reader
output, or an explicit instruction) for their own operations. An agent
must never infer the task ID solely from the current branch name, since
the branch may be mismatched or stale relative to the task actually being
worked on.
