begin;

create table public.live_view_config (
  singleton boolean primary key default true check(singleton),
  collection_started_at timestamptz not null default now()
);
insert into public.live_view_config(singleton) values(true);

create table public.live_visitor_sessions (
  id uuid primary key,
  page text not null check(length(page) between 1 and 180 and page !~ '[?#%\\[:space:]]'),
  stage text not null check(stage in ('browsing','intake','review')),
  source text not null check(source in ('Direct','Google','Bing','Facebook','Instagram','ChatGPT','Perplexity','Other referral')),
  device text not null check(device in ('mobile','tablet','desktop')),
  city text check(length(city) <= 80), region text check(length(region) <= 80), country text check(length(country) <= 80),
  latitude numeric check(latitude between -90 and 90), longitude numeric check(longitude between -180 and 180),
  started_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create index live_visitor_last_seen_idx on public.live_visitor_sessions(last_seen_at);
create index live_visitor_started_idx on public.live_visitor_sessions(started_at);

create table public.live_visitor_rate_limits (
  network_hash text not null check(network_hash ~ '^[0-9a-f]{64}$'),
  bucket timestamptz not null, requests integer not null,
  primary key(network_hash,bucket)
);
create index live_visitor_rate_bucket_idx on public.live_visitor_rate_limits(bucket);

alter table public.live_view_config enable row level security;
alter table public.live_visitor_sessions enable row level security;
alter table public.live_visitor_rate_limits enable row level security;
revoke all on public.live_view_config,public.live_visitor_sessions,public.live_visitor_rate_limits from public,anon,authenticated;
grant all on public.live_view_config,public.live_visitor_sessions,public.live_visitor_rate_limits to service_role;

create function public.ingest_live_visitor(
  p_session_id uuid,p_page text,p_stage text,p_source text,p_device text,p_network_hash text,
  p_city text default null,p_region text default null,p_country text default null,
  p_latitude numeric default null,p_longitude numeric default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare rate_count integer;
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
    -- Limit writes from duplicate tabs, while allowing navigation/stage updates.
    where public.live_visitor_sessions.last_seen_at < now()-interval '10 seconds'
       or public.live_visitor_sessions.page <> excluded.page
       or public.live_visitor_sessions.stage <> excluded.stage;
  return true;
end;
$$;
revoke all on function public.ingest_live_visitor(uuid,text,text,text,text,text,text,text,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.ingest_live_visitor(uuid,text,text,text,text,text,text,text,text,numeric,numeric) to service_role;

create function public.admin_live_view() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
  day_start timestamptz := date_trunc('day',now() at time zone 'America/Edmonton') at time zone 'America/Edmonton';
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin'::public.app_role) then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  with active as materialized (
    select * from public.live_visitor_sessions where last_seen_at > now()-interval '90 seconds'
  ), visitors as (
    select * from active order by last_seen_at desc,id limit 200
  ), locations as (
    select city,region,country,latitude,longitude,count(*) as count from active
    group by city,region,country,latitude,longitude order by count(*) desc limit 200
  ), pages as (
    select page,count(*) as count from active group by page order by count(*) desc,page limit 10
  ), sources as (
    select source,count(*) as count from active group by source order by count(*) desc,source
  ), minutes as (
    select generate_series(date_trunc('minute',now())-interval '29 minutes',date_trunc('minute',now()),interval '1 minute') as minute
  ), recent as (
    select date_trunc('minute',started_at) as minute,count(*) as sessions from public.live_visitor_sessions
    where started_at >= date_trunc('minute',now())-interval '29 minutes' group by 1
  ), timeline as (
    select m.minute,coalesce(r.sessions,0) as sessions from minutes m left join recent r using(minute) order by m.minute
  )
  select jsonb_build_object(
    'generated_at',now(),'window_seconds',90,
    'collection_started_at',(select collection_started_at from public.live_view_config where singleton),
    'active',(select count(*) from active),
    'sessions_today',(select count(*) from public.live_visitor_sessions where started_at >= day_start and started_at <= now()),
    'submissions_today',(select count(*) from public.ticket_submissions where created_at >= day_start and created_at <= now()),
    'paid_cases_today',(select count(*) from public.ticket_submissions
      where (representation_paid_at >= day_start and representation_paid_at <= now())
         or (assessment_paid_at >= day_start and assessment_paid_at <= now())),
    'stages',jsonb_build_object(
      'browsing',(select count(*) from active where stage='browsing'),
      'intake',(select count(*) from active where stage='intake'),
      'review',(select count(*) from active where stage='review')),
    'visitors',coalesce((select jsonb_agg(to_jsonb(v)) from visitors v),'[]'::jsonb),
    'visitors_truncated',(select count(*) > 200 from active),
    'locations',coalesce((select jsonb_agg(to_jsonb(l)) from locations l),'[]'::jsonb),
    'pages',coalesce((select jsonb_agg(to_jsonb(p)) from pages p),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(s)) from sources s),'[]'::jsonb),
    'timeline',(select jsonb_agg(to_jsonb(t)) from timeline t)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_live_view() from public,anon;
grant execute on function public.admin_live_view() to authenticated;

create function public.cleanup_live_view() returns void
language sql security definer set search_path = '' as $$
  delete from public.live_visitor_sessions where last_seen_at < now()-interval '48 hours';
  delete from public.live_visitor_rate_limits where bucket < now()-interval '2 hours';
$$;
revoke all on function public.cleanup_live_view() from public,anon,authenticated;
grant execute on function public.cleanup_live_view() to service_role;

-- pg_cron is already used by Fabsy's operational workers. Do not change existing jobs.
select cron.schedule('live-view-retention','17 * * * *','select public.cleanup_live_view()');

commit;
