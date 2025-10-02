import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gcasbisxfrssonllpqrw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function updatePageJsonLD(slug, jsonldData) {
  console.log(`  Updating ${slug}...`);
  
  const { data, error } = await supabase
    .from('page_content')
    .update({ jsonld: jsonldData })
    .eq('slug', slug)
    .select();

  if (error) {
    throw new Error(`Failed to update ${slug}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(`No rows updated for ${slug} - page might not exist in database`);
  }

  return data[0];
}

async function main() {
  const ssgPagesDir = './ssg-pages';
  
  if (!fs.existsSync(ssgPagesDir)) {
    console.error('❌ ssg-pages directory not found');
    process.exit(1);
  }

  const jsonFiles = fs.readdirSync(ssgPagesDir)
    .filter(file => file.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.log('⚠️  No JSON files found in ssg-pages/');
    process.exit(0);
  }

  console.log(`🔄 Updating JSON-LD for ${jsonFiles.length} pages in database...`);
  
  let successful = 0;
  let failed = 0;

  for (const file of jsonFiles) {
    const filePath = path.join(ssgPagesDir, file);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const pageData = JSON.parse(content);
      
      if (!pageData.jsonld) {
        console.log(`  ⚠️  ${pageData.slug} - no jsonld field, skipping`);
        continue;
      }

      await updatePageJsonLD(pageData.slug, pageData.jsonld);
      console.log(`  ✅ ${pageData.slug} - JSON-LD updated`);
      successful++;
      
    } catch (error) {
      console.log(`  ❌ ${file} - ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  ✅ Updated: ${successful}`);
  console.log(`  ❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log(`\n⚠️  Some updates failed. You may need to check if those pages exist in the database.`);
  }
  
  if (successful > 0) {
    console.log(`\n✅ Success! Run 'node scripts/sync-pages-from-db.js' to pull the updated data into src/content/pages/`);
  }
}

main().catch(error => {
  console.error('❌ Script failed:', error.message);
  process.exit(1);
});