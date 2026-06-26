-- Call logs for the Fabsy AI phone agent (Vapi). Stores transcript, recording and metadata
-- for every call, plus a private storage bucket for the audio recordings.

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  vapi_call_id text unique,
  direction text,                       -- inboundPhoneCall / outboundPhoneCall / webCall
  phone_number_from text,               -- caller's number
  phone_number_to text,                 -- the Fabsy line dialled
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds numeric,
  ended_reason text,
  summary text,
  transcript text,
  recording_url text,                   -- Vapi-hosted recording URL
  recording_path text,                  -- path in the call-recordings storage bucket
  structured jsonb,                     -- structured outputs / extracted intake fields
  cost numeric,
  raw jsonb,                            -- full payload, for safety / future parsing
  created_at timestamptz not null default now()
);

create index if not exists call_logs_created_at_idx on public.call_logs (created_at desc);
create index if not exists call_logs_from_idx on public.call_logs (phone_number_from);

alter table public.call_logs enable row level security;

-- Service role (used by the edge function) bypasses RLS. Admins may read in the dashboard.
drop policy if exists "Admins can view call logs" on public.call_logs;
create policy "Admins can view call logs"
  on public.call_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

-- Private bucket for call audio.
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

-- Admins can read recordings from the dashboard; the edge function writes via service role.
drop policy if exists "Admins can read call recordings" on storage.objects;
create policy "Admins can read call recordings"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'call-recordings'
    and exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );
