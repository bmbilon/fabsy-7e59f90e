-- Make client-retained contact-change capability rotation safe when the save
-- commits but its HTTP response is lost. No raw capability is persisted.

begin;

create or replace function public.save_ticket_intake_draft(
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
  replay_after_rotation boolean;
begin
  if p_replacement_access_token_hash is not null and (
     p_replacement_access_token_hash !~ '^[0-9a-f]{64}$' or
     p_replacement_access_token_hash = p_access_token_hash
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'TICKET_INTAKE_REPLACEMENT_CAPABILITY_INVALID';
  end if;

  select * into existing
  from public.ticket_intake_drafts
  where id = p_id
    and status = 'active'
    and expires_at > now()
    and (
      (
        access_token_hash = p_access_token_hash and
        revision = p_expected_revision
      ) or (
        access_token_hash = p_replacement_access_token_hash and
        revision = p_expected_revision + 1
      )
    )
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
  end if;

  replay_after_rotation :=
    existing.access_token_hash = p_replacement_access_token_hash and
    existing.revision = p_expected_revision + 1;

  if replay_after_rotation then
    -- The candidate authenticates only the immediately committed next
    -- revision. Return it unchanged only when it is the exact state requested
    -- by the lost call; otherwise preserve normal revision-conflict behavior.
    if existing.email is distinct from p_email or
       existing.phone is distinct from p_phone or
       existing.current_step is distinct from p_current_step or
       existing.completed_step < p_completed_step or
       existing.draft_data is distinct from p_draft_data or
       existing.resume_delivery_status <> 'pending' or
       existing.resume_delivery_channel is not null or
       existing.resume_delivery_claim_id is not null or
       existing.resume_delivery_attempt_count <> 0 then
      raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_REVISION_CONFLICT';
    end if;
    return existing;
  end if;

  rotate_capability := (
    existing.email is distinct from p_email or
    existing.phone is distinct from p_phone
  ) and (
    existing.resume_delivery_status <> 'pending' or
    existing.resume_delivery_attempt_count > 0
  );

  -- A legacy frontend has no response-loss-safe candidate. NULL permits its
  -- ordinary saves during staged rollout, but fails closed if a concurrent
  -- delivery claim makes this contact edit require rotation.
  if rotate_capability and p_replacement_access_token_hash is null then
    raise exception using
      errcode = 'P0001',
      message = 'TICKET_INTAKE_REPLACEMENT_CAPABILITY_INVALID';
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

commit;
