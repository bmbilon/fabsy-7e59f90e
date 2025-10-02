#!/usr/bin/env bash
set -euo pipefail
# ------------------------------------------------------------
# ONE PASTE: Bulk generate pages (optional) -> sitemap -> robots -> git push + PR -> optional supabase upsert
# Paste into Warp and run from your repo root.
# ------------------------------------------------------------

# CONFIG - edit/or export these before running if desired
BULK_GEN="${BULK_GEN:-false}"                      # set false to skip page generation (we already have pages)
SSG_DIR="${SSG_DIR:-ssg-pages}"                    # where page json lives
PUBLIC_DIR="${PUBLIC_DIR:-public}"                 # where sitemap/robots will be written
REPO_REMOTE="${REPO_REMOTE:-origin}"
BR="aeo-next-$(date +%s)"
COMMIT_MSG="chore(aeo): sitemap + robots + optional bulk pages"
GIT_PUSH="${GIT_PUSH:-true}"                       # false = no git actions
SUPABASE_FUNCTION_URL="${SUPABASE_FUNCTION_URL:-}" # set to upsert endpoint to auto-upsert
SUPABASE_ADMIN_KEY="${SUPABASE_ADMIN_KEY:-}"       # admin key (keep secret)
BUILD_CMD="${BUILD_CMD:-npm run prebuild && npm run build}" # build command
DOMAIN="${DOMAIN:-https://fabsy.ca}"

# PHASE 2 bulk generation lists (change as desired)
CITIES=(Calgary Edmonton "Red Deer" Lethbridge "Medicine Hat" "Fort McMurray")
VIOLATIONS=(speeding "red light" distracted careless)

# Helper: safe mkdir
mkdir -p "$SSG_DIR" "$PUBLIC_DIR"

# -----------------------
# A) Bulk page generator (simple template)
# -----------------------
if [ "$BULK_GEN" = "true" ]; then
  echo "== A) Bulk generating JSON pages into $SSG_DIR (24+)..."
  export BULK_CITIES="$(printf '%s\n' "${CITIES[@]}" | jq -R -s -c 'split("\n")[:-1]')"
  export BULK_VIOLATIONS="$(printf '%s\n' "${VIOLATIONS[@]}" | jq -R -s -c 'split("\n")[:-1]')"
  node - <<'NODE'
const fs = require('fs');
const path = require('path');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

const cities = JSON.parse(process.env['BULK_CITIES'] || '["Calgary","Edmonton","Red Deer","Lethbridge","Medicine Hat","Fort McMurray"]');
const violations = JSON.parse(process.env['BULK_VIOLATIONS'] || '["speeding","red light","distracted","careless"]');
const outDir = process.env['SSG_DIR'] || 'ssg-pages';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});

for (const city of cities) {
  for (const violation of violations) {
    const slug = `fight-${slugify(violation)}-ticket-${slugify(city)}`;
    const filename = path.join(outDir, `${slug}.json`);
    const h1 = `How to Fight a ${violation[0].toUpperCase()+violation.slice(1)} Ticket in ${city}`;
    const meta_title = `${h1} | Fabsy`;
    const meta_description = `Local guide to fighting ${violation} tickets in ${city}. Free eligibility check.`;
    const faqs = [
      { q: `Do I need to go to court for a ${violation} ticket in ${city}?`, a: `Not always. You can plead guilty, pay, or request trial. Request disclosure and we can evaluate your options for ${city}.` },
      { q: `How much does a ${violation} ticket cost in ${city}?`, a: `Typical fines vary — our analysis estimates an average out-of-pocket plus insurance impact; request a free eligibility check to see expected savings.` },
      { q: `Will fighting a ${violation} ticket affect my insurance in ${city}?`, a: `If convicted insurance typically rises. Fighting aims to avoid convictions that raise premiums. Fabsy offers a zero-risk review.` }
    ];
    const json = {
      slug, city, violation, h1, meta_title, meta_description,
      content: `<p>${h1} — short intro tailored to ${city}.</p>`,
      faqs,
      jsonld: null,   // generator pipeline will produce JSON-LD later if needed
      created_at: new Date().toISOString()
    };
    fs.writeFileSync(filename, JSON.stringify(json, null, 2) + '\n', 'utf8');
    console.log('WROTE', filename);
  }
}
NODE
  echo "Bulk generation complete."
else
  echo "Bulk generation skipped (BULK_GEN=false)."
fi

# -----------------------
# B) Generate sitemap.xml
# -----------------------
echo "== B) Generating sitemap.xml from $SSG_DIR/*.json -> $PUBLIC_DIR/sitemap.xml"
SITEMAP_FILE="$PUBLIC_DIR/sitemap.xml"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$SITEMAP_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${DOMAIN}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>${DOMAIN}/faq</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>${DOMAIN}/how-it-works</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
EOF

# add pages
for f in "$SSG_DIR"/*.json; do
  [ -f "$f" ] || continue
  slug=$(basename "$f" .json)
  # heuristics for priority
  priority="0.7"
  changefreq="weekly"
  echo "  <url><loc>${DOMAIN}/${slug}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority><lastmod>${now}</lastmod></url>" >> "$SITEMAP_FILE"
done

cat >> "$SITEMAP_FILE" <<EOF
</urlset>
EOF

echo "Sitemap written to $SITEMAP_FILE ($(wc -c < $SITEMAP_FILE) bytes)"

# -----------------------
# C) Generate robots.txt (includes AI crawlers allowlist)
# -----------------------
ROBOT_FILE="$PUBLIC_DIR/robots.txt"
echo "== C) Writing robots.txt to $ROBOT_FILE"
cat > "$ROBOT_FILE" <<EOF
# robots.txt for Fabsy
User-agent: *
Allow: /

# Explicitly permit major AI crawlers we want to encourage
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: ${DOMAIN}/sitemap.xml
EOF
echo "robots.txt written."

# -----------------------
# D) Git commit -> push -> PR
# -----------------------
if [ "$GIT_PUSH" = "true" ]; then
  echo "== D) Git commit + push + PR (branch: $BR)"
  git fetch "$REPO_REMOTE" || true
  git checkout -b "$BR"
  git add "$PUBLIC_DIR/sitemap.xml" "$PUBLIC_DIR/robots.txt" "$SSG_DIR" || true
  # if there are no changes, proceed gracefully
  if git diff --staged --quiet; then
    echo "No staged changes to commit."
  else
    git commit -m "$COMMIT_MSG"
    git push -u "$REPO_REMOTE" "$BR"
    echo "Pushed branch $BR."
    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
      gh pr create --title "chore(aeo): sitemap + robots + bulk pages" --body "Auto-generated sitemap + robots and optional bulk AEO pages." --base main --head "$BR" || echo "gh pr create failed (maybe PR exists)."
      echo "PR created/opened in browser (if gh supports web)."
    else
      echo "gh CLI not found/unauthed — open a PR in GitHub UI for branch $BR"
    fi
  fi
else
  echo "Skipping git actions (GIT_PUSH=false)."
fi

# -----------------------
# E) Optional Supabase upsert for new pages
# -----------------------
if [ -n "$SUPABASE_FUNCTION_URL" ] && [ -n "$SUPABASE_ADMIN_KEY" ]; then
  echo "== E) Upserting JSON pages to Supabase: $SUPABASE_FUNCTION_URL"
  OK=0; FAIL=0;
  for f in "$SSG_DIR"/fight-*-ticket-*.json; do
    [ -f "$f" ] || continue
    slug=$(basename "$f" .json)
    echo -n "Upsert $slug ... "
    code=$(curl -sS -o /tmp/upsert_resp.$$ -w "%{http_code}" -X POST "$SUPABASE_FUNCTION_URL" \
      -H "x-admin-key: $SUPABASE_ADMIN_KEY" -H "Content-Type: application/json" --data-binary @"$f" || echo "000")
    if [ "$code" = "200" ] || [ "$code" = "201" ]; then
      echo "OK"
      OK=$((OK+1))
    else
      echo "FAIL ($code)"
      sed -n '1,6p' /tmp/upsert_resp.$$
      FAIL=$((FAIL+1))
    fi
  done
  rm -f /tmp/upsert_resp.$$
  echo "Supabase upsert complete: ok=$OK fail=$FAIL"
else
  echo "Supabase upsert skipped (SUPABASE vars not set)."
fi

# -----------------------
# F) Build & quick checks
# -----------------------
echo "== F) Triggering build: $BUILD_CMD"
set +e
eval "$BUILD_CMD"
RC=$?
set -e
if [ $RC -ne 0 ]; then
  echo "Build failed (rc=$RC). Inspect logs and rerun build."
else
  echo "Build succeeded."
  # if gh available, optionally watch latest deployment
  if command -v gh >/dev/null 2>&1; then
    echo "You can watch CI with: gh run watch --repo \$(git remote get-url $REPO_REMOTE | sed -n 's#.*/\([^/]*\/[^/]*\)\.git#\1#p')"
  fi
fi

# -----------------------
# FINAL SUMMARY
# -----------------------
echo
echo "=== DONE: summary ==="
echo "SSG dir: $SSG_DIR"
echo "Sitemap: $SITEMAP_FILE"
echo "Robots: $ROBOT_FILE"
if [ "$GIT_PUSH" = "true" ]; then
  echo "Branch pushed: $BR (remote: $REPO_REMOTE)"
  echo "Open PR to review the changes and merge when CI passes."
fi
if [ -n "$SUPABASE_FUNCTION_URL" ]; then
  echo "Supabase upsert was attempted (check output above)."
fi

cat <<EOF

NEXT MANUAL STEPS (recommended)
1) Review and merge the PR created by this script.
2) After deployment, manually submit sitemap to Google Search Console + Bing:
   - Google: https://search.google.com/search-console > Sitemaps > Submit: ${DOMAIN}/sitemap.xml
   - Bing: https://www.bing.com/webmasters > Sitemaps

3) Check live pages for JSON-LD parity:
   - Use your parity checker: node scripts/validate-faq-parity.js
   - Or test a page with Rich Results Test

4) Phase 2 expansion (scale): once PR merged, run the generator with different city lists to create 100+ pages. Use the embedded generator pattern above (SSG_DIR env target) and then rerun this script (B-F).

EOF