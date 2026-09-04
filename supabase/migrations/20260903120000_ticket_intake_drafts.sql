-- Persist incomplete public ticket intakes behind a high-entropy capability.
-- Drafts remain separate from clients/ticket_submissions until the complete,
-- validated representation intake is submitted.

begin;

create table public.ticket_intake_drafts (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  email text,
  phone text,
  preferred_locale text not null default 'en',
  alberta_confirmed boolean not null default false,
  contact_permission boolean not null default false,
  contact_permission_version text not null default 'ticket-intake-follow-up-v1',
  contact_permission_recorded_at timestamptz not null default now(),
  draft_data jsonb not null default '{}'::jsonb,
  schema_version smallint not null default 1,
  current_step smallint not null default 1,
  completed_step smallint not null default 0,
  revision bigint not null default 1,
  status text not null default 'active',
  ticket_document_path text not null,
  ticket_document_content_type text not null,
  ticket_document_size_bytes integer not null,
  ticket_uploaded_at timestamptz,
  converted_submission_id uuid unique references public.ticket_submissions(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  converted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  last_saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_intake_drafts_access_token_hash_check
    check (access_token_hash ~ '^[0-9a-f]{64}$'),
  constraint ticket_intake_drafts_contact_check
    check (status <> 'active' or email is not null or phone is not null),
  constraint ticket_intake_drafts_email_check
    check (email is null or (char_length(email) between 3 and 255 and email = lower(btrim(email)))),
  constraint ticket_intake_drafts_phone_check
    check (phone is null or char_length(phone) between 7 and 30),
  constraint ticket_intake_drafts_locale_check
    check (preferred_locale in ('en', 'pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'hi', 'es')),
  constraint ticket_intake_drafts_consent_check
    check (alberta_confirmed and contact_permission),
  constraint ticket_intake_drafts_contact_permission_version_check
    check (contact_permission_version = 'ticket-intake-follow-up-v1'),
  constraint ticket_intake_drafts_data_check
    check (jsonb_typeof(draft_data) = 'object' and octet_length(draft_data::text) <= 49152),
  constraint ticket_intake_drafts_contact_data_sync_check
    check (
      (not (draft_data ? 'email') or coalesce(draft_data ->> 'email', '') = coalesce(email, '')) and
      (not (draft_data ? 'phone') or coalesce(draft_data ->> 'phone', '') = coalesce(phone, ''))
    ),
  constraint ticket_intake_drafts_schema_check check (schema_version = 1),
  constraint ticket_intake_drafts_step_check
    check (current_step between 1 and 6 and completed_step between 0 and 6),
  constraint ticket_intake_drafts_revision_check check (revision >= 1),
  constraint ticket_intake_drafts_status_check check (status in ('active', 'converted', 'expired')),
  constraint ticket_intake_drafts_file_type_check
    check (ticket_document_content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  constraint ticket_intake_drafts_file_size_check
    check (ticket_document_size_bytes between 1 and 10485760),
  constraint ticket_intake_drafts_file_path_check
    check (
      ticket_document_path ~ (
        '^' || id::text || '/representation-ticket-r[1-9][0-9]*[.](pdf|jpg|png|webp|heic|heif)$'
      )
    ),
  constraint ticket_intake_drafts_conversion_shape_check
    check (
      (
        status = 'converted' and converted_submission_id is not null and
        client_id is not null and converted_at is not null and ticket_uploaded_at is not null
      ) or (
        status in ('active', 'expired') and converted_submission_id is null and
        client_id is null and converted_at is null
      )
    )
);

comment on table public.ticket_intake_drafts is
  'Private, capability-addressed autosave records. A draft is not a client, case, authorization or representation agreement.';
comment on column public.ticket_intake_drafts.access_token_hash is
  'SHA-256 hash of the 256-bit public resume capability. The raw capability is never persisted.';
comment on column public.ticket_intake_drafts.contact_permission is
  'Permission to contact the lead about this ticket intake only; not marketing consent or authorization to act.';

create index ticket_intake_drafts_staff_queue_idx
  on public.ticket_intake_drafts (status, updated_at desc);
create index ticket_intake_drafts_expires_idx
  on public.ticket_intake_drafts (expires_at)
  where status = 'active';
create index ticket_intake_drafts_email_idx
  on public.ticket_intake_drafts (email)
  where email is not null and status = 'active';

create trigger update_ticket_intake_drafts_updated_at
  before update on public.ticket_intake_drafts
  for each row execute function public.update_updated_at_column();

alter table public.ticket_intake_drafts enable row level security;
alter table public.ticket_intake_drafts force row level security;
revoke all on table public.ticket_intake_drafts from public, anon, authenticated;
grant select on table public.ticket_intake_drafts to authenticated;
grant all on table public.ticket_intake_drafts to service_role;

create policy "Staff can read ticket intake drafts"
  on public.ticket_intake_drafts for select to authenticated
  using (public.is_idr_staff());

-- The edge function sends only this keyed HMAC. Raw IP addresses are neither
-- stored nor returned. The RPC serializes a fingerprint's fixed one-hour window
-- before it inserts the lead, so parallel creates cannot evade the limit.
create table public.ticket_intake_draft_rate_limits (
  request_fingerprint text primary key,
  window_started_at timestamptz not null,
  create_count integer not null,
  updated_at timestamptz not null default now(),
  constraint ticket_intake_draft_rate_limits_hash_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint ticket_intake_draft_rate_limits_count_check
    check (create_count between 1 and 5)
);

create index ticket_intake_draft_rate_limits_updated_idx
  on public.ticket_intake_draft_rate_limits (updated_at);
alter table public.ticket_intake_draft_rate_limits enable row level security;
alter table public.ticket_intake_draft_rate_limits force row level security;
revoke all on table public.ticket_intake_draft_rate_limits from public, anon, authenticated;
grant all on table public.ticket_intake_draft_rate_limits to service_role;

create or replace function public.create_ticket_intake_draft(
  p_id uuid,
  p_access_token_hash text,
  p_request_fingerprint text,
  p_email text,
  p_phone text,
  p_preferred_locale text,
  p_draft_data jsonb,
  p_current_step smallint,
  p_completed_step smallint,
  p_ticket_document_path text,
  p_ticket_document_content_type text,
  p_ticket_document_size_bytes integer
)
returns public.ticket_intake_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rate_row public.ticket_intake_draft_rate_limits%rowtype;
  created public.ticket_intake_drafts%rowtype;
begin
  -- The indexed retention sweep keeps keyed network fingerprints bounded. It
  -- cannot remove an active one-hour window because retention is two hours.
  delete from public.ticket_intake_draft_rate_limits
  where updated_at < now() - interval '2 hours';

  perform pg_advisory_xact_lock(hashtextextended(p_request_fingerprint, 0));
  select * into rate_row
  from public.ticket_intake_draft_rate_limits
  where request_fingerprint = p_request_fingerprint
  for update;

  if not found then
    insert into public.ticket_intake_draft_rate_limits (
      request_fingerprint, window_started_at, create_count
    ) values (p_request_fingerprint, now(), 1);
  elsif rate_row.window_started_at <= now() - interval '1 hour' then
    update public.ticket_intake_draft_rate_limits
      set window_started_at = now(), create_count = 1, updated_at = now()
      where request_fingerprint = p_request_fingerprint;
  elsif rate_row.create_count >= 5 then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_CREATE_RATE_LIMIT';
  else
    update public.ticket_intake_draft_rate_limits
      set create_count = create_count + 1, updated_at = now()
      where request_fingerprint = p_request_fingerprint;
  end if;

  insert into public.ticket_intake_drafts (
    id,
    access_token_hash,
    email,
    phone,
    preferred_locale,
    alberta_confirmed,
    contact_permission,
    contact_permission_version,
    contact_permission_recorded_at,
    draft_data,
    current_step,
    completed_step,
    ticket_document_path,
    ticket_document_content_type,
    ticket_document_size_bytes
  ) values (
    p_id,
    p_access_token_hash,
    p_email,
    p_phone,
    p_preferred_locale,
    true,
    true,
    'ticket-intake-follow-up-v1',
    now(),
    p_draft_data,
    p_current_step,
    p_completed_step,
    p_ticket_document_path,
    p_ticket_document_content_type,
    p_ticket_document_size_bytes
  ) returning * into created;

  return created;
end;
$$;

revoke all on function public.create_ticket_intake_draft(
  uuid, text, text, text, text, text, jsonb, smallint, smallint, text, text, integer
) from public, anon, authenticated;
grant execute on function public.create_ticket_intake_draft(
  uuid, text, text, text, text, text, jsonb, smallint, smallint, text, text, integer
) to service_role;

create or replace function public.save_ticket_intake_draft(
  p_id uuid,
  p_access_token_hash text,
  p_expected_revision bigint,
  p_email text,
  p_phone text,
  p_current_step smallint,
  p_completed_step smallint,
  p_draft_data jsonb
)
returns public.ticket_intake_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved public.ticket_intake_drafts%rowtype;
begin
  update public.ticket_intake_drafts
    set email = p_email,
        phone = p_phone,
        current_step = p_current_step,
        completed_step = greatest(completed_step, p_completed_step),
        draft_data = p_draft_data,
        revision = revision + 1,
        last_saved_at = now(),
        expires_at = now() + interval '30 days'
  where id = p_id
    and access_token_hash = p_access_token_hash
    and status = 'active'
    and expires_at > now()
    and revision = p_expected_revision
  returning * into saved;

  if not found then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
  end if;
  return saved;
end;
$$;

revoke all on function public.save_ticket_intake_draft(
  uuid, text, bigint, text, text, smallint, smallint, jsonb
) from public, anon, authenticated;
grant execute on function public.save_ticket_intake_draft(
  uuid, text, bigint, text, text, smallint, smallint, jsonb
) to service_role;

create or replace function public.prepare_ticket_intake_draft_upload(
  p_id uuid,
  p_access_token_hash text,
  p_expected_revision bigint,
  p_ticket_document_path text,
  p_ticket_document_content_type text,
  p_ticket_document_size_bytes integer
)
returns public.ticket_intake_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prepared public.ticket_intake_drafts%rowtype;
begin
  update public.ticket_intake_drafts
    set ticket_document_path = p_ticket_document_path,
        ticket_document_content_type = p_ticket_document_content_type,
        ticket_document_size_bytes = p_ticket_document_size_bytes,
        ticket_uploaded_at = null,
        revision = revision + 1,
        last_saved_at = now(),
        expires_at = now() + interval '30 days'
  where id = p_id
    and access_token_hash = p_access_token_hash
    and status = 'active'
    and expires_at > now()
    and revision = p_expected_revision
  returning * into prepared;

  if not found then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
  end if;
  return prepared;
end;
$$;

revoke all on function public.prepare_ticket_intake_draft_upload(
  uuid, text, bigint, text, text, integer
) from public, anon, authenticated;
grant execute on function public.prepare_ticket_intake_draft_upload(
  uuid, text, bigint, text, text, integer
) to service_role;

create or replace function public.confirm_ticket_intake_draft_upload(
  p_id uuid,
  p_access_token_hash text,
  p_expected_revision bigint
)
returns public.ticket_intake_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  confirmed public.ticket_intake_drafts%rowtype;
begin
  update public.ticket_intake_drafts
    set ticket_uploaded_at = now(),
        revision = revision + 1,
        last_saved_at = now(),
        expires_at = now() + interval '30 days'
  where id = p_id
    and access_token_hash = p_access_token_hash
    and status = 'active'
    and expires_at > now()
    and revision = p_expected_revision
    and ticket_uploaded_at is null
  returning * into confirmed;

  if not found then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
  end if;
  return confirmed;
end;
$$;

revoke all on function public.confirm_ticket_intake_draft_upload(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.confirm_ticket_intake_draft_upload(uuid, text, bigint)
  to service_role;

-- Inserting the complete final case converts a matching draft in the same
-- transaction. A ticket cannot consume a draft with the wrong capability,
-- contact, locale or private file path.
create or replace function public.convert_ticket_intake_draft_on_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft
  from public.ticket_intake_drafts
  where id = new.id
  for update;

  if not found then
    return new;
  end if;

  if draft.status <> 'active' or
     draft.expires_at <= now() or
     draft.ticket_uploaded_at is null or
     not draft.alberta_confirmed or
     not draft.contact_permission or
     new.service_type <> 'representation' or
     new.status <> 'awaiting_payment' or
     new.representation_access_token_hash is distinct from draft.access_token_hash or
     new.ticket_document_path is distinct from draft.ticket_document_path or
     new.preferred_locale is distinct from draft.preferred_locale or
     (draft.email is not null and lower(btrim(new.email)) is distinct from draft.email) or
     (draft.phone is not null and new.phone is distinct from draft.phone) then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_CONVERSION_INVALID';
  end if;

  update public.ticket_intake_drafts
    set status = 'converted',
        converted_submission_id = new.id,
        client_id = new.client_id,
        converted_at = now(),
        revision = revision + 1,
        last_saved_at = now()
    where id = draft.id;

  return new;
end;
$$;

revoke all on function public.convert_ticket_intake_draft_on_submission()
  from public, anon, authenticated;
grant execute on function public.convert_ticket_intake_draft_on_submission()
  to service_role;

create trigger convert_ticket_intake_draft_after_submission
  after insert on public.ticket_submissions
  for each row execute function public.convert_ticket_intake_draft_on_submission();

-- Remove two legacy public-write paths. Service-role Edge Functions bypass RLS
-- and remain able to manage these records and private PDFs.
drop policy if exists "Allow anonymous access to ticket cache" on public.ticket_cache;
alter table public.ticket_cache force row level security;
revoke all on table public.ticket_cache from public, anon, authenticated;
grant all on table public.ticket_cache to service_role;
revoke all on function public.cleanup_expired_ticket_cache() from public, anon, authenticated;
grant execute on function public.cleanup_expired_ticket_cache() to service_role;

drop policy if exists "System can upload consent forms" on storage.objects;

commit;
