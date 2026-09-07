# Language Policy

This rule governs only the *language* in which instructions and
communication are written. It never governs, alters, renames, or
translates code, identifiers, API contracts, commands, file paths, or
configuration values.

## Instruction Files (en-US)

`CLAUDE.md`, all files under `.claude/rules/`, and all files under
`.claude/agents/` must be written in en-US.

## User-Visible Communication (pt-BR)

All agent communication visible to the user — progress updates,
explanations, justifications, summaries, test/validation instructions,
and final responses — must be written in pt-BR (Brazilian Portuguese).

## Never Translated

The following are never translated and must be preserved exactly as they
appear in the codebase, regardless of the surrounding language:

- source code;
- identifiers;
- API/route names;
- CLI commands;
- file paths;
- environment variable names;
- technical contracts, including payload field names, HTTP status codes,
  headers, and cookie names.

## Scope

This policy governs only the language of instructions and communication.
It does not authorize, require, or imply any change to code, identifiers,
API contracts, commands, file paths, or configuration values referenced
elsewhere in the project's documentation.
