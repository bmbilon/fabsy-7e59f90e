import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const bin=process.env.ABANDONED_TICKET_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const dir=mkdtempSync(join(tmpdir(),'fabsy-abandoned-email-test-'));
const run=(cmd,args)=>{
  const result=spawnSync(join(bin,cmd),args,{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr||result.stdout||`${cmd} failed`);
  return result.stdout;
};
const args=['-h',dir,'-p','55448','-d','postgres','-v','ON_ERROR_STOP=1'];
const queryAsync=(sql)=>new Promise((resolve,reject)=>{
  const proc=spawn(join(bin,'psql'),[...args,'-tA','-c',sql]);let stdout='',stderr='';
  proc.stdout.on('data',data=>stdout+=data);proc.stderr.on('data',data=>stderr+=data);
  proc.on('error',reject);proc.on('close',code=>code===0?resolve(stdout.trim()):reject(new Error(stderr)));
});
let started=false;
try{
  run('initdb',['-D',join(dir,'data'),'-A','trust','--no-locale']);
  run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -h '' -p 55448`,'-w','start']);started=true;
  const source=readFileSync('supabase/migrations/20260903190000_ticket_intake_object_deletion_queue.sql','utf8');
  const confirm=source.slice(source.indexOf('create or replace function public.confirm_ticket_intake_draft_upload('),source.indexOf('create or replace function public.claim_ticket_intake_draft_object_deletions('));
  if(!confirm.includes('grant execute on function public.confirm_ticket_intake_draft_upload'))throw new Error('Existing upload RPC missing');
  writeFileSync(join(dir,'confirm.sql'),confirm);
  for(const file of ['supabase/tests/abandoned-ticket-emails.fixture.sql',join(dir,'confirm.sql'),'supabase/migrations/20260911193000_abandoned_ticket_emails.sql','supabase/tests/abandoned-ticket-emails.test.sql']){
    run('psql',[...args,'-f',file]);console.log(`${file.endsWith('confirm.sql')?'Existing upload confirmation RPC':file}: passed`);
  }
  run('psql',[...args,'-c',"update public.abandoned_ticket_email_settings set enabled=true,activated_at=now()-interval '1 hour'; insert into public.ticket_intake_drafts(ticket_uploaded_at) values(now()-interval '31 minutes');"]);
  const results=await Promise.all([queryAsync('select id from public.claim_abandoned_ticket_emails(1)'),queryAsync('select id from public.claim_abandoned_ticket_emails(1)')]);
  if(results.filter(Boolean).length!==1)throw new Error('Concurrent workers did not claim exactly once');
  console.log('Concurrent claim race: passed');
}finally{
  if(started)run('pg_ctl',['-D',join(dir,'data'),'-m','fast','-w','stop']);
  rmSync(dir,{recursive:true,force:true});
}
