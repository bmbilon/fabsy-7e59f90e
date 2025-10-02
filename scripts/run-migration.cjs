const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ADMIN_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE/SUPABASE_ADMIN_KEY');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('❌ Usage: node run-migration.cjs <migration-file.sql>');
  process.exit(1);
}

const sql = fs.readFileSync(migrationFile, 'utf8');

(async () => {
  try {
    console.log(`📤 Executing migration: ${path.basename(migrationFile)}`);
    
    // Execute SQL via PostgREST using a raw query
    // Note: We'll need to execute this as multiple statements
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (!statement.trim()) continue;
      
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'params=single-object'
        },
        body: JSON.stringify({ sql: statement + ';' })
      });
      
      if (!res.ok) {
        const error = await res.text();
        console.error(`❌ Failed to execute statement:`, statement.substring(0, 100));
        console.error(`Status: ${res.status}`);
        console.error(`Error: ${error}`);
        
        // Try direct SQL via pg connection string if available
        console.log('\n⚠️  PostgREST method failed. Trying psql...');
        process.exit(1);
      }
    }
    
    console.log('✅ Migration executed successfully!');
    
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
})();
