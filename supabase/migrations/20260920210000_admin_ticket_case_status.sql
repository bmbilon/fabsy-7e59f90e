-- Staff case tracking is independent of payment, intake and customer notifications.
create table public.admin_ticket_case_status (
  kind text not null check (kind in ('draft','submission')),
  ticket_id uuid not null,
  stage text not null check (stage in ('partial','paid','disclosure_requested','crown_offer_received','done_reduced','done_withdrawn','trial_proceeding','trial_date_pending','trial_date_set','trial_concluded_reduced','trial_concluded_upheld')),
  version integer not null check (version>0),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid,
  note text check (length(note)<=500),
  primary key(kind,ticket_id)
);
create table public.admin_ticket_case_status_history (
  id bigint generated always as identity primary key,
  kind text not null,
  ticket_id uuid not null,
  from_stage text,
  to_stage text not null,
  version integer not null,
  changed_at timestamptz not null,
  changed_by uuid,
  change_source text not null,
  note text
);
create index admin_ticket_case_status_history_ticket_idx on public.admin_ticket_case_status_history(kind,ticket_id,changed_at desc);
alter table public.admin_ticket_case_status enable row level security;
alter table public.admin_ticket_case_status_history enable row level security;
revoke all on public.admin_ticket_case_status, public.admin_ticket_case_status_history from public,anon,authenticated;
grant select on public.admin_ticket_case_status, public.admin_ticket_case_status_history to authenticated;
grant all on public.admin_ticket_case_status, public.admin_ticket_case_status_history to service_role;
grant usage,select on sequence public.admin_ticket_case_status_history_id_seq to service_role;
create policy staff_read_case_status on public.admin_ticket_case_status for select to authenticated using(public.is_idr_staff());
create policy staff_read_case_status_history on public.admin_ticket_case_status_history for select to authenticated using(public.is_idr_staff());

create function public.audit_admin_ticket_case_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.admin_ticket_case_status_history(kind,ticket_id,from_stage,to_stage,version,changed_at,changed_by,change_source,note)
  values(new.kind,new.ticket_id,case when tg_op='UPDATE' then old.stage else null end,new.stage,new.version,new.updated_at,new.updated_by,
    case when new.updated_by is null then 'maintenance' else 'staff_ui' end,new.note);
  return new;
end $$;
revoke all on function public.audit_admin_ticket_case_status() from public,anon,authenticated;
create trigger audit_case_status after insert or update on public.admin_ticket_case_status for each row execute function public.audit_admin_ticket_case_status();

-- Converted draft autosaves are eventually purged. Copy tracking to the
-- canonical submission during conversion so its status survives that purge.
create function public.carry_admin_ticket_case_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.converted_submission_id is not null and old.converted_submission_id is distinct from new.converted_submission_id then
    perform pg_advisory_xact_lock(hashtextextended(new.id::text,731904218::bigint));
    perform pg_advisory_xact_lock(hashtextextended('submission'||new.converted_submission_id::text,731904219::bigint));
    insert into public.admin_ticket_case_status(kind,ticket_id,stage,version,updated_at,note)
      select 'submission',new.converted_submission_id,stage,version,clock_timestamp(),'Carried forward when the intake converted to a submission.'
      from public.admin_ticket_case_status where kind='draft' and ticket_id=new.id
      on conflict(kind,ticket_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.carry_admin_ticket_case_status() from public,anon,authenticated;
create trigger carry_admin_ticket_case_status after update of converted_submission_id on public.ticket_intake_drafts for each row execute function public.carry_admin_ticket_case_status();

create function public.get_admin_ticket_case_status(p_kind text,p_ticket_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_kind text:=p_kind; target_id uuid:=p_ticket_id; inherited_id uuid; current_row public.admin_ticket_case_status%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(),false) then raise exception 'STAFF_REQUIRED' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('draft','submission') or p_ticket_id is null then raise exception 'CASE_STATUS_TARGET_INVALID'; end if;
  if p_kind='draft' then
    select d.converted_submission_id into inherited_id from public.ticket_intake_drafts d where d.id=p_ticket_id and d.deleted_at is null;
    if not found then raise exception 'CASE_STATUS_TICKET_UNAVAILABLE'; end if;
    if inherited_id is not null then target_kind:='submission'; target_id:=inherited_id; end if;
  end if;
  if target_kind='submission' then
    perform 1 from public.ticket_submissions s where s.id=target_id and s.deleted_at is null;
    if not found then raise exception 'CASE_STATUS_TICKET_UNAVAILABLE'; end if;
    select d.id into inherited_id from public.ticket_intake_drafts d where d.converted_submission_id=target_id;
  end if;
  select * into current_row from public.admin_ticket_case_status where kind=target_kind and ticket_id=target_id;
  if not found and target_kind='submission' and inherited_id is not null then
    select * into current_row from public.admin_ticket_case_status where kind='draft' and ticket_id=inherited_id;
  end if;
  return jsonb_build_object('kind',target_kind,'ticket_id',target_id,'stage',current_row.stage,'version',coalesce(current_row.version,0),'updated_at',current_row.updated_at);
end $$;
revoke all on function public.get_admin_ticket_case_status(text,uuid) from public,anon;
grant execute on function public.get_admin_ticket_case_status(text,uuid) to authenticated;

create function public.set_admin_ticket_case_status(p_kind text,p_ticket_id uuid,p_stage text,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_state jsonb; target_kind text; target_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(),false) then raise exception 'STAFF_REQUIRED' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('draft','submission') or p_ticket_id is null or p_expected_version is null or p_expected_version<0
    or p_stage is null or p_stage not in ('partial','paid','disclosure_requested','crown_offer_received','done_reduced','done_withdrawn','trial_proceeding','trial_date_pending','trial_date_set','trial_concluded_reduced','trial_concluded_upheld')
    then raise exception 'CASE_STATUS_INPUT_INVALID'; end if;
  -- Match the intake conversion/cleanup lock order before resolving the target.
  if p_kind='draft' then
    perform pg_advisory_xact_lock(hashtextextended(p_ticket_id::text,731904218::bigint));
    perform 1 from public.ticket_intake_drafts where id=p_ticket_id and cleanup_claim_id is not null and converted_submission_id is null;
    if found then raise exception 'CASE_STATUS_UPLOAD_CLEANUP_STARTED'; end if;
  end if;
  current_state:=public.get_admin_ticket_case_status(p_kind,p_ticket_id);
  target_kind:=current_state->>'kind'; target_id:=(current_state->>'ticket_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(target_kind||target_id::text,731904219::bigint));
  current_state:=public.get_admin_ticket_case_status(p_kind,p_ticket_id);
  if current_state->>'stage'=p_stage then return current_state; end if;
  if (current_state->>'version')::integer<>p_expected_version then raise exception 'CASE_STATUS_CHANGED' using errcode='40001'; end if;
  insert into public.admin_ticket_case_status(kind,ticket_id,stage,version,updated_at,updated_by)
  values(target_kind,target_id,p_stage,p_expected_version+1,clock_timestamp(),auth.uid())
  on conflict(kind,ticket_id) do update set stage=excluded.stage,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by,note=null;
  return public.get_admin_ticket_case_status(target_kind,target_id);
end $$;
revoke all on function public.set_admin_ticket_case_status(text,uuid,text,integer) from public,anon;
grant execute on function public.set_admin_ticket_case_status(text,uuid,text,integer) to authenticated;

create or replace function public.admin_dashboard_queue(
  p_filter text default 'attention', p_search text default '', p_offset integer default 0,
  p_since timestamptz default null, p_until timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; stamp timestamptz := statement_timestamp();
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(),false) then
    raise exception 'STAFF_REQUIRED' using errcode='42501';
  end if;
  if p_filter is null or p_filter not in ('attention','partial','active','submitted','completed','uploads','paid','trial')
    or p_search is null or length(p_search)>120 or p_offset is null or p_offset<0 or p_offset>100000
    or ((p_since is null) <> (p_until is null)) or p_since>=p_until then
    raise exception 'DASHBOARD_QUEUE_FILTER_INVALID';
  end if;
  with raw_items as materialized (
    select s.id,'submission'::text as kind,
      coalesce(nullif(btrim(concat_ws(' ',s.first_name,s.last_name)),''),'Ticket submission') as name,
      s.email,s.phone,s.ticket_number,s.service_type,s.ticket_type,s.status,
      coalesce(w.stage,dw.stage) as case_stage,coalesce(w.version,dw.version,0) as case_stage_version,
      case when s.status in ('awaiting_payment','assessment_awaiting_payment','assessment_checkout_open') then 'payment'
        when s.status in ('pending','assessment_pending') then 'new'
        when s.status='completed' then 'completed' else 'active' end as original_category,
      null::integer as current_step,
      s.created_at,greatest(s.updated_at,w.updated_at,dw.updated_at) as updated_at,
      coalesce(d.ticket_uploaded_at,o.created_at) as ticket_uploaded_at,
      null::text as follow_up_status,
      true as queue_active,
      coalesce(s.ticket_document_path,s.assessment_ticket_path,s.id::text) as upload_key,
      payment.paid_at,
      coalesce('email:' || nullif(lower(btrim(s.email)),''),'submission:' || s.id::text) as client_key
    from public.ticket_submissions s
    left join lateral (
      select max(paid_at) as paid_at
      from (values (s.representation_paid_at),(s.assessment_paid_at)) p(paid_at)
      where paid_at<stamp and (p_since is null or (paid_at>=p_since and paid_at<p_until))
    ) payment on true
    left join public.ticket_intake_drafts d on d.converted_submission_id=s.id
    left join public.admin_ticket_case_status w on w.kind='submission' and w.ticket_id=s.id
    left join public.admin_ticket_case_status dw on dw.kind='draft' and dw.ticket_id=d.id
    left join storage.objects o on o.bucket_id='assessment-tickets'
      and o.name=coalesce(s.ticket_document_path,s.assessment_ticket_path)
      and o.name ~* '\.(pdf|jpg|jpeg|png|webp|heic|heif)$'
    where s.deleted_at is null
    union all
    select d.id,'draft',
      coalesce(nullif(btrim(concat_ws(' ',left(d.draft_data->>'firstName',120),left(d.draft_data->>'lastName',120))),''),'Partial intake'),
      d.email,d.phone,left(d.draft_data->>'ticketNumber',100),'representation',
      coalesce(d.draft_data->>'ticketType','officer_issued'),
      case when d.expires_at<=stamp then 'expired' else d.status end,
      w.stage,coalesce(w.version,0),'partial',d.current_step::integer,
      d.created_at,greatest(d.updated_at,w.updated_at),d.ticket_uploaded_at,d.staff_follow_up_status,
      (w.stage is not null or (d.expires_at>stamp and d.status='active' and d.staff_follow_up_status<>'dismissed')),
      coalesce(d.ticket_document_path,d.id::text),null::timestamptz,null::text
    from public.ticket_intake_drafts d
    left join public.admin_ticket_case_status w on w.kind='draft' and w.ticket_id=d.id
    where d.deleted_at is null and d.converted_submission_id is null
  ), items as materialized (
    select raw_items.*, case
      when case_stage='partial' then 'partial'
      when case_stage in ('done_reduced','done_withdrawn','trial_concluded_reduced','trial_concluded_upheld') then 'completed'
      when case_stage in ('trial_proceeding','trial_date_pending','trial_date_set') then 'trial'
      when case_stage is not null then 'active' else original_category end as category,
      coalesce(case_stage like 'trial_%',false) as trial_matter
    from raw_items
  ), matching as (
    select * from items i where
      (p_filter='attention' and category in ('partial','payment','new')
        or p_filter='partial' and category='partial'
        or p_filter='active' and category in ('new','active')
        or p_filter='submitted' and (kind='submission' or case_stage is not null)
        or p_filter='completed' and category='completed'
        or p_filter='trial' and trial_matter
        or p_filter='paid' and kind='submission' and paid_at is not null
        or p_filter='uploads' and ticket_uploaded_at is not null)
      and (queue_active or p_filter='uploads')
      and (p_search='' or strpos(lower(concat_ws(' ',name,email,phone,ticket_number)),lower(btrim(p_search)))>0)
      and (p_since is null or (case when p_filter='uploads' then ticket_uploaded_at when p_filter='paid' then paid_at else created_at end >=p_since
        and case when p_filter='uploads' then ticket_uploaded_at when p_filter='paid' then paid_at else created_at end <p_until))
  ), filtered as (
    -- An assessment and its representation can reference the same ticket file.
    -- Show that upload once, linked to its most recently updated case.
    -- Multiple paid tickets or services for the same email count as one client.
    select distinct on (case when p_filter='uploads' then upload_key when p_filter='paid' then client_key else kind || id::text end) *
    from matching order by (case when p_filter='uploads' then upload_key when p_filter='paid' then client_key else kind || id::text end),(case when p_filter='paid' then paid_at end) desc nulls last,updated_at desc,id
  ), page as (
    select * from filtered order by updated_at desc,id limit 8 offset p_offset
  )
  select jsonb_build_object('generated_at',stamp,'total',(select count(*) from filtered),'offset',p_offset,'page_size',8,
    'counts',jsonb_build_object(
      'attention',(select count(*) from items where queue_active and category in ('partial','payment','new')),
      'partial',(select count(*) from items where queue_active and category='partial'),
      'active',(select count(*) from items where queue_active and category in ('new','active')),
      'submitted',(select count(*) from items where queue_active and (kind='submission' or case_stage is not null)),
      'trial',(select count(*) from items where queue_active and trial_matter),
      'completed',(select count(*) from items where queue_active and category='completed')),
    'items',coalesce((select jsonb_agg(to_jsonb(page)-'upload_key'-'queue_active'-'client_key'-'original_category' order by updated_at desc,id) from page),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_dashboard_queue(text,text,integer,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_dashboard_queue(text,text,integer,timestamptz,timestamptz) to authenticated;

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
      and not exists (select 1 from public.admin_ticket_case_status cs where cs.kind='draft' and cs.ticket_id=d.id)
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
      and not exists (select 1 from public.admin_ticket_case_status cs where cs.kind='draft' and cs.ticket_id=d.id)
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
      and not exists (select 1 from public.admin_ticket_case_status cs where cs.kind='draft' and cs.ticket_id=d.id)
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


-- A manually progressed or resolved case must not receive an abandoned-intake reminder.
create or replace function public.get_abandoned_ticket_email_context(p_id uuid,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  job public.abandoned_ticket_emails%rowtype;
  draft public.ticket_intake_drafts%rowtype;
  submission public.ticket_submissions%rowtype;
  recipient text;
  number_key text;
  delivery_key_value text;
  related_ids uuid[];
  sessions jsonb;
  reason text;
begin
  select * into job from public.abandoned_ticket_emails where id=p_id and claim_id=p_claim_id
    and status='sending' and claim_expires_at > clock_timestamp();
  if not found then raise exception 'ABANDONED_TICKET_EMAIL_CLAIM_LOST'; end if;
  select * into draft from public.ticket_intake_drafts where id=job.draft_id;
  select * into submission from public.ticket_submissions where id=coalesce(draft.converted_submission_id,draft.id);
  recipient:=lower(btrim(draft.email));
  number_key:=regexp_replace(upper(coalesce(nullif(btrim(draft.draft_data->>'ticketNumber'),''),submission.ticket_number,'')),'[^A-Z0-9]','','g');
  if not exists(select 1 from public.abandoned_ticket_email_settings where singleton and enabled) then reason:='disabled';
  elsif draft.id is null or draft.deleted_at is not null or draft.status not in ('active','converted') or draft.expires_at <= clock_timestamp() then reason:='intake_unavailable';
  elsif draft.ticket_uploaded_at is null or job.due_at > clock_timestamp() then reason:='upload_not_due';
  elsif not draft.contact_permission or not draft.alberta_confirmed then reason:='contact_not_permitted';
  elsif exists(select 1 from public.admin_ticket_case_status cs where cs.stage<>'partial' and ((cs.kind='draft' and cs.ticket_id=draft.id) or (cs.kind='submission' and cs.ticket_id=draft.converted_submission_id))) then reason:='case_managed_by_staff';
  elsif draft.staff_follow_up_status <> 'open' then reason:='staff_followed_up';
  elsif recipient is null or length(recipient) > 255 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then reason:='email_unavailable';
  elsif job.email_payload is not null and job.email_payload->'to'->>0 is distinct from recipient then reason:='recipient_changed';
  elsif job.first_attempt_at <= clock_timestamp()-interval '23 hours' then reason:='idempotency_window_elapsed';
  end if;
  if reason is not null then return jsonb_build_object('eligible',false,'reason',reason,'retryable',reason='disabled'); end if;

  -- A converted draft is still abandoned until its representation checkout is paid.
  -- Match restarts by recipient and ticket number. When the number is missing,
  -- conservatively check same-email unfinished or recent representation purchases.
  select array_agg(t.id) into related_ids from public.ticket_submissions t
    where t.id=coalesce(draft.converted_submission_id,draft.id) or
      (t.service_type='representation' and lower(btrim(t.email))=recipient and
       ((number_key<>'' and regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g')=number_key) or
        (number_key='' and (t.created_at>=job.uploaded_at or t.status='awaiting_payment' or
          t.representation_paid_at>=job.uploaded_at or exists(
            select 1 from public.idr_checkout_intents paid_intent where paid_intent.ticket_submission_id=t.id
              and paid_intent.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
              and paid_intent.status='paid' and paid_intent.updated_at>=job.uploaded_at)))));
  if draft.status='converted' and not exists(select 1 from public.ticket_submissions t
      where t.id=draft.converted_submission_id and t.status='awaiting_payment' and t.deleted_at is null) then
    return jsonb_build_object('eligible',false,'reason','submission_unavailable','retryable',false);
  end if;
  if exists(select 1 from public.ticket_submissions t where t.id=any(related_ids) and
      (t.representation_paid_at is not null or t.status <> 'awaiting_payment')) or
    exists(select 1 from public.idr_checkout_intents i where i.ticket_submission_id=any(related_ids)
      and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar') and i.status='paid') then
    return jsonb_build_object('eligible',false,'reason','already_paid_or_active','retryable',false);
  end if;
  if exists(select 1 from public.idr_checkout_intents i where i.ticket_submission_id=any(related_ids)
    and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar') and i.status in ('creating','open')
    and i.stripe_checkout_session_id is null) then
    return jsonb_build_object('eligible',false,'reason','checkout_creating','retryable',true);
  end if;
  delivery_key_value:=encode(sha256(convert_to(recipient||':'||case when number_key<>'' then number_key else draft.id::text end,'UTF8')),'hex');
  if job.delivery_key is not null and job.delivery_key<>delivery_key_value then
    return jsonb_build_object('eligible',false,'reason','ticket_identity_changed','retryable',false);
  end if;
  if exists(select 1 from public.abandoned_ticket_emails a where a.id<>job.id and a.delivery_key=delivery_key_value) then
    return jsonb_build_object('eligible',false,'reason','duplicate_ticket','retryable',false);
  end if;
  select coalesce(jsonb_agg(distinct checkout.session_id),'[]'::jsonb) into sessions from (
    select i.stripe_checkout_session_id as session_id from public.idr_checkout_intents i
      where i.ticket_submission_id=any(related_ids) and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
    union select t.representation_checkout_session_id from public.ticket_submissions t where t.id=any(related_ids)
  ) checkout where checkout.session_id is not null;
  return jsonb_build_object('eligible',true,'email',recipient,'firstName',coalesce(nullif(btrim(draft.draft_data->>'firstName'),''),submission.first_name,''),
    'ticketType',coalesce(nullif(btrim(draft.draft_data->>'violation'),''),nullif(btrim(draft.draft_data->>'offenceDescription'),''),nullif(submission.violation,''),
      case when coalesce(draft.draft_data->>'ticketType',submission.ticket_type)='photo_radar' then 'Photo Radar' else '' end),
    'ticketNumber',coalesce(nullif(btrim(draft.draft_data->>'ticketNumber'),''),submission.ticket_number,''),'checkoutSessionIds',sessions,
    'deliveryKey',delivery_key_value,'retryable',false);
end $$;

revoke all on function public.get_abandoned_ticket_email_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_abandoned_ticket_email_context(uuid,uuid) to service_role;
