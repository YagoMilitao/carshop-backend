#!/usr/bin/env bash
# PreToolUse gate for `git push` (see .claude/rules/push-gate.md).
# Runs lint:check + unit tests + e2e tests and hard-blocks the push on failure.
# On success it stays silent (no permissionDecision), so the normal
# push confirmation prompt still applies — this only ever narrows
# permission, never grants it.
set -uo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$root" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"push gate: could not determine git repository root"}}\n'
  exit 0
fi

cd "$root" || exit 0

log_dir="$(mktemp -d)"

if npm run lint:check >"$log_dir/lint.log" 2>&1 \
  && npm test >"$log_dir/test.log" 2>&1 \
  && npm run test:e2e >"$log_dir/test-e2e.log" 2>&1; then
  printf '{"systemMessage":"push gate: lint:check, unit and e2e tests passed."}\n'
  exit 0
fi

reason="push gate: lint:check/test/test:e2e failed. Fix the failures and try again. Logs: $log_dir/lint.log, $log_dir/test.log, $log_dir/test-e2e.log"
reason_escaped=$(printf '%s' "$reason" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason_escaped"
