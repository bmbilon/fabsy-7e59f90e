create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
grant usage on schema public,auth to anon,authenticated,service_role;
create function public.is_idr_staff() returns boolean language sql stable as $$ select auth.uid()='10000000-0000-4000-8000-000000000001'::uuid $$;
create table clients(id uuid primary key,first_name text,last_name text);
create table ticket_submissions(id uuid primary key,client_id uuid,ticket_number text,deleted_at timestamptz,
  service_type text default 'representation',representation_checkout_session_id text,representation_payment_intent_id text,
  assessment_checkout_session_id text,assessment_payment_intent_id text);
create table idr_checkout_intents(id uuid primary key,client_id uuid,ticket_submission_id uuid,
  status text,checkout_kind text,stripe_checkout_session_id text,type text);
create table idr_orders(id uuid primary key,client_id uuid,ticket_submission_id uuid,type text,
  stripe_checkout_session_id text,stripe_payment_intent_id text,paid_at timestamptz);
