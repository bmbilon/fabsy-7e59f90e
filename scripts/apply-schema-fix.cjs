const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ADMIN_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE/SUPABASE_ADMIN_KEY');
  process.exit(1);
}

const columns = [
  { name: 'city', type: 'TEXT' },
  { name: 'violation', type: 'TEXT' },
  { name: 'content', type: 'TEXT' },
  { name: 'stats', type: 'JSONB', default: "'{}'::jsonb" },
  { name: 'local_info', type: 'TEXT' }
];

(async () => {
  console.log('🔧 Applying schema fixes to page_content table...\n');
  
  for (const col of columns) {
    try {
      // First, check if column exists by trying to query it
      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/page_content?select=${col.name}&limit=0`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        }
      );
      
      if (checkRes.ok) {
        console.log(`✓ Column '${col.name}' already exists`);
        continue;
      }
      
      // Column doesn't exist, need to add it
      // We'll use a workaround: create a test record with the column
      console.log(`➕ Adding column '${col.name}'...`);
      
      // This is a limitation - we can't ALTER TABLE via REST API directly
      console.log(`⚠️  Cannot add column '${col.name}' via REST API`);
      console.log(`   Please run the migration manually or use psql/Supabase dashboard`);
      
    } catch (e) {
      console.error(`❌ Error checking column '${col.name}':`, e.message);
    }
  }
  
  console.log('\n📝 To fix this issue, you need to run the migration using one of these methods:');
  console.log('   1. Supabase Dashboard SQL Editor');
  console.log('   2. psql command line');
  console.log('   3. supabase db push (requires supabase link)');
  console.log('\nMigration file: supabase/migrations/20251002122721_add_page_content_columns.sql');
  
})();
