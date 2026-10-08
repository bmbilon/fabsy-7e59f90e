import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
const bin=process.env.DISCLOSURE_TEST_PG_BIN||'/opt/homebrew/opt/postgresql@17/bin';
const dir=mkdtempSync(join(tmpdir(),'fabsy-initial-disclosure-pg-'));
const run=(cmd,args)=>{const result=spawnSync(join(bin,cmd),args,{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||result.stdout||cmd+' failed');return result.stdout;};
let started=false;
try{run('initdb',['-D',join(dir,'data'),'-A','trust','--no-locale']);run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -h '' -p 55451`,'-w','start']);started=true;
 const args=['-h',dir,'-p','55451','-d','postgres','-v','ON_ERROR_STOP=1'];
 for(const file of ['supabase/tests/initial-disclosure.fixture.sql','supabase/migrations/20261008220000_automatic_initial_disclosure.sql','supabase/migrations/20261008233000_case_portal_lookup.sql','supabase/migrations/20261008234500_required_portal_lookup.sql','supabase/tests/initial-disclosure.test.sql','supabase/tests/case-portal-lookup.test.sql','supabase/tests/required-portal-lookup.test.sql']){const output=run('psql',[...args,'-f',file]);console.log(file+': passed');if(file.endsWith('.test.sql'))console.log(output.split('\n').filter(line=>line.includes('tests passed')).join('\n'));}
}finally{if(started)run('pg_ctl',['-D',join(dir,'data'),'-m','fast','-w','stop']);rmSync(dir,{recursive:true,force:true});}
