create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
grant usage on schema public,auth to anon,authenticated,service_role;
create table public.clients(id uuid primary key,first_name text,last_name text,drivers_license text,date_of_birth text);
create table public.ticket_submissions(id uuid primary key,client_id uuid references public.clients(id),ticket_number text,
  first_name text,last_name text,service_type text default 'representation',status text default 'pending',case_outcome text,
  representation_paid_at timestamptz,ticket_document_path text,consent_form_path text,defense_strategy text,
  intake_mode text,intake_review_status text,intake_consent jsonb,referral_refunded_at timestamptz,
  referral_disputed_at timestamptz,referral_payment_intent_id text);
create table public.idr_checkout_intents(ticket_submission_id uuid,client_id uuid,status text,checkout_kind text);
create table public.referral_payment_holds(payment_intent_id text);
create table public.idr_orders(ticket_submission_id uuid,stripe_payment_intent_id text);
create table public.disclosure_confirmations(submission_id uuid,ticket_number text);
insert into public.clients values('20000000-0000-4000-8000-000000000001','Fixture','Client','test-private','2000-01-01');
insert into public.ticket_submissions(id,client_id,ticket_number,first_name,last_name,representation_paid_at,
  ticket_document_path,consent_form_path,intake_mode,intake_review_status,intake_consent)
values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','T12345678Z','Fixture','Client',now(),
  'fixture/ticket.pdf','fixture/consent.pdf','photo_only','ready','{"version":"photo-upload-consent-v3","accepted":true,"pleadNotGuilty":true}');
