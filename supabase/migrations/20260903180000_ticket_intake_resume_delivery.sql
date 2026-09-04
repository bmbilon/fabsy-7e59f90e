begin;

alter table public.ticket_intake_drafts
  add column pending_ticket_document_path text,
  add column pending_ticket_document_content_type text,
  add column pending_ticket_document_size_bytes integer,
  add column resume_delivery_generation integer not null default 1,
  add column resume_delivery_status text not null default 'pending',
  add column resume_delivery_channel text,
  add column resume_delivery_claim_id uuid,
  add column resume_delivery_claimed_at timestamptz,
  add column resume_delivery_claim_expires_at timestamptz,
  add column resume_delivery_attempted_at timestamptz,
  add column resume_delivery_sent_at timestamptz,
  add column resume_delivery_failed_at timestamptz,
  add column resume_delivery_attempt_count smallint not null default 0,
  add column resume_delivery_failure_code text;

alter table public.ticket_intake_drafts
  add constraint ticket_intake_drafts_pending_file_shape_check
    check (
      (
        pending_ticket_document_path is null and
        pending_ticket_document_content_type is null and
        pending_ticket_document_size_bytes is null
      ) or (
        pending_ticket_document_path ~ (
          '^' || id::text || '/representation-ticket-r[1-9][0-9]*[.](pdf|jpg|png|webp|heic|heif)$'
        ) and
        pending_ticket_document_content_type in (
          'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
        ) and
        pending_ticket_document_size_bytes between 1 and 10485760 and
        ticket_uploaded_at is not null and
        pending_ticket_document_path <> ticket_document_path
      )
    ),
  add constraint ticket_intake_drafts_resume_delivery_status_check
    check (resume_delivery_status in ('pending', 'sending', 'sent', 'failed')),
  add constraint ticket_intake_drafts_resume_delivery_channel_check
    check (resume_delivery_channel is null or resume_delivery_channel in ('email', 'sms')),
  add constraint ticket_intake_drafts_resume_delivery_attempt_count_check
    check (resume_delivery_attempt_count between 0 and 5),
  add constraint ticket_intake_drafts_resume_delivery_generation_check
    check (resume_delivery_generation between 1 and 2147483647),
  add constraint ticket_intake_drafts_resume_delivery_failure_code_check
    check (
      resume_delivery_failure_code is null or
      resume_delivery_failure_code in (
        'configuration_missing', 'request_rejected', 'rate_limited', 'outcome_unknown'
      )
    ),
  add constraint ticket_intake_drafts_resume_delivery_shape_check
    check (
      (
        resume_delivery_status = 'pending' and
        resume_delivery_channel is null and
        resume_delivery_claim_id is null and
        resume_delivery_claimed_at is null and
        resume_delivery_claim_expires_at is null and
        resume_delivery_attempted_at is null and
        resume_delivery_sent_at is null and
        resume_delivery_failed_at is null and
        resume_delivery_attempt_count = 0 and
        resume_delivery_failure_code is null
      ) or (
        resume_delivery_status = 'sending' and
        resume_delivery_channel is not null and
        resume_delivery_claim_id is not null and
        resume_delivery_claimed_at is not null and
        resume_delivery_claim_expires_at is not null and
        resume_delivery_attempted_at is not null and
        resume_delivery_sent_at is null and
        resume_delivery_failed_at is null and
        resume_delivery_attempt_count between 1 and 5 and
        resume_delivery_failure_code is null
      ) or (
        resume_delivery_status = 'sending' and
        resume_delivery_channel is not null and
        resume_delivery_claim_id is not null and
        resume_delivery_claimed_at is not null and
        resume_delivery_claim_expires_at is not null and
        resume_delivery_attempted_at is not null and
        resume_delivery_sent_at is null and
        resume_delivery_failed_at is null and
        resume_delivery_attempt_count between 1 and 5 and
        resume_delivery_failure_code = 'outcome_unknown'
      ) or (
        resume_delivery_status = 'sent' and
        resume_delivery_channel is not null and
        resume_delivery_claim_id is not null and
        resume_delivery_claimed_at is not null and
        resume_delivery_claim_expires_at is not null and
        resume_delivery_attempted_at is not null and
        resume_delivery_sent_at is not null and
        resume_delivery_failed_at is null and
        resume_delivery_attempt_count between 1 and 5 and
        resume_delivery_failure_code is null
      ) or (
        resume_delivery_status = 'failed' and
        resume_delivery_channel is not null and
        resume_delivery_claim_id is not null and
        resume_delivery_claimed_at is not null and
        resume_delivery_claim_expires_at is not null and
        resume_delivery_attempted_at is not null and
        resume_delivery_sent_at is null and
        resume_delivery_failed_at is not null and
        resume_delivery_attempt_count between 1 and 5 and
        resume_delivery_failure_code in (
          'configuration_missing', 'request_rejected', 'rate_limited'
        )
      )
    );

comment on column public.ticket_intake_drafts.resume_delivery_status is
  'Resume-link outbox state. A sending row with outcome_unknown is deliberately not retryable because an external provider may have accepted the message.';
comment on column public.ticket_intake_drafts.resume_delivery_claim_id is
  'Service-only coordination identifier used to atomically complete the claimed delivery attempt.';
comment on column public.ticket_intake_drafts.resume_delivery_failure_code is
  'Bounded operational category only. Provider responses, recipient data and resume URLs are never stored here.';

create index ticket_intake_drafts_resume_delivery_queue_idx
  on public.ticket_intake_drafts (resume_delivery_status, updated_at desc)
  where ticket_uploaded_at is not null;

-- A replacement is staged separately when a confirmed ticket exists. This
-- keeps refresh, Back and upload failures pointed at the last verified object.
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

-- Contact changes invalidate any capability that may already have been sent.
-- The raw replacement capability is generated and retained only by the Edge
-- caller; this RPC receives and stores its SHA-256 hash.
revoke all on function public.save_ticket_intake_draft(
  uuid, text, bigint, text, text, smallint, smallint, jsonb
) from public, anon, authenticated, service_role;
drop function public.save_ticket_intake_draft(
  uuid, text, bigint, text, text, smallint, smallint, jsonb
);

create function public.save_ticket_intake_draft(
  p_id uuid,
  p_access_token_hash text,
  p_expected_revision bigint,
  p_email text,
  p_phone text,
  p_current_step smallint,
  p_completed_step smallint,
  p_draft_data jsonb,
  p_replacement_access_token_hash text
)
returns public.ticket_intake_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.ticket_intake_drafts%rowtype;
  saved public.ticket_intake_drafts%rowtype;
  rotate_capability boolean;
begin
  select * into existing
  from public.ticket_intake_drafts
  where id = p_id
    and access_token_hash = p_access_token_hash
    and status = 'active'
    and expires_at > now()
    and revision = p_expected_revision
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
  end if;

  rotate_capability := (
    existing.email is distinct from p_email or
    existing.phone is distinct from p_phone
  ) and (
    existing.resume_delivery_status <> 'pending' or
    existing.resume_delivery_attempt_count > 0
  );
  if rotate_capability and p_replacement_access_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REPLACEMENT_CAPABILITY_INVALID';
  end if;

  update public.ticket_intake_drafts
    set email = p_email,
        phone = p_phone,
        current_step = p_current_step,
        completed_step = greatest(completed_step, p_completed_step),
        draft_data = p_draft_data,
        access_token_hash = case
          when rotate_capability then p_replacement_access_token_hash
          else access_token_hash
        end,
        resume_delivery_status = case when rotate_capability then 'pending' else resume_delivery_status end,
        resume_delivery_generation = case
          when rotate_capability then resume_delivery_generation + 1
          else resume_delivery_generation
        end,
        resume_delivery_channel = case when rotate_capability then null else resume_delivery_channel end,
        resume_delivery_claim_id = case when rotate_capability then null else resume_delivery_claim_id end,
        resume_delivery_claimed_at = case when rotate_capability then null else resume_delivery_claimed_at end,
        resume_delivery_claim_expires_at = case when rotate_capability then null else resume_delivery_claim_expires_at end,
        resume_delivery_attempted_at = case when rotate_capability then null else resume_delivery_attempted_at end,
        resume_delivery_sent_at = case when rotate_capability then null else resume_delivery_sent_at end,
        resume_delivery_failed_at = case when rotate_capability then null else resume_delivery_failed_at end,
        resume_delivery_attempt_count = case when rotate_capability then 0 else resume_delivery_attempt_count end,
        resume_delivery_failure_code = case when rotate_capability then null else resume_delivery_failure_code end,
        revision = revision + 1,
        last_saved_at = now(),
        expires_at = now() + interval '30 days'
  where id = existing.id
  returning * into saved;

  return saved;
end;
$$;

revoke all on function public.save_ticket_intake_draft(
  uuid, text, bigint, text, text, smallint, smallint, jsonb, text
) from public, anon, authenticated;
grant execute on function public.save_ticket_intake_draft(
  uuid, text, bigint, text, text, smallint, smallint, jsonb, text
) to service_role;

-- Claiming is the only transition that authorizes a provider call. Initial
-- confirmation can claim pending, while the explicit retry action can claim a
-- definite failure. A sending state is never lease-reclaimed automatically:
-- expiry is operational evidence, not proof the provider did not accept it.
create or replace function public.claim_ticket_intake_resume_delivery(
  p_id uuid,
  p_access_token_hash text,
  p_claim_id uuid,
  p_retry boolean
)
returns public.ticket_intake_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft
  from public.ticket_intake_drafts
  where id = p_id
    and access_token_hash = p_access_token_hash
    and status in ('active', 'converted')
    and expires_at > now()
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_DELIVERY_ACCESS_DENIED';
  end if;
  if not draft.contact_permission or draft.ticket_uploaded_at is null then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_DELIVERY_NOT_READY';
  end if;

  if (
    (not p_retry and draft.resume_delivery_status <> 'pending') or
    (p_retry and draft.resume_delivery_status <> 'failed') or
    draft.resume_delivery_attempt_count >= 5
  ) then
    return draft;
  end if;

  update public.ticket_intake_drafts
    set resume_delivery_status = 'sending',
        resume_delivery_channel = case when email is not null then 'email' else 'sms' end,
        resume_delivery_claim_id = p_claim_id,
        resume_delivery_claimed_at = now(),
        resume_delivery_claim_expires_at = now() + interval '10 minutes',
        resume_delivery_attempted_at = now(),
        resume_delivery_sent_at = null,
        resume_delivery_failed_at = null,
        resume_delivery_attempt_count = resume_delivery_attempt_count + 1,
        resume_delivery_failure_code = null
  where id = draft.id
  returning * into draft;

  return draft;
end;
$$;

revoke all on function public.claim_ticket_intake_resume_delivery(
  uuid, text, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.claim_ticket_intake_resume_delivery(
  uuid, text, uuid, boolean
) to service_role;

create or replace function public.complete_ticket_intake_resume_delivery(
  p_id uuid,
  p_claim_id uuid,
  p_outcome text,
  p_failure_code text
)
returns public.ticket_intake_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft
  from public.ticket_intake_drafts
  where id = p_id
  for update;

  if not found or draft.resume_delivery_claim_id is distinct from p_claim_id then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_DELIVERY_CLAIM_LOST';
  end if;

  if draft.resume_delivery_status <> 'sending' then
    if (draft.resume_delivery_status = 'sent' and p_outcome = 'sent') or
       (draft.resume_delivery_status = 'failed' and p_outcome = 'failed' and
        draft.resume_delivery_failure_code is not distinct from p_failure_code) then
      return draft;
    end if;
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_DELIVERY_CLAIM_LOST';
  end if;

  if p_outcome = 'sent' and p_failure_code is null then
    update public.ticket_intake_drafts
      set resume_delivery_status = 'sent',
          resume_delivery_sent_at = now(),
          resume_delivery_failed_at = null,
          resume_delivery_failure_code = null
    where id = draft.id
    returning * into draft;
  elsif p_outcome = 'failed' and p_failure_code in (
    'configuration_missing', 'request_rejected', 'rate_limited'
  ) then
    update public.ticket_intake_drafts
      set resume_delivery_status = 'failed',
          resume_delivery_sent_at = null,
          resume_delivery_failed_at = now(),
          resume_delivery_failure_code = p_failure_code
    where id = draft.id
    returning * into draft;
  elsif p_outcome = 'indeterminate' and p_failure_code = 'outcome_unknown' then
    update public.ticket_intake_drafts
      set resume_delivery_status = 'sending',
          resume_delivery_sent_at = null,
          resume_delivery_failed_at = null,
          resume_delivery_failure_code = 'outcome_unknown'
    where id = draft.id
    returning * into draft;
  else
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_DELIVERY_OUTCOME_INVALID';
  end if;

  return draft;
end;
$$;

revoke all on function public.complete_ticket_intake_resume_delivery(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.complete_ticket_intake_resume_delivery(
  uuid, uuid, text, text
) to service_role;

-- Make upload confirmation idempotent under both sequential and concurrent
-- repeats. The first call advances the form revision; later calls return the
-- already-confirmed row without changing it.
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

-- Conversion is blocked while a replacement is pending. The final submission
-- must reference the newly confirmed object, never the prior confirmed file.
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
     draft.pending_ticket_document_path is not null or
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

commit;
