#!/usr/bin/env bash

set -euo pipefail

if [ ! -d "specs" ]; then
  exit 0
fi

PATTERN='password|passwd|secret|token|api[_-]?key|authorization|bearer|mongodb\+srv|private[_-]?key|BEGIN PRIVATE KEY|set-cookie|cookie:'

if grep -RniE "$PATTERN" specs/; then
  echo
  echo "Potential sensitive information found inside specs/."
  echo "Review the matches before committing."
  exit 1
fi

exit 0