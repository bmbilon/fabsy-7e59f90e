-- Aggregate first-party document requests across public pages. One row per
-- hour/page/channel/source/campaign/device; no session or network identifiers.
create schema if not exists analytics_private;
create table analytics_private.traffic_collection_config (
  singleton boolean primary key default true check(singleton),
  started_at timestamptz
);
insert into analytics_private.traffic_collection_config(singleton) values(true);
alter table analytics_private.traffic_collection_config enable row level security;
revoke all on analytics_private.traffic_collection_config from public,anon,authenticated,service_role;
create table analytics_private.traffic_requests_hourly (
  bucket_start timestamptz not null,
  page text not null,
  channel text not null,
  source text not null,
  campaign text not null default '',
  device text not null,
  request_count bigint not null default 1 check (request_count > 0),
  primary key (bucket_start,page,channel,source,campaign,device),
  check (bucket_start = date_trunc('hour',bucket_start)),
  check (length(page) between 1 and 180 and page ~ '^/[a-z0-9/-]*$'),
  check (channel in ('Paid search','Paid social','Other paid','Organic search','Organic social','AI referral','Email','Referral','Direct / unknown')),
  check (source in ('Google','Bing','DuckDuckGo','Facebook','Meta','Instagram','LinkedIn','Reddit','YouTube','ChatGPT','Perplexity','Claude','Email','Other paid','Other referral','Direct / unknown')),
  check (campaign in ('','rr_ab_en_creative_20260831','rr_ab_multilingual_20260906','rr_google_profit_20260913','rr-pilot-calgary-202608','rr-pilot-edmonton-202608','rr-pilot-alberta-202608')),
  check (device in ('desktop','mobile','tablet'))
);
create index traffic_requests_hourly_bucket_idx on analytics_private.traffic_requests_hourly(bucket_start);
alter table analytics_private.traffic_requests_hourly enable row level security;
revoke all on analytics_private.traffic_requests_hourly from public,anon,authenticated,service_role;

create function public.record_traffic_request(p_page text,p_channel text,p_source text,p_campaign text,p_device text)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
begin
  -- Validate at the database boundary too, even though the edge reducer emits
  -- only fixed categories and a public path.
  if p_page is null or length(p_page) not between 1 and 180 or p_page !~ '^/[a-z0-9/-]*$' or
     p_channel not in ('Paid search','Paid social','Other paid','Organic search','Organic social','AI referral','Email','Referral','Direct / unknown') or
     p_source not in ('Google','Bing','DuckDuckGo','Facebook','Meta','Instagram','LinkedIn','Reddit','YouTube','ChatGPT','Perplexity','Claude','Email','Other paid','Other referral','Direct / unknown') or
     p_campaign not in ('','rr_ab_en_creative_20260831','rr_ab_multilingual_20260906','rr_google_profit_20260913','rr-pilot-calgary-202608','rr-pilot-edmonton-202608','rr-pilot-alberta-202608') or
     p_device not in ('desktop','mobile','tablet') then
    raise exception 'TRAFFIC_REQUEST_INVALID';
  end if;
  update analytics_private.traffic_collection_config set started_at=clock_timestamp()
    where singleton and started_at is null;
  insert into analytics_private.traffic_requests_hourly(bucket_start,page,channel,source,campaign,device)
    values(date_trunc('hour',clock_timestamp()),p_page,p_channel,p_source,p_campaign,p_device)
    on conflict(bucket_start,page,channel,source,campaign,device)
    do update set request_count = analytics_private.traffic_requests_hourly.request_count + 1;
  return true;
end $$;
revoke all on function public.record_traffic_request(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_traffic_request(text,text,text,text,text) to service_role;

-- Consented browser checkpoints: a session is counted once per public page and
-- stage. The short-lived dedupe rows expire with Live View after 48 hours.
alter table public.live_visitor_sessions drop constraint if exists live_visitor_sessions_source_check;
alter table public.live_visitor_sessions add constraint live_visitor_sessions_source_check
  check (source in ('Direct','Google','Google Ads','Bing','Facebook','Meta Ads','Instagram','ChatGPT','Perplexity','Email','Other paid','Other referral'));

create table public.live_visitor_page_stages (
  session_id uuid not null,
  page text not null,
  stage text not null check(stage in ('browsing','intake','review')),
  observed_at timestamptz not null default now(),
  primary key(session_id,page,stage)
);
create index live_visitor_page_stages_observed_idx on public.live_visitor_page_stages(observed_at);
alter table public.live_visitor_page_stages enable row level security;
revoke all on public.live_visitor_page_stages from public,anon,authenticated;
grant all on public.live_visitor_page_stages to service_role;

create table analytics_private.consented_activity_hourly (
  bucket_start timestamptz not null,
  page text not null,
  source text not null,
  stage text not null check(stage in ('browsing','intake','review')),
  sessions bigint not null default 1 check(sessions > 0),
  primary key(bucket_start,page,source,stage)
);
create index consented_activity_hourly_bucket_idx on analytics_private.consented_activity_hourly(bucket_start);
alter table analytics_private.consented_activity_hourly enable row level security;
revoke all on analytics_private.consented_activity_hourly from public,anon,authenticated,service_role;

create or replace function public.ingest_live_visitor(
  p_session_id uuid,p_page text,p_stage text,p_source text,p_device text,p_network_hash text,
  p_city text default null,p_region text default null,p_country text default null,
  p_latitude numeric default null,p_longitude numeric default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare rate_count integer; first_page integer; retained_source text;
begin
  insert into public.live_visitor_rate_limits(network_hash,bucket,requests)
    values(p_network_hash,date_trunc('minute',now()),1)
    on conflict(network_hash,bucket) do update set requests=public.live_visitor_rate_limits.requests+1
    returning requests into rate_count;
  if rate_count > 180 then return false; end if;
  insert into public.live_visitor_sessions(id,page,stage,source,device,city,region,country,latitude,longitude)
    values(p_session_id,p_page,p_stage,p_source,p_device,p_city,p_region,p_country,p_latitude,p_longitude)
    on conflict(id) do update set
      page=excluded.page,stage=excluded.stage,device=excluded.device,
      city=excluded.city,region=excluded.region,country=excluded.country,
      latitude=excluded.latitude,longitude=excluded.longitude,last_seen_at=now()
    where public.live_visitor_sessions.last_seen_at < now()-interval '10 seconds'
       or public.live_visitor_sessions.page <> excluded.page
       or public.live_visitor_sessions.stage <> excluded.stage;
  select source into retained_source from public.live_visitor_sessions where id=p_session_id;
  insert into public.live_visitor_page_stages(session_id,page,stage)
    values(p_session_id,p_page,p_stage) on conflict do nothing returning 1 into first_page;
  if first_page = 1 then
    insert into analytics_private.consented_activity_hourly(bucket_start,page,source,stage)
      values(date_trunc('hour',clock_timestamp()),p_page,retained_source,p_stage)
      on conflict(bucket_start,page,source,stage)
      do update set sessions=analytics_private.consented_activity_hourly.sessions+1;
  end if;
  return true;
end $$;

create or replace function public.cleanup_live_view() returns void
language sql security definer set search_path = '' as $$
  delete from public.live_visitor_page_stages where observed_at < now()-interval '48 hours';
  delete from public.live_visitor_sessions where last_seen_at < now()-interval '48 hours';
  delete from public.live_visitor_rate_limits where bucket < now()-interval '2 hours';
$$;

create function public.all_source_traffic_report(p_since timestamptz,p_until timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare result jsonb;
begin
  if p_since is null or p_until is null or p_since >= p_until or
     p_since < p_until - interval '90 days' or p_until > clock_timestamp() + interval '5 minutes' then
    raise exception 'TRAFFIC_REPORT_WINDOW_INVALID';
  end if;
  with current_rows as materialized (
    select * from analytics_private.traffic_requests_hourly
    where bucket_start >= date_trunc('hour',p_since) and bucket_start < p_until
  ), previous_rows as (
    select coalesce(sum(request_count),0) as requests
    from analytics_private.traffic_requests_hourly
    where bucket_start >= date_trunc('hour',p_since - (p_until-p_since))
      and bucket_start < date_trunc('hour',p_since)
  ), channels as (
    select channel,sum(request_count)::bigint requests from current_rows group by channel
  ), sources as (
    select channel,source,sum(request_count)::bigint requests from current_rows group by channel,source
  ), pages as (
    select page,sum(request_count)::bigint requests from current_rows group by page order by requests desc,page limit 100
  ), combinations as (
    select channel,source,page,campaign,device,sum(request_count)::bigint requests
    from current_rows group by channel,source,page,campaign,device
    order by requests desc,channel,source,page limit 500
  ), devices as (
    select device,sum(request_count)::bigint requests from current_rows group by device
  ), daily as (
    select (bucket_start at time zone 'America/Edmonton')::date as day,sum(request_count)::bigint as requests
    from current_rows group by 1
  ), recent_hours as (
    select h.bucket_start,coalesce(sum(r.request_count),0)::bigint requests
    from generate_series(date_trunc('hour',p_until)-interval '23 hours',date_trunc('hour',p_until),interval '1 hour') h(bucket_start)
    left join current_rows r on r.bucket_start=h.bucket_start
    group by h.bucket_start
  ), activity as (
    select source,page,stage,sum(sessions)::bigint sessions
    from analytics_private.consented_activity_hourly
    where bucket_start >= date_trunc('hour',p_since) and bucket_start < p_until
    group by source,page,stage order by sessions desc,source,page,stage limit 500
  )
  select jsonb_build_object(
    'generated_at',clock_timestamp(),'since',p_since,'until',p_until,
    'collection_started_at',(select started_at from analytics_private.traffic_collection_config where singleton),
    'comparison_complete',coalesce((select started_at <= p_since-(p_until-p_since) from analytics_private.traffic_collection_config where singleton),false),
    'request_counts_not_people_or_sessions',true,
    'requests',coalesce((select sum(request_count) from current_rows),0),
    'previous_requests',(select requests from previous_rows),
    'this_hour',coalesce((select sum(request_count) from current_rows where bucket_start=date_trunc('hour',p_until)),0),
    'submissions',(select count(*) from public.ticket_submissions where deleted_at is null and created_at >= p_since and created_at < p_until),
    'channels',coalesce((select jsonb_agg(to_jsonb(c) order by requests desc,channel) from channels c),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(s) order by requests desc,channel,source) from sources s),'[]'::jsonb),
    'pages',coalesce((select jsonb_agg(to_jsonb(p) order by requests desc,page) from pages p),'[]'::jsonb),
    'breakdown',coalesce((select jsonb_agg(to_jsonb(b) order by requests desc,channel,source,page) from combinations b),'[]'::jsonb),
    'devices',coalesce((select jsonb_agg(to_jsonb(d) order by requests desc,device) from devices d),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(to_jsonb(d) order by day) from daily d),'[]'::jsonb),
    'recent_hours',coalesce((select jsonb_agg(to_jsonb(h) order by bucket_start) from recent_hours h),'[]'::jsonb)
    ,'consented_activity',coalesce((select jsonb_agg(to_jsonb(a) order by sessions desc,source,page,stage) from activity a),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.all_source_traffic_report(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.all_source_traffic_report(timestamptz,timestamptz) to service_role;

create function public.purge_traffic_requests(p_before timestamptz default clock_timestamp()-interval '400 days')
returns bigint language plpgsql security definer set search_path = pg_catalog as $$
declare removed bigint; activity_removed bigint;
begin
  if p_before is null or p_before > clock_timestamp()-interval '180 days' then raise exception 'TRAFFIC_PURGE_BOUNDARY_INVALID'; end if;
  delete from analytics_private.traffic_requests_hourly where bucket_start < p_before;
  get diagnostics removed = row_count;
  delete from analytics_private.consented_activity_hourly where bucket_start < p_before;
  get diagnostics activity_removed = row_count;
  return removed + activity_removed;
end $$;
revoke all on function public.purge_traffic_requests(timestamptz) from public,anon,authenticated;
grant execute on function public.purge_traffic_requests(timestamptz) to service_role;
select cron.schedule('fabsy-traffic-requests-retention','43 4 * * *',$cron$select public.purge_traffic_requests();$cron$);
