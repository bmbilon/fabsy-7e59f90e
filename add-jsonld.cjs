const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node add-jsonld.js <json-files>');
  process.exit(1);
}

const patched = [];
let alreadyHadJsonld = 0;
let noFaqs = 0;

for (const f of files) {
  try {
    const raw = fs.readFileSync(f, 'utf8');
    const obj = JSON.parse(raw);
    
    if (obj.jsonld) {
      console.log(`✅ ${f} already has jsonld - skipping`);
      alreadyHadJsonld++;
      continue;
    }
    
    if (!Array.isArray(obj.faqs) || obj.faqs.length === 0) {
      console.log(`⚠️  ${f} has no faqs array - skipping`);
      noFaqs++;
      continue;
    }
    
    // Build mainEntity from faqs
    const mainEntity = obj.faqs.map(q => ({
      "@type": "Question",
      "name": String(q.q || q.question || "").trim(),
      "acceptedAnswer": {
        "@type": "Answer",
        "text": String(q.a || q.answer || "").trim()
      }
    })).filter(e => e.name && e.acceptedAnswer.text);
    
    if (mainEntity.length === 0) {
      console.log(`⚠️  ${f} has faqs but no valid Q&A pairs - skipping`);
      continue;
    }
    
    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": mainEntity
    };
    
    // Store as JSON string to keep file portable
    obj.jsonld = JSON.stringify(schema);
    
    fs.writeFileSync(f, JSON.stringify(obj, null, 2) + "\n", "utf8");
    console.log(`✅ ${f} - added JSON-LD with ${mainEntity.length} FAQ(s)`);
    patched.push(f);
    
  } catch (err) {
    console.error(`❌ Error processing ${f}:`, err.message);
  }
}

console.log(`\nSummary:`);
console.log(`  Files patched: ${patched.length}`);
console.log(`  Already had JSON-LD: ${alreadyHadJsonld}`);
console.log(`  No FAQs: ${noFaqs}`);

if (patched.length === 0) {
  console.log('\nNo files needed patching.');
  process.exit(0);
}

console.log(`\nPatched files:`);
patched.forEach(f => console.log(`  - ${f}`));