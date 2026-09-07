# CARSHOP-121 — Padronizar idioma das instruções e respostas dos agentes

## Status

Ready

## Source

Notion Task:
CARSHOP-121

This specification reinterprets the original Notion task for the
`carshop-backend` repository, per explicit user authorization recorded in
the task-reader handoff. The original Notion Technical Notes reference
frontend-specific files (e.g. `AGENTS.md`,
`docs/agents/frontend-architect.md`, `ui-tailwind.md`,
`api-integration.md`, `frontend-security.md`, `quality.md`,
`context-sync.md`, `docs/context/notion.md`, `docs/context/obsidian.md`)
that belong to a separate `carshop-frontend` repository and do not exist
here. The underlying language policy is applied instead to this
repository's actual instruction files:

- `CLAUDE.md`
- `.claude/rules/*.md`
- `.claude/agents/*.md`

## Context

The CarShop project instructions (`CLAUDE.md`, `.claude/rules/*.md`,
`.claude/agents/*.md`) are, as verified by direct inspection at the time
this specification was written, already authored entirely in en-US. No
mixed-language content was found in these files.

However, no single, centralized rule currently exists that:

1. explicitly mandates that these internal instruction files remain in
   en-US going forward; and
2. explicitly mandates that all communication visible to the end user
   (progress updates, explanations, summaries, final responses, etc.)
   produced by any agent be written in pt-BR (Brazilian Portuguese).

Without a centralized, explicitly stated rule, this convention is
implicit and undocumented, which risks future drift (e.g. a new or
edited agent file introducing pt-BR into instructions, or an agent
answering the user in en-US) and risks the policy being restated
inconsistently across multiple files if addressed piecemeal.

This task is the second task in the current working session to touch
`.claude/agents/*.md`. `reviewer.md` and `developer.md` currently have
unrelated, uncommitted changes (adding lint/static-analysis-parity
checks). This specification's scope must not conflict with, depend on,
or require reverting that unrelated in-progress work.

## Objective

Establish and centralize, in exactly one location referenced from
`CLAUDE.md`, an explicit language policy for the CarShop agent workflow:

- Internal/persistent instruction files (`CLAUDE.md`, `.claude/rules/*.md`,
  `.claude/agents/*.md`) must be written in en-US.
- All user-visible agent communication (progress updates, explanations,
  justifications, summaries, test/validation instructions, final
  responses) must be written in pt-BR.
- Code, identifiers, API names, commands, file paths, and technical
  contracts are never translated and remain exactly as they are today.

Every existing specialized agent must inherit this policy through the
existing `@.claude/rules/*.md` include mechanism already used by
`CLAUDE.md`, without needing to have the policy restated verbatim inside
each individual agent file.

## Functional Requirements

- **FR-001**: A single new rule document (e.g.
  `.claude/rules/language-policy.md`) must exist, stating:
  - that `CLAUDE.md`, all files under `.claude/rules/`, and all files
    under `.claude/agents/` must be written in en-US;
  - that all agent communication visible to the user (progress updates,
    explanations, justifications, summaries, test/validation
    instructions, and final responses) must be written in pt-BR;
  - that source code, identifiers, API/route names, CLI commands, file
    paths, environment variable names, and technical contracts (payload
    field names, HTTP status codes, headers, cookie names, etc.) are
    never translated and must be preserved exactly as they appear in the
    codebase, regardless of the surrounding language.

- **FR-002**: `CLAUDE.md` must reference the new language-policy rule
  document using the same `@.claude/rules/<file>.md` include convention
  already used for the other rule files listed in `CLAUDE.md`'s header
  section, so that the policy is inherited automatically without
  modifying every individual agent file under `.claude/agents/`.

- **FR-003**: The language policy must not be restated in full inside
  any individual `.claude/agents/*.md` file. Existing agent files must
  not be edited to duplicate the policy text; they inherit it solely via
  the `CLAUDE.md` include mechanism (FR-002).

- **FR-004**: `CLAUDE.md` and every file under `.claude/rules/` and
  `.claude/agents/` must be confirmed (and, if any deviation is found
  during implementation, corrected) to be written in en-US. As verified
  during specification, no pt-BR content currently exists in these
  files; this requirement guards against undetected exceptions and
  future drift.

- **FR-005**: The language policy document must explicitly state that it
  governs only the *language* of instructions and communication, and
  must not alter, rename, or translate any code, identifier, API
  contract, command, file path, or configuration value referenced
  elsewhere in the project's documentation.

## Non-Functional Requirements

- **NFR-001** (Maintainability): The language policy must be defined in
  exactly one file so that future changes to the policy require editing
  a single location rather than multiple agent files.
- **NFR-002** (Compatibility): The change must not require edits to
  `reviewer.md` or `developer.md` beyond, at most, adding the same
  optional cross-reference pattern already used by other rule files (if
  any agent file already lists explicit rule references). It must not
  conflict with or overwrite the unrelated, uncommitted
  lint/static-analysis-parity changes currently present in those two
  files.

## Acceptance Criteria

- **AC-001**: A file `.claude/rules/language-policy.md` (or an
  equivalently named, single centralized rule file) exists and contains
  the three policy statements described in FR-001.
- **AC-002**: `CLAUDE.md` includes a reference to the new rule file using
  the same `@.claude/rules/<file>.md` syntax already used for the other
  rule includes in its header section.
- **AC-003**: No file under `.claude/agents/` contains a restated,
  duplicated copy of the full language policy text; at most, an agent
  file may contain a short pointer/reference to the centralized rule
  file if the coordinator or spec-writer judges it useful, but the
  normative policy text exists only once.
- **AC-004**: A manual review of `CLAUDE.md`, all `.claude/rules/*.md`
  files, and all `.claude/agents/*.md` files confirms no pt-BR text is
  present in any of them after the change.
- **AC-005**: No code file, identifier, route name, command, file path,
  environment variable name, or technical contract (payload fields,
  headers, cookie names, status codes) is modified, renamed, or
  translated as part of this task.
- **AC-006**: The diff introduced by this task does not modify the
  unrelated, already-in-progress lint/static-analysis-parity content in
  `reviewer.md` and `developer.md` beyond, at most, a minimal reference
  addition consistent with AC-003.

## Constraints

- Do not translate file names, code symbols, HTTP contracts, CLI
  commands, environment variable names, or other technical terms found
  anywhere in the repository.
- Do not alter code, payload shapes, property names, or any
  project-defined technical contract as part of this task.
- Do not restate the language policy in each individual
  `.claude/agents/*.md` file; centralize it and rely on the existing
  `CLAUDE.md` include mechanism.
- Do not revert, overwrite, or conflict with the unrelated, uncommitted
  lint/static-analysis-parity changes currently present in
  `reviewer.md` and `developer.md`.
- This specification does not apply to and does not create any file in
  a separate `carshop-frontend` repository; that repository is out of
  scope and not accessible from this workspace.

## Dependencies

- `CLAUDE.md`'s existing rule-include mechanism
  (`@.claude/rules/<file>.md` syntax) is the delivery mechanism this
  task relies on; it must continue to function as-is.
- No new external dependency, library, or tooling is introduced.

## Out of Scope

- Any change to `carshop-frontend` files (`AGENTS.md`,
  `docs/agents/frontend-architect.md`, `ui-tailwind.md`,
  `api-integration.md`, `frontend-security.md`, `quality.md`,
  `context-sync.md`, `docs/context/notion.md`,
  `docs/context/obsidian.md`) — these do not exist in this repository
  and are explicitly out of scope per user authorization.
- Any translation of existing en-US instruction content into pt-BR, or
  vice versa — the instruction files are already en-US and remain so.
- Any change to the unrelated lint/static-analysis-parity work currently
  in progress in `reviewer.md` and `developer.md`.
- Any change to source code, tests, API contracts, or persisted data.
- Enforcement tooling (e.g. a linter or CI check that machine-verifies
  the language of instruction files or agent responses). This task
  defines a documented policy only; automated enforcement is not
  requested by the Notion task and is not part of this specification.

## Risks

- Risk of accidentally translating a technical term, identifier, file
  name, or contract while documenting the policy or its examples;
  mitigated by FR-005 and AC-005.
- Risk of the policy being interpreted as requiring edits across all
  `.claude/agents/*.md` files, which would unnecessarily broaden scope
  and could conflict with the unrelated in-progress changes in
  `reviewer.md`/`developer.md`; mitigated by FR-002, FR-003, and AC-003.
- Risk of confusing this repository's scope with the original
  frontend-oriented Notion Technical Notes; mitigated by the explicit
  reinterpretation recorded in the Source section above.

## Open Questions

### Blocking

None.

### Non-blocking

- Whether a short pointer line should also be added to each
  `.claude/agents/*.md` file (beyond the `CLAUDE.md` include) is left to
  the architect/developer's judgment at implementation time, since
  `CLAUDE.md`'s include mechanism already propagates the rule to every
  agent that reads `CLAUDE.md`. This does not block readiness because
  FR-002/FR-003 already define the minimum required mechanism.

## Traceability

FR-001 → AC-001, AC-004
FR-002 → AC-002
FR-003 → AC-003, AC-006
FR-004 → AC-004
FR-005 → AC-005
