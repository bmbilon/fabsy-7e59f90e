-- Only the disposable cluster created by run.py may load these inert substitutes.
begin;
create function public.assert_chatwoot_queue_test() returns void language plpgsql as $guard$
begin
  if current_setting('fabsy.queue_test', true) is distinct from 'disposable-local'
    or current_database() <> 'fabsy_chatwoot_queue_test'
    or inet_server_addr() is not null
    or current_setting('listen_addresses') <> ''
    or current_setting('data_directory') !~ '/fabsy-cw-tests-[^/]+/data$' then
    raise exception 'Run fixtures only through the disposable local run.py harness';
  end if;
end;
$guard$;
select public.assert_chatwoot_queue_test();

create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select null::uuid; $$;
create type public.app_role as enum ('admin', 'case_manager');
create function public.has_role(uuid, public.app_role) returns boolean language sql as $$ select false; $$;

-- No background worker exists. Rows describe schedules but cannot execute them.
create schema cron;
create table cron.job (
  jobid bigserial primary key, jobname text unique, schedule text,
  command text, active boolean default true
);
create function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint language plpgsql as $$
declare new_id bigint;
begin
  insert into cron.job(jobname, schedule, command) values(p_name, p_schedule, p_command)
    on conflict(jobname) do update set schedule = excluded.schedule,
      command = excluded.command, active = true
    returning jobid into new_id;
  return new_id;
end;
$$;
create function cron.alter_job(job_id bigint, active boolean) returns void language sql as $$
  update cron.job set active = $2 where jobid = $1;
$$;
create function cron.unschedule(job_id bigint) returns boolean language plpgsql as $$
begin
  delete from cron.job where jobid = job_id;
  return found;
end;
$$;

create schema vault;
create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
create schema net;
create table net.test_calls(id bigserial primary key);
-- This function only checks dummy values and increments a local counter. It has
-- no network client and does not save headers, tokens, or request bodies.
create function net.http_post(
  url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds integer default 5000
) returns bigint language plpgsql as $$
declare result_id bigint;
begin
  assert url = 'https://example.supabase.co/functions/v1/chatwoot-vapi-worker', 'runtime endpoint';
  assert headers->>'Authorization' = 'Bearer ' || repeat('x', 32), 'runtime bearer';
  assert body = '{}'::jsonb, 'empty wake body';
  insert into net.test_calls default values returning id into result_id;
  return result_id;
end;
$$;
commit;
