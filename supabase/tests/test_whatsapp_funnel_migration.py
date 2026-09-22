"""Verify consented WhatsApp events using disposable, socket-only PostgreSQL.
Run from the repository root. No remote database is contacted.
"""
from pathlib import Path
import subprocess, tempfile, shlex
binpath=Path('/opt/homebrew/opt/postgresql@17/bin')
def run(name,args,input=None):
 r=subprocess.run([str(binpath/name),*args],text=True,input=input,capture_output=True)
 if r.returncode: raise RuntimeError(r.stderr or r.stdout)
 return r.stdout
with tempfile.TemporaryDirectory(prefix='fabsy-whatsapp-',dir='/tmp') as folder:
 d=Path(folder);data=d/'data'; run('initdb',['-D',str(data),'-A','trust','--no-locale'])
 run('pg_ctl',['-D',str(data),'-l',str(d/'postgres.log'),'-o',shlex.join(['-h','','-k',folder,'-p','55449']),'-w','start'])
 try:
  args=['-X','-h',folder,'-p','55449','-d','postgres','-v','ON_ERROR_STOP=1']
  run('psql',args,'create role anon; create role authenticated; create role service_role;')
  for migration in ['20260903170000_paid_funnel_measurement.sql','20260906170000_paid_funnel_behavior_diagnostics.sql','20260918180000_paid_funnel_photo_radar.sql','20260922121000_funnel_whatsapp_click.sql']:
   sql=Path('supabase/migrations',migration).read_text()
   # Local PostgreSQL has no pg_cron; scheduling existing retention is unrelated.
   if migration=='20260903170000_paid_funnel_measurement.sql': sql=sql.split('create extension if not exists pg_cron')[0]
   run('psql',args,sql)
  run('psql',args,"""
  do $$ declare sid uuid:=gen_random_uuid(); page text; pos text; begin
    foreach page in array array['rapid_resolution','photo_radar'] loop
      foreach pos in array array['section','footer'] loop
        for i in 1..2 loop
          if public.record_paid_funnel_event(gen_random_uuid(),sid,'whatsapp_click',clock_timestamp(),page,
              p_position=>pos,p_consent_version=>'fabsy-funnel-v1',p_consented_at=>clock_timestamp()) is distinct from true then raise exception 'event rejected'; end if;
        end loop;
      end loop;
    end loop;
    if (select count(*) from analytics_private.paid_funnel_events)<>4 then raise exception 'dedupe/page/position failed'; end if;
    begin
      perform public.record_paid_funnel_event(gen_random_uuid(),sid,'whatsapp_click',clock_timestamp(),'intake',
        p_consent_version=>'fabsy-funnel-v1',p_consented_at=>clock_timestamp());
      raise exception 'accepted private page';
    exception when check_violation then null; end;
    begin
      perform public.record_paid_funnel_event(gen_random_uuid(),sid,'whatsapp_click',clock_timestamp(),'rapid_resolution');
      raise exception 'accepted absent consent';
    exception when others then if sqlerrm <> 'FUNNEL_CONSENT_INVALID' then raise; end if; end;
    if has_function_privilege('anon','public.record_paid_funnel_event(uuid,uuid,text,timestamptz,text,smallint,text,text,text,text,text,text,text,text,text,text,timestamptz)','execute') then raise exception 'public write allowed'; end if;
  end $$;
  """)
  print('WhatsApp SQL passed: actual migrations, page/position deduplication, consent/private-page rejection, RPC permissions.')
 finally: run('pg_ctl',['-D',str(data),'-m','fast','-w','stop'])
