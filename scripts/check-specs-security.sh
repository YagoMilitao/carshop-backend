#!/usr/bin/env bash

set -euo pipefail

if [ ! -d "specs" ]; then
  exit 0
fi

# Matches an actual secret VALUE, not a mere mention of the concept (env var
# name, mechanism description, or identifier like `tokenService`).
SECRET_PATTERN='(password|passwd|secret|api[_-]?key|private[_-]?key)[[:space:]]*[:=][[:space:]]*[^<{[:space:]][^[:space:]]{7,}'
SECRET_PATTERN="${SECRET_PATTERN}|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9._-]{15,}"
SECRET_PATTERN="${SECRET_PATTERN}|mongodb(\\+srv)?://[^:@/[:space:]]+:[^@/[:space:]]+@"
SECRET_PATTERN="${SECRET_PATTERN}|-----BEGIN (RSA |EC )?PRIVATE KEY-----"
SECRET_PATTERN="${SECRET_PATTERN}|Set-Cookie:[[:space:]]*[A-Za-z0-9_]+=[^;[:space:]]{8,}"
SECRET_PATTERN="${SECRET_PATTERN}|eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{5,}"

# Documented-safe placeholder forms (see .claude/rules/spec-security.md):
# <ACCESS_TOKEN>, {API_BASE_URL}, process.env.X, obvious dummy values.
PLACEHOLDER_PATTERN='<[A-Z0-9_]+>|\{[A-Z0-9_]+\}|process\.env\.|\bYOUR_|\bCHANGE_?ME\b|\bexample\.com\b'

matches=$(grep -RniE "$SECRET_PATTERN" specs/ | grep -viE "$PLACEHOLDER_PATTERN" || true)

if [ -n "$matches" ]; then
  echo "$matches"
  echo
  echo "Potential sensitive information found inside specs/."
  echo "Review the matches before committing."
  exit 1
fi

exit 0
