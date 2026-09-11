create role anon;
create role authenticated;
create role service_role bypassrls;
-- Relevant production columns. The runner loads the actual production upload
-- confirmation RPC so timestamps/replacements exercise the real lifecycle.
create table public.ticket_submissions (
  id uuid primary key, email text, ticket_number text, service_type text default 'representation',
  status text default 'awaiting_payment', representation_paid_at timestamptz, deleted_at timestamptz,
  representation_checkout_session_id text,created_at timestamptz default now(),first_name text,violation text,ticket_type text
);
create table public.ticket_intake_drafts (
  id uuid primary key default gen_random_uuid(),access_token_hash text default repeat('a',64),
  email text default 'lead@example.com',phone text,preferred_locale text default 'en',
  contact_permission boolean default true,alberta_confirmed boolean default true,
  staff_follow_up_status text default 'open',draft_data jsonb default '{}',status text default 'active',
  expires_at timestamptz default now()+interval '30 days',deleted_at timestamptz,
  converted_submission_id uuid unique references public.ticket_submissions(id),
  ticket_document_path text default 'ticket.pdf',ticket_document_content_type text default 'application/pdf',
  ticket_document_size_bytes integer default 100,ticket_uploaded_at timestamptz,
  pending_ticket_document_path text,pending_ticket_document_content_type text,pending_ticket_document_size_bytes integer,
  revision bigint default 1,last_saved_at timestamptz
);
create table public.ticket_intake_draft_object_deletions(draft_id uuid,object_path text);
create table public.idr_checkout_intents (
  id uuid primary key default gen_random_uuid(),ticket_submission_id uuid references public.ticket_submissions(id),
  checkout_kind text default 'ticket_only',status text default 'creating',stripe_checkout_session_id text,
  updated_at timestamptz default now()
);
