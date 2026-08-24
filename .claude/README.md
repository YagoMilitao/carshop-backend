# Claude Code configuration

This folder contains the shared instructions used by Claude Code in this repository.

## Structure

- `../CLAUDE.md`: essential project context, commands, and mandatory workflow.
- `agents/`: specialized subagents for architecture, development, testing, and review.
- `rules/`: rules loaded when Claude works on the paths indicated in each file's frontmatter.
- `skills/implementar/SKILL.md`: reusable workflow for implementing a specification with `/implementar`.
- `settings.json`: shared, version-controlled permissions.
- `settings.local.json`: personal preferences and permissions for this clone. This file is ignored by Git.

## Usage in VS Code

1. Open the repository root in VS Code.
2. Open a conversation in the official Claude Code extension.
3. Run `/context` to confirm that `CLAUDE.md` and the rules were loaded.
4. Run `/agents` and confirm the `architect`, `developer`, `tester`, and `reviewer` agents in the Library.
5. Run `/skills` to confirm that `/implementar` is available.
6. Create a specification from `docs/specs/TEMPLATE.md`.
7. Start the implementation with `/implementar @docs/specs/<name>.md`.

Use `/memory` to inspect the instruction files, `/permissions` to check resolved permissions, and `/doctor` to diagnose invalid configuration.

## Scopes

- Team rules must be versioned in `CLAUDE.md`, `agents/`, `rules/`, `skills/`, or `settings.json`.
- Personal preferences must live in `settings.local.json` or in `~/.claude/`.
- Requirements for a single feature must live in `docs/specs/`, not in the permanent rules.
