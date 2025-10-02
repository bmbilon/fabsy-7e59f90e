const fs = require('fs');
const path = require('path');

// Get environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gcasbisxfrssonllpqrw.supabase.co';
const SUPABASE_ADMIN_KEY = process.env.SUPABASE_ADMIN_KEY;

if (!SUPABASE_ADMIN_KEY) {
  console.error('❌ SUPABASE_ADMIN_KEY environment variable is required');
  process.exit(1);
}

async function upsertPageToSupabase(pageData) {
  const url = `${SUPABASE_URL}/functions/v1/upsert-page-content`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ADMIN_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pageData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to upsert ${pageData.slug}: ${error.message}`);
  }
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

  console.log(`📤 Seeding ${jsonFiles.length} pages to Supabase...`);
  
  let successful = 0;
  let failed = 0;

  for (const file of jsonFiles) {
    const filePath = path.join(ssgPagesDir, file);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const pageData = JSON.parse(content);
      
      console.log(`  Upserting ${pageData.slug}...`);
      await upsertPageToSupabase(pageData);
      console.log(`  ✅ ${pageData.slug} - OK`);
      successful++;
      
    } catch (error) {
      console.log(`  ❌ ${file} - ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  ✅ Successful: ${successful}`);
  console.log(`  ❌ Failed: ${failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Script failed:', error.message);
  process.exit(1);
});