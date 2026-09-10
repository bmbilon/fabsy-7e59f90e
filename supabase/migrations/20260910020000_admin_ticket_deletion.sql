-- Recoverable staff deletion; payment records, files and case outcomes are retained.
begin;
alter table public.ticket_submissions
  add column deleted_at timestamptz,
  add column deleted_by uuid,
  add constraint ticket_submission_deletion_audit check ((deleted_at is null) = (deleted_by is null));
alter table public.ticket_intake_drafts
  add column deleted_at timestamptz,
  add column deleted_by uuid,
  add constraint ticket_intake_deletion_audit check ((deleted_at is null) = (deleted_by is null));
create index ticket_submissions_active_created on public.ticket_submissions(created_at desc) where deleted_at is null;
create table public.admin_ticket_deletion_events (
  id uuid primary key default gen_random_uuid(),
  record_kind text not null check(record_kind in ('submission','intake')),
  record_id uuid not null,
  action text not null check(action in ('delete','restore')),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.admin_ticket_deletion_events enable row level security;
revoke all on public.admin_ticket_deletion_events from public, anon, authenticated, service_role;
grant select on public.admin_ticket_deletion_events to authenticated;
create policy "Staff read ticket deletion history" on public.admin_ticket_deletion_events for select to authenticated using(public.is_idr_staff());

create function public.set_admin_ticket_deleted(p_id uuid, p_kind text, p_deleted boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_submission_id uuid; actor uuid := auth.uid(); stamp timestamptz := clock_timestamp();
begin
  if actor is null or not coalesce(public.is_idr_staff(),false) then
    raise exception using errcode='42501', message='TICKET_DELETE_STAFF_REQUIRED';
  end if;
  if p_id is null or p_kind is null or p_kind not in ('submission','intake') or p_deleted is null then
    raise exception using errcode='22023', message='TICKET_DELETE_INPUT_INVALID';
  end if;
  if p_kind='submission' then
    v_submission_id := p_id;
  else
    -- Lock the submission before its drafts, for the same ordering from either UI entry point.
    select converted_submission_id into v_submission_id from public.ticket_intake_drafts where id=p_id;
    if not found then raise exception 'TICKET_DELETE_NOT_FOUND'; end if;
  end if;
  if v_submission_id is not null then
    perform 1 from public.ticket_submissions where id=v_submission_id for update;
    if not found then raise exception 'TICKET_DELETE_NOT_FOUND'; end if;
    update public.ticket_submissions set deleted_at=case when p_deleted then stamp end,
      deleted_by=case when p_deleted then actor end
      where id=v_submission_id and (deleted_at is not null) is distinct from p_deleted;
  end if;
  update public.ticket_intake_drafts set deleted_at=case when p_deleted then stamp end,
    deleted_by=case when p_deleted then actor end
    where (converted_submission_id=v_submission_id or (p_kind='intake' and id=p_id))
      and (deleted_at is not null) is distinct from p_deleted;

  if p_deleted then
    -- Cancel unsent notices. Already sent records remain as delivery evidence.
    update public.disclosure_notification_outbox set status='needs_review',claim_token=null,lease_until=null,
      last_error='Ticket deleted by staff.'
      where submission_id=v_submission_id and status in ('pending','processing');
    update public.ticket_upload_alerts set status='failed',failure_code='ticket_deleted',claim_id=null,claim_expires_at=null
      where draft_id in (select id from public.ticket_intake_drafts where deleted_at is not null and
        (converted_submission_id=v_submission_id or (p_kind='intake' and id=p_id)))
        and status in ('pending','retry','sending');
  end if;
end $$;
revoke all on function public.set_admin_ticket_deleted(uuid,text,boolean) from public, anon, service_role;
grant execute on function public.set_admin_ticket_deleted(uuid,text,boolean) to authenticated;

-- Table UPDATE grants must not provide an unaudited alternative to the staff RPC.
create function public.guard_admin_ticket_deletion() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare rpc_owner name;
begin
  select r.rolname into rpc_owner from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='public.set_admin_ticket_deleted(uuid,text,boolean)'::regprocedure;
  if (tg_op='INSERT' and new.deleted_at is not null) or
     (tg_op='UPDATE' and (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by)) then
    if current_user <> rpc_owner or auth.uid() is null or not coalesce(public.is_idr_staff(),false) then
      raise exception using errcode='42501', message='USE_TICKET_DELETION_ACTION';
    end if;
    insert into public.admin_ticket_deletion_events(record_kind,record_id,action,actor_id)
      values(case when tg_table_name='ticket_submissions' then 'submission' else 'intake' end,new.id,
        case when new.deleted_at is null then 'restore' else 'delete' end,auth.uid());
  elsif tg_op='UPDATE' and old.deleted_at is not null and current_user='authenticated' then
    raise exception using errcode='42501', message='RESTORE_TICKET_BEFORE_EDITING';
  end if;
  return new;
end $$;
create trigger guard_admin_ticket_deletion before insert or update on public.ticket_submissions
  for each row execute function public.guard_admin_ticket_deletion();
create trigger guard_admin_ticket_deletion before insert or update on public.ticket_intake_drafts
  for each row execute function public.guard_admin_ticket_deletion();
revoke all on function public.guard_admin_ticket_deletion() from public, anon, authenticated, service_role;
create policy "Deleted tickets visible only to staff" on public.ticket_submissions as restrictive for select to authenticated
  using(deleted_at is null or public.is_idr_staff());
comment on column public.ticket_submissions.deleted_at is 'Recoverable staff deletion from admin queues; financial records and case history are retained.';

create or replace function public.match_disclosure_confirmation(p_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare item public.disclosure_confirmations%rowtype; ticket public.ticket_submissions%rowtype;
  client public.clients%rowtype; matches uuid[]; reason text;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not coalesce(public.is_idr_staff(),false) then raise exception 'STAFF_REQUIRED'; end if;
  select * into item from public.disclosure_confirmations where id=p_id for update;
  if not found then raise exception 'CONFIRMATION_NOT_FOUND'; end if;
  if item.status in ('matched','duplicate') then return item.status; end if;
  if item.parse_error is not null then
    update public.disclosure_confirmations set status='needs_review',review_reason=item.parse_error,updated_at=now() where id=p_id;
    return 'needs_review';
  end if;
  -- Include ALL representation matches before checking state: do not pick one of two matching records.
  select array_agg(id) into matches from public.ticket_submissions
    where deleted_at is null and service_type='representation' and regexp_replace(upper(ticket_number),'[^A-Z0-9]','','g')=item.ticket_number;
  if coalesce(cardinality(matches),0)=0 then reason := 'No exact representation case found. Correct or create the case, then retry matching.';
  elsif cardinality(matches)>1 then reason := 'Multiple representation cases have this ticket number. Resolve the duplicate records before retrying.';
  else
    select * into ticket from public.ticket_submissions where id=matches[1] for share;
    select * into client from public.clients where id=ticket.client_id for share;
    if ticket.deleted_at is not null or ticket.status not in ('pending','in_progress') or ticket.case_outcome is not null then
      reason := 'Case is unpaid, closed or outside the active representation workflow.';
    elsif ticket.representation_paid_at is null and not exists (
      select 1 from public.idr_checkout_intents where ticket_submission_id=ticket.id and client_id=ticket.client_id
        and status='paid' and checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
    ) then reason := 'Representation payment is not recorded. Verify payment before retrying.';
    elsif client.id is null or coalesce(client.email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      reason := 'The matched case has no valid client email.';
    end if;
  end if;
  if reason is not null then
    update public.disclosure_confirmations set status='needs_review',review_reason=reason,updated_at=now() where id=p_id;
    return 'needs_review';
  end if;
  -- Serializes independent provider IDs acknowledging the same case on the same day.
  perform pg_advisory_xact_lock(hashtextextended(ticket.id::text || ':' || item.confirmed_on::text,0));
  if exists(select 1 from public.disclosure_confirmations where submission_id=ticket.id and confirmed_on=item.confirmed_on and status='matched') then
    update public.disclosure_confirmations set status='duplicate',submission_id=ticket.id,
      review_reason='A confirmation is already recorded for this case and date.',updated_at=now() where id=p_id;
    return 'duplicate';
  end if;
  update public.disclosure_confirmations set status='matched',submission_id=ticket.id,review_reason=null,updated_at=now() where id=p_id;
  insert into public.disclosure_notification_outbox(confirmation_id,submission_id,snapshot)
    values(p_id,ticket.id,jsonb_build_object('recipient',client.email,'first_name',client.first_name,
      'ticket_number',item.ticket_number,'confirmed_on',item.confirmed_on,'timeframe_text',item.timeframe_text,'submission_id',ticket.id));
  return 'matched';
end $$;


create or replace function public.enqueue_ticket_upload_alert(p_draft_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  draft public.ticket_intake_drafts%rowtype;
  notice_id uuid;
begin
  select * into draft from public.ticket_intake_drafts where id = p_draft_id for share;
  if not found or draft.deleted_at is not null or draft.ticket_uploaded_at is null or not draft.contact_permission
     or draft.status not in ('active','converted') or draft.expires_at <= clock_timestamp() then
    return null;
  end if;
  insert into public.ticket_upload_alerts (draft_id, object_fingerprint, uploaded_at, contact_snapshot)
  values (draft.id, encode(sha256(convert_to(draft.ticket_document_path, 'UTF8')), 'hex'), draft.ticket_uploaded_at,
    jsonb_build_object('firstName', left(coalesce(draft.draft_data->>'firstName',''),120),
      'lastName', left(coalesce(draft.draft_data->>'lastName',''),120),
      'email', draft.email, 'phone', draft.phone, 'preferredLocale', draft.preferred_locale))
  on conflict (draft_id, object_fingerprint) do nothing
  returning id into notice_id;
  return notice_id;
end $$;


create or replace function public.ate_first_twenty_metrics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_idr_staff() then raise exception 'ATE_STAFF_REQUIRED'; end if;
  with cohort as (
    select r.* from public.ticket_submissions t join public.ate_reviews r on r.ticket_submission_id=t.id
    where t.deleted_at is null and t.ticket_type='photo_radar' and t.representation_paid_at is not null
    order by t.representation_paid_at,t.id limit 20
  ), stats as (
    select count(*) as files,count(*) filter(where resolved_at is not null) as resolved,
      percentile_cont(0.5) within group(order by greatest(original_fine_cents-final_fine_cents,0)/100.0)
        filter(where resolved_at is not null) as median_reduction_cad from cohort
  ) select jsonb_build_object('cohort_count',files,'resolved_count',resolved,'pending_count',files-resolved,
    'median_reduction_cad',median_reduction_cad,'below_40',median_reduction_cad<40,'cohort_complete',files=20 and resolved=20)
    into result from stats;
  return result;
end;
$$;
revoke all on function public.ate_first_twenty_metrics() from public,anon;
grant execute on function public.ate_first_twenty_metrics() to authenticated;


notify pgrst, 'reload schema';
commit;
