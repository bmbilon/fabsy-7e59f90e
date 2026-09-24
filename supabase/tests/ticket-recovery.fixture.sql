create role anon; create role authenticated; create role service_role bypassrls;
create schema extensions; create extension pgcrypto with schema extensions;
create schema storage; create table storage.objects(bucket_id text,name text);
create function public.is_idr_staff() returns boolean language sql as $$select false$$;
create table ticket_submissions(id uuid primary key,created_at timestamptz default now()-interval '4 days',deleted_at timestamptz,
  email text default 'customer@example.com',phone text default '4035550112',sms_opt_in boolean default true,
  ticket_number text default 'B12345678C',first_name text default 'Test',service_type text default 'representation',
  status text default 'awaiting_payment',intake_mode text default 'photo_only',intake_review_status text default 'ready',
  ticket_document_path text default 'ticket.pdf',consent_form_path text default 'consent.pdf',representation_paid_at timestamptz,
  representation_checkout_session_id text,case_outcome text);
create table ticket_intake_drafts(id uuid primary key,converted_submission_id uuid,created_at timestamptz default now(),
  ticket_uploaded_at timestamptz default now()-interval '4 days',deleted_at timestamptz,status text default 'active',
  expires_at timestamptz default now()+interval '30 days',staff_follow_up_status text default 'open',pending_ticket_document_path text,
  contact_permission boolean default true,contact_permission_recorded_at timestamptz default now(),draft_data jsonb default '{"ticketNumber":"B12345678C","smsOptIn":true}',
  email text default 'customer@example.com',phone text default '4035550112',ticket_document_path text default 'ticket.pdf');
create table idr_checkout_intents(id uuid primary key default gen_random_uuid(),ticket_submission_id uuid,checkout_kind text default 'ticket_only',status text default 'open',stripe_checkout_session_id text);
create table representation_consent_invites(ticket_submission_id uuid,signed_at timestamptz,revoked_at timestamptz,pdf_path text);
create table service_orders(email text,ticket_number text,product text default 'rapid_resolution',ticket_submission_id uuid,payment_status text,consent_form_path text,stripe_session_id text);
create table abandoned_ticket_emails(draft_id uuid,status text,sent_at timestamptz,claim_expires_at timestamptz);
create table abandoned_ticket_email_settings(singleton boolean,enabled boolean); insert into abandoned_ticket_email_settings values(true,true);
insert into storage.objects values('assessment-tickets','ticket.pdf');
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception '%',message; end if; end $$;
