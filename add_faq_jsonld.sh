#!/usr/bin/env bash
set -euo pipefail

# Single-step: add FAQPage JSON-LD into prerendered index.html using ssg-pages JSON (if present)
PR_DIR="${PRERENDER_DIR:-prerendered}"
CANDIDATE_JSON_DIRS=( "ssg-pages" "src/content/pages" "src/content" )

if [ ! -d "$PR_DIR" ]; then
  echo "ERROR: prerendered directory not found: $PR_DIR"
  echo "Run the prerender step first."
  exit 1
fi

TMP_JS="/tmp/__add_faq_jsonld_$$.js"
cat > "$TMP_JS" <<'NODE'
/*
 Inject FAQPage JSON-LD into prerendered index.html files.

 Expects environment variable PR_DIR (default 'prerendered') and tries
 to find JSON files in candidate dirs passed by the shell command that
 invokes this script.
*/
const fs = require('fs');
const path = require('path');

const PR_DIR = process.env.PR_DIR || 'prerendered';
const candidateDirs = JSON.parse(process.env.CANDIDATE_DIRS_JSON || '["ssg-pages","src/content/pages","src/content"]');

function findJsonForSlug(slug) {
  for (const d of candidateDirs) {
    const p = path.join(d, `${slug}.json`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function safeParseJsonFile(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Failed parsing JSON ${p}: ${e.message}`);
    return null;
  }
}

function buildFAQSchema(faqs) {
  const mainEntity = faqs.map(f => ({
    "@type": "Question",
    "name": String(f.q || f.question || "").trim(),
    "acceptedAnswer": {
      "@type": "Answer",
      "text": String(f.a || f.answer || "").trim()
    }
  }));
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": mainEntity
  };
}

const dirs = fs.readdirSync(PR_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

let patched = 0, skippedAlready=0, noJson=0, noFaqs=0, errors=0;

for (const slug of dirs) {
  try {
    const indexPath = path.join(PR_DIR, slug, 'index.html');
    if (!fs.existsSync(indexPath)) {
      console.warn(`[skip] ${slug} - index.html not found`);
      continue;
    }
    const html = fs.readFileSync(indexPath, 'utf8');

    // If page already contains FAQPage JSON-LD, skip idempotently
    if (html.match(/"@type"\s*:\s*"FAQPage"/)) {
      console.log(`[skip] ${slug} - FAQPage already present`);
      skippedAlready++;
      continue;
    }

    const jsonPath = findJsonForSlug(slug);
    if (!jsonPath) {
      console.log(`[skip] ${slug} - no page JSON found in candidate dirs`);
      noJson++;
      continue;
    }

    const pageJson = safeParseJsonFile(jsonPath);
    if (!pageJson) { errors++; continue; }

    // Prefer explicit faqs array; support alternative key names defensively
    const faqs = pageJson.faqs || pageJson.FAQs || pageJson.questions || pageJson.qas;
    if (!Array.isArray(faqs) || faqs.length === 0) {
      console.log(`[skip] ${slug} - JSON found but no faqs array`);
      noFaqs++;
      continue;
    }

    // Ensure each FAQ has q and a fields (best-effort)
    const normalizedFaqs = faqs.map(f => {
      if (typeof f === 'string') {
        // fallback: no structured q/a, skip page
        return null;
      }
      return {
        q: f.q || f.question || f.Q || f.qText || "",
        a: f.a || f.answer || f.A || f.aText || ""
      };
    }).filter(Boolean).filter(f=>f.q && f.a);

    if (normalizedFaqs.length === 0) {
      console.log(`[skip] ${slug} - faqs present but not in expected format (q/a)`);
      noFaqs++;
      continue;
    }

    const schema = buildFAQSchema(normalizedFaqs);
    const jsonldText = JSON.stringify(schema, null, 2);

    // Create the script tag to inject
    const scriptTag = `\n<script type="application/ld+json">\n${jsonldText}\n</script>\n`;

    // Inject before closing </head> if exists, else before first <body>
    let newHtml;
    if (html.includes('</head>')) {
      newHtml = html.replace('</head>', `${scriptTag}</head>`);
    } else if (html.includes('<body')) {
      // insert right before <body> tag
      newHtml = html.replace(/<body([^>]*)>/i, match => `${scriptTag}${match}`);
    } else {
      // append to start
      newHtml = `${scriptTag}\n${html}`;
    }

    fs.writeFileSync(indexPath, newHtml, 'utf8');
    console.log(`[patched] ${slug} - injected FAQPage JSON-LD (questions: ${normalizedFaqs.length})`);
    patched++;
  } catch (e) {
    console.error(`[error] ${slug}: ${e && e.message ? e.message : e}`);
    errors++;
  }
}

console.log("\n--- Summary ---");
console.log(`patched: ${patched}`);
console.log(`skippedAlready: ${skippedAlready}`);
console.log(`noJson: ${noJson}`);
console.log(`noFaqs: ${noFaqs}`);
console.log(`errors: ${errors}`);

if (errors > 0) process.exit(2);
NODE

# run the node injector
export PR_DIR="$PR_DIR"
# Provide candidate dirs to node via env var (JSON-encoded)
export CANDIDATE_DIRS_JSON='["ssg-pages","src/content/pages","src/content"]'
node "$TMP_JS"

# cleanup
rm -f "$TMP_JS"

# Re-run the prerender inspector to verify FAQPage presence
echo
echo "== Running prerender inspector to verify changes =="
cat > /tmp/prerender_inspect.sh <<'BASH'
#!/usr/bin/env bash
set -euo pipefail
PR_DIR="${PRERENDER_DIR:-prerendered}"
if [ ! -d "$PR_DIR" ]; then
  echo "No prerendered dir found: $PR_DIR"
  exit 1
fi
for html in "$PR_DIR"/*/index.html; do
  [ -f "$html" ] || continue
  slug=$(basename "$(dirname "$html")")
  echo "== $slug =="
  cnt=$(grep -o '<script[^>]*type=["'\''"]application/ld+json["'\''"]' "$html" | wc -l || echo 0)
  echo "  JSON-LD count: $cnt"
  if grep -q '"@type"\s*:\s*"FAQPage"' "$html"; then
    echo "  FAQPage: PRESENT"
  else
    echo "  FAQPage: MISSING"
  fi
done
BASH

bash /tmp/prerender_inspect.sh
rm -f /tmp/prerender_inspect.sh

echo
echo "Done. If you want the script to commit these patched prerendered files, run:"
echo "  git checkout -b publish/prerender-faq-$(date +%s)"
echo "  git add prerendered public/sitemap.xml && git commit -m \"chore(aeo): add FAQPage JSON-LD to prerendered pages\""
echo "  git push -u origin HEAD"