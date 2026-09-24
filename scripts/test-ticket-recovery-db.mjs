import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
const bin=process.env.TICKET_RECOVERY_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin',dir=mkdtempSync(join(tmpdir(),'fabsy-recovery-test-'));
const run=(cmd,args)=>{const r=spawnSync(join(bin,cmd),args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout;};
const args=['-h',dir,'-p','55449','-d','postgres','-v','ON_ERROR_STOP=1'];
const query=sql=>run('psql',[...args,'-tA','-c',sql]);
const queryAsync=sql=>new Promise((resolve,reject)=>{const p=spawn(join(bin,'psql'),[...args,'-tA','-c',sql]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));});
let started=false;
try{
 run('initdb',['-D',join(dir,'data'),'-A','trust','--no-locale']);
 run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -h '' -p 55449`,'-w','start']);started=true;
 for(const file of ['supabase/tests/ticket-recovery.fixture.sql','supabase/migrations/20260924120000_ticket_recovery.sql','supabase/tests/ticket-recovery.test.sql']){
  run('psql',['-h',dir,'-p','55449','-d','postgres','-v','ON_ERROR_STOP=1','-f',file]);console.log(file+': passed');
 }
 query("insert into ticket_submissions(id) values('00000000-0000-4000-8000-000000000003'); select enqueue_ticket_recovery(); update ticket_recovery_events set status='claimed',claim_id=gen_random_uuid(),claim_expires_at=now()+interval '5 minutes' where source_kind='submission' and stage=2 and channel='email';");
 const result=await Promise.all(['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003'].map(id=>queryAsync(`select begin_ticket_recovery_attempt(id,claim_id,ticket_recovery_snapshot(source_kind,source_id)) from ticket_recovery_events where source_id='${id}' and source_kind='submission' and stage=2 and channel='email'`)));
 if(result.filter(x=>x==='t').length!==1)throw Error('Concurrent duplicate ticket dispatch was not exclusive: '+result);
 console.log('Concurrent duplicate recipient/ticket dispatch: passed');
}finally{if(started)run('pg_ctl',['-D',join(dir,'data'),'-m','fast','-w','stop']);rmSync(dir,{recursive:true,force:true});}
