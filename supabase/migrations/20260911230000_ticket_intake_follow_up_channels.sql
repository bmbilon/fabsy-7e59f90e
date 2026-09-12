begin;

alter table public.ticket_intake_drafts
  add column follow_up_email_sent_at timestamptz,
  add column follow_up_email_sent_by uuid,
  add column follow_up_phone_called_at timestamptz,
  add column follow_up_phone_called_by uuid,
  add constraint ticket_intake_follow_up_email_audit_check
    check (follow_up_email_sent_at is not null or follow_up_email_sent_by is null),
  add constraint ticket_intake_follow_up_phone_audit_check
    check ((follow_up_phone_called_at is null) = (follow_up_phone_called_by is null));

comment on column public.ticket_intake_drafts.follow_up_email_sent_at is
  'First recorded customer follow-up email: provider-confirmed abandoned-intake send or explicit staff record. Not an internal upload alert or secure resume-link email.';
comment on column public.ticket_intake_drafts.follow_up_email_sent_by is
  'Staff actor for a manually recorded first follow-up email; null for an automatic provider receipt. No auth.users FK so account deletion does not block intake retention cleanup.';
comment on column public.ticket_intake_drafts.follow_up_phone_called_at is
  'First phone follow-up explicitly recorded by staff. Recording this never makes a call.';
comment on column public.ticket_intake_drafts.follow_up_phone_called_by is
  'Authenticated staff actor who first recorded the phone call. No auth.users FK so account deletion does not block intake retention cleanup.';

create function public.record_ticket_intake_follow_up(p_id uuid,p_expected_status text,p_channel text)
returns table (
  draft_id uuid,
  follow_up_status text,
  follow_up_updated_at timestamptz,
  follow_up_updated_by uuid,
  follow_up_email_sent_at timestamptz,
  follow_up_email_sent_by uuid,
  follow_up_phone_called_at timestamptz,
  follow_up_phone_called_by uuid
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  draft public.ticket_intake_drafts%rowtype;
  stamp timestamptz;
begin
  if actor is null or not coalesce(public.is_idr_staff(),false) then
    raise exception using errcode='42501',message='TICKET_INTAKE_FOLLOW_UP_STAFF_REQUIRED';
  end if;
  if p_id is null or p_expected_status is null or p_expected_status not in ('open','contacted','dismissed') or
    p_channel is null or p_channel not in ('email','phone') then
    raise exception using errcode='22023',message='TICKET_INTAKE_FOLLOW_UP_INPUT_INVALID';
  end if;
  -- Serialize staff actions and automatic receipt updates on the same intake.
  -- Validate expiry after acquiring the lock, including requests that had to wait.
  select * into draft from public.ticket_intake_drafts where id=p_id for update;
  if not found or draft.deleted_at is not null or draft.status not in ('active','converted') or
    draft.expires_at<=clock_timestamp() or draft.staff_follow_up_status='dismissed' or
    not draft.contact_permission or (draft.email is null and draft.phone is null) then
    raise exception using errcode='P0001',message='TICKET_INTAKE_FOLLOW_UP_NOT_AVAILABLE';
  end if;
  if draft.staff_follow_up_status<>p_expected_status then
    raise exception using errcode='40001',message='TICKET_INTAKE_FOLLOW_UP_CONFLICT';
  end if;
  if draft.staff_follow_up_status<>'contacted' or
    (p_channel='email' and draft.follow_up_email_sent_at is null) or
    (p_channel='phone' and draft.follow_up_phone_called_at is null) then
    stamp:=clock_timestamp();
    update public.ticket_intake_drafts d set
      staff_follow_up_status='contacted',staff_follow_up_updated_at=stamp,staff_follow_up_updated_by=actor,
      follow_up_email_sent_at=case when p_channel='email' and d.follow_up_email_sent_at is null then stamp else d.follow_up_email_sent_at end,
      follow_up_email_sent_by=case when p_channel='email' and d.follow_up_email_sent_at is null then actor else d.follow_up_email_sent_by end,
      follow_up_phone_called_at=case when p_channel='phone' and d.follow_up_phone_called_at is null then stamp else d.follow_up_phone_called_at end,
      follow_up_phone_called_by=case when p_channel='phone' and d.follow_up_phone_called_at is null then actor else d.follow_up_phone_called_by end
      where d.id=p_id returning d.* into draft;
  end if;
  return query select draft.id,draft.staff_follow_up_status,draft.staff_follow_up_updated_at,draft.staff_follow_up_updated_by,
    draft.follow_up_email_sent_at,draft.follow_up_email_sent_by,draft.follow_up_phone_called_at,draft.follow_up_phone_called_by;
end $$;

revoke all on function public.record_ticket_intake_follow_up(uuid,text,text) from public,anon,service_role;
grant execute on function public.record_ticket_intake_follow_up(uuid,text,text) to authenticated;
comment on function public.record_ticket_intake_follow_up(uuid,text,text) is
  'Staff-only audited record of an email already sent or phone call already made. Supports contact-only intakes, preserves first channel evidence, and performs no delivery.';

create function public.record_abandoned_ticket_email_receipt()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status='sent' and new.sent_at is not null and nullif(btrim(new.provider_email_id),'') is not null then
    -- Preserve staff disposition, actor, deletion, phone history and draft revision.
    -- A receipt remains factual even if staff dismissed/deleted the intake while
    -- the provider request was completing. Never invent a staff actor for it.
    update public.ticket_intake_drafts d set follow_up_email_sent_at=new.sent_at
      where d.id=new.draft_id and d.follow_up_email_sent_at is null;
  end if;
  return new;
end $$;
revoke all on function public.record_abandoned_ticket_email_receipt() from public,anon,authenticated,service_role;
create trigger record_abandoned_ticket_email_receipt
  after insert or update of status,sent_at,provider_email_id on public.abandoned_ticket_emails
  for each row execute function public.record_abandoned_ticket_email_receipt();

-- Existing provider-confirmed sends appear immediately. This does not enqueue
-- work or modify any outbox status, payment state, or staff disposition.
update public.ticket_intake_drafts d set follow_up_email_sent_at=a.sent_at
  from public.abandoned_ticket_emails a
  where a.draft_id=d.id and a.status='sent' and a.sent_at is not null
    and nullif(btrim(a.provider_email_id),'') is not null and d.follow_up_email_sent_at is null;

-- The existing table SELECT grant covers new columns and remains protected by
-- the staff-only RLS policy. No public grants or outbox grants are broadened.
commit;
