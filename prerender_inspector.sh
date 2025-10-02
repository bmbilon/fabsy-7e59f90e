#!/usr/bin/env bash
set -euo pipefail

PR_DIR="${PRERENDER_DIR:-prerendered}"

echo
echo "== Prerendered content quick inspector =="
echo "Looking for prerendered dir: ${PR_DIR}"
echo

if [ ! -d "${PR_DIR}" ] || [ -z "$(ls -A "${PR_DIR}" 2>/dev/null)" ]; then
  echo "→ No prerendered directory found or it's empty."
  echo
  echo "Listing top-level directories (cwd: $(pwd)):"
  ls -la | sed -n '1,200p'
  echo
  echo "Searching for likely places (prerendered / dist / ssg-pages):"
  find . -maxdepth 4 -type d \( -name 'prerendered' -o -name 'dist' -o -name 'ssg-pages' \) -print || true
  echo
  echo "If your prerendered output is elsewhere, set PRERENDER_DIR environment var and re-run, e.g.:"
  echo "  PRERENDER_DIR=path/to/prerendered ./this-script.sh"
  exit 0
fi

echo "Prerendered directory found and non-empty: ${PR_DIR}"
echo

total=0
pages_with_index=0
pages_with_faq=0
pages_with_jsonld=0

for d in "${PR_DIR}"/*; do
  [ -d "$d" ] || continue
  slug=$(basename "$d")
  html="$d/index.html"
  total=$((total+1))
  echo "----"
  echo "Slug: $slug"
  if [ ! -f "$html" ]; then
    echo "  index.html: MISSING"
    continue
  fi
  pages_with_index=$((pages_with_index+1))

  # count JSON-LD script tags (robust-ish)
  jsonld_cnt=$(grep -oEi '<script[^>]*type=("|\x27)?application\/ld\+json("|\x27)?[^>]*>' "$html" | wc -l || echo 0)
  echo "  index.html: OK"
  echo "  JSON-LD script tags: ${jsonld_cnt}"

  if [ "$jsonld_cnt" -gt 0 ]; then
    pages_with_jsonld=$((pages_with_jsonld+1))
  fi

  # detect FAQPage presence (simple string search in HTML)
  if grep -qE '"@type"\s*:\s*"FAQPage"' "$html" || grep -qE "'@type'\s*:\s*'FAQPage'" "$html"; then
    echo "  FAQPage schema: PRESENT"
    pages_with_faq=$((pages_with_faq+1))
  else
    echo "  FAQPage schema: MISSING"
  fi

  # print page <title> if exists (first 1 line)
  title=$(grep -iPo '(?<=<title>).*?(?=</title>)' "$html" 2>/dev/null || true)
  if [ -n "$title" ]; then
    echo "  <title>: ${title}"
  fi

  # extract first JSON-LD block excerpt (try perl for robust extraction, fallback to sed)
  echo "  JSON-LD excerpt (first 400 chars of first JSON-LD script):"
  if command -v perl >/dev/null 2>&1; then
    perl -0777 -ne 'while (/<script[^>]*type=(?:"|\047)?application\/ld\+json(?:"|\047)?[^>]*>(.*?)<\/script>/gis){ print substr($1,0,400),"\n"; last }' "$html" | sed -n '1,6p' || echo "   (could not extract)"
  else
    sed -n '/<script[^>]*type=["'\'']application\/ld+json["'\'']/,/<\/script>/p' "$html" 2>/dev/null | sed '1d;$d' | tr -d '\n' | sed 's/  */ /g' | cut -c1-400 | sed -n '1,6p' || echo "   (could not extract)"
  fi

  echo
done

echo "----"
echo "Summary:"
echo "  Slugs inspected: $total"
echo "  index.html present: $pages_with_index"
echo "  pages with >=1 JSON-LD script: $pages_with_jsonld"
echo "  pages with FAQPage schema: $pages_with_faq"
echo

# quick exit status: 0 ok, 2 if no FAQPage found at all
if [ "$pages_with_faq" -eq 0 ]; then
  echo "No FAQPage JSON-LD found in any prerendered pages."
  exit 2
fi

echo "Done."