/**
 * Generate AEO-optimized city pages for Alberta cities
 * Calls the generate-city-package edge function and saves output to ./ssg-pages/
 */
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://gcasbisxfrssonllpqrw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KEo-G1wij9RC_IDDzblisw_VISRvwrX';

const cities = ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'Medicine Hat'];
const targetKeywordTemplate = 'fight speeding ticket {city}';

async function generateCityPages() {
  console.log('🚀 Generating AEO-optimized city pages...');
  
  const outputDir = path.resolve('./ssg-pages');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✓ Created directory: ${outputDir}`);
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-city-package`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        cities,
        targetKeywordTemplate
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.pages || !Array.isArray(data.pages)) {
      throw new Error('Invalid response format: missing pages array');
    }

    console.log(`✓ Generated content for ${data.pages.length} cities`);

    // Save each city page as a separate JSON file
    data.pages.forEach((page) => {
      const filename = `${page.slug}.json`;
      const filepath = path.join(outputDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(page, null, 2), 'utf8');
      console.log(`  ✓ Saved: ${filename}`);
      console.log(`     - Meta title: ${page.meta_title} (${page.validations?.meta_title_length || page.meta_title.length} chars)`);
      console.log(`     - Meta desc: ${page.validations?.meta_description_length || page.meta_description.length} chars`);
      console.log(`     - FAQs: ${page.faqs?.length || 0}`);
      console.log(`     - Social posts: ${page.social?.length || 0}`);
      console.log(`     - Validation: ${page.validations?.pass ? '✓ PASS' : '✗ FAIL'}`);
    });

    console.log('\n✅ All city pages generated successfully!');
    console.log(`📁 Output directory: ${outputDir}`);

  } catch (error) {
    console.error('❌ Error generating city pages:', error.message);
    process.exit(1);
  }
}

generateCityPages();
