create role service_role;
alter table public.ticket_intake_drafts
 add column pending_ticket_document_path text,
 add column cleanup_claim_id uuid,
 add column cleanup_claimed_at timestamptz,
 add column cleanup_claim_expires_at timestamptz,
 add column cleanup_attempt_count integer not null default 0;

alter table public.ticket_intake_drafts add column contact_permission boolean default true, add column alberta_confirmed boolean default true;
alter table public.ticket_submissions add column representation_checkout_session_id text, add column violation text;
create table public.abandoned_ticket_email_settings(singleton boolean, enabled boolean);
insert into public.abandoned_ticket_email_settings values(true,true);
create table public.abandoned_ticket_emails(id uuid primary key,draft_id uuid,claim_id uuid,status text,claim_expires_at timestamptz,due_at timestamptz,email_payload jsonb,first_attempt_at timestamptz,uploaded_at timestamptz,delivery_key text);
create table public.idr_checkout_intents(ticket_submission_id uuid,checkout_kind text,status text,updated_at timestamptz,stripe_checkout_session_id text);
