#!/usr/bin/env bash
set -euo pipefail

# CONFIG
REPO="bmbilon/fabsy-7e59f90e"
TITLE_MATCH_REGEX="SSR-ready schema components|SSR-ready|schema components|AEO|AEo|aeo|schema components \+ FAQ"
WORKFLOW_NAME="Build and Deploy"   # adjust if your workflow is named differently

# Helpers
echo_header(){ printf "\n\x1b[1;34m%s\x1b[0m\n\n" "$1"; }

# 1) Ensure gh CLI present and authenticated
if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI (gh) not found. Install it: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "You are not authenticated with gh. Attempting interactive login..."
  gh auth login || { echo "gh auth login failed. Abort."; exit 1; }
fi

echo_header "Searching for target PR in repo: $REPO"

# 2) Try to find PR by title pattern (case-insensitive)
PR_NUMBER=$(gh pr list --repo "$REPO" --state open --json number,title,author --jq -- |
  jq -r --arg re "$TITLE_MATCH_REGEX" '.[] | select((.title|test($re; "i"))) | .number' 2>/dev/null || true)

# If jq not available, use gh's --jq directly as fallback
if [ -z "$PR_NUMBER" ] && gh --version >/dev/null 2>&1; then
  PR_NUMBER=$(gh pr list --repo "$REPO" --state open --json number,title,author --jq ".[] | select(.title | test(\"$TITLE_MATCH_REGEX\"; \"i\")) | .number" 2>/dev/null || true)
fi

# 3) Fallback: if no match and exactly one open PR, choose it
if [ -z "$PR_NUMBER" ]; then
  OPEN_COUNT=$(gh pr list --repo "$REPO" --state open --limit 100 --json number --jq 'length' 2>/dev/null || true)
  if [ "$OPEN_COUNT" = "1" ]; then
    PR_NUMBER=$(gh pr list --repo "$REPO" --state open --limit 1 --json number --jq '.[0].number')
    echo "No title match found — single open PR detected. Using PR #$PR_NUMBER."
  else
    echo "Multiple open PRs found and none matched title regex:"
    gh pr list --repo "$REPO" --state open --limit 20 --format 'table(#,title,author.login,headRefName)'
    echo
    echo "Aborting. If you want to auto-merge a specific PR, re-run with that PR number."
    exit 2
  fi
fi

if [ -z "$PR_NUMBER" ]; then
  echo "No open PR found. Nothing to merge."
  exit 0
fi

echo_header "Found PR #$PR_NUMBER — fetching details"

gh pr view "$PR_NUMBER" --repo "$REPO" --web >/dev/null 2>&1 || true
PR_TITLE=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json title,headRefName,author --jq '.title')
PR_BRANCH=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json title,headRefName,author --jq '.headRefName')
PR_AUTHOR=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json title,headRefName,author --jq '.author.login')

echo "PR: #$PR_NUMBER"
echo "Title: $PR_TITLE"
echo "Branch: $PR_BRANCH"
echo "Author: $PR_AUTHOR"
echo

# 4) Merge (merge commit) and delete branch
echo_header "Merging PR #$PR_NUMBER into main (merge commit + delete branch)"
gh pr merge "$PR_NUMBER" --repo "$REPO" --merge --delete-branch --admin --subject "Merge PR #${PR_NUMBER}: ${PR_TITLE}" --body "Automated merge triggered by script." || {
  echo "ERROR: gh pr merge failed. Check permissions and PR status."
  exit 3
}

echo "Merge command returned OK. PR #$PR_NUMBER merged and branch deleted (if permitted)."

# 5) Find the latest run on main and watch it
echo_header "Waiting for workflow run on branch 'main' to start and finish (watching latest $WORKFLOW_NAME run)"

# Wait a few seconds for run to trigger
sleep 3

# Get latest run id for main branch (limit 1)
RUN_ID=$(gh run list --repo "$REPO" --branch main --limit 5 --json id,name,workflowName,conclusion --jq '.[] | select(.workflowName==("'"$WORKFLOW_NAME"'")) | .id' | head -n1 || true)

# If we didn't find a run for the named workflow, just take the latest run on main
if [ -z "$RUN_ID" ]; then
  RUN_ID=$(gh run list --repo "$REPO" --branch main --limit 1 --json id --jq '.[0].id' || true)
fi

if [ -z "$RUN_ID" ]; then
  echo "No recent GitHub run detected on main. Open Actions page to inspect: https://github.com/${REPO}/actions"
  exit 0
fi

echo "Watching run id: $RUN_ID"
set +e
gh run watch "$RUN_ID" --repo "$REPO"
WATCH_EXIT=$?
set -e

if [ $WATCH_EXIT -ne 0 ]; then
  echo "gh run watch exited with code $WATCH_EXIT — check Actions UI: https://github.com/${REPO}/actions/runs/${RUN_ID}"
  exit $WATCH_EXIT
fi

# Get final conclusion of run
CONCLUSION=$(gh run view "$RUN_ID" --repo "$REPO" --json conclusion --jq '.conclusion' 2>/dev/null || true)
echo_header "Workflow run finished. Conclusion: ${CONCLUSION:-unknown}"

if [ "$CONCLUSION" = "success" ]; then
  echo "✅ Build & deploy succeeded. Your merge is live or being deployed by CI."
  echo "Actions run: https://github.com/${REPO}/actions/runs/${RUN_ID}"
  exit 0
else
  echo "❌ Build or deploy failed — open Actions run for logs:"
  echo "https://github.com/${REPO}/actions/runs/${RUN_ID}"
  exit 4
fi