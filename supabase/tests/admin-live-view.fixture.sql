create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema cron;
create type public.app_role as enum('admin','case_manager','client');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.has_role(id uuid,role public.app_role) returns boolean language sql stable as $$ select id='10000000-0000-4000-8000-000000000001'::uuid and role='admin' $$;
grant usage on schema public,auth to anon,authenticated,service_role;
create table public.ticket_submissions(id uuid primary key,created_at timestamptz,representation_paid_at timestamptz,assessment_paid_at timestamptz);
-- Test scheduling arguments without installing an actual recurring job locally.
create table cron.test_jobs(name text,schedule text,command text);
create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.test_jobs values($1,$2,$3); select 1::bigint $$;
