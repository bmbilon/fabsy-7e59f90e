const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ADMIN_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const sqlFile = process.argv[2] || 'supabase/migrations/20251002122721_add_page_content_columns.sql';
const sql = fs.readFileSync(sqlFile, 'utf8');

(async () => {
  console.log(`🔧 Executing SQL from: ${sqlFile}\n`);
  
  // Extract project ref from URL
  const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) {
    console.error('❌ Could not extract project ref from SUPABASE_URL');
    process.exit(1);
  }
  
  const projectRef = match[1];
  
  try {
    // Use Supabase Management API to execute SQL
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
      }
    );
    
    if (res.ok) {
      const data = await res.json();
      console.log('✅ SQL executed successfully!');
      if (data) console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      const error = await res.text();
      console.error(`❌ Failed to execute SQL (${res.status}):`, error);
      console.log('\n📝 Alternative: Copy the SQL and run it in Supabase Dashboard > SQL Editor');
      console.log(`   Dashboard: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.log('\n📝 Alternative: Copy the SQL and run it in Supabase Dashboard > SQL Editor');
    console.log(`   Dashboard: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    process.exit(1);
  }
})();
