/**
 * Generate JSON-LD structured data from FAQ content in page JSON files
 * This ensures perfect parity between visible FAQs and structured data
 */
import fs from 'fs';
import path from 'path';

function generateFaqJsonLD(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) {
    return null;
  }

  const mainEntity = faqs.map(faq => ({
    "@type": "Question",
    "name": String(faq.q || faq.question || "").trim(),
    "acceptedAnswer": {
      "@type": "Answer", 
      "text": String(faq.a || faq.answer || "").trim()
    }
  })).filter(entity => entity.name && entity.acceptedAnswer.text);

  if (mainEntity.length === 0) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": mainEntity
  };
}

async function main() {
  const pagesDir = path.resolve('./src/content/pages');
  
  if (!fs.existsSync(pagesDir)) {
    console.log('⚠️  src/content/pages directory not found - skipping JSON-LD generation');
    return;
  }

  const jsonFiles = fs.readdirSync(pagesDir)
    .filter(file => file.endsWith('.json') && file !== '.gitkeep');

  if (jsonFiles.length === 0) {
    console.log('⚠️  No page JSON files found - skipping JSON-LD generation');
    return;
  }

  console.log(`🔧 Generating JSON-LD for ${jsonFiles.length} pages...`);
  
  let generated = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of jsonFiles) {
    const filePath = path.join(pagesDir, file);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const pageData = JSON.parse(content);
      
      // Generate JSON-LD from FAQ data
      const jsonld = generateFaqJsonLD(pageData.faqs);
      
      if (!jsonld) {
        console.log(`  ⚠️  ${pageData.slug || file} - no valid FAQs, skipping`);
        skipped++;
        continue;
      }

      // Check if JSON-LD changed
      const currentJsonld = pageData.jsonld ? JSON.parse(pageData.jsonld) : null;
      const jsonldString = JSON.stringify(jsonld);
      
      if (JSON.stringify(currentJsonld) === jsonldString) {
        console.log(`  ✅ ${pageData.slug || file} - JSON-LD already up to date`);
        skipped++;
        continue;
      }

      // Update page with generated JSON-LD
      pageData.jsonld = jsonldString;
      
      fs.writeFileSync(filePath, JSON.stringify(pageData, null, 2) + '\n', 'utf8');
      
      if (currentJsonld) {
        console.log(`  🔄 ${pageData.slug || file} - JSON-LD updated (${jsonld.mainEntity.length} FAQs)`);
        updated++;
      } else {
        console.log(`  ✨ ${pageData.slug || file} - JSON-LD generated (${jsonld.mainEntity.length} FAQs)`);
        generated++;
      }
      
    } catch (error) {
      console.error(`  ❌ ${file} - Error: ${error.message}`);
    }
  }

  console.log(`\n📊 JSON-LD Generation Summary:`);
  console.log(`  ✨ Generated: ${generated}`);
  console.log(`  🔄 Updated: ${updated}`);
  console.log(`  ⚠️  Skipped: ${skipped}`);
  
  if (generated + updated > 0) {
    console.log(`\n✅ JSON-LD generation complete! ${generated + updated} pages now have structured data.`);
  }
}

main().catch(error => {
  console.error('❌ JSON-LD generation failed:', error.message);
  process.exit(1);
});