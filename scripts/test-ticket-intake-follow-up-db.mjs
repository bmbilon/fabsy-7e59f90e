import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn,spawnSync } from 'node:child_process';
const bin=process.env.ABANDONED_TICKET_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const dir=mkdtempSync(join(tmpdir(),'fabsy-follow-up-test-'));
const run=(cmd,args)=>{const r=spawnSync(join(bin,cmd),args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout;};
const args=['-h',dir,'-p','55449','-d','postgres','-v','ON_ERROR_STOP=1'];
const queryAsync=(sql)=>new Promise((resolve,reject)=>{
  const proc=spawn(join(bin,'psql'),[...args,'-tA','-c',sql]);let stdout='',stderr='';
  proc.stdout.on('data',data=>stdout+=data);proc.stderr.on('data',data=>stderr+=data);
  proc.on('error',reject);proc.on('close',code=>resolve({code,stdout:stdout.trim(),stderr}));
});
const slice=(file,start,end)=>{const s=readFileSync(file,'utf8');const a=s.indexOf(start),b=s.indexOf(end,a);if(a<0||b<0)throw new Error(`Production SQL excerpt missing: ${start}`);return s.slice(a,b);};
let started=false;
try{
  run('initdb',['-D',join(dir,'data'),'-A','trust','--no-locale']);
  run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -h '' -p 55449`,'-w','start']);started=true;
  const base='supabase/migrations/20250930233722_86dfb5ff-6837-4fa4-a0b4-09308b097b2a.sql';
  const helpers=slice(base,'CREATE OR REPLACE FUNCTION public.has_role(','-- Create ticket_submissions table')+
    slice(base,'CREATE OR REPLACE FUNCTION public.update_updated_at_column()','-- Create trigger for automatic timestamp updates')+
    slice('supabase/migrations/20260801120000_insurance_damage_report.sql','create or replace function public.is_idr_staff()','create or replace function public.idr_staff_role()');
  writeFileSync(join(dir,'helpers.sql'),helpers);
  writeFileSync(join(dir,'deletion.sql'),slice('supabase/migrations/20260910020000_admin_ticket_deletion.sql','-- Recoverable staff deletion','create or replace function public.match_disclosure_confirmation(')+'\ncommit;\n');
  writeFileSync(join(dir,'draft-access.sql'),slice('supabase/migrations/20260903120000_ticket_intake_drafts.sql','create trigger update_ticket_intake_drafts_updated_at','-- The edge function sends only this keyed HMAC.'));
  for(const file of ['supabase/tests/abandoned-ticket-emails.fixture.sql','supabase/tests/ticket-intake-follow-up.fixture.sql',join(dir,'helpers.sql'),
    'supabase/migrations/20260903194000_ticket_intake_staff_follow_up.sql','supabase/migrations/20260910190000_contact_first_ticket_intake.sql',
    join(dir,'deletion.sql'),join(dir,'draft-access.sql'),'supabase/migrations/20260911193000_abandoned_ticket_emails.sql',
    'supabase/tests/ticket-intake-follow-up.seed.sql','supabase/migrations/20260911230000_ticket_intake_follow_up_channels.sql','supabase/tests/ticket-intake-follow-up.test.sql']){
    run('psql',[...args,'-f',file]);console.log(`${file.startsWith(dir)?'Production '+file.split('/').at(-1):file}: passed`);
  }
  const staff="set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false); ";
  run('psql',[...args,'-c',"insert into public.ticket_intake_drafts(id) values('00000000-0000-4000-8000-000000000030')"]);
  const concurrent=await Promise.all(['email','phone'].map(channel=>queryAsync(staff+`select * from public.record_ticket_intake_follow_up('00000000-0000-4000-8000-000000000030','open','${channel}')`)));
  if(concurrent.filter(result=>result.code===0).length!==1 || !concurrent.some(result=>result.stderr.includes('TICKET_INTAKE_FOLLOW_UP_CONFLICT')))throw new Error('Concurrent stale staff actions were not serialized');
  console.log('Concurrent manual action conflict: passed');
  run('psql',[...args,'-c',"insert into public.ticket_intake_drafts(id) values('00000000-0000-4000-8000-000000000032'); insert into public.abandoned_ticket_emails(draft_id,uploaded_at,due_at,next_attempt_at) values('00000000-0000-4000-8000-000000000032',now()-interval '1 hour',now()-interval '30 minutes',now())"]);
  const independent=await Promise.all([
    queryAsync(staff+"select * from public.record_ticket_intake_follow_up('00000000-0000-4000-8000-000000000032','open','phone')"),
    queryAsync("set role service_role; update public.abandoned_ticket_emails set status='sent',sent_at=clock_timestamp(),provider_email_id='concurrent-auto' where draft_id='00000000-0000-4000-8000-000000000032'")
  ]);
  if(independent.some(result=>result.code!==0))throw new Error('Concurrent receipt and phone recording failed');
  const preserved=run('psql',[...args,'-tA','-c',"select follow_up_email_sent_at is not null and follow_up_email_sent_by is null and follow_up_phone_called_at is not null and follow_up_phone_called_by='00000000-0000-4000-8000-000000000001' and staff_follow_up_status='contacted' from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000032'"]).trim();
  if(preserved!=='t')throw new Error('Concurrent receipt and phone history was overwritten');
  console.log('Concurrent automatic email and manual phone: passed');
  // Hold a row until it expires, proving availability is checked after the lock.
  run('psql',[...args,'-c',"insert into public.ticket_intake_drafts(id,expires_at) values('00000000-0000-4000-8000-000000000031',clock_timestamp()+interval '1 second')"]);
  const lock=queryAsync("begin; select id from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000031' for update; select pg_sleep(1.5); commit;");
  await new Promise(resolve=>setTimeout(resolve,100));
  const afterWait=await queryAsync(staff+"select * from public.record_ticket_intake_follow_up('00000000-0000-4000-8000-000000000031','open','phone')");
  await lock;
  if(afterWait.code===0||!afterWait.stderr.includes('TICKET_INTAKE_FOLLOW_UP_NOT_AVAILABLE'))throw new Error('Expiry crossed while waiting for lock was ignored');
  console.log('Expiry while awaiting row lock: passed');
}finally{
  if(started)run('pg_ctl',['-D',join(dir,'data'),'-m','fast','-w','stop']);
  rmSync(dir,{recursive:true,force:true});
}
