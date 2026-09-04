-- Give authenticated Fabsy staff a small, audited lifecycle for incomplete
-- uploaded intakes. This records queue disposition only; it never changes the
-- customer's consent, resume capability, delivery counters, or case status.

begin;

alter table public.ticket_intake_drafts
  add column staff_follow_up_status text not null default 'open',
  add column staff_follow_up_updated_at timestamptz,
  add column staff_follow_up_updated_by uuid;

alter table public.ticket_intake_drafts
  add constraint ticket_intake_drafts_staff_follow_up_status_check
    check (staff_follow_up_status in ('open', 'contacted', 'dismissed')),
  add constraint ticket_intake_drafts_staff_follow_up_audit_check
    check (
      (staff_follow_up_status = 'open' and
        ((staff_follow_up_updated_at is null and staff_follow_up_updated_by is null) or
         (staff_follow_up_updated_at is not null and staff_follow_up_updated_by is not null))) or
      (staff_follow_up_status in ('contacted', 'dismissed') and
        staff_follow_up_updated_at is not null and staff_follow_up_updated_by is not null)
    );

create index ticket_intake_drafts_staff_follow_up_queue_idx
  on public.ticket_intake_drafts (staff_follow_up_status, updated_at desc)
  where ticket_uploaded_at is not null and status in ('active', 'converted');

comment on column public.ticket_intake_drafts.staff_follow_up_status is
  'Staff-only operational disposition for an incomplete uploaded intake. This does not grant consent, authorize representation, or trigger delivery.';
comment on column public.ticket_intake_drafts.staff_follow_up_updated_at is
  'Timestamp of the most recent explicit staff disposition change.';
comment on column public.ticket_intake_drafts.staff_follow_up_updated_by is
  'Authenticated staff user who made the most recent disposition change. Deliberately has no auth.users FK so account deletion cannot block draft retention cleanup.';

create function public.set_ticket_intake_follow_up_status(
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
    and draft.ticket_uploaded_at is not null
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
        and available.ticket_uploaded_at is not null
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

comment on function public.set_ticket_intake_follow_up_status(uuid, text, text) is
  'Authenticated-staff-only, audited disposition update for a live incomplete uploaded intake. It does not send a message or expose a resume capability.';

revoke all on function public.set_ticket_intake_follow_up_status(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.set_ticket_intake_follow_up_status(uuid, text, text)
  to authenticated;

commit;
