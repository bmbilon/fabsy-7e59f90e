begin;

-- Aggregates only: the private payment ledger and session identifiers remain
-- inaccessible to clients. Existing overview/queue RPCs remain compatible.
create function public.admin_performance_report(
  p_period text default 'all_time', p_start date default null, p_end date default null,
  p_compare text default 'previous', p_granularity text default 'auto'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stamp timestamptz := statement_timestamp();
  today date := (stamp at time zone 'America/Edmonton')::date;
  first_case timestamptz; first_payment timestamptz; first_visit timestamptz; first_refund timestamptz;
  history_start date; start_day date; end_day date; day_count integer;
  since_at timestamptz; until_at timestamptz;
  prior_day date; prior_since timestamptz; prior_until timestamptz;
  comparison text := p_compare; grain text; result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(),false) then
    raise exception 'STAFF_REQUIRED' using errcode='42501';
  end if;
  if p_period is null or p_period not in ('all_time','today','7d','30d','90d','365d','ytd','last_year','custom')
    or p_compare is null or p_compare not in ('none','previous','year')
    or p_granularity is null or p_granularity not in ('auto','day','week','month') then
    raise exception 'PERFORMANCE_FILTER_INVALID';
  end if;
  select min(created_at) into first_case from public.ticket_submissions where deleted_at is null and created_at<stamp;
  select min(occurred_at) into first_payment from analytics_private.paid_payment_purchases where currency='cad' and occurred_at<stamp;
  select min(occurred_at) into first_visit from analytics_private.paid_funnel_events
    where occurred_at<stamp and not analytics_private.is_paid_funnel_verification(utm_source,utm_medium,utm_campaign);
  select min(status_observed_at) into first_refund from analytics_private.paid_payment_refunds
    where currency='cad' and status='succeeded' and status_observed_at<stamp;
  history_start := coalesce((least(first_case,first_payment,first_visit,first_refund) at time zone 'America/Edmonton')::date,today);
  end_day := today;
  start_day := case p_period
    when 'all_time' then history_start when 'today' then today
    when '7d' then today-6 when '30d' then today-29 when '90d' then today-89 when '365d' then today-364
    when 'ytd' then date_trunc('year',today)::date
    when 'last_year' then (date_trunc('year',today)-interval '1 year')::date
    when 'custom' then p_start end;
  if p_period='last_year' then end_day := date_trunc('year',today)::date-1; end if;
  if p_period='custom' then end_day := p_end; end if;
  if start_day is null or end_day is null or not isfinite(start_day) or not isfinite(end_day)
    or start_day>end_day or end_day>today or start_day<date '1900-01-01' then
    raise exception 'PERFORMANCE_DATE_INVALID';
  end if;
  day_count := end_day-start_day+1;
  since_at := start_day::timestamp at time zone 'America/Edmonton';
  until_at := least((end_day+1)::timestamp at time zone 'America/Edmonton',stamp);
  if p_period='all_time' then comparison := 'none'; end if;
  if comparison<>'none' then
    prior_day := case when comparison='year' then (start_day-interval '1 year')::date else start_day-day_count end;
    prior_since := prior_day::timestamp at time zone 'America/Edmonton';
    prior_until := (prior_day::timestamp+((until_at at time zone 'America/Edmonton')-start_day::timestamp)) at time zone 'America/Edmonton';
  end if;
  -- Bound response size, never truncate the selected history. Long periods
  -- automatically use wider buckets even if a client asks for daily values.
  grain := case when p_granularity='auto' then
    case when day_count<=90 then 'day' when day_count<=730 then 'week' else 'month' end
    when p_granularity='day' and day_count>730 then case when day_count<=3650 then 'week' else 'month' end
    when p_granularity='week' and day_count>3650 then 'month' else p_granularity end;

  with periods as (
    select 'current'::text period,since_at since,until_at until,start_day as day
    union all select 'previous',prior_since,prior_until,prior_day where comparison<>'none'
  ), events as materialized (
    select p.period,e.event_name,e.session_id,e.occurred_at,e.utm_source,e.click_id_kind,e.click_id_hash,
      start_day+((e.occurred_at at time zone 'America/Edmonton')::date-p.day) as aligned_day
    from periods p join analytics_private.paid_funnel_events e on e.occurred_at>=p.since and e.occurred_at<p.until
    where not analytics_private.is_paid_funnel_verification(e.utm_source,e.utm_medium,e.utm_campaign)
  ), purchases as materialized (
    select p.period,b.occurred_at,b.amount_cents,b.tax_cents,b.product,
      start_day+((b.occurred_at at time zone 'America/Edmonton')::date-p.day) as aligned_day
    from periods p join analytics_private.paid_payment_purchases b on b.occurred_at>=p.since and b.occurred_at<p.until
    where b.currency='cad'
  ), refunds as materialized (
    select p.period,r.amount_cents,start_day+((r.status_observed_at at time zone 'America/Edmonton')::date-p.day) as aligned_day
    from periods p join analytics_private.paid_payment_refunds r on r.status_observed_at>=p.since and r.status_observed_at<p.until
    where r.currency='cad' and r.status='succeeded'
  ), submissions as materialized (
    select p.period,s.id,start_day+((s.created_at at time zone 'America/Edmonton')::date-p.day) as aligned_day
    from periods p join public.ticket_submissions s on s.created_at>=p.since and s.created_at<p.until where s.deleted_at is null
  ), totals as (
    select p.period,jsonb_build_object(
      'revenue_cents',coalesce((select sum(amount_cents-tax_cents) from purchases b where b.period=p.period),0),
      'gross_cents',coalesce((select sum(amount_cents) from purchases b where b.period=p.period),0),
      'refunds_cents',coalesce((select sum(amount_cents) from refunds r where r.period=p.period),0),
      'paid_orders',(select count(*) from purchases b where b.period=p.period),
      'tracked_visits',(select count(distinct session_id) from events e where e.period=p.period and event_name='landing_view'),
      'submissions',(select count(*) from submissions s where s.period=p.period)
    ) metrics from periods p
  ), buckets as (
    select greatest(start_day,d::date) as day,
      least(end_day,(d+case grain when 'month' then interval '1 month' when 'week' then interval '1 week' else interval '1 day' end)::date-1) as end_day
    from generate_series(case when grain='month' then date_trunc('month',start_day)::timestamp else start_day::timestamp end,
      end_day::timestamp,case grain when 'month' then interval '1 month' when 'week' then interval '1 week' else interval '1 day' end) d
  ), purchase_buckets as (
    select period,case grain when 'month' then greatest(start_day,date_trunc('month',aligned_day)::date) when 'week' then start_day+7*((aligned_day-start_day)/7) else aligned_day end as day,sum(amount_cents-tax_cents) revenue_cents,sum(amount_cents) gross_cents,count(*) paid_orders
    from purchases group by 1,2
  ), refund_buckets as (
    select period,case grain when 'month' then greatest(start_day,date_trunc('month',aligned_day)::date) when 'week' then start_day+7*((aligned_day-start_day)/7) else aligned_day end as day,sum(amount_cents) refunds_cents from refunds group by 1,2
  ), event_buckets as (
    select period,case grain when 'month' then greatest(start_day,date_trunc('month',aligned_day)::date) when 'week' then start_day+7*((aligned_day-start_day)/7) else aligned_day end as day,count(distinct session_id) tracked_visits
    from events where event_name='landing_view' group by 1,2
  ), submission_buckets as (
    select period,case grain when 'month' then greatest(start_day,date_trunc('month',aligned_day)::date) when 'week' then start_day+7*((aligned_day-start_day)/7) else aligned_day end as day,count(*) submissions from submissions group by 1,2
  ), bucket_values as (
    select b.day,b.end_day,p.period,jsonb_build_object(
      'revenue_cents',case when first_payment is not null and b.end_day+(p.day-start_day)>=(first_payment at time zone 'America/Edmonton')::date then coalesce(pb.revenue_cents,0) end,
      'gross_cents',case when least(first_payment,first_refund) is not null and b.end_day+(p.day-start_day)>=(least(first_payment,first_refund) at time zone 'America/Edmonton')::date then coalesce(pb.gross_cents,0) end,
      'refunds_cents',coalesce(rb.refunds_cents,0),
      'paid_orders',case when first_payment is not null and b.end_day+(p.day-start_day)>=(first_payment at time zone 'America/Edmonton')::date then coalesce(pb.paid_orders,0) end,
      'tracked_visits',case when first_visit is not null and b.end_day+(p.day-start_day)>=(first_visit at time zone 'America/Edmonton')::date then coalesce(eb.tracked_visits,0) end,
      'submissions',case when first_case is not null and b.end_day+(p.day-start_day)>=(first_case at time zone 'America/Edmonton')::date then coalesce(sb.submissions,0) end
    ) metrics from buckets b cross join periods p
    left join purchase_buckets pb on pb.day=b.day and pb.period=p.period
    left join refund_buckets rb on rb.day=b.day and rb.period=p.period
    left join event_buckets eb on eb.day=b.day and eb.period=p.period
    left join submission_buckets sb on sb.day=b.day and sb.period=p.period
  ), series as (
    select c.day,c.end_day,c.metrics as current,v.metrics as previous
    from bucket_values c left join bucket_values v on v.day=c.day and v.period='previous' where c.period='current'
  ), landings as (
    select distinct on(session_id) session_id,
      coalesce(nullif(btrim(utm_source),''),case when click_id_hash is not null then case
        when click_id_kind in ('gclid','gbraid','wbraid') then 'google' when click_id_kind='fbclid' then 'meta' end end,'Direct / unknown') source
    from events where period='current' and event_name='landing_view'
    order by session_id,occurred_at,coalesce(utm_source,''),coalesce(click_id_kind,'')
  ), sources as (
    select source,count(*) sessions from landings group by source
  ), services as (
    select product,count(*) paid_orders,sum(amount_cents-tax_cents) revenue_cents,sum(amount_cents) gross_cents
    from purchases where period='current' group by product
  ), funnel as (
    select event_name,count(distinct session_id) sessions from events where period='current'
      and event_name in ('landing_view','intake_started','ticket_uploaded','checkout_started','purchase') group by event_name
  )
  select jsonb_build_object(
    'generated_at',stamp,'period',p_period,'days',day_count,'since',since_at,'until',until_at,
    'start_day',start_day,'end_day',end_day,'granularity',grain,'comparison',comparison,
    'previous_since',prior_since,'previous_until',prior_until,
    'coverage',jsonb_build_object('history_start',history_start,'revenue_since',first_payment,'cash_since',least(first_payment,first_refund),'visits_since',first_visit,
      'submissions_since',first_case,'traffic_retention_days',400),
    'current',(select metrics from totals where period='current'),
    'previous',(select metrics from totals where period='previous'),
    'series',coalesce((select jsonb_agg(to_jsonb(series) order by day) from series),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(to_jsonb(services) order by revenue_cents desc,product) from services),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(sources) order by sessions desc,source) from sources),'[]'::jsonb),
    'funnel',coalesce((select jsonb_agg(to_jsonb(funnel) order by event_name) from funnel),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_performance_report(text,date,date,text,text) from public,anon;
grant execute on function public.admin_performance_report(text,date,date,text,text) to authenticated;

-- Operational counters refresh independently from potentially long reports.
create function public.admin_dashboard_activity() returns jsonb
language plpgsql security definer set search_path='' as $$
declare stamp timestamptz:=statement_timestamp(); today_start timestamptz:=((statement_timestamp() at time zone 'America/Edmonton')::date)::timestamp at time zone 'America/Edmonton';
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(),false) then raise exception 'STAFF_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object('generated_at',stamp,'today_since',today_start,'until',stamp,'today',jsonb_build_object(
    'uploads',(public.admin_dashboard_queue('uploads','',0,today_start,stamp)->>'total')::bigint,
    'paid_clients',(public.admin_dashboard_queue('paid','',0,today_start,stamp)->>'total')::bigint,
    'submissions',(select count(*) from public.ticket_submissions where deleted_at is null and created_at>=today_start and created_at<stamp)));
end $$;
revoke all on function public.admin_dashboard_activity() from public,anon;
grant execute on function public.admin_dashboard_activity() to authenticated;

commit;
