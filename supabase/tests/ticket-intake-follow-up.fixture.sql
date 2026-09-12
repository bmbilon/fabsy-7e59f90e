create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to anon,authenticated,service_role;
create type public.app_role as enum ('admin','case_manager','customer');
create table public.user_roles(user_id uuid,role public.app_role);
insert into public.user_roles values
  ('00000000-0000-4000-8000-000000000001','admin'),
  ('00000000-0000-4000-8000-000000000002','case_manager'),
  ('00000000-0000-4000-8000-000000000003','customer');
-- Load the real staff/deletion migrations after replacing the simplified
-- columns from the abandoned-email fixture with their production definitions.
alter table public.ticket_intake_drafts drop column staff_follow_up_status,drop column deleted_at,
  add column updated_at timestamptz not null default now();
alter table public.ticket_submissions drop column deleted_at;
create table public.disclosure_notification_outbox(submission_id uuid,status text,claim_token uuid,lease_until timestamptz,last_error text);
create table public.ticket_upload_alerts(draft_id uuid,status text,failure_code text,claim_id uuid,claim_expires_at timestamptz);
