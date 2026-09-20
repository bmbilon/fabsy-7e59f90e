-- Lapsed/expired is a terminal staff status; keep the ticket available in Completed.
alter table public.admin_ticket_case_status drop constraint admin_ticket_case_status_stage_check;
alter table public.admin_ticket_case_status add constraint admin_ticket_case_status_stage_check
  check (stage in ('partial','paid','disclosure_requested','crown_offer_received','done_reduced','done_withdrawn','lapsed_expired','trial_proceeding','trial_date_pending','trial_date_set','trial_concluded_reduced','trial_concluded_upheld'));

create or replace function public.set_admin_ticket_case_status(p_kind text,p_ticket_id uuid,p_stage text,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_state jsonb; target_kind text; target_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(),false) then raise exception 'STAFF_REQUIRED' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('draft','submission') or p_ticket_id is null or p_expected_version is null or p_expected_version<0
    or p_stage is null or p_stage not in ('partial','paid','disclosure_requested','crown_offer_received','done_reduced','done_withdrawn','lapsed_expired','trial_proceeding','trial_date_pending','trial_date_set','trial_concluded_reduced','trial_concluded_upheld')
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
      when case_stage in ('done_reduced','done_withdrawn','lapsed_expired','trial_concluded_reduced','trial_concluded_upheld') then 'completed'
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

