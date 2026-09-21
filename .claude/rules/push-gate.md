# Push Gate

`git push` is not manually blocked in this repository. Instead, it is gated
by an automated, enforced check.

## Enforcement

Enforcement is a `PreToolUse` hook on the `Bash` tool, configured in
`.claude/settings.json`, filtered to commands matching `git push*`. The
hook's `command` first resolves the repository root itself
(`git rev-parse --show-toplevel`) — independent of whatever directory the
session happened to start in — and denies immediately if that fails,
instead of silently failing to find the script (see "Hardening" below).
It then runs `.claude/hooks/push-gate.sh`, which:

1. Re-verifies, from the hook's own stdin JSON (`tool_input.command`), that
   this really is a `git push` invocation. Anything else is a no-op:
   allowed through immediately, no tests run. This does not trust the `if`
   filter alone (see "Hardening").
2. Denies if the working tree has uncommitted changes to tracked files
   (`git diff --quiet HEAD --`) — uncommitted changes are not part of what
   `git push` actually sends, so testing a dirty tree would validate the
   wrong thing.
3. Makes a best-effort, conservative check that the push targets the
   current branch only (not `--all`/`--mirror`/`--tags`/`--follow-tags`,
   and not an explicit different branch/refspec). Anything it can't
   confidently classify as "pushes only the current branch" is denied
   rather than guessed through.
4. Runs, in order, under internal soft-timeouts: `npm run lint:check`,
   `npm test`, `npm run test:e2e`.
5. If any of the checks above fails (or times out), the hook returns a
   `PreToolUse` deny decision and the `git push` attempt is refused
   outright, with a reason pointing to the failing step and (for
   lint/test/e2e) the captured logs.
6. If everything passes, the hook stays silent and lets the normal
   permission flow continue — `git push` is not on the `allow` list, so the
   user is still asked to confirm the push. The hook only ever narrows
   permission (it can turn an attempt into a hard refusal); it never grants
   permission on its own.

This is documentation of the policy, not the enforcement mechanism itself.
The hook is the enforcement; this file explains what it does and why, so
agents and the coordinator do not need to attempt a push to discover the
gate exists.

## Hardening (findings from an automated review)

The first version of this gate had four gaps, found by an automated code
review (Codex) on the PR that introduced it. All four are fixed in the
current script and hook command:

1. **The `if` filter alone is not trusted.** `Bash(git push*)` on the hook
   is meant to scope every invocation to real `git push` commands, and it
   was independently confirmed to correctly skip a non-matching command in
   this session — but a separate, unrelated observation (an agent's Bash
   call being denied by this gate despite not being `git push`, while
   verifying other work in this same session) means it cannot be fully
   trusted as the only gate. `push-gate.sh` now independently re-checks
   `tool_input.command` from its own stdin (via `jq`, when available) and
   is a pure no-op for anything that isn't `git push*`. If `jq` isn't
   installed, this specific re-check is skipped (falls back to relying on
   `if`) rather than denying every Bash call — a missing `jq` must never
   turn this gate into a blanket Bash blocker.
2. **The script is now located via a resolved repo root, not a relative
   path.** The original hook command was `bash .claude/hooks/push-gate.sh`,
   relative to the session's working directory. A session started outside
   the repo root would fail to find the script (`exit 127`), which is a
   non-blocking hook error, not a deny — and since the blanket `deny` on
   `git push` was removed in the same change, that failure mode would have
   let an unvalidated push proceed to the normal confirmation prompt with
   no automated check having run at all. The hook `command` now resolves
   `git rev-parse --show-toplevel` itself before invoking the script, and
   denies outright if that resolution fails.
3. **lint/test/e2e run under internal, portable soft-timeouts**, well
   inside the outer hook timeout (900s), instead of relying on the outer
   timeout alone. A hook that hits its outer timeout is killed and treated
   as a non-blocking error (fails open, not closed) — so a slow or hung
   `npm run test:e2e` (e.g. a first-time `mongodb-memory-server` binary
   download) could previously let a push through with no completed
   validation. The internal timeouts are implemented in pure bash
   (background job + `kill`), not the external `timeout(1)` binary, which
   is not shipped on macOS by default.
4. **The gate validates the actual push, not just "whatever's checked
   out.**" `git push` accepts explicit refspecs and doesn't include
   uncommitted changes; testing only the working tree could pass while the
   actual pushed commit is untested (dirty tree) or the push targets a
   different branch than the one just tested (`git push origin
   other-branch`). The dirty-tree and refspec checks above (steps 2–3)
   address this. The refspec check is a naive whitespace tokenizer, not a
   real shell parser — it does not handle quoted refspecs or every flag
   form, and denies (rather than guesses) on anything it can't classify.

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

The push is refused if: the repo root can't be resolved, the working tree
has uncommitted changes to tracked files, the push targets more than the
current branch, or `npm run lint:check` / `npm test` / `npm run test:e2e`
fails or times out. The correct response is to fix the underlying cause
(commit/stash first, push the current branch, fix the lint violation or
failing test) and retry — never to bypass the gate by disabling the hook,
editing `.claude/settings.json` to remove it, or running `git push` through
a mechanism that avoids the `Bash` tool's `PreToolUse` hook. If the hook
itself appears broken (e.g. it can't resolve the repo root for a reason
that isn't actually "not in a git repo", or `npm run test:e2e`'s
environment is unavailable), treat that as a blocker to report to the
user, not as license to skip validation before pushing.
