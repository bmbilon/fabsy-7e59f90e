/**
 * scripts/validate-faq-parity.js
 */
const fs = require('fs');
const path = require('path');
const PAGES_DIR = process.env.PAGES_DIR || 'ssg-pages';
function safeParseJsonLd(jsonldStr) {
  try { return JSON.parse(jsonldStr); } catch(e){ try { return JSON.parse(jsonldStr.trim()); }catch(e2){ return null; } }
}
function flattenSchemas(obj){ if(!obj) return []; if(Array.isArray(obj)) return obj; return [obj]; }
let failed = false;
const files = fs.existsSync(PAGES_DIR) ? fs.readdirSync(PAGES_DIR).filter(f=>f.endsWith('.json')) : [];
if(files.length===0){ console.log(`No files in ${PAGES_DIR} — skipping.`); process.exit(0); }
for(const f of files){
  const full=path.join(PAGES_DIR,f);
  try{
    const raw=fs.readFileSync(full,'utf8');
    const page=JSON.parse(raw);
    const faqs=Array.isArray(page.faqs)?page.faqs:[];
    if(faqs.length===0) continue;
    if(!page.jsonld || typeof page.jsonld!=='string'){ console.error(`[ERROR] ${f}: missing jsonld field (has ${faqs.length} faq(s))`); failed=true; continue; }
    const parsed=safeParseJsonLd(page.jsonld);
    if(!parsed){ console.error(`[ERROR] ${f}: jsonld field not valid JSON`); failed=true; continue; }
    const schemas=flattenSchemas(parsed);
    let faqSchema=null;
    for(const s of schemas){ if(s && s['@type']==='FAQPage'){ faqSchema=s; break; } }
    if(!faqSchema){ console.error(`[ERROR] ${f}: jsonld does not contain a FAQPage schema`); failed=true; continue; }
    const mainEntity=Array.isArray(faqSchema.mainEntity)?faqSchema.mainEntity:[];
    if(mainEntity.length!==faqs.length){ console.error(`[ERROR] ${f}: count mismatch faqs.length=${faqs.length} vs jsonld.mainEntity.length=${mainEntity.length}`); failed=true; }
    for(let i=0;i<Math.min(mainEntity.length, faqs.length); i++){
      const qJson=String(mainEntity[i].name||'').trim();
      const qPage=String(faqs[i].q||faqs[i].question||'').trim();
      if(qJson!==qPage){ console.error(`[ERROR] ${f}: question mismatch index ${i}:\n  jsonld: "${qJson}"\n  page:    "${qPage}"\n`); failed=true; }
      const aJson=String((mainEntity[i].acceptedAnswer && mainEntity[i].acceptedAnswer.text) || '').trim();
      const aPage=String(faqs[i].a||faqs[i].answer||'').trim();
      if(aJson!==aPage){ console.error(`[ERROR] ${f}: answer mismatch index ${i}:\n  jsonld.answer: "${aJson}"\n  page.answer:    "${aPage}"\n`); failed=true; }
    }
    if(!failed) console.log(`[OK] ${f} — parity verified (${faqs.length} FAQ(s))`);
  }catch(err){ console.error(`[ERROR] ${full}: ${err && err.message}`); failed=true; }
}
if(failed){ console.error('FAQ parity validation FAILED'); process.exit(2); } else { console.log('FAQ parity validation PASSED'); process.exit(0); }
