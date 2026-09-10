-- Save and deliver recoverable contact access before the ticket upload wall.
-- A draft is still not a client, case, representation agreement or authority
-- to act. Final conversion continues to require a confirmed private ticket.

begin;

drop index if exists public.ticket_intake_drafts_staff_follow_up_queue_idx;
create index ticket_intake_drafts_staff_follow_up_queue_idx
  on public.ticket_intake_drafts (staff_follow_up_status, updated_at desc)
  where status in ('active', 'converted')
    and contact_permission
    and (email is not null or phone is not null);

comment on column public.ticket_intake_drafts.staff_follow_up_status is
  'Staff-only operational disposition for a consented incomplete intake, including contact saved before ticket upload. This does not authorize representation or trigger marketing.';

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
  if not draft.contact_permission then
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

comment on function public.claim_ticket_intake_resume_delivery(uuid, text, uuid, boolean) is
  'Claims one consented secure resume-link delivery. Ticket upload is not required; case conversion still requires a confirmed private ticket.';

create or replace function public.set_ticket_intake_follow_up_status(
  p_id uuid,
  p_expected_status text,
  p_status text
)
returns table (
  draft_id uuid,
  follow_up_status text,
  follow_up_updated_at timestamptz,
  follow_up_updated_by uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  staff_user_id uuid := auth.uid();
begin
  if staff_user_id is null or not coalesce(public.is_idr_staff(), false) then
    raise exception using
      errcode = '42501',
      message = 'TICKET_INTAKE_FOLLOW_UP_STAFF_REQUIRED';
  end if;

  if p_expected_status is null or
     p_expected_status not in ('open', 'contacted', 'dismissed') or
     p_status is null or
     p_status not in ('open', 'contacted', 'dismissed') then
    raise exception using
      errcode = '22023',
      message = 'TICKET_INTAKE_FOLLOW_UP_STATUS_INVALID';
  end if;

  return query
  update public.ticket_intake_drafts as draft
  set staff_follow_up_status = p_status,
      staff_follow_up_updated_at = case
        when draft.staff_follow_up_status is distinct from p_status
          then clock_timestamp()
        else draft.staff_follow_up_updated_at
      end,
      staff_follow_up_updated_by = case
        when draft.staff_follow_up_status is distinct from p_status
          then staff_user_id
        else draft.staff_follow_up_updated_by
      end
  where draft.id = p_id
    and draft.status in ('active', 'converted')
    and draft.contact_permission
    and (draft.email is not null or draft.phone is not null)
    and draft.expires_at > clock_timestamp()
    and draft.staff_follow_up_status = p_expected_status
  returning
    draft.id,
    draft.staff_follow_up_status,
    draft.staff_follow_up_updated_at,
    draft.staff_follow_up_updated_by;

  if not found then
    if exists (
      select 1
      from public.ticket_intake_drafts as available
      where available.id = p_id
        and available.status in ('active', 'converted')
        and available.contact_permission
        and (available.email is not null or available.phone is not null)
        and available.expires_at > clock_timestamp()
    ) then
      raise exception using
        errcode = '40001',
        message = 'TICKET_INTAKE_FOLLOW_UP_CONFLICT';
    end if;
    raise exception using
      errcode = 'P0001',
      message = 'TICKET_INTAKE_FOLLOW_UP_NOT_AVAILABLE';
  end if;
end;
$$;

revoke all on function public.set_ticket_intake_follow_up_status(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.set_ticket_intake_follow_up_status(uuid, text, text)
  to authenticated;

comment on function public.set_ticket_intake_follow_up_status(uuid, text, text) is
  'Authenticated-staff-only, audited disposition update for a live consented incomplete intake, including contact saved before ticket upload.';

commit;
