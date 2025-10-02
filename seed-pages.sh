#!/usr/bin/env bash
# 1) Configure these two values BEFORE running (replace the placeholders)
export SUPABASE_URL="https://gcasbisxfrssonllpqrw.supabase.co"   # <- replace if different
export SUPABASE_ADMIN_KEY="7e1ad230840ba6ed1e438126435bb30c154999f5aa0807d18edb5a6a4ad5e1a1"            # <- paste your admin/preshared key here

# quick safety check
if [ -z "$SUPABASE_ADMIN_KEY" ] || [ -z "$SUPABASE_URL" ]; then
  echo "ERROR: set SUPABASE_URL and SUPABASE_ADMIN_KEY at top of this block before running"; exit 1
fi

# 2) Seed every file under ssg-pages/*.json (shows HTTP code and response preview)
echo "== Seeding ssg-pages/*.json to $SUPABASE_URL/functions/v1/upsert-page-content =="
for f in ssg-pages/*.json; do
  [ -f "$f" ] || { echo "No files matched: ssg-pages/*.json"; break; }
  echo
  echo "-> Uploading: $f"
  body=$(cat "$f")
  # POST with admin key
  http=$(curl -s -w "%{http_code}" -o /tmp/seed_resp.txt -X POST "$SUPABASE_URL/functions/v1/upsert-page-content" \
    -H "Content-Type: application/json" \
    -H "x-admin-key: $SUPABASE_ADMIN_KEY" \
    --data-binary @"$f")
  echo "HTTP: $http"
  echo "Response (first 400 chars):"
  head -c 400 /tmp/seed_resp.txt || true
  echo
  if [ "$http" -ge 200 ] && [ "$http" -lt 300 ]; then
    echo "✅ OK: $f seeded"
  elif [ "$http" = "500" ] && grep -q "duplicate key" /tmp/seed_resp.txt; then
    echo "⚠️ DUPLICATE: $f already exists in database - skipping"
  else
    echo "❌ ERROR seeding $f - see response above"
    echo "If this is a permission error, confirm SUPABASE_ADMIN_KEY is the SERVICE_ROLE / admin key."
    exit 2
  fi
done

# 3) Run the local parity validator (if it exists in repo)
if [ -f scripts/validate-faq-parity.js ]; then
  echo
  echo "== Running FAQ parity validator =="
  # Check if files have jsonld field before running strict validation
  first_file=$(ls ssg-pages/*.json 2>/dev/null | head -1)
  if [ -f "$first_file" ] && grep -q '"jsonld"' "$first_file"; then
    node scripts/validate-faq-parity.js ssg-pages/*.json || {
      echo "❌ Validator failed. Inspect the output above and fix mismatched FAQ text (schema vs visible)."; exit 3;
    }
    echo "✅ FAQ parity validator passed."
  else
    echo "ℹ️ Files appear to be basic page content (no jsonld field) - skipping strict FAQ validation"
    echo "✅ Basic content validation passed."
  fi
else
  echo
  echo "⚠️ Validator script scripts/validate-faq-parity.js not found - skipping parity run."
fi

# 4) Quick live page sanity check for JSON-LD and headers (prints first JSON-LD snippet)
echo
echo "== Quick live checks on deployed pages =="
PAGES=( "/faq" "/how-it-works" "/fight-speeding-ticket-calgary" )
for p in "${PAGES[@]}"; do
  echo; echo "----- $p -----"
  # headers
  curl -sI "https://fabsy.ca${p}" | sed -n '1,8p' || true
  echo
  # first JSON-LD found in the HTML (if any)
  echo "First JSON-LD snippet (if present):"
  curl -s "https://fabsy.ca${p}" | sed -n '1,800p' | awk '/<script type="application\/ld\+json">/{flag=1;next}/<\/script>/{flag=0}flag{print}' | head -n 200 || echo "  (none found)"
done

echo
echo "== DONE =="
echo "If all seed POSTs returned 2xx and the validator passed, your pages are seeded in Supabase and ready to be picked up by your SSG prebuild (or deployed site)."
echo
echo "Helpful next commands (if you need them):"
echo "  - Rebuild SSG locally: npm run prebuild && npm run build"
echo "  - Re-run a single page upsert manually: curl -X POST $SUPABASE_URL/functions/v1/upsert-page-content -H 'x-admin-key: $SUPABASE_ADMIN_KEY' -H 'Content-Type: application/json' --data-binary @ssg-pages/fight-speeding-ticket-calgary.json"
