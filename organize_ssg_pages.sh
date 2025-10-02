#!/usr/bin/env bash
set -euo pipefail

# ----------------------------------------------------
# Config (edit or export these in your session beforehand)
# ----------------------------------------------------
GIT_PUSH="${GIT_PUSH:-true}"                                # set to "false" to skip git/PR steps
REPO_REMOTE="${REPO_REMOTE:-origin}"
BR="fix/move-ssg-pages-$(date +%s)"
COMMIT_MSG="chore(aeo): move generated pages into ssg-pages (auto)"
SSG_DIR="${SSG_DIR:-ssg-pages}"                             # destination dir for page JSON files
SUPABASE_FUNCTION_URL="${SUPABASE_FUNCTION_URL:-}"          # e.g. https://<proj>.supabase.co/functions/v1/upsert-page-content
SUPABASE_ADMIN_KEY="${SUPABASE_ADMIN_KEY:-}"                # your admin key in env if you want auto-upsert
BUILD_CMD="${BUILD_CMD:-npm run prebuild && npm run build}" # adjust if your build differs

echo
echo "== 1) Find generated page JSON files (fight-*-ticket-*.json) not already in $SSG_DIR/ =="
# find files anywhere in repo except those already in $SSG_DIR
FOUND_LIST=$(find . -type f -name 'fight-*-ticket-*.json' ! -path "./${SSG_DIR}/*" -print)
FOUND_COUNT=$(echo "$FOUND_LIST" | grep -c . || echo 0)

if [ "$FOUND_COUNT" -eq 0 ]; then
  echo "No stray generated files found outside ./${SSG_DIR}. Nothing to move."
else
  echo "Found $FOUND_COUNT files to move:"
  echo "$FOUND_LIST" | while read -r f; do
    [ -n "$f" ] && echo "  - $f"
  done

  echo
  echo "== 2) Create ${SSG_DIR} and move files =="
  mkdir -p "$SSG_DIR"
  echo "$FOUND_LIST" | while read -r f; do
    [ -n "$f" ] || continue
    # Safely move, preserving name
    mv -v -- "$f" "$SSG_DIR/" || { echo "Failed to move $f"; exit 1; }
  done

  echo
  echo "== 3) Quick sanity: list $SSG_DIR contents =="
  ls -1 "$SSG_DIR" | sed -n '1,200p'
fi

# ----------------------------------------------------
# Git commit / push / PR (optional)
# ----------------------------------------------------
if [ "${GIT_PUSH}" = "true" ] && [ -d "$SSG_DIR" ]; then
  echo
  echo "== 4) Create git branch $BR and commit moved files =="
  git fetch "$REPO_REMOTE" || true
  git checkout -b "$BR"
  git add "$SSG_DIR"
  git commit -m "$COMMIT_MSG" || echo "No changes to commit (maybe already committed)"
  git push -u "$REPO_REMOTE" "$BR"
  echo "Pushed branch $BR to $REPO_REMOTE."
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    echo "Creating PR via gh..."
    gh pr create --title "chore(aeo): move generated pages into ssg-pages" \
                 --body "Auto move of generated AEO pages into ${SSG_DIR}/ — commit made by script." \
                 --base main --head "$BR" || echo "gh pr create failed (maybe PR already exists)."
  else
    echo "gh CLI not available or not authenticated — open PR manually for branch: $BR"
  fi
else
  echo
  echo "GIT_PUSH=false or ${SSG_DIR} doesn't exist - skipping git commit/push/PR step."
fi

# ----------------------------------------------------
# Optional: Upsert into Supabase Edge Function
# ----------------------------------------------------
if [ -n "${SUPABASE_FUNCTION_URL}" ] && [ -n "${SUPABASE_ADMIN_KEY}" ] && [ -d "$SSG_DIR" ]; then
  echo
  echo "== 5) Upserting JSON pages to Supabase via $SUPABASE_FUNCTION_URL =="
  POST_OK=0
  POST_FAIL=0
  for f in "$SSG_DIR"/fight-*-ticket-*.json; do
    [ -f "$f" ] || continue
    slug="$(basename "$f" .json)"
    echo -n "  Upserting $slug ... "
    http_code=$(curl -s -o /tmp/upsert_resp.$$ -w "%{http_code}" -X POST "$SUPABASE_FUNCTION_URL" \
      -H "x-admin-key: $SUPABASE_ADMIN_KEY" \
      -H "Content-Type: application/json" \
      --data-binary @"$f" || echo "000")
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
      echo "OK ($http_code)"
      POST_OK=$((POST_OK+1))
    else
      echo "FAIL ($http_code)"
      echo "  Response preview:"
      sed -n '1,6p' /tmp/upsert_resp.$$
      POST_FAIL=$((POST_FAIL+1))
    fi
  done
  rm -f /tmp/upsert_resp.$$
  echo "Supabase upsert results: ok=$POST_OK fail=$POST_FAIL"
else
  echo
  echo "SUPABASE_FUNCTION_URL or SUPABASE_ADMIN_KEY not set — skipping Supabase upsert."
fi

# ----------------------------------------------------
# Build & prerender & parity checks
# ----------------------------------------------------
echo
echo "== 6) Run build pipeline: $BUILD_CMD"
set +e
eval "$BUILD_CMD"
RC=$?
set -e
if [ "$RC" -ne 0 ]; then
  echo "Build failed (rc=$RC). Inspect build log and re-run: $BUILD_CMD"
else
  echo "Build succeeded."
  # run prerender if script exists
  if npm run | grep -q "prerender"; then
    echo "Running npm run prerender ..."
    npm run prerender || echo "prerender failed (nonfatal)"
  fi

  # run parity verifier if present
  if [ -x "scripts/verify_prerender_parity.sh" ]; then
    echo "Running scripts/verify_prerender_parity.sh ..."
    bash scripts/verify_prerender_parity.sh || echo "Parity script reported issues (check output)."
  elif [ -f "scripts/validate-faq-parity.js" ]; then
    echo "Running node scripts/validate-faq-parity.js ..."
    node scripts/validate-faq-parity.js || echo "faq parity script reported issues."
  elif [ -f "verify_prerender_parity.sh" ]; then
    echo "Running ./verify_prerender_parity.sh ..."
    bash verify_prerender_parity.sh || echo "Parity script reported issues (check output)."
  else
    echo "No parity script found; run your verifier manually if desired."
  fi
fi

# ----------------------------------------------------
# Final summary
# ----------------------------------------------------
echo
echo "=== SUMMARY ==="
echo "SSG directory: $SSG_DIR"
echo "Moved files (count): $(ls -1 "$SSG_DIR" | wc -l || echo 0)"
if [ "${GIT_PUSH}" = "true" ]; then
  echo "Git branch pushed: $BR (remote: $REPO_REMOTE)"
  if command -v gh >/dev/null 2>&1; then
    echo "Open PR with: gh pr view --web"
  else
    echo "Open PR in GitHub UI for branch $BR"
  fi
fi
if [ -n "${SUPABASE_FUNCTION_URL}" ] && [ -n "${SUPABASE_ADMIN_KEY}" ]; then
  echo "Supabase upsert attempted: ok=$POST_OK fail=${POST_FAIL:-0}"
fi

echo
echo "NEXT STEPS:"
echo "- Review the PR and merge when CI passes"
echo "- If build/prerender printed problems, fix and re-run"
echo "- After merge, monitor Search Console & run the AEO parity checker weekly"
echo