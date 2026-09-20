# Push Gate

`git push` is not manually blocked in this repository. Instead, it is gated
by an automated, enforced check.

## Enforcement

Enforcement is a `PreToolUse` hook on the `Bash` tool, configured in
`.claude/settings.json`, filtered to commands matching `git push*`. The hook
runs `.claude/hooks/push-gate.sh`, which:

1. Resolves the repository root (`git rev-parse --show-toplevel`).
2. Runs, in order: `npm run lint:check`, `npm test`, `npm run test:e2e`.
3. If any of the three fails, the hook returns a `PreToolUse` deny decision
   and the `git push` attempt is refused outright, with a reason pointing to
   the failing step and the captured logs.
4. If all three pass, the hook stays silent and lets the normal permission
   flow continue — `git push` is not on the `allow` list, so the user is
   still asked to confirm the push. The hook only ever narrows permission
   (it can turn an attempt into a hard refusal); it never grants permission
   on its own.

This is documentation of the policy, not the enforcement mechanism itself.
The hook is the enforcement; this file explains what it does and why, so
agents and the coordinator do not need to attempt a push to discover the
gate exists.

## Why `lint:check`, not `lint`

`npm run lint` runs ESLint with `--fix`, which can silently rewrite files
right before a push. The gate uses `npm run lint:check` (no `--fix`)
instead, so the push decision reflects the code as it actually is, and the
gate itself never mutates the working tree.

## Scope

- Applies to every `git push` invocation attempted through the `Bash` tool
  in this repository, regardless of which agent or the coordinator issues
  it.
- Does not apply to any other git command (`git commit`, `git fetch`,
  `git pull`, etc.) — only pushes are gated.
- Does not replace or weaken the existing rule that most agents (e.g.
  `developer`, `tester`) must never commit or push at all (see their
  agent definitions and `CLAUDE.md`'s Phase 7/Common Implementation
  Rules). Those agents are still expected to never attempt a push; this
  gate is the safety net for whichever actor (normally the coordinator,
  on the user's explicit instruction) actually runs `git push`.
- Does not bypass the general operating principle that pushing is a
  hard-to-reverse, shared-state action requiring the user's explicit
  confirmation — the gate only adds an automated failure condition on top
  of that confirmation, it does not remove the confirmation.

## Failure mode

If `npm run lint:check`, `npm test`, or `npm run test:e2e` fails, the push
is refused. The correct response is to fix the underlying failure (lint
violation, failing test) and retry — never to bypass the gate by disabling
the hook, editing `.claude/settings.json` to remove it, or running `git
push` through a mechanism that avoids the `Bash` tool's `PreToolUse` hook.
If the hook itself appears broken (e.g. it can't resolve the repo root, or
`npm run test:e2e`'s environment is unavailable), treat that as a blocker
to report to the user, not as license to skip validation before pushing.
