const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ADMIN_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

// SQL statements to execute
const statements = [
  "ALTER TABLE public.page_content ADD COLUMN IF NOT EXISTS city TEXT",
  "ALTER TABLE public.page_content ADD COLUMN IF NOT EXISTS violation TEXT",
  "ALTER TABLE public.page_content ADD COLUMN IF NOT EXISTS content TEXT",
  "ALTER TABLE public.page_content ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{}'::jsonb",
  "ALTER TABLE public.page_content ADD COLUMN IF NOT EXISTS local_info TEXT",
  "CREATE INDEX IF NOT EXISTS idx_page_content_city ON public.page_content(city)",
  "CREATE INDEX IF NOT EXISTS idx_page_content_violation ON public.page_content(violation)",
  "CREATE INDEX IF NOT EXISTS idx_page_content_city_violation ON public.page_content(city, violation)"
];

(async () => {
  console.log('🔧 Applying schema changes to page_content table...\n');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const sql of statements) {
    try {
      console.log(`Executing: ${sql.substring(0, 60)}...`);
      
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'params=single-object'
        },
        body: JSON.stringify({ query: sql })
      });
      
      if (res.ok) {
        console.log('  ✅ Success\n');
        successCount++;
      } else {
        const error = await res.text();
        console.log(`  ❌ Failed: ${error}\n`);
        failCount++;
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}\n`);
      failCount++;
    }
  }
  
  console.log(`\n📊 Results: ${successCount} succeeded, ${failCount} failed`);
  
  if (failCount > 0) {
    console.log('\n⚠️  Some operations failed. The RPC method might not be available.');
    console.log('📝 Please run the migration manually using one of these options:\n');
    console.log('   Option 1: Supabase Dashboard SQL Editor');
    const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (projectRef) {
      console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    }
    console.log('\n   Option 2: psql command line (requires database password)');
    console.log('   psql "postgresql://postgres:[PASSWORD]@db.' + projectRef + '.supabase.co:5432/postgres"');
    console.log('\n   Option 3: Copy and paste the SQL from:');
    console.log('   supabase/migrations/20251002122721_add_page_content_columns.sql');
    process.exit(1);
  } else {
    console.log('\n✅ All schema changes applied successfully!');
    console.log('\n🚀 You can now run: node scripts/generate-pages.cjs');
  }
})();
