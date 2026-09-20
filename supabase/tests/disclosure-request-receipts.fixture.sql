-- Extend the isolated existing disclosure fixture for the actual staff/approval migrations.
alter table public.ticket_submissions add column first_name text,add column last_name text,
  add column deleted_at timestamptz,add column ticket_document_path text,add column consent_form_path text,
  add column defense_strategy text,add column intake_mode text,add column intake_review_status text,
  add column intake_consent jsonb,add column referral_refunded_at timestamptz,
  add column referral_disputed_at timestamptz,add column referral_payment_intent_id text;
create table public.ticket_intake_drafts(id uuid primary key,converted_submission_id uuid,deleted_at timestamptz,
  status text default 'converted',expires_at timestamptz default now()-interval '3 days',cleanup_claim_id uuid);
create table public.abandoned_ticket_emails(id uuid);
create table public.referral_payment_holds(payment_intent_id text);
create table public.idr_orders(ticket_submission_id uuid,stripe_payment_intent_id text);

-- A synthetic pre-migration acknowledgement with an already accepted, frozen notice.
insert into public.ticket_submissions(id,client_id,ticket_number,representation_paid_at) values
  ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','H90000001Z',now());
insert into public.disclosure_confirmations(id,source_message_id,sender,ticket_number,confirmed_at,timeframe_text,
  body_excerpt,authentication_result,status,submission_id) values
  ('71000000-0000-4000-8000-000000000001','synthetic-historical','noreply@gov.ab.ca','H90000001Z',
    now()-interval '1 day','Synthetic historical estimate','Synthetic fixture','dkim=pass','matched',
    '70000000-0000-4000-8000-000000000001');
insert into public.disclosure_notification_outbox(id,confirmation_id,submission_id,snapshot,email_payload,status,
  attempts,first_attempt_at,provider_email_id,sent_at) values
  ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '{"recipient":"client@example.test","first_name":"Fixture","ticket_number":"H90000001Z","submission_id":"70000000-0000-4000-8000-000000000001"}',
    '{"subject":"Original historical notice","html":"Frozen original"}','sent',1,now()-interval '1 day',
    'synthetic-existing-provider',now()-interval '1 day');
