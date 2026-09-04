-- Durably retain every known superseded ticket-object path until Storage has
-- acknowledged deletion. This queue never enumerates a customer's folder and
-- never makes a converted case document eligible for deletion.

begin;

create table public.ticket_intake_draft_object_deletions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  object_path text not null unique,
  queued_at timestamptz not null default clock_timestamp(),
  eligible_at timestamptz not null default (clock_timestamp() + interval '24 hours'),
  cleanup_claim_id uuid,
  cleanup_claimed_at timestamptz,
  cleanup_claim_expires_at timestamptz,
  cleanup_attempt_count integer not null default 0,
  deleted_at timestamptz,
  constraint ticket_intake_draft_object_deletions_path_check
    check (
      object_path ~ (
        '^' || draft_id::text || '/representation-ticket-r[1-9][0-9]*[.](pdf|jpg|png|webp|heic|heif)$'
      )
    ),
  constraint ticket_intake_draft_object_deletions_eligibility_check
    check (eligible_at > queued_at),
  constraint ticket_intake_draft_object_deletions_attempt_count_check
    check (cleanup_attempt_count between 0 and 1000000),
  constraint ticket_intake_draft_object_deletions_state_check
    check (
      (
        deleted_at is null and
        (
          (
            cleanup_claim_id is null and
            cleanup_claimed_at is null and
            cleanup_claim_expires_at is null
          ) or (
            cleanup_claim_id is not null and
            cleanup_claimed_at is not null and
            cleanup_claim_expires_at is not null and
            cleanup_claim_expires_at > cleanup_claimed_at
          )
        )
      ) or (
        deleted_at is not null and
        cleanup_claim_id is null and
        cleanup_claimed_at is null and
        cleanup_claim_expires_at is null
      )
    )
);

create index ticket_intake_draft_object_deletions_queue_idx
  on public.ticket_intake_draft_object_deletions (
    cleanup_attempt_count, eligible_at, id
  )
  where deleted_at is null;

comment on table public.ticket_intake_draft_object_deletions is
  'Service-only durable deletion queue and tombstone for known superseded ticket-intake object paths. Paths contain only an opaque draft UUID and bounded revision filename.';
comment on column public.ticket_intake_draft_object_deletions.eligible_at is
  'Deletion waits a full day so every two-hour signed upload URL has expired before the first Storage attempt.';

alter table public.ticket_intake_draft_object_deletions enable row level security;
alter table public.ticket_intake_draft_object_deletions force row level security;
revoke all on table public.ticket_intake_draft_object_deletions
  from public, anon, authenticated;
grant all on table public.ticket_intake_draft_object_deletions
  to service_role;

-- The queue row itself is a durable exact-path fence. The existing draft
-- cleanup tombstone remains a whole-folder fence after an expired draft row is
-- removed. Both checks run under the same draft-folder advisory lock used by
-- cleanup claimants and conversion.
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
  ) or exists (
    select 1
    from public.ticket_intake_draft_object_deletions queued
    where queued.object_path = new.ticket_document_path
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

-- A replacement is staged separately when a confirmed ticket exists. Queue
-- the exact old pending/unconfirmed path in this same transaction before its
-- only database reference is overwritten.
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
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 731904218::bigint));

  select * into prepared
  from public.ticket_intake_drafts
  where id = p_id
    and access_token_hash = p_access_token_hash
    and status = 'active'
    and expires_at > now()
  for update;

  if not found or prepared.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
  end if;

  if prepared.ticket_uploaded_at is not null then
    if prepared.pending_ticket_document_path is not null and
       prepared.pending_ticket_document_path is distinct from p_ticket_document_path then
      insert into public.ticket_intake_draft_object_deletions (draft_id, object_path)
      values (prepared.id, prepared.pending_ticket_document_path);
    end if;

    update public.ticket_intake_drafts
      set pending_ticket_document_path = p_ticket_document_path,
          pending_ticket_document_content_type = p_ticket_document_content_type,
          pending_ticket_document_size_bytes = p_ticket_document_size_bytes,
          revision = revision + 1,
          last_saved_at = now(),
          expires_at = now() + interval '30 days'
    where id = prepared.id
    returning * into prepared;
  else
    if prepared.ticket_document_path is distinct from p_ticket_document_path then
      insert into public.ticket_intake_draft_object_deletions (draft_id, object_path)
      values (prepared.id, prepared.ticket_document_path);
    end if;

    update public.ticket_intake_drafts
      set ticket_document_path = p_ticket_document_path,
          ticket_document_content_type = p_ticket_document_content_type,
          ticket_document_size_bytes = p_ticket_document_size_bytes,
          ticket_uploaded_at = null,
          pending_ticket_document_path = null,
          pending_ticket_document_content_type = null,
          pending_ticket_document_size_bytes = null,
          revision = revision + 1,
          last_saved_at = now(),
          expires_at = now() + interval '30 days'
    where id = prepared.id
    returning * into prepared;
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

create or replace function public.discard_pending_ticket_intake_draft_upload(
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
  discarded public.ticket_intake_drafts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 731904218::bigint));

  select * into discarded
  from public.ticket_intake_drafts
  where id = p_id
    and access_token_hash = p_access_token_hash
    and status = 'active'
    and expires_at > now()
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_DELIVERY_ACCESS_DENIED';
  end if;
  if discarded.ticket_uploaded_at is null then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_PENDING_UPLOAD_NOT_DISCARDABLE';
  end if;
  if discarded.pending_ticket_document_path is null then
    return discarded;
  end if;
  if discarded.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
  end if;

  insert into public.ticket_intake_draft_object_deletions (draft_id, object_path)
  values (discarded.id, discarded.pending_ticket_document_path);

  update public.ticket_intake_drafts
    set pending_ticket_document_path = null,
        pending_ticket_document_content_type = null,
        pending_ticket_document_size_bytes = null,
        revision = revision + 1,
        last_saved_at = now(),
        expires_at = now() + interval '30 days'
  where id = discarded.id
  returning * into discarded;

  return discarded;
end;
$$;

revoke all on function public.discard_pending_ticket_intake_draft_upload(
  uuid, text, bigint
) from public, anon, authenticated;
grant execute on function public.discard_pending_ticket_intake_draft_upload(
  uuid, text, bigint
) to service_role;

-- Confirmation atomically queues the former confirmed object before the
-- replacement becomes current. Repeated confirmations remain idempotent.
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
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 731904218::bigint));

  select * into confirmed
  from public.ticket_intake_drafts
  where id = p_id
    and access_token_hash = p_access_token_hash
    and status = 'active'
    and expires_at > now()
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
  end if;
  if confirmed.pending_ticket_document_path is not null then
    if confirmed.revision <> p_expected_revision then
      raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
    end if;

    insert into public.ticket_intake_draft_object_deletions (draft_id, object_path)
    values (confirmed.id, confirmed.ticket_document_path);

    update public.ticket_intake_drafts
      set ticket_document_path = pending_ticket_document_path,
          ticket_document_content_type = pending_ticket_document_content_type,
          ticket_document_size_bytes = pending_ticket_document_size_bytes,
          ticket_uploaded_at = now(),
          pending_ticket_document_path = null,
          pending_ticket_document_content_type = null,
          pending_ticket_document_size_bytes = null,
          revision = revision + 1,
          last_saved_at = now(),
          expires_at = now() + interval '30 days'
    where id = confirmed.id
    returning * into confirmed;
    return confirmed;
  end if;
  if confirmed.ticket_uploaded_at is not null then
    return confirmed;
  end if;
  if confirmed.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
  end if;

  update public.ticket_intake_drafts
    set ticket_uploaded_at = now(),
        revision = revision + 1,
        last_saved_at = now(),
        expires_at = now() + interval '30 days'
  where id = confirmed.id
  returning * into confirmed;

  return confirmed;
end;
$$;

revoke all on function public.confirm_ticket_intake_draft_upload(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.confirm_ticket_intake_draft_upload(uuid, text, bigint)
  to service_role;

create or replace function public.claim_ticket_intake_draft_object_deletions(
  p_claim_id uuid,
  p_limit integer default 10
)
returns table (
  deletion_id uuid,
  draft_id uuid,
  claim_id uuid,
  object_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate record;
  claimed public.ticket_intake_draft_object_deletions%rowtype;
  claimed_at timestamptz := clock_timestamp();
begin
  if p_claim_id is null then
    raise exception using errcode = '22023', message = 'TICKET_INTAKE_OBJECT_CLAIM_INVALID';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception using errcode = '22023', message = 'TICKET_INTAKE_OBJECT_LIMIT_INVALID';
  end if;

  for candidate in
    select queued.id, queued.draft_id, queued.object_path
    from public.ticket_intake_draft_object_deletions queued
    where queued.deleted_at is null
      and queued.eligible_at <= claimed_at
      and (
        queued.cleanup_claim_id is null or
        queued.cleanup_claim_expires_at <= claimed_at
      )
      and not exists (
        select 1 from public.ticket_submissions submission
        where submission.ticket_document_path = queued.object_path
      )
      and not exists (
        select 1 from public.ticket_intake_drafts draft
        where draft.ticket_document_path = queued.object_path
           or draft.pending_ticket_document_path = queued.object_path
      )
    -- Rotate failed paths behind untried work. Without attempt-first ordering,
    -- a full batch of permanently failing oldest objects would starve every
    -- newer known path forever.
    order by queued.cleanup_attempt_count, queued.eligible_at, queued.id
    limit p_limit
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(candidate.draft_id::text, 731904218::bigint)
    );

    select * into claimed
    from public.ticket_intake_draft_object_deletions queued
    where queued.id = candidate.id
      and queued.draft_id = candidate.draft_id
      and queued.object_path = candidate.object_path
      and queued.deleted_at is null
      and queued.eligible_at <= claimed_at
      and (
        queued.cleanup_claim_id is null or
        queued.cleanup_claim_expires_at <= claimed_at
      )
    for update of queued skip locked;

    if not found then
      continue;
    end if;
    if exists (
      select 1 from public.ticket_submissions submission
      where submission.ticket_document_path = claimed.object_path
    ) or exists (
      select 1 from public.ticket_intake_drafts draft
      where draft.ticket_document_path = claimed.object_path
         or draft.pending_ticket_document_path = claimed.object_path
    ) then
      continue;
    end if;

    update public.ticket_intake_draft_object_deletions queued
      set cleanup_claim_id = p_claim_id,
          cleanup_claimed_at = claimed_at,
          cleanup_claim_expires_at = claimed_at + interval '15 minutes',
          cleanup_attempt_count = cleanup_attempt_count + 1
    where queued.id = claimed.id
      and queued.deleted_at is null
      and (
        queued.cleanup_claim_id is null or
        queued.cleanup_claim_expires_at <= claimed_at
      )
    returning queued.* into claimed;

    if found then
      deletion_id := claimed.id;
      draft_id := claimed.draft_id;
      claim_id := claimed.cleanup_claim_id;
      object_path := claimed.object_path;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.claim_ticket_intake_draft_object_deletions(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ticket_intake_draft_object_deletions(uuid, integer)
  to service_role;

create or replace function public.finalize_ticket_intake_draft_object_deletion(
  p_id uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.ticket_intake_draft_object_deletions%rowtype;
begin
  if p_id is null or p_claim_id is null then
    return false;
  end if;

  select * into claimed
  from public.ticket_intake_draft_object_deletions queued
  where queued.id = p_id;
  if not found then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(claimed.draft_id::text, 731904218::bigint)
  );
  select * into claimed
  from public.ticket_intake_draft_object_deletions queued
  where queued.id = p_id
  for update;

  if claimed.deleted_at is not null then
    return true;
  end if;
  if claimed.cleanup_claim_id is distinct from p_claim_id then
    return false;
  end if;
  if exists (
    select 1 from public.ticket_submissions submission
    where submission.ticket_document_path = claimed.object_path
  ) or exists (
    select 1 from public.ticket_intake_drafts draft
    where draft.ticket_document_path = claimed.object_path
       or draft.pending_ticket_document_path = claimed.object_path
  ) then
    return false;
  end if;

  update public.ticket_intake_draft_object_deletions queued
    set deleted_at = clock_timestamp(),
        cleanup_claim_id = null,
        cleanup_claimed_at = null,
        cleanup_claim_expires_at = null
  where queued.id = claimed.id
    and queued.cleanup_claim_id = p_claim_id
    and queued.deleted_at is null;
  return found;
end;
$$;

revoke all on function public.finalize_ticket_intake_draft_object_deletion(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_ticket_intake_draft_object_deletion(uuid, uuid)
  to service_role;

create or replace function public.release_ticket_intake_draft_object_deletion(
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

  update public.ticket_intake_draft_object_deletions queued
    set cleanup_claim_id = null,
        cleanup_claimed_at = null,
        cleanup_claim_expires_at = null
  where queued.id = p_id
    and queued.cleanup_claim_id = p_claim_id
    and queued.deleted_at is null;
  return found;
end;
$$;

revoke all on function public.release_ticket_intake_draft_object_deletion(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_ticket_intake_draft_object_deletion(uuid, uuid)
  to service_role;

commit;
