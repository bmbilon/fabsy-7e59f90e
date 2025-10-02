#!/usr/bin/env bash
set -euo pipefail

# Usage: paste into Warp from repo root
# Writes a temporary Node script and runs it

PR_DIR="${PRERENDER_DIR:-prerendered}"
CANDIDATE_DIRS=( "ssg-pages" "src/content/pages" "src/content" )

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found in PATH. Install Node 18+ and re-run."
  exit 1
fi

TMP_JS="/tmp/verify_prerender_parity_$$.js"
cat > "$TMP_JS" <<'NODE'
const fs = require('fs');
const path = require('path');

const PR_DIR = process.env.PR_DIR || 'prerendered';
const candidateDirs = JSON.parse(process.env.CANDIDATE_DIRS_JSON || '["ssg-pages","src/content/pages","src/content"]');

function findJsonForSlug(slug) {
  for (const d of candidateDirs) {
    const p1 = path.join(d, `${slug}.json`);
    const p2 = path.join(d, slug, 'index.json');
    if (fs.existsSync(p1)) return p1;
    if (fs.existsSync(p2)) return p2;
  }
  return null;
}

function extractJsonLdScripts(html) {
  // crude but reliable: find <script type="application/ld+json"> ... </script>
  const re = /<script[^>]*type=(?:'|")?application\/ld\+json(?:'|")?[^>]*>([\s\S]*?)<\/script>/ig;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // sometimes pages emit multiple JSON objects concatenated; try to wrap
    try {
      // attempt to repair by removing leading/trailing chars
      const repaired = text.replace(/^\uFEFF/, '').trim();
      return JSON.parse(repaired);
    } catch (err) {
      return null;
    }
  }
}

function findFAQPageInParsed(parsed) {
  if (!parsed) return null;
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && item['@type'] === 'FAQPage') return item;
    }
    return null;
  } else if (parsed['@type'] === 'FAQPage') {
    return parsed;
  } else if (parsed && parsed.mainEntity && Array.isArray(parsed.mainEntity)) {
    // could be WebPage wrapping mainEntity etc -> check
    if (parsed.mainEntity.length && parsed.mainEntity[0]['@type'] === 'Question') {
      return { "@context": parsed['@context'] || "https://schema.org", "@type": "FAQPage", "mainEntity": parsed.mainEntity };
    }
  }
  return null;
}

function normalizeFaqsFromSource(obj) {
  const faqs = obj.faqs || obj.FAQs || obj.questions || obj.qas || obj.qa || [];
  if (!Array.isArray(faqs)) return [];
  return faqs.map(f => {
    if (typeof f === 'string') return null;
    // try common keys
    const q = (f.q || f.question || f.Q || f.qText || f.questionText || '') + '';
    const a = (f.a || f.answer || f.A || f.aText || f.answerText || '') + '';
    return { q: q.trim(), a: a.trim() };
  }).filter(Boolean);
}

function normalizeMainEntity(me) {
  if (!Array.isArray(me)) return [];
  return me.map(item => {
    const q = (item.name || item.question || '') + '';
    const a = (item.acceptedAnswer && (item.acceptedAnswer.text || item.acceptedAnswer.answerText)) || '';
    return { q: q.trim(), a: (a+'').trim() };
  });
}

if (!fs.existsSync(PR_DIR) || !fs.statSync(PR_DIR).isDirectory()) {
  console.error(`Prerender directory "${PR_DIR}" not found.`);
  process.exit(2);
}

const candidateDirsEnv = process.env.CANDIDATE_DIRS_JSON || '["ssg-pages","src/content/pages","src/content"]';
const candidateDirsLocal = JSON.parse(candidateDirsEnv);

const dirs = fs.readdirSync(PR_DIR, {withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort();

let total=0, pass=0, fail=0, missingJson=0, missingFAQJsonLd=0, mismatchCount=0;

console.log(`Verifying prerendered pages in "${PR_DIR}" against candidate dirs: ${candidateDirsLocal.join(', ')}`);
console.log('------------------------------------------------------------------');

for (const slug of dirs) {
  total++;
  const indexPath = path.join(PR_DIR, slug, 'index.html');
  const readableSlug = slug;
  process.stdout.write(`\n[${total}] ${readableSlug} ... `);
  if (!fs.existsSync(indexPath)) {
    console.log('MISSING index.html -> SKIP');
    continue;
  }
  const html = fs.readFileSync(indexPath, 'utf8');
  const jsonPath = findJsonForSlug(slug);
  if (!jsonPath) {
    console.log('NO SOURCE JSON -> cannot parity-check -> SKIP');
    missingJson++;
    continue;
  }
  const pageJsonRaw = fs.readFileSync(jsonPath, 'utf8');
  let pageJson;
  try { pageJson = JSON.parse(pageJsonRaw); } catch(e){
    console.log(`BAD SOURCE JSON (${jsonPath}) -> SKIP`);
    missingJson++;
    continue;
  }
  const sourceFaqs = normalizeFaqsFromSource(pageJson);
  if (!sourceFaqs.length) {
    console.log('SOURCE JSON has no faqs -> SKIP');
    missingJson++;
    continue;
  }

  // extract JSON-LD scripts
  const scripts = extractJsonLdScripts(html);
  let foundFAQ = null;
  for (const s of scripts) {
    const parsed = parseJsonSafe(s);
    const faq = findFAQPageInParsed(parsed);
    if (faq) { foundFAQ = faq; break; }
  }
  if (!foundFAQ) {
    console.log('NO FAQPage JSON-LD FOUND -> FAIL');
    missingFAQJsonLd++;
    fail++;
    continue;
  }

  const mainEntity = normalizeMainEntity(foundFAQ.mainEntity || []);
  // Compare lengths first
  let pageOk = true;
  const diffs = [];

  if (mainEntity.length !== sourceFaqs.length) {
    diffs.push(`COUNT MISMATCH: JSON-LD mainEntity=${mainEntity.length} vs source faqs=${sourceFaqs.length}`);
    pageOk = false;
  }

  // Compare entries by order (exact match)
  const n = Math.max(mainEntity.length, sourceFaqs.length);
  for (let i=0;i<n;i++){
    const src = sourceFaqs[i] || {q:'',a:''};
    const ld = mainEntity[i] || {q:'',a:''};
    if (src.q !== ld.q || src.a !== ld.a) {
      pageOk = false;
      diffs.push(`Q/A mismatch #${i+1}:
  source.q: "${src.q}"
  ld.q:     "${ld.q}"
  source.a: "${src.a}"
  ld.a:     "${ld.a}"`);
    }
    // Also check that the question string appears in visible HTML (verbatim)
    if (src.q && !html.includes(src.q)) {
      pageOk = false;
      diffs.push(`VISIBLE MISSING: question not found verbatim in HTML: "${src.q}"`);
    }
  }

  if (pageOk) {
    pass++;
    console.log('PASS');
  } else {
    fail++;
    mismatchCount++;
    console.log('FAIL');
    console.log('  Detailed diffs:');
    for (const d of diffs) {
      console.log('  - ' + d.split('\n').join('\n    '));
    }
  }
}

console.log('\n------------------------------------------------------------------');
console.log(`Summary: total=${total}  pass=${pass}  fail=${fail}  missingSourceJson=${missingJson}  missingFAQJsonLd=${missingFAQJsonLd}`);
if (fail>0) process.exit(3);
process.exit(0);
NODE

# Run it
export PR_DIR="$PR_DIR"
export CANDIDATE_DIRS_JSON='["ssg-pages","src/content/pages","src/content"]'
node "$TMP_JS"
RC=$?
rm -f "$TMP_JS"
if [ $RC -eq 0 ]; then
  echo
  echo "All prerendered pages PASSED parity check ✔️"
else
  echo
  echo "Some pages FAILED parity check. RC=$RC"
  echo "Inspect printed diffs above, then fix source JSON or re-run injection."
fi
exit $RC