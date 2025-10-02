#!/usr/bin/env bash
set -euo pipefail
HOOKS_DIR=".git/hooks"
if [ ! -d "$HOOKS_DIR" ]; then
  echo "Error: .git/hooks not found. Are you in a git repo?"
  exit 1
fi
cat > "$HOOKS_DIR/pre-push" <<'HOOK'
#!/usr/bin/env bash
# pre-push hook: run FAQ parity validator locally and abort push on failure
# Uses repo-relative path to node script
echo "Running local validate-faq-parity.js before push..."
if command -v node >/dev/null 2>&1; then
  node scripts/validate-faq-parity.cjs
  STATUS=$?
  if [ "$STATUS" -ne 0 ]; then
    echo "validate-faq-parity failed (exit $STATUS). Aborting push. Fix parity or run scripts/validate-faq-parity.cjs to debug."
    exit $STATUS
  fi
else
  echo "node not found; skipping parity validator (hook permitted)"; exit 0
fi
HOOK
chmod +x "$HOOKS_DIR/pre-push"
echo "Installed git pre-push hook (local only). To reinstall on another machine, run scripts/install-git-hooks.sh"