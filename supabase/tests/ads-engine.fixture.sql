create role anon; create role authenticated; create role service_role;
create schema auth;create schema vault;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean);
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.has_role(p_id uuid,p_role text) returns boolean language sql stable as $$ select p_id='11111111-1111-4111-8111-111111111111'::uuid and p_role='admin' $$;
create table public.ticket_submissions(id uuid primary key);
create table public.portal_push_subscriptions(id uuid primary key,user_id uuid,active boolean);
create table public.portal_push_outbox(subscription_id uuid,job_id uuid,dedupe_key text,unique(subscription_id,dedupe_key));
create table vault.secrets(name text);
grant usage on schema public,auth to authenticated,service_role;
insert into auth.users values('11111111-1111-4111-8111-111111111111');
insert into ticket_submissions values('22222222-2222-4222-8222-222222222222');

create table public.ticket_intake_drafts(id uuid primary key);
