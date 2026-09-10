import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const bin = process.env.PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const dir = mkdtempSync(join(tmpdir(), 'fabsy-ticket-deletion-test-'));
const run = (cmd, args) => {
 const r = spawnSync(join(bin, cmd), args, { encoding: 'utf8' });
 if (r.status !== 0) throw new Error(r.stderr || r.stdout || `${cmd} failed`);
 return r.stdout;
};
let started = false;
try {
 run('initdb', ['-D', join(dir,'data'), '-A', 'trust', '--no-locale']);
 run('pg_ctl', ['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -h '' -p 55449`,'-w','start']); started = true;
 for (const file of ['supabase/tests/disclosure-confirmations.fixture.sql','supabase/migrations/20260909150000_disclosure_confirmations.sql','supabase/tests/admin-ticket-deletion.fixture.sql','supabase/migrations/20260909230000_ticket_upload_alerts.sql','supabase/migrations/20260910020000_admin_ticket_deletion.sql','supabase/tests/admin-ticket-deletion.test.sql']) {
   run('psql',['-h',dir,'-p','55449','-d','postgres','-v','ON_ERROR_STOP=1','-f',file]);
   console.log(`${file}: passed`);
 }
} finally {
 if (started) run('pg_ctl',['-D',join(dir,'data'),'-m','fast','-w','stop']);
 rmSync(dir,{recursive:true,force:true});
}
