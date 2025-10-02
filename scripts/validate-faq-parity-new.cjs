/*
 * scripts/validate-faq-parity.js
 * Validates parity between ssg-pages/*.json (faqs + jsonld) and prerendered/<slug>/index.html
 * Exit codes: 0 = OK, 2 = parity issues found, 1 = error
 * Usage:
 *   node scripts/validate-faq-parity.js           # report-only
 *   FIX=1 node scripts/validate-faq-parity.js     # apply safe fixes (writes json & html)
 */
const fs = require('fs');
const path = require('path');

const PAGES_DIR = process.env.PAGES_DIR || 'ssg-pages';
const PRERENDER_DIR = process.env.PRERENDER_DIR || 'prerendered';
const FIX = String(process.env.FIX || '') === '1';

function safeJSONParse(s) {
  try { return JSON.parse(s); } catch(e){ return null; }
}

function canonicalFAQSchemaFromArray(faqs) {
  const mainEntity = faqs.map(q => ({
    "@type": "Question",
    "name": String(q.q || q.question || '').replace(/\r/g,'').trim(),
    "acceptedAnswer": {
      "@type": "Answer",
      "text": String(q.a || q.answer || '').replace(/\r/g,'').trim()
    }
  }));
  return { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": mainEntity };
}

if (!fs.existsSync(PAGES_DIR)) {
  console.error('ERROR: pages dir not found:', PAGES_DIR);
  process.exit(1);
}

const files = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.json'));
let parityIssues = [];
let changedFiles = [];

for (const file of files) {
  const fp = path.join(PAGES_DIR, file);
  let obj;
  try { obj = JSON.parse(fs.readFileSync(fp,'utf8')); } catch(e) {
    console.error('ERR parsing', fp, e.message);
    parityIssues.push({ file: fp, error: 'invalid-json' });
    continue;
  }

  const slug = obj.slug || path.basename(file, '.json');
  const faqs = Array.isArray(obj.faqs) ? obj.faqs.filter(Boolean) : [];

  if (faqs.length === 0) {
    // nothing to do for this page
    continue;
  }

  const canonical = canonicalFAQSchemaFromArray(faqs);
  const canonicalStr = JSON.stringify(canonical);

  // 1) Check jsonld field in page JSON
  if (obj.jsonld && obj.jsonld.trim() === canonicalStr) {
    // OK
  } else {
    parityIssues.push({ file: fp, type: 'jsonld_mismatch', slug, note: 'json file jsonld differs or missing' });
    if (FIX) {
      obj.jsonld = canonicalStr;
      fs.writeFileSync(fp, JSON.stringify(obj, null, 2) + "\n", 'utf8');
      changedFiles.push(fp);
      console.log('FIXED jsonld in', fp);
    }
  }

  // 2) Check prerendered HTML
  const htmlPath = path.join(PRERENDER_DIR, slug, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    parityIssues.push({ file: htmlPath, type: 'missing_prerender', slug, note: 'prerendered HTML missing' });
    continue;
  }

  let html = fs.readFileSync(htmlPath, 'utf8');
  let foundFAQ = false;
  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let newHtml = html.replace(scriptRegex, (m, inner) => {
    const parsed = safeJSONParse(inner.trim());
    if (!parsed) return m; // keep as-is
    const check = (obj) => obj && obj['@type'] === 'FAQPage';
    const hasFAQ = (Array.isArray(parsed) && parsed.some(check)) || check(parsed) || (typeof parsed === 'object' && Object.values(parsed).some(v => check(v)));
    if (hasFAQ) {
      foundFAQ = true;
      return `<script type="application/ld+json" id="faq-jsonld">\n${canonicalStr}\n</script>`;
    }
    return m;
  });

  if (!foundFAQ) {
    // inject before </head> if present else add at top
    if (/<\/head>/i.test(newHtml)) {
      newHtml = newHtml.replace(/<\/head>/i, `<script type="application/ld+json" id="faq-jsonld">\n${canonicalStr}\n</script>\n</head>`);
      parityIssues.push({ file: htmlPath, type: 'injected_html', slug, note: 'no FAQ block found; injection prepared' });
      if (FIX) {
        fs.writeFileSync(htmlPath, newHtml, 'utf8');
        changedFiles.push(htmlPath);
        console.log('FIXED injected FAQ JSON-LD into', htmlPath);
      }
    } else {
      // prepend
      newHtml = `<script type="application/ld+json" id="faq-jsonld">\n${canonicalStr}\n</script>\n` + newHtml;
      parityIssues.push({ file: htmlPath, type: 'injected_html', slug, note: 'no FAQ block found; injected at top' });
      if (FIX) {
        fs.writeFileSync(htmlPath, newHtml, 'utf8');
        changedFiles.push(htmlPath);
        console.log('FIXED injected FAQ JSON-LD into', htmlPath);
      }
    }
  } else {
    if (FIX && newHtml !== html) {
      fs.writeFileSync(htmlPath, newHtml, 'utf8');
      changedFiles.push(htmlPath);
      console.log('FIXED replaced FAQ JSON-LD in', htmlPath);
    }
  }
}

if (parityIssues.length === 0) {
  console.log('PARITY OK: All checked pages passed.');
  if (changedFiles.length) {
    console.log('Files changed (FIX mode):');
    changedFiles.forEach(f => console.log(' -', f));
  }
  process.exit(0);
} else {
  console.error('PARITY ISSUES FOUND:', parityIssues.length);
  parityIssues.forEach(p => {
    console.error(' -', p.file, p.type || '', p.note || '');
  });
  if (FIX) {
    console.error('FIX mode applied. Changed files:');
    changedFiles.forEach(f => console.error(' -', f));
  } else {
    console.error('');
    console.error('Run with FIX=1 to apply safe fixes to json & prerendered HTML.');
  }
  process.exit(2);
}
