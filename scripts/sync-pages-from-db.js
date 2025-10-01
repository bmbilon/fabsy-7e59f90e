/**
 * Prebuild script: Fetch published pages from Supabase and write to src/content/pages/*.json
 * Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gcasbisxfrssonllpqrw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY not set - skipping page sync');
  console.warn('   Pages will be loaded at runtime instead of build time');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  try {
    const outDir = path.resolve('./src/content/pages');
    fs.mkdirSync(outDir, { recursive: true });

    console.log('📥 Fetching published pages from Supabase...');
    const { data, error } = await supabase
      .from('page_content')
      .select('*');

    if (error) throw error;

    if (!data || data.length === 0) {
      console.warn('⚠️  No pages found in database');
      process.exit(0);
    }

    // Clear existing JSON files (except .gitkeep)
    const existingFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.json'));
    existingFiles.forEach(f => fs.unlinkSync(path.join(outDir, f)));

    for (const row of data) {
      const slug = row.slug;
      const outPath = path.join(outDir, `${slug}.json`);
      
      const pageObj = {
        slug: row.slug,
        meta_title: row.meta_title || row.h1 || '',
        meta_description: row.meta_description || '',
        h1: row.h1 || '',
        hook: row.hook || '',
        bullets: Array.isArray(row.bullets) ? row.bullets : [],
        what: row.what || '',
        how: row.how || '',
        next: row.next || '',
        faqs: Array.isArray(row.faqs) ? row.faqs : [],
        video: row.video || null
      };
      
      fs.writeFileSync(outPath, JSON.stringify(pageObj, null, 2), 'utf8');
      console.log('✓ Wrote', slug + '.json');
    }

    console.log(`\n✅ Sync complete: ${data.length} page(s) synced to src/content/pages/`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Sync error:', err.message);
    console.error(err);
    process.exit(1);
  }
})();
