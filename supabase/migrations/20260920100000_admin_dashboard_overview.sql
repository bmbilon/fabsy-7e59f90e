begin;

-- These functions only return staff-visible summaries. Neither changes a case,
-- exposes payment identifiers, nor grants access to the underlying private ledger.
create function public.admin_dashboard_overview(p_days integer default 7)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stamp timestamptz := statement_timestamp();
  today date := (stamp at time zone 'America/Edmonton')::date;
  start_at timestamptz;
  previous_start timestamptz;
  previous_end timestamptz;
  result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(),false) then
    raise exception 'STAFF_REQUIRED' using errcode='42501';
  end if;
  if p_days is null or p_days not in (7,30) then raise exception 'DASHBOARD_WINDOW_INVALID'; end if;
  start_at := (today - (p_days - 1))::timestamp at time zone 'America/Edmonton';
  previous_start := (today - (2 * p_days - 1))::timestamp at time zone 'America/Edmonton';
  previous_end := ((stamp at time zone 'America/Edmonton') - make_interval(days=>p_days)) at time zone 'America/Edmonton';

  with periods as (
    select 'current' as period, start_at as since, stamp as until
    union all select 'previous',previous_start,previous_end
  ), events as materialized (
    select event_name,session_id,occurred_at,utm_source,click_id_kind,click_id_hash
    from analytics_private.paid_funnel_events
    where occurred_at >= previous_start and occurred_at < stamp
      and not analytics_private.is_paid_funnel_verification(utm_source,utm_medium,utm_campaign)
  ), purchases as materialized (
    select occurred_at,amount_cents,tax_cents from analytics_private.paid_payment_purchases
    where occurred_at >= previous_start and occurred_at < stamp and currency='cad'
  ), summaries as (
    select p.period, jsonb_build_object(
      'revenue_cents',coalesce((select sum(amount_cents-tax_cents) from purchases where occurred_at>=p.since and occurred_at<p.until),0),
      'gross_cents',coalesce((select sum(amount_cents) from purchases where occurred_at>=p.since and occurred_at<p.until),0),
      'refunds_cents',coalesce((select sum(amount_cents) from analytics_private.paid_payment_refunds
        where currency='cad' and status='succeeded' and status_observed_at>=p.since and status_observed_at<p.until),0),
      'paid_orders',(select count(*) from purchases where occurred_at>=p.since and occurred_at<p.until),
      'tracked_visits',(select count(distinct session_id) from events where event_name='landing_view' and occurred_at>=p.since and occurred_at<p.until),
      'submissions',(select count(*) from public.ticket_submissions where deleted_at is null and created_at>=p.since and created_at<p.until)
    ) as metrics from periods p
  ), days as (
    select today - n as day from generate_series(0,p_days-1) n
  ), daily_events as (
    select (occurred_at at time zone 'America/Edmonton')::date as day,
      count(distinct session_id) filter(where event_name='landing_view') as tracked_visits
    from events where occurred_at>=start_at group by 1
  ), daily_purchases as (
    select (occurred_at at time zone 'America/Edmonton')::date as day,
      sum(amount_cents-tax_cents) as revenue_cents,count(*) as paid_orders
    from purchases where occurred_at>=start_at group by 1
  ), daily_submissions as (
    select (created_at at time zone 'America/Edmonton')::date as day,count(*) as submissions
    from public.ticket_submissions where deleted_at is null and created_at>=start_at and created_at<stamp group by 1
  ), trend as (
    select d.day,coalesce(e.tracked_visits,0) as tracked_visits,coalesce(p.revenue_cents,0) as revenue_cents,
      coalesce(p.paid_orders,0) as paid_orders,coalesce(s.submissions,0) as submissions
    from days d left join daily_events e using(day) left join daily_purchases p using(day) left join daily_submissions s using(day)
  ), funnel as (
    select event_name,count(distinct session_id) as sessions from events
    where occurred_at>=start_at and event_name in ('landing_view','intake_started','ticket_uploaded','checkout_started','purchase')
    group by event_name
  ), sources as (
    select coalesce(utm_source,case when click_id_hash is not null then case
      when click_id_kind in ('gclid','gbraid','wbraid') then 'google'
      when click_id_kind='fbclid' then 'meta' end end,'Direct / unknown') as source,
      count(distinct session_id) as sessions
    from events where occurred_at>=start_at and event_name='landing_view' group by 1
  )
  select jsonb_build_object(
    'generated_at',stamp,'days',p_days,'since',start_at,'until',stamp,'today_since',(today::timestamp at time zone 'America/Edmonton'),
    'previous_since',previous_start,'previous_until',previous_end,
    -- Use exactly the drilldown's definition, including inactive uploads and
    -- shared files, so a count can never disagree with its matching records.
    'today',jsonb_build_object('uploads',(public.admin_dashboard_queue('uploads','',0,(today::timestamp at time zone 'America/Edmonton'),stamp)->>'total')::bigint,
      'submissions',(select count(*) from public.ticket_submissions where deleted_at is null and created_at>=(today::timestamp at time zone 'America/Edmonton') and created_at<stamp),
      'paid_clients',(public.admin_dashboard_queue('paid','',0,(today::timestamp at time zone 'America/Edmonton'),stamp)->>'total')::bigint),
    'current',(select metrics from summaries where period='current'),
    'previous',(select metrics from summaries where period='previous'),
    'daily',(select jsonb_agg(to_jsonb(trend) order by day) from trend),
    'funnel',coalesce((select jsonb_agg(to_jsonb(funnel) order by event_name) from funnel),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(sources) order by sessions desc,source) from sources),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_dashboard_overview(integer) from public,anon;
grant execute on function public.admin_dashboard_overview(integer) to authenticated;

create function public.admin_dashboard_queue(
  p_filter text default 'attention', p_search text default '', p_offset integer default 0,
  p_since timestamptz default null, p_until timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; stamp timestamptz := statement_timestamp();
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(),false) then
    raise exception 'STAFF_REQUIRED' using errcode='42501';
  end if;
  if p_filter is null or p_filter not in ('attention','partial','active','submitted','completed','uploads','paid')
    or p_search is null or length(p_search)>120 or p_offset is null or p_offset<0 or p_offset>100000
    or ((p_since is null) <> (p_until is null)) or p_since>=p_until then
    raise exception 'DASHBOARD_QUEUE_FILTER_INVALID';
  end if;
  with items as materialized (
    select s.id,'submission'::text as kind,
      coalesce(nullif(btrim(concat_ws(' ',s.first_name,s.last_name)),''),'Ticket submission') as name,
      s.email,s.phone,s.ticket_number,s.service_type,s.ticket_type,s.status,
      case when s.status in ('awaiting_payment','assessment_awaiting_payment','assessment_checkout_open') then 'payment'
        when s.status in ('pending','assessment_pending') then 'new'
        when s.status='completed' then 'completed' else 'active' end as category,
      null::integer as current_step,
      s.created_at,s.updated_at,
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
    left join storage.objects o on o.bucket_id='assessment-tickets'
      and o.name=coalesce(s.ticket_document_path,s.assessment_ticket_path)
      and o.name ~* '\.(pdf|jpg|jpeg|png|webp|heic|heif)$'
    where s.deleted_at is null
    union all
    select d.id,'draft',
      coalesce(nullif(btrim(concat_ws(' ',left(d.draft_data->>'firstName',120),left(d.draft_data->>'lastName',120))),''),'Partial intake'),
      d.email,d.phone,left(d.draft_data->>'ticketNumber',100),'representation',
      coalesce(d.draft_data->>'ticketType','officer_issued'),
      case when d.expires_at<=stamp then 'expired' else d.status end,'partial',d.current_step::integer,
      d.created_at,d.updated_at,d.ticket_uploaded_at,d.staff_follow_up_status,
      (d.expires_at>stamp and d.status='active' and d.staff_follow_up_status<>'dismissed'),
      coalesce(d.ticket_document_path,d.id::text),null::timestamptz,null::text
    from public.ticket_intake_drafts d
    where d.deleted_at is null and d.converted_submission_id is null
  ), matching as (
    select * from items i where
      (p_filter='attention' and category in ('partial','payment','new')
        or p_filter='partial' and category='partial'
        or p_filter='active' and category in ('new','active')
        or p_filter='submitted' and kind='submission'
        or p_filter='completed' and category='completed'
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
      'submitted',(select count(*) from items where queue_active and kind='submission'),
      'completed',(select count(*) from items where queue_active and category='completed')),
    'items',coalesce((select jsonb_agg(to_jsonb(page)-'upload_key'-'queue_active'-'client_key' order by updated_at desc,id) from page),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_dashboard_queue(text,text,integer,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_dashboard_queue(text,text,integer,timestamptz,timestamptz) to authenticated;

commit;
