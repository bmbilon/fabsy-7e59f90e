-- Privacy-safe visibility for the part of the paid journey that occurs before
-- optional browser measurement consent. This stores hourly counters only: no
-- visitor/session identifier, raw click ID, URL, referrer, IP or user agent.

create schema if not exists analytics_private;
revoke all on schema analytics_private from public, anon, authenticated;

create table analytics_private.preconsent_metrics_hourly (
  bucket_start timestamptz not null,
  event_name text not null,
  page_key text not null,
  locale text not null,
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  utm_content text not null default '',
  click_id_kind text not null default '',
  event_count bigint not null default 1,
  primary key (
    bucket_start, event_name, page_key, locale, utm_source,
    utm_medium, utm_campaign, utm_content, click_id_kind
  ),
  constraint preconsent_metric_bucket_check
    check (bucket_start = date_trunc('hour', bucket_start)),
  constraint preconsent_metric_event_check
    check (event_name in ('paid_landing','consent_accepted','consent_declined','consent_dismissed')),
  constraint preconsent_metric_page_check
    check (page_key in ('home','rapid_resolution','photo_radar','pro_drivers')),
  constraint preconsent_metric_locale_check
    check (locale in ('en','pa','tl','zh-hans','zh-hant','ar','hi','es')),
  constraint preconsent_metric_source_check
    check (utm_source in ('meta','facebook','instagram','google','openai','other_paid')),
  constraint preconsent_metric_medium_check
    check (utm_medium in ('cpc','ppc','paid','paid_social','paid-social')),
  constraint preconsent_metric_campaign_check
    check (utm_campaign in ('','rr_ab_en_creative_20260831','rr-pilot-calgary-202608','rr-pilot-edmonton-202608','rr-pilot-alberta-202608')),
  constraint preconsent_metric_content_check
    check (utm_content in ('','rr_relief_v1','rr_flat_fee_v1','rr_client_control_v1')),
  constraint preconsent_metric_click_kind_check
    check (click_id_kind in ('','gclid','gbraid','wbraid','fbclid')),
  constraint preconsent_metric_count_check check (event_count > 0)
);

alter table analytics_private.preconsent_metrics_hourly enable row level security;
revoke all on analytics_private.preconsent_metrics_hourly from public, anon, authenticated, service_role;

create or replace function public.record_preconsent_metric(
  p_event_name text,
  p_page_key text,
  p_locale text,
  p_utm_source text default '',
  p_utm_medium text default '',
  p_utm_campaign text default '',
  p_utm_content text default '',
  p_click_id_kind text default ''
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  source_value text := lower(coalesce(btrim(p_utm_source), ''));
  medium_value text := lower(coalesce(btrim(p_utm_medium), ''));
  campaign_value text := coalesce(btrim(p_utm_campaign), '');
  content_value text := coalesce(btrim(p_utm_content), '');
  click_kind text := lower(coalesce(btrim(p_click_id_kind), ''));
begin
  if p_event_name not in ('paid_landing','consent_accepted','consent_declined','consent_dismissed') or
      p_page_key not in ('home','rapid_resolution','photo_radar','pro_drivers') or
      p_locale not in ('en','pa','tl','zh-hans','zh-hant','ar','hi','es') then
    raise exception 'PRECONSENT_METRIC_INVALID';
  end if;
  if source_value not in ('meta','facebook','instagram','google','openai','other_paid') or
      medium_value not in ('cpc','ppc','paid','paid_social','paid-social') or
      campaign_value not in ('','rr_ab_en_creative_20260831','rr-pilot-calgary-202608','rr-pilot-edmonton-202608','rr-pilot-alberta-202608') or
      content_value not in ('','rr_relief_v1','rr_flat_fee_v1','rr_client_control_v1') or
      click_kind not in ('','gclid','gbraid','wbraid','fbclid') then
    raise exception 'PRECONSENT_CAMPAIGN_INVALID';
  end if;

  insert into analytics_private.preconsent_metrics_hourly (
    bucket_start, event_name, page_key, locale, utm_source, utm_medium,
    utm_campaign, utm_content, click_id_kind, event_count
  ) values (
    date_trunc('hour', clock_timestamp()), p_event_name, p_page_key, p_locale,
    source_value, medium_value, campaign_value, content_value, click_kind, 1
  )
  on conflict (
    bucket_start, event_name, page_key, locale, utm_source,
    utm_medium, utm_campaign, utm_content, click_id_kind
  ) do update set event_count = analytics_private.preconsent_metrics_hourly.event_count + 1;
  return true;
end;
$$;

revoke all on function public.record_preconsent_metric(text,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.record_preconsent_metric(text,text,text,text,text,text,text,text)
  to service_role;

create or replace function public.preconsent_measurement_report(
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
    raise exception 'PRECONSENT_REPORT_WINDOW_INVALID';
  end if;

  with source as (
    select *
    from analytics_private.preconsent_metrics_hourly
    where bucket_start >= date_trunc('hour', p_since)
      and bucket_start < p_until
  ), event_totals as (
    select event_name, sum(event_count)::bigint as event_count
    from source
    group by event_name
  ), campaign_totals as (
    select
      coalesce(nullif(utm_source, ''), '(click id)') as source,
      coalesce(nullif(utm_medium, ''), '(none)') as medium,
      coalesce(nullif(utm_campaign, ''), '(none)') as campaign,
      coalesce(nullif(utm_content, ''), '(none)') as content,
      locale,
      sum(event_count) filter (where event_name = 'paid_landing')::bigint as landing_requests,
      sum(event_count) filter (where event_name = 'consent_accepted')::bigint as consent_accepted,
      sum(event_count) filter (where event_name = 'consent_declined')::bigint as consent_declined,
      sum(event_count) filter (where event_name = 'consent_dismissed')::bigint as consent_dismissed
    from source
    group by utm_source, utm_medium, utm_campaign, utm_content, locale
  ), daily_totals as (
    select
      (bucket_start at time zone 'America/Edmonton')::date as day,
      sum(event_count) filter (where event_name = 'paid_landing')::bigint as landing_requests,
      sum(event_count) filter (where event_name = 'consent_accepted')::bigint as consent_accepted,
      sum(event_count) filter (where event_name = 'consent_declined')::bigint as consent_declined,
      sum(event_count) filter (where event_name = 'consent_dismissed')::bigint as consent_dismissed
    from source
    group by (bucket_start at time zone 'America/Edmonton')::date
  )
  select jsonb_build_object(
    'generated_at', clock_timestamp(),
    'since', p_since,
    'until', p_until,
    'aggregate_only', true,
    'request_counts_not_people_or_sessions', true,
    'events', coalesce((
      select jsonb_agg(to_jsonb(event_totals) order by event_name)
      from event_totals
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(to_jsonb(campaign_totals) order by landing_requests desc nulls last, source, campaign, content, locale)
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

revoke all on function public.preconsent_measurement_report(timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.preconsent_measurement_report(timestamptz,timestamptz)
  to service_role;

create or replace function public.purge_preconsent_metrics(
  p_before timestamptz default clock_timestamp() - interval '400 days'
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  removed bigint;
begin
  if p_before is null or p_before > clock_timestamp() - interval '180 days' then
    raise exception 'PRECONSENT_PURGE_BOUNDARY_INVALID';
  end if;
  delete from analytics_private.preconsent_metrics_hourly where bucket_start < p_before;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_preconsent_metrics(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_preconsent_metrics(timestamptz)
  to service_role;

comment on table analytics_private.preconsent_metrics_hourly is
  'Hourly aggregate paid-landing and consent-choice counters. Contains no visitor/session identifier, raw ad click ID, URL, referrer, IP address, user agent or form data.';
comment on function public.preconsent_measurement_report(timestamptz,timestamptz) is
  'Returns aggregate request and consent-choice counts only; counts do not represent unique people or sessions.';

select cron.schedule(
  'fabsy-preconsent-measurement-retention',
  '41 4 * * *',
  $cron$select public.purge_preconsent_metrics();$cron$
);
