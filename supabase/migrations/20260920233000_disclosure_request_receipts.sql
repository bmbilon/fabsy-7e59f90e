begin;

alter table public.disclosure_automation_state add column inbox_poll_cursor jsonb;
comment on column public.disclosure_automation_state.inbox_poll_cursor is
  'Private bounded Gmail polling cursor: fixed query window, page token and remaining message IDs. Updated by compare-and-swap only after successful ingestion.';

-- A request receipt is distinct from Crown email and from receipt of evidence.
-- One immutable fact per ticket also deduplicates later acknowledgements/dates.
create table public.disclosure_request_receipts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.ticket_submissions(id) on delete restrict,
  ticket_number text not null unique check(ticket_number ~ '^[A-Z0-9]{5,30}$' and ticket_number ~ '[0-9]'),
  source text not null check(source in ('portal','manual','inbound')),
  source_key text not null check(length(source_key) between 1 and 500),
  confirmed_at timestamptz not null,
  evidence_reference text not null check(length(evidence_reference) between 1 and 1000),
  evidence_sha256 text check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  portal_session_id uuid,
  confirmation_id uuid references public.disclosure_confirmations(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid,
  status_sync text not null,
  staff_stage_before text,
  staff_version_before integer not null,
  staff_version_after integer not null,
  unique(source,source_key)
);
alter table public.disclosure_request_receipts enable row level security;
revoke all on public.disclosure_request_receipts from public,anon,authenticated,service_role;
grant select on public.disclosure_request_receipts to authenticated,service_role;
create policy staff_read_disclosure_request_receipts on public.disclosure_request_receipts
  for select to authenticated using(public.is_idr_staff());

alter table public.disclosure_notification_outbox alter column confirmation_id drop not null;
alter table public.disclosure_notification_outbox add column request_receipt_id uuid unique
  references public.disclosure_request_receipts(id) on delete restrict;
alter table public.disclosure_notification_outbox add constraint disclosure_notice_source_required
  check(confirmation_id is not null or request_receipt_id is not null);
-- Estimates are optional facts, never a prerequisite for a verified request.
alter table public.disclosure_confirmations drop constraint disclosure_confirmations_check;
alter table public.disclosure_confirmations add constraint disclosure_confirmations_check
  check(status <> 'matched' or (submission_id is not null and confirmed_at is not null and parse_error is null));

create function public.record_disclosure_request_receipt(
  p_submission_id uuid,p_ticket_number text,p_source text,p_source_key text,
  p_confirmed_at timestamptz,p_evidence_reference text,p_evidence_sha256 text default null,
  p_portal_session_id uuid default null,p_confirmation_id uuid default null,
  p_request_confirmed boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  ticket public.ticket_submissions%rowtype; client public.clients%rowtype;
  receipt public.disclosure_request_receipts%rowtype; confirmation public.disclosure_confirmations%rowtype;
  normalized text:=regexp_replace(upper(p_ticket_number),'[^A-Z0-9]','','g');
  staff jsonb; stage text; before_version integer; after_version integer; sync_result text;
  notice_id uuid; inserted boolean:=false; actor uuid:=auth.uid();
begin
  if coalesce(auth.role(),'') <> 'service_role' and not coalesce(public.is_idr_staff(),false) then
    raise exception 'STAFF_REQUIRED' using errcode='42501';
  end if;
  if p_source is null or p_source not in ('portal','manual','inbound') or p_submission_id is null
    or normalized is null or normalized !~ '^[A-Z0-9]{5,30}$' or normalized !~ '[0-9]'
    or p_source_key is null or length(btrim(p_source_key)) not between 1 and 500
    or p_confirmed_at is null or p_confirmed_at>clock_timestamp()+interval '5 minutes'
    or p_evidence_reference is null or length(btrim(p_evidence_reference)) not between 1 and 1000 then
    raise exception 'DISCLOSURE_RECEIPT_INPUT_INVALID';
  end if;
  if p_source='portal' and (coalesce(auth.role(),'')<>'service_role' or p_portal_session_id is null) then
    raise exception 'PORTAL_RECEIPT_OPERATOR_SESSION_REQUIRED' using errcode='42501';
  end if;
  if p_source in ('portal','manual') and (p_request_confirmed is distinct from true
    or p_evidence_sha256 is null or p_evidence_sha256 !~ '^[a-f0-9]{64}$') then
    raise exception 'ACTUAL_DISCLOSURE_RECEIPT_REQUIRED';
  end if;
  if p_source='inbound' then
    select * into confirmation from public.disclosure_confirmations where id=p_confirmation_id;
    if not found or confirmation.status<>'matched' or confirmation.parse_error is not null
      or confirmation.submission_id is distinct from p_submission_id
      or confirmation.confirmed_at is distinct from p_confirmed_at
      or regexp_replace(upper(confirmation.ticket_number),'[^A-Z0-9]','','g') is distinct from normalized
      or confirmation.source_message_id is distinct from p_source_key then
      raise exception 'MATCHED_DISCLOSURE_CONFIRMATION_REQUIRED';
    end if;
  elsif p_confirmation_id is not null then
    raise exception 'DISCLOSURE_RECEIPT_SOURCE_INVALID';
  end if;

  -- Ticket identity first, then the same canonical lock used by staff updates.
  perform pg_advisory_xact_lock(hashtextextended(normalized,731904220::bigint));
  perform pg_advisory_xact_lock(hashtextextended('submission'||p_submission_id::text,731904219::bigint));
  select * into ticket from public.ticket_submissions where id=p_submission_id for share;
  if not found or ticket.service_type<>'representation'
    or regexp_replace(upper(ticket.ticket_number),'[^A-Z0-9]','','g') is distinct from normalized then
    raise exception 'DISCLOSURE_RECEIPT_CASE_MISMATCH';
  end if;
  select * into receipt from public.disclosure_request_receipts
    where ticket_number=normalized or submission_id=p_submission_id;
  if found and (receipt.submission_id<>p_submission_id or receipt.ticket_number<>normalized) then
    raise exception 'DISCLOSURE_RECEIPT_CASE_CONFLICT';
  end if;
  if not found then
    staff:=public.disclosure_approval_staff_state(p_submission_id);
    stage:=staff->>'stage'; before_version:=(staff->>'version')::integer; after_version:=before_version;
    if ticket.deleted_at is not null then sync_result:='held_deleted';
    elsif ticket.case_outcome is not null or ticket.status not in ('pending','in_progress') then sync_result:='held_inactive';
    elsif staff->'ambiguous'='true'::jsonb then sync_result:='held_ambiguous';
    elsif stage='disclosure_requested' then sync_result:='already_requested';
    elsif stage is not null and stage not in ('partial','paid') then sync_result:='held_later_stage';
    else sync_result:='advanced'; after_version:=before_version+1;
    end if;
    insert into public.disclosure_request_receipts(submission_id,ticket_number,source,source_key,
      confirmed_at,evidence_reference,evidence_sha256,portal_session_id,confirmation_id,recorded_by,
      status_sync,staff_stage_before,staff_version_before,staff_version_after)
    values(p_submission_id,normalized,p_source,p_source_key,p_confirmed_at,btrim(p_evidence_reference),
      p_evidence_sha256,p_portal_session_id,p_confirmation_id,actor,sync_result,stage,before_version,after_version)
    returning * into receipt;
    inserted:=true;
    if sync_result='advanced' then
      insert into public.admin_ticket_case_status(kind,ticket_id,stage,version,updated_at,updated_by,note)
      values('submission',p_submission_id,'disclosure_requested',after_version,clock_timestamp(),actor,
        'Confirmed disclosure request receipt '||receipt.id::text)
      on conflict(kind,ticket_id) do update set stage=excluded.stage,version=excluded.version,
        updated_at=excluded.updated_at,updated_by=excluded.updated_by,note=excluded.note;
    end if;
  end if;

  -- Reuse any existing notice, including sent, frozen or uncertain attempts.
  -- A later date/provider message must never create another customer email.
  -- Share the claim lock before touching outbox rows to avoid lock inversion.
  perform pg_advisory_xact_lock(hashtextextended('disclosure-notice-outbox',731904221::bigint));
  select o.id into notice_id from public.disclosure_notification_outbox o
    where o.submission_id=p_submission_id or regexp_replace(upper(o.snapshot->>'ticket_number'),'[^A-Z0-9]','','g')=normalized
    order by (o.status='sent') desc,(o.first_attempt_at is not null) desc,o.created_at,o.id
    limit 1 for update;
  if notice_id is not null then
    update public.disclosure_notification_outbox set request_receipt_id=receipt.id
      where id=notice_id and request_receipt_id is null;
    update public.disclosure_notification_outbox set status='needs_review',claim_token=null,lease_until=null,
      last_error='Duplicate disclosure notice held; an earlier case notice already exists.'
      where id<>notice_id and status in ('pending','processing') and (submission_id=p_submission_id
        or regexp_replace(upper(snapshot->>'ticket_number'),'[^A-Z0-9]','','g')=normalized);
  elsif inserted then
    select * into client from public.clients where id=ticket.client_id for share;
    insert into public.disclosure_notification_outbox(confirmation_id,request_receipt_id,submission_id,snapshot,status,last_error)
    values(p_confirmation_id,receipt.id,p_submission_id,
      jsonb_build_object('recipient',client.email,'first_name',client.first_name,'ticket_number',normalized,
        'submission_id',p_submission_id,'confirmed_on',(p_confirmed_at at time zone 'America/Edmonton')::date),
      case when ticket.deleted_at is null and ticket.status in ('pending','in_progress') and ticket.case_outcome is null
        and coalesce(client.email,'') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        and receipt.status_sync<>'held_ambiguous'
        and coalesce(receipt.staff_stage_before,'') not in
          ('done_reduced','done_withdrawn','lapsed_expired','trial_concluded_reduced','trial_concluded_upheld') then 'pending' else 'needs_review' end,
      case when ticket.deleted_at is null and ticket.status in ('pending','in_progress') and ticket.case_outcome is null
        and coalesce(client.email,'') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        and receipt.status_sync<>'held_ambiguous'
        and coalesce(receipt.staff_stage_before,'') not in
          ('done_reduced','done_withdrawn','lapsed_expired','trial_concluded_reduced','trial_concluded_upheld') then null else 'Case state or recipient needs review before a disclosure notice.' end)
    returning id into notice_id;
  end if;
  return jsonb_build_object('receipt_id',receipt.id,'created',inserted,'status_sync',receipt.status_sync,
    'submission_id',receipt.submission_id,'ticket_number',receipt.ticket_number,
    'source',receipt.source,'portal_session_id',receipt.portal_session_id,'confirmed_at',receipt.confirmed_at,
    'staff_stage_before',receipt.staff_stage_before,'staff_version_before',receipt.staff_version_before,
    'staff_version_after',receipt.staff_version_after,'outbox_id',notice_id);
end $$;
revoke all on function public.record_disclosure_request_receipt(uuid,text,text,text,timestamptz,text,text,uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.record_disclosure_request_receipt(uuid,text,text,text,timestamptz,text,text,uuid,uuid,boolean)
  to authenticated,service_role;

create function public.record_matched_disclosure_request() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform public.record_disclosure_request_receipt(new.submission_id,new.ticket_number,'inbound',
    new.source_message_id,new.confirmed_at,'disclosure_confirmations:'||new.id::text,
    null,null,new.id,false);
  return new;
end $$;
revoke all on function public.record_matched_disclosure_request() from public,anon,authenticated,service_role;
create trigger record_matched_disclosure_request after insert or update of status,submission_id,confirmed_at
  on public.disclosure_confirmations for each row when(new.status='matched')
  execute function public.record_matched_disclosure_request();

comment on table public.disclosure_request_receipts is
  'Actual confirmed requests only, never a new filing or receipt of complete evidence. Staff status advances once; immutable receipts prevent refiling and duplicate notices.';

create function public.get_case_disclosure_requests(p_submission_id uuid)
returns table(id uuid,confirmed_on date,source text,ticket_number text,notification_status text,sent_at timestamptz)
language sql stable security definer set search_path=public as $$
  with allowed as (
    select t.id from public.ticket_submissions t where t.id=p_submission_id and (
      public.is_idr_staff() or (t.deleted_at is null and exists(select 1 from public.clients c
        where c.id=t.client_id and c.auth_user_id=auth.uid())))
  ), receipts as (
    select r.id,(r.confirmed_at at time zone 'America/Edmonton')::date as confirmed_on,
      r.source,r.ticket_number,o.status as notification_status,o.sent_at
    from public.disclosure_request_receipts r left join public.disclosure_notification_outbox o on o.request_receipt_id=r.id
    where r.submission_id in (select id from allowed)
  )
  select * from receipts
  union all
  (select d.id,d.confirmed_on,'inbound'::text,d.ticket_number,o.status,o.sent_at
    from public.disclosure_confirmations d left join public.disclosure_notification_outbox o on o.confirmation_id=d.id
    where d.submission_id in (select id from allowed) and d.status='matched' and not exists(select 1 from receipts)
    order by d.confirmed_at,d.id limit 1);
$$;
revoke all on function public.get_case_disclosure_requests(uuid) from public,anon,authenticated;
grant execute on function public.get_case_disclosure_requests(uuid) to authenticated,service_role;

create or replace function public.match_disclosure_confirmation(p_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare item public.disclosure_confirmations%rowtype; ticket public.ticket_submissions%rowtype;
  client public.clients%rowtype; matches uuid[]; reason text; prior_confirmation public.disclosure_confirmations%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not coalesce(public.is_idr_staff(),false) then raise exception 'STAFF_REQUIRED'; end if;
  select * into item from public.disclosure_confirmations where id=p_id for update;
  if not found then raise exception 'CONFIRMATION_NOT_FOUND'; end if;
  if item.status='matched' then
    perform public.record_disclosure_request_receipt(item.submission_id,item.ticket_number,'inbound',
      item.source_message_id,item.confirmed_at,'disclosure_confirmations:'||item.id::text,null,null,item.id,false);
    return 'matched';
  elsif item.status='duplicate' then
    select * into prior_confirmation from public.disclosure_confirmations where status='matched'
      and submission_id=item.submission_id and confirmed_on=item.confirmed_on order by id limit 1;
    if found then
      perform public.record_disclosure_request_receipt(prior_confirmation.submission_id,prior_confirmation.ticket_number,'inbound',
        prior_confirmation.source_message_id,prior_confirmation.confirmed_at,
        'disclosure_confirmations:'||prior_confirmation.id::text,null,null,prior_confirmation.id,false);
    end if;
    return 'duplicate';
  end if;
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
    end if;
  end if;
  if reason is not null then
    update public.disclosure_confirmations set status='needs_review',review_reason=reason,updated_at=now() where id=p_id;
    return 'needs_review';
  end if;
  -- Serializes independent provider IDs acknowledging the same case on the same day.
  perform pg_advisory_xact_lock(hashtextextended(ticket.id::text || ':' || item.confirmed_on::text,0));
  select * into prior_confirmation from public.disclosure_confirmations
    where submission_id=ticket.id and confirmed_on=item.confirmed_on and status='matched' order by id limit 1;
  if found then
    update public.disclosure_confirmations set status='duplicate',submission_id=ticket.id,
      review_reason='A confirmation is already recorded for this case and date.',updated_at=now() where id=p_id;
    perform public.record_disclosure_request_receipt(prior_confirmation.submission_id,prior_confirmation.ticket_number,'inbound',
      prior_confirmation.source_message_id,prior_confirmation.confirmed_at,
      'disclosure_confirmations:'||prior_confirmation.id::text,null,null,prior_confirmation.id,false);
    return 'duplicate';
  end if;
  update public.disclosure_confirmations set status='matched',submission_id=ticket.id,review_reason=null,updated_at=now() where id=p_id;
  -- The matched-row trigger records the receipt, advances status and enqueues once.
  return 'matched';
end $$;


create or replace function public.disclosure_approval_case_eligible(p_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select t.service_type='representation' and t.status in ('pending','in_progress')
    and t.deleted_at is null
    and public.disclosure_approval_staff_state(t.id)->'allows_new_request'='true'::jsonb
    and t.case_outcome is null and nullif(t.ticket_document_path,'') is not null
    and nullif(t.consent_form_path,'') is not null
    and (coalesce(to_jsonb(t)->>'intake_mode','') <> 'photo_only' or to_jsonb(t)->>'intake_review_status'='ready')
    and ((to_jsonb(t)->'intake_consent'->>'version'='photo-upload-consent-v3'
      and to_jsonb(t)->'intake_consent'->'accepted'='true'::jsonb
      and to_jsonb(t)->'intake_consent'->'pleadNotGuilty'='true'::jsonb)
      or (coalesce(to_jsonb(t)->>'intake_mode','') <> 'photo_only'
        and not coalesce((to_jsonb(t)->'intake_consent') ? 'pleadNotGuilty',false)
        and split_part(replace(coalesce(t.defense_strategy,''),E'\r',''),E'\n',1)='not_guilty'))
    and (t.representation_paid_at is not null or exists(select 1 from public.idr_checkout_intents i
      where i.ticket_submission_id=t.id and i.client_id=t.client_id and i.status='paid'
      and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')))
    and to_jsonb(t)->>'referral_refunded_at' is null and to_jsonb(t)->>'referral_disputed_at' is null
    and not exists(select 1 from public.referral_payment_holds h
      where h.payment_intent_id=to_jsonb(t)->>'referral_payment_intent_id'
        or exists(select 1 from public.idr_orders o where o.ticket_submission_id=t.id and o.stripe_payment_intent_id=h.payment_intent_id))
    and (select count(*) from public.ticket_submissions other where other.service_type='representation'
      and regexp_replace(upper(other.ticket_number),'[^A-Z0-9]','','g')=regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g'))=1
    and not exists(select 1 from public.disclosure_request_receipts r where r.submission_id=t.id
      or r.ticket_number=regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g'))
    and not exists(select 1 from public.disclosure_confirmations d where d.submission_id=t.id
      or regexp_replace(upper(d.ticket_number),'[^A-Z0-9]','','g')=regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g'))
    from public.ticket_submissions t where t.id=p_id),false);
$$;

create or replace function public.claim_disclosure_notices(p_limit integer default 5) returns setof public.disclosure_notification_outbox
language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if not (select delivery_enabled from public.disclosure_automation_state where id) then return; end if;
  -- Serialize claimers and receipt-driven reconciliation across historical rows.
  perform pg_advisory_xact_lock(hashtextextended('disclosure-notice-outbox',731904221::bigint));
  -- Gmail's deterministic Message-ID is not a provider idempotency guarantee.
  -- Any attempted pending notice or expired lease has an uncertain outcome.
  update public.disclosure_notification_outbox set status='needs_review',claim_token=null,lease_until=null,
    last_error='Delivery outcome uncertain. Reconcile provider history before any manual resend.'
    where (status='pending' and (first_attempt_at is not null or attempts>0))
      or (status='processing' and (lease_until is null or lease_until<now()));
  -- Before the first send, recheck case and recipient. Frozen attempted content is retained for reconciliation.
  update public.disclosure_notification_outbox o set status='needs_review',last_error='Case state or recipient changed before delivery. Review the case.'
    where status='pending' and first_attempt_at is null and not exists(
      select 1 from public.ticket_submissions t join public.clients c on c.id=t.client_id
      where t.id=o.submission_id and t.deleted_at is null and t.status in ('pending','in_progress') and t.case_outcome is null
        and c.email=o.snapshot->>'recipient'
        and o.snapshot->>'ticket_number' ~ '^[A-Z0-9]{5,30}$' and o.snapshot->>'ticket_number' ~ '[0-9]'
        and regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g')=o.snapshot->>'ticket_number'
        and public.disclosure_approval_staff_state(t.id)->'ambiguous'='false'::jsonb
        and coalesce(public.disclosure_approval_staff_state(t.id)->>'stage','') not in
          ('done_reduced','done_withdrawn','lapsed_expired','trial_concluded_reduced','trial_concluded_upheld'));
  -- Historical different-date acknowledgements could already have several
  -- notices. A sent/attempted sibling wins; otherwise retain the oldest fresh
  -- pending notice. This does not depend on inbox replay or a receipt RPC.
  update public.disclosure_notification_outbox o set status='needs_review',claim_token=null,lease_until=null,
    last_error='Duplicate disclosure notice held; reconcile the existing case notice before any resend.'
    where o.status='pending' and o.first_attempt_at is null and o.attempts=0 and exists(
      select 1 from public.disclosure_notification_outbox other where other.id<>o.id
        and (other.submission_id=o.submission_id or
          regexp_replace(upper(other.snapshot->>'ticket_number'),'[^A-Z0-9]','','g')=
          regexp_replace(upper(o.snapshot->>'ticket_number'),'[^A-Z0-9]','','g'))
        and (other.status='sent' or other.first_attempt_at is not null or other.attempts>0
          or (other.status='pending' and other.first_attempt_at is null and other.attempts=0
            and (other.created_at,other.id)<(o.created_at,o.id))));
  return query
    with due as (
      select id from public.disclosure_notification_outbox
      where next_attempt_at<=now() and status='pending' and first_attempt_at is null and attempts=0
      order by next_attempt_at,id for update skip locked limit greatest(1,least(p_limit,5))
    ) update public.disclosure_notification_outbox o set status='processing',claim_token=gen_random_uuid(),
      lease_until=now()+interval '5 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now())
      from due where o.id=due.id returning o.*;
end $$;


create or replace function public.complete_disclosure_notice(p_id uuid,p_claim uuid,p_provider_id text default null,p_error text default null) returns boolean
language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if nullif(p_provider_id,'') is null and nullif(p_error,'') is null then raise exception 'RESULT_REQUIRED'; end if;
  update public.disclosure_notification_outbox set
    status=case when nullif(p_provider_id,'') is not null then 'sent' else 'needs_review' end,
    provider_email_id=nullif(p_provider_id,''),sent_at=case when nullif(p_provider_id,'') is not null then now() else null end,
    last_error=case when nullif(p_provider_id,'') is not null then null else left(p_error,500) end,
    claim_token=null,lease_until=null
    where id=p_id and claim_token=p_claim and status='processing';
  get diagnostics changed=row_count;
  return changed=1;
end $$;

create or replace function public.ingest_disclosure_confirmation(p_event jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare event_id uuid; result text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  insert into public.disclosure_confirmations(source_message_id,sender,ticket_number,confirmed_at,timeframe_text,body_excerpt,authentication_result,parse_error)
    values(p_event->>'source_message_id',p_event->>'sender',p_event->>'ticket_number',(p_event->>'confirmed_at')::timestamptz,
      p_event->>'timeframe_text',p_event->>'body_excerpt',p_event->>'authentication_result',p_event->>'parse_error')
    on conflict(source_message_id) do nothing returning id into event_id;
  if event_id is null then
    select id,status into event_id,result from public.disclosure_confirmations where source_message_id=p_event->>'source_message_id';
    if result in ('matched','duplicate') then result:=public.match_disclosure_confirmation(event_id); end if;
    return jsonb_build_object('id',event_id,'status',result,'replayed',true);
  end if;
  result := public.match_disclosure_confirmation(event_id);
  return jsonb_build_object('id',event_id,'status',result,'replayed',false);
end $$;

commit;
