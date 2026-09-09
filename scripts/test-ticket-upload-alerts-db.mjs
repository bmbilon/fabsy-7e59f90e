import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const bin = process.env.TICKET_UPLOAD_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const dir = mkdtempSync(join(tmpdir(), 'fabsy-upload-alert-test-'));
const run = (cmd, args) => {
 const r = spawnSync(join(bin, cmd), args, { encoding: 'utf8' });
 if(r.status !== 0) throw new Error(r.stderr || r.stdout || `${cmd} failed`);
 return r.stdout;
};
let started=false;
try {
 run('initdb',['-D',join(dir,'data'),'-A','trust','--no-locale']);
 run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -h '' -p 55447`,'-w','start']);started=true;
 const source=readFileSync('supabase/migrations/20260903190000_ticket_intake_object_deletion_queue.sql','utf8');
 const confirm=source.slice(source.indexOf('create or replace function public.confirm_ticket_intake_draft_upload('),source.indexOf('create or replace function public.claim_ticket_intake_draft_object_deletions('));
 if(!confirm.includes('grant execute on function public.confirm_ticket_intake_draft_upload'))throw new Error('Actual upload confirmation function could not be extracted');
 writeFileSync(join(dir,'confirm.sql'),confirm);
 const args=['-h',dir,'-p','55447','-d','postgres','-v','ON_ERROR_STOP=1'];
 for(const file of ['supabase/tests/ticket-upload-alerts.fixture.sql',join(dir,'confirm.sql'),'supabase/migrations/20260909230000_ticket_upload_alerts.sql','supabase/tests/ticket-upload-alerts.test.sql']) {
  run('psql',[...args,'-f',file]);console.log(`${file.endsWith('confirm.sql')?'Existing upload confirmation RPC':file}: passed`);
 }
} finally {
 if(started)run('pg_ctl',['-D',join(dir,'data'),'-m','fast','-w','stop']);
 rmSync(dir,{recursive:true,force:true});
}
