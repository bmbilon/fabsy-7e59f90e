create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$$;
create type public.app_role as enum ('admin','case_manager','customer');
create table public.test_roles(user_id uuid, role public.app_role);
create function public.has_role(p_user uuid, p_role public.app_role)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select exists(select 1 from public.test_roles where user_id=p_user and role=p_role);
$$;
create function public.is_idr_staff() returns boolean language sql stable security definer as $$
  select public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'case_manager'::public.app_role);
$$;
insert into public.test_roles values
  ('00000000-0000-4000-8000-000000000001','admin'),
  ('00000000-0000-4000-8000-000000000002','case_manager'),
  ('00000000-0000-4000-8000-000000000003','customer');
-- The test cluster has no provider/network extensions. Record schedule intent
-- with a local stub, while applying both real migrations and their assertions.
create schema cron;
create table cron.job(jobid bigint generated always as identity primary key, jobname text unique,
  schedule text, command text, active boolean default true);
create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint
language sql as $$
  insert into cron.job(jobname,schedule,command) values(p_name,p_schedule,p_command)
  on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command
  returning jobid;
$$;
create function cron.unschedule(p_id bigint) returns boolean language plpgsql as $$
begin delete from cron.job where jobid=p_id; return found; end $$;
create function cron.alter_job(p_id bigint, active boolean) returns void language sql as $$
  update cron.job set active=$2 where jobid=p_id;
$$;
