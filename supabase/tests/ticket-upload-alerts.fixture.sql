create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.ticket_intake_drafts (
 id uuid primary key, access_token_hash text, email text, phone text,
 preferred_locale text default 'en', contact_permission boolean default true,
 draft_data jsonb default '{}', status text default 'active', expires_at timestamptz default now() + interval '30 days',
 ticket_document_path text, ticket_document_content_type text, ticket_document_size_bytes integer,
 ticket_uploaded_at timestamptz, pending_ticket_document_path text,
 pending_ticket_document_content_type text, pending_ticket_document_size_bytes integer,
 revision bigint default 1, last_saved_at timestamptz
);
create table public.ticket_intake_draft_object_deletions (draft_id uuid, object_path text);
