alter table public.ticket_submissions add column created_at timestamptz default now();
grant select,update on public.ticket_submissions to authenticated;
alter table public.ticket_submissions enable row level security;
create policy staff on public.ticket_submissions for all to authenticated using(public.is_idr_staff());
create table public.ticket_intake_drafts(id uuid primary key,converted_submission_id uuid references public.ticket_submissions(id),ticket_uploaded_at timestamptz,contact_permission boolean default true,status text default 'active',expires_at timestamptz default now()+interval '1 day',ticket_document_path text,draft_data jsonb default '{}',email text,phone text,preferred_locale text default 'en');
grant select,update on public.ticket_intake_drafts to authenticated;
