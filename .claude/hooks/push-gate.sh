#!/usr/bin/env bash
# PreToolUse gate for `git push` (see .claude/rules/push-gate.md).
# Runs lint:check + unit tests + e2e tests and hard-blocks the push on failure.
#
# Hardened per an automated review (Codex) that flagged four issues in the
# first version of this gate:
#   1. The "if" filter on the hook (Bash(git push*)) may not reliably scope
#      every launch of this script to actual `git push` commands, so this
#      script independently re-checks the real command text on stdin before
#      doing anything else, and is a no-op for anything that is not a
#      `git push` invocation.
#   2. The hook command that launches this script now resolves the repo
#      root itself before invoking it, so a session started outside the
#      repo root can't silently fail to find this file.
#   3. lint/test/e2e run under internal, pure-bash soft timeouts (no
#      external `timeout` binary — not guaranteed on macOS) well inside the
#      hook's own timeout budget, so this script always finishes and emits
#      a deny decision instead of being killed by the outer hook timeout,
#      which fails OPEN (non-blocking hook error), not closed.
#   4. Before running anything, this script now denies a dirty working tree
#      (uncommitted changes to tracked files aren't part of what gets
#      pushed, so testing them is misleading) and denies pushes whose
#      refspec doesn't resolve to the current branch (a conservative,
#      best-effort parse — see "Known limitation" below).
#
# On success it stays silent (no permissionDecision), so the normal push
# confirmation prompt still applies — this only ever narrows permission,
# never grants it.
set -uo pipefail

# --- 1. Verify this really is a `git push` before doing anything else ---
# Read the hook's stdin JSON once. If jq isn't available, skip this specific
# defense-in-depth check rather than deny every Bash call in that case (a
# missing jq must never turn this gate into a blanket Bash blocker).
stdin_json="$(cat)"

if command -v jq >/dev/null 2>&1; then
  command_text="$(printf '%s' "$stdin_json" | jq -r '.tool_input.command // empty' 2>/dev/null)"
  case "$command_text" in
    git\ push*) : ;;
    "") : ;; # could not extract the command; fall through to the git-based checks below rather than guess
    *)
      # Not a git push command at all — allow through immediately, no tests.
      exit 0
      ;;
  esac
else
  command_text=""
fi

# --- 2. Resolve the repo root robustly, regardless of session cwd ---
root="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$root" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"push gate: could not determine git repository root"}}\n'
  exit 0
fi

cd "$root" || {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"push gate: could not cd into repository root"}}\n'
  exit 0
}

# --- 4a. Deny a dirty working tree (uncommitted changes aren't pushed) ---
if ! git diff --quiet HEAD -- 2>/dev/null; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"push gate: working tree has uncommitted changes to tracked files. Commit or stash them first — this gate validates the working tree, and uncommitted changes are not part of what git push actually sends."}}\n'
  exit 0
fi

# --- 4b. Best-effort validation that the push targets the current branch ---
# Known limitation: this is a naive whitespace tokenizer, not a real shell
# parser, so it does not handle quoted refspecs or every possible flag form.
# On anything it cannot confidently classify as "pushes only the current
# branch", it denies rather than guesses — fail closed, not fail open.
if [ -n "$command_text" ]; then
  current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  push_args="${command_text#*push}"

  case " $push_args " in
    *" --all "*|*" --mirror "*|*" --tags "*|*" --follow-tags "*)
      printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"push gate: this push pushes more than the current branch (--all/--mirror/--tags/--follow-tags), which this gate cannot validate. Push the current branch explicitly instead."}}\n'
      exit 0
      ;;
  esac

  # shellcheck disable=SC2206
  tokens=($push_args)
  non_flag_tokens=()
  for tok in "${tokens[@]+"${tokens[@]}"}"; do
    case "$tok" in
      -*) continue ;;
      *) non_flag_tokens+=("$tok") ;;
    esac
  done

  if [ "${#non_flag_tokens[@]}" -ge 2 ]; then
    for refspec in "${non_flag_tokens[@]:1}"; do
      case "$refspec" in
        "$current_branch"|HEAD|"HEAD:$current_branch"|"$current_branch:$current_branch") ;;
        *)
          printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"push gate: this push targets a ref (%s) other than the current checked-out branch (%s), which this gate did not validate. Checkout that branch and push from there, or push the current branch only."}}\n' "$refspec" "${current_branch:-unknown}"
          exit 0
          ;;
      esac
    done
  fi
fi

# --- 3. Run validation under internal, portable soft-timeouts ---
# Pure-bash background-process timeout: `timeout(1)` is not shipped on
# macOS by default, so this avoids that dependency entirely.
log_dir="$(mktemp -d)"

run_step() {
  local name="$1" budget="$2"
  shift 2
  "$@" >"$log_dir/$name.log" 2>&1 &
  local pid=$! waited=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge "$budget" ]; then
      kill -TERM "$pid" 2>/dev/null
      sleep 1
      kill -KILL "$pid" 2>/dev/null
      printf '\n[push-gate] step "%s" killed after %ss soft timeout\n' "$name" "$budget" >>"$log_dir/$name.log"
      wait "$pid" 2>/dev/null
      return 124
    fi
  done
  wait "$pid"
}

if run_step lint 120 npm run lint:check \
  && run_step test 300 npm test \
  && run_step test-e2e 420 npm run test:e2e; then
  printf '{"systemMessage":"push gate: lint:check, unit and e2e tests passed."}\n'
  exit 0
fi

reason="push gate: lint:check/test/test:e2e failed (or timed out). Fix the failures and try again. Logs: $log_dir/lint.log, $log_dir/test.log, $log_dir/test-e2e.log"
reason_escaped=$(printf '%s' "$reason" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason_escaped"
