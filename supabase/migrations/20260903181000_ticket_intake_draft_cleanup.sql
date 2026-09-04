-- Race-safe, service-only cleanup for expired, unconverted ticket-intake drafts.
-- Storage is deleted by the worker before the claimed database row is finalized.

begin;

alter table public.ticket_intake_drafts
  add column cleanup_claim_id uuid,
  add column cleanup_claimed_at timestamptz,
  add column cleanup_claim_expires_at timestamptz,
  add column cleanup_attempt_count integer not null default 0,
  add constraint ticket_intake_drafts_cleanup_claim_shape_check
    check (
      (
        cleanup_claim_id is null and
        cleanup_claimed_at is null and
        cleanup_claim_expires_at is null
      ) or (
        cleanup_claim_id is not null and
        cleanup_claimed_at is not null and
        cleanup_claim_expires_at is not null and
        cleanup_claim_expires_at > cleanup_claimed_at and
        status = 'expired' and
        converted_submission_id is null
      )
    ),
  add constraint ticket_intake_drafts_cleanup_attempt_count_check
    check (cleanup_attempt_count between 0 and 1000000);

comment on column public.ticket_intake_drafts.cleanup_claim_id is
  'Service-only lease identifier for deleting private objects before an expired, unconverted draft row.';
comment on column public.ticket_intake_drafts.cleanup_attempt_count is
  'Bounded operational count only; no contact, capability or object-path data is recorded here.';

create index ticket_intake_drafts_cleanup_queue_idx
  on public.ticket_intake_drafts (expires_at, id)
  where status in ('active', 'expired') and converted_submission_id is null;

-- Finalization removes the draft row, so retain a non-reversible hash of each
-- deleted object path. This closes the late-submission race after the row and
-- lease no longer exist without retaining contact data, capabilities or paths.
create table public.ticket_intake_draft_cleanup_tombstones (
  path_hash text primary key,
  draft_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint ticket_intake_draft_cleanup_tombstones_hash_check
    check (path_hash ~ '^[0-9a-f]{64}$')
);

create index ticket_intake_draft_cleanup_tombstones_draft_idx
  on public.ticket_intake_draft_cleanup_tombstones (draft_id);

comment on table public.ticket_intake_draft_cleanup_tombstones is
  'Service-only hashes of deleted assessment-ticket paths, used to reject late submissions after an expired draft is purged.';

alter table public.ticket_intake_draft_cleanup_tombstones enable row level security;
alter table public.ticket_intake_draft_cleanup_tombstones force row level security;
revoke all on table public.ticket_intake_draft_cleanup_tombstones
  from public, anon, authenticated;
grant all on table public.ticket_intake_draft_cleanup_tombstones
  to service_role;

-- The cleanup claimant and ticket-submission writer take the same transaction
-- advisory lock for the draft folder. Whichever transaction wins forces the
-- other to recheck durable state, so no object in that folder can become a case
-- document while deletion is in progress.
create or replace function public.protect_ticket_submission_from_draft_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  draft_folder text;
  draft_uuid uuid;
begin
  if new.ticket_document_path is null then
    return new;
  end if;

  draft_folder := split_part(new.ticket_document_path, '/', 1);
  if draft_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return new;
  end if;
  draft_uuid := draft_folder::uuid;

  perform pg_advisory_xact_lock(hashtextextended(draft_uuid::text, 731904218::bigint));

  if exists (
    select 1
    from public.ticket_intake_drafts d
    where d.cleanup_claim_id is not null
      and d.id = draft_uuid
  ) or exists (
    select 1
    from public.ticket_intake_draft_cleanup_tombstones t
    where t.draft_id = draft_uuid
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'TICKET_INTAKE_CLEANUP_PATH_CLAIMED';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_ticket_submission_from_draft_cleanup()
  from public, anon, authenticated, service_role;

create trigger protect_ticket_submission_from_draft_cleanup
  before insert or update of ticket_document_path on public.ticket_submissions
  for each row execute function public.protect_ticket_submission_from_draft_cleanup();

create or replace function public.claim_expired_ticket_intake_drafts(
  p_claim_id uuid,
  p_limit integer default 10
)
returns table (
  draft_id uuid,
  claim_id uuid,
  current_path text,
  pending_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate record;
  claimed public.ticket_intake_drafts%rowtype;
  claimed_at timestamptz := clock_timestamp();
begin
  if p_claim_id is null then
    raise exception using errcode = '22023', message = 'TICKET_INTAKE_CLEANUP_CLAIM_INVALID';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception using errcode = '22023', message = 'TICKET_INTAKE_CLEANUP_LIMIT_INVALID';
  end if;

  for candidate in
    select
      d.id,
      d.ticket_document_path,
      d.pending_ticket_document_path
    from public.ticket_intake_drafts d
    where d.status in ('active', 'expired')
      and d.converted_submission_id is null
      -- Signed upload URLs currently live for two hours. A full-day grace
      -- prevents a still-valid URL from creating an unseen object after the
      -- worker's final empty-folder check.
      and d.expires_at <= claimed_at - interval '24 hours'
      and (
        d.cleanup_claim_id is null or
        d.cleanup_claim_expires_at <= claimed_at
      )
      and not exists (
        select 1
        from public.ticket_submissions s
        where s.ticket_document_path like d.id::text || '/%'
      )
    order by d.expires_at, d.id
    limit p_limit
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(candidate.id::text, 731904218::bigint)
    );

    -- Path locks come before the row lock, matching the submission trigger's
    -- order. This avoids a row-lock/advisory-lock cycle with the AFTER
    -- submission conversion trigger. Recheck all eligibility after waiting.
    select * into claimed
    from public.ticket_intake_drafts d
    where d.id = candidate.id
      and d.ticket_document_path is not distinct from candidate.ticket_document_path
      and d.pending_ticket_document_path is not distinct from candidate.pending_ticket_document_path
      and d.status in ('active', 'expired')
      and d.converted_submission_id is null
      and d.expires_at <= claimed_at - interval '24 hours'
      and (
        d.cleanup_claim_id is null or
        d.cleanup_claim_expires_at <= claimed_at
      )
    for update of d skip locked;

    if not found then
      continue;
    end if;

    -- A submission transaction may have committed while this claimant waited
    -- for the path lock. Recheck after both locks before creating the lease.
    if exists (
      select 1
      from public.ticket_submissions s
      where s.ticket_document_path like claimed.id::text || '/%'
    ) then
      continue;
    end if;

    update public.ticket_intake_drafts d
      set status = 'expired',
          cleanup_claim_id = p_claim_id,
          cleanup_claimed_at = claimed_at,
          cleanup_claim_expires_at = claimed_at + interval '15 minutes',
          cleanup_attempt_count = cleanup_attempt_count + 1
    where d.id = candidate.id
      and d.status in ('active', 'expired')
      and d.converted_submission_id is null
      and d.expires_at <= claimed_at - interval '24 hours'
      and (
        d.cleanup_claim_id is null or
        d.cleanup_claim_expires_at <= claimed_at
      )
    returning d.* into claimed;

    if found then
      draft_id := claimed.id;
      claim_id := claimed.cleanup_claim_id;
      current_path := claimed.ticket_document_path;
      pending_path := claimed.pending_ticket_document_path;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.claim_expired_ticket_intake_drafts(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_expired_ticket_intake_drafts(uuid, integer)
  to service_role;

-- The worker hashes every strictly validated path and records the hashes before
-- asking Storage to delete anything. This RPC accepts no raw object paths.
create or replace function public.record_ticket_intake_draft_cleanup_tombstones(
  p_id uuid,
  p_claim_id uuid,
  p_path_hashes text[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.ticket_intake_drafts%rowtype;
  recorded integer;
begin
  if p_id is null or p_claim_id is null or p_path_hashes is null or
     cardinality(p_path_hashes) < 1 or cardinality(p_path_hashes) > 25 or
     exists (
       select 1 from unnest(p_path_hashes) as supplied(path_hash)
       where supplied.path_hash is null or
             supplied.path_hash !~ '^[0-9a-f]{64}$'
     ) then
    raise exception using errcode = '22023', message = 'TICKET_INTAKE_CLEANUP_TOMBSTONES_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 731904218::bigint));
  select * into claimed
  from public.ticket_intake_drafts d
  where d.id = p_id
  for update;

  if not found or claimed.cleanup_claim_id is distinct from p_claim_id or
     claimed.status <> 'expired' or claimed.converted_submission_id is not null then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_CLEANUP_CLAIM_LOST';
  end if;
  if exists (
    select 1
    from public.ticket_intake_draft_cleanup_tombstones t
    join unnest(p_path_hashes) as supplied(path_hash)
      on supplied.path_hash = t.path_hash
    where t.draft_id <> p_id
  ) then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_CLEANUP_TOMBSTONE_CONFLICT';
  end if;

  insert into public.ticket_intake_draft_cleanup_tombstones (path_hash, draft_id)
  select distinct supplied.path_hash, p_id
  from unnest(p_path_hashes) as supplied(path_hash)
  on conflict (path_hash) do nothing;

  select count(*)::integer into recorded
  from public.ticket_intake_draft_cleanup_tombstones t
  where t.draft_id = p_id
    and t.path_hash = any(p_path_hashes);
  return recorded;
end;
$$;

revoke all on function public.record_ticket_intake_draft_cleanup_tombstones(
  uuid, uuid, text[]
) from public, anon, authenticated;
grant execute on function public.record_ticket_intake_draft_cleanup_tombstones(
  uuid, uuid, text[]
) to service_role;

create or replace function public.finalize_ticket_intake_draft_cleanup(
  p_id uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.ticket_intake_drafts%rowtype;
begin
  if p_id is null or p_claim_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 731904218::bigint));

  -- Match the folder-lock -> row-lock order used everywhere else.
  select * into claimed
  from public.ticket_intake_drafts d
  where d.id = p_id
  for update;

  if not found then
    return true;
  end if;
  if claimed.cleanup_claim_id is distinct from p_claim_id or
     claimed.status <> 'expired' or
     claimed.converted_submission_id is not null then
    return false;
  end if;

  if exists (
    select 1
    from public.ticket_submissions s
    where s.ticket_document_path like claimed.id::text || '/%'
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.ticket_intake_draft_cleanup_tombstones t
    where t.draft_id = claimed.id
  ) then
    return false;
  end if;

  delete from public.ticket_intake_drafts d
  where d.id = claimed.id
    and d.cleanup_claim_id = p_claim_id;
  return found;
end;
$$;

revoke all on function public.finalize_ticket_intake_draft_cleanup(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_ticket_intake_draft_cleanup(uuid, uuid)
  to service_role;

-- This is used only when the worker rejects a claim before attempting any
-- Storage mutation (for example, a malformed row returned across the RPC
-- boundary). Storage failures keep the lease until expiry because their
-- outcome can be ambiguous.
create or replace function public.release_ticket_intake_draft_cleanup(
  p_id uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_id is null or p_claim_id is null then
    return false;
  end if;

  update public.ticket_intake_drafts d
    set cleanup_claim_id = null,
        cleanup_claimed_at = null,
        cleanup_claim_expires_at = null
  where d.id = p_id
    and d.cleanup_claim_id = p_claim_id
    and d.status = 'expired'
    and d.converted_submission_id is null;
  return found;
end;
$$;

revoke all on function public.release_ticket_intake_draft_cleanup(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_ticket_intake_draft_cleanup(uuid, uuid)
  to service_role;

commit;
