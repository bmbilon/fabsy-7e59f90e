#!/usr/bin/env bash
set -euo pipefail
RETRY=0
MAX_RETRIES=3
REMOTE="${1:-origin}"
BRANCH="${2:-$(git rev-parse --abbrev-ref HEAD)}"
while true; do
  echo "Attempting git push $REMOTE $BRANCH (attempt #$((RETRY+1)))..."
  if git push "$REMOTE" "$BRANCH"; then
    echo "Push succeeded."
    exit 0
  else
    echo "Push failed."
    if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
      echo "Max retries reached. Please resolve push conflicts manually."
      exit 1
    fi
    echo "Attempting to auto-fix: git pull --rebase --autostash $REMOTE $BRANCH"
    git pull --rebase --autostash "$REMOTE" "$BRANCH" || {
      echo "Auto-rebase failed; try resolving conflicts manually."
      exit 1
    }
    RETRY=$((RETRY+1))
    echo "Retrying push..."
  fi
done