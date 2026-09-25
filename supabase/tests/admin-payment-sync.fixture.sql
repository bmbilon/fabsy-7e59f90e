create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema analytics_private;
create function auth.role() returns text language sql as $$select coalesce(current_setting('test.role',true),'service_role')$$;
create function public.is_idr_staff() returns boolean language sql as $$select coalesce(current_setting('test.staff',true),'')='true'$$;
create table public.clients(id uuid primary key,first_name text,last_name text);
create table public.ticket_submissions(id uuid primary key,client_id uuid,deleted_at timestamptz,service_type text,case_outcome text,status text,
 representation_paid_at timestamptz,representation_checkout_session_id text,assessment_paid_at timestamptz,ticket_number text);
create table public.idr_checkout_intents(id uuid primary key default gen_random_uuid(),ticket_submission_id uuid,client_id uuid,status text,stripe_checkout_session_id text,checkout_kind text);
create table public.service_orders(id uuid primary key default gen_random_uuid(),ticket_submission_id uuid,client_id uuid,mode text,product text,
 payment_status text,paid_at timestamptz,stripe_session_id text,stripe_payment_intent_id text,applied_at timestamptz,ticket_number text,name text);
create table public.idr_orders(id uuid primary key,paid_at timestamptz,status text);
create table public.ticket_intake_drafts(id uuid primary key,converted_submission_id uuid);
create table public.admin_ticket_case_status(kind text,ticket_id uuid,stage text,version integer not null check(version>0),note text,updated_at timestamptz default now(),updated_by uuid,primary key(kind,ticket_id));
create table analytics_private.paid_payment_purchases(id int);
create table analytics_private.paid_payment_refunds(id int);
