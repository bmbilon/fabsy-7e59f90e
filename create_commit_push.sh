#!/usr/bin/env bash
set -euo pipefail

echo "This legacy content writer is disabled because it predates Fabsy's current content guardrails."
echo "Use scripts/seed-reviewed-pages.mjs, scripts/generate-static-snapshots.cjs, and the reviewed content-engine workflow instead."
exit 1
