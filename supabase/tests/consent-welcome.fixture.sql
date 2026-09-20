create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
grant usage on schema public,auth to anon,authenticated,service_role;
create function public.is_idr_staff() returns boolean language sql stable as $$ select auth.uid()='10000000-0000-4000-8000-000000000001'::uuid $$;
create schema storage;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,updated_at timestamptz default now(),metadata jsonb default '{"size":100}',unique(bucket_id,name));
create table clients(id uuid primary key,first_name text,last_name text,email text);
create table ticket_submissions(id uuid primary key,client_id uuid references clients(id),ticket_number text,
  consent_form_path text,ticket_document_path text,source_assessment_id uuid,deleted_at timestamptz,
  service_type text default 'representation',status text default 'awaiting_payment',first_name text,last_name text,email text,
  preferred_locale text default 'en',intake_consent jsonb,representation_paid_at timestamptz,
  representation_checkout_session_id text,representation_payment_intent_id text,
  referral_payment_intent_id text,referral_refunded_at timestamptz,referral_disputed_at timestamptz);
create table representation_consent_invites(id uuid primary key,status text default 'pending',ticket_submission_id uuid,
  client_legal_name text,client_first_name text,client_last_name text,client_email text,ticket_number text,ticket_numbers text[],
  pdf_path text,pdf_sha256 text,signed_at timestamptz,signature_method text,manual_scan_pdf_path text,manual_scan_pdf_sha256 text,
  manual_scan_review_status text,access_revoked_at timestamptz);
create table idr_checkout_intents(id uuid primary key,client_id uuid,ticket_submission_id uuid,
  status text,checkout_kind text,stripe_checkout_session_id text);
create table idr_orders(id uuid primary key,ticket_submission_id uuid,stripe_payment_intent_id text);
create table referral_payment_holds(payment_intent_id text);
create table ticket_checkout_links(code text primary key,checkout_intent_id uuid,submission_id uuid,expires_at timestamptz);
create table ticket_intake_drafts(id uuid primary key,converted_submission_id uuid);
create table abandoned_ticket_emails(id uuid primary key,draft_id uuid);
create function public.get_abandoned_ticket_email_context(p_id uuid,p_claim_id uuid) returns jsonb language sql as $$
  select jsonb_build_object('eligible',true,'reason','original_guard_preserved') $$;
create table portal_activity_events(id uuid primary key default gen_random_uuid(),event_type text,status text default 'pending',
  last_error text,claim_token uuid,lease_until timestamptz,first_attempt_at timestamptz,attempts integer default 0,
  next_attempt_at timestamptz default now(),occurred_at timestamptz default now());
-- Baseline claimant semantics: expired preparation rows and other activity types
-- are retryable; the new wrapper must suppress only marked consent sends.
create function public.claim_portal_activity_events(p_limit integer default 10) returns setof portal_activity_events
language plpgsql security definer as $$ begin
  return query with due as(select id from portal_activity_events where status='pending'
    or (status='processing' and lease_until<now()) order by id limit p_limit for update skip locked)
  update portal_activity_events e set status='processing',claim_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=e.attempts+1
    from due where e.id=due.id returning e.*;
end $$;
-- Historical records exist before installation and must never be backfilled.
insert into clients values('20000000-0000-4000-8000-000000000000','Older','Example','older@example.test');
insert into ticket_submissions(id,client_id,ticket_number,consent_form_path,ticket_document_path) values
 ('20000000-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','E00000000P','historical/consent.pdf','historical/ticket.pdf');
insert into representation_consent_invites(id,status,client_email,ticket_number,pdf_path) values
 ('30000000-0000-4000-8000-000000000000','completed','older@example.test','E00000000P','historical/invite.pdf');
