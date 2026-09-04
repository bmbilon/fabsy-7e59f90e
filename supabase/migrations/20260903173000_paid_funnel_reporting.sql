create or replace function public.paid_funnel_report(
  p_since timestamptz,
  p_until timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  report jsonb;
begin
  if p_since is null or p_until is null or p_since >= p_until or
      p_since < p_until - interval '90 days' or p_until > clock_timestamp() + interval '5 minutes' then
    raise exception 'FUNNEL_REPORT_WINDOW_INVALID';
  end if;

  with source as (
    select *
    from analytics_private.paid_funnel_events
    where occurred_at >= p_since and occurred_at < p_until
  ), event_totals as (
    select event_name, count(*)::bigint as event_count, count(distinct session_id)::bigint as sessions
    from source
    group by event_name
  ), campaign_totals as (
    select
      coalesce(utm_source, '(direct)') as source,
      coalesce(utm_medium, '(none)') as medium,
      coalesce(utm_campaign, '(none)') as campaign,
      coalesce(utm_content, '(none)') as content,
      count(distinct session_id) filter (where event_name = 'landing_view')::bigint as landing_sessions,
      count(distinct session_id) filter (where event_name = 'primary_cta_click')::bigint as cta_sessions,
      count(distinct session_id) filter (where event_name = 'phone_click')::bigint as phone_sessions,
      count(distinct session_id) filter (where event_name = 'intake_started')::bigint as intake_sessions,
      count(distinct session_id) filter (where event_name = 'ticket_uploaded')::bigint as upload_sessions,
      count(distinct session_id) filter (where event_name = 'lead_saved')::bigint as lead_sessions,
      count(distinct session_id) filter (where event_name = 'checkout_started')::bigint as checkout_sessions,
      count(distinct session_id) filter (where event_name = 'checkout_canceled')::bigint as canceled_sessions,
      count(distinct session_id) filter (where event_name = 'purchase')::bigint as purchase_sessions
    from source
    group by coalesce(utm_source, '(direct)'), coalesce(utm_medium, '(none)'),
      coalesce(utm_campaign, '(none)'), coalesce(utm_content, '(none)')
  ), daily_totals as (
    select
      (occurred_at at time zone 'America/Edmonton')::date as day,
      count(distinct session_id) filter (where event_name = 'landing_view')::bigint as landing_sessions,
      count(distinct session_id) filter (where event_name = 'lead_saved')::bigint as lead_sessions,
      count(distinct session_id) filter (where event_name = 'purchase')::bigint as purchase_sessions
    from source
    group by (occurred_at at time zone 'America/Edmonton')::date
  )
  select jsonb_build_object(
    'generated_at', clock_timestamp(),
    'since', p_since,
    'until', p_until,
    'consented_sessions_only', true,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_name', event_name,
        'event_count', event_count,
        'sessions', sessions
      ) order by event_name)
      from event_totals
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(to_jsonb(campaign_totals) order by landing_sessions desc, source, campaign, content)
      from campaign_totals
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(daily_totals) order by day)
      from daily_totals
    ), '[]'::jsonb)
  ) into report;

  return report;
end;
$$;

revoke all on function public.paid_funnel_report(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.paid_funnel_report(timestamptz, timestamptz)
  to service_role;

comment on function public.paid_funnel_report(timestamptz, timestamptz) is
  'Returns only aggregate, consented, PII-free paid-funnel counts for a service-role caller after application-level staff authorization.';
