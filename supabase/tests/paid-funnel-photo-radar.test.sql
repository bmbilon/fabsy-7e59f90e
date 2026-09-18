\set ON_ERROR_STOP on

begin;

truncate analytics_private.paid_funnel_events,
  analytics_private.paid_funnel_checkouts,
  analytics_private.paid_funnel_checkout_withdrawals,
  analytics_private.paid_payment_purchases,
  analytics_private.paid_payment_refunds;

-- One real session visits both offers, while a separate QA session visits
-- Photo Radar. Every public checkpoint must survive per page, exactly once.
set role service_role;
do $$
declare
  fixture record;
  event_name text;
  event_position text;
  event_id uuid;
begin
  for fixture in select * from (values
    ('real', 'rapid_resolution', 'photo_launch'),
    ('real', 'photo_radar', 'photo_launch'),
    ('qa', 'photo_radar', 'qa_photo_launch')
  ) entry(session_key, page_key, campaign) loop
    foreach event_name in array array[
      'landing_view','primary_cta_viewed','primary_cta_click','phone_click',
      'engaged_10s','engaged_30s','engaged_60s',
      'scroll_25','scroll_50','scroll_75','scroll_90'
    ] loop
      event_id := md5('photo-event-' || fixture.session_key || fixture.page_key || event_name)::uuid;
      event_position := case when event_name in ('primary_cta_viewed','primary_cta_click','phone_click') then 'hero' end;
      if public.record_paid_funnel_event(
        event_id, md5('photo-session-' || fixture.session_key)::uuid,
        event_name, clock_timestamp() - interval '1 hour', fixture.page_key,
        p_position => event_position, p_utm_source => 'google', p_utm_medium => 'cpc',
        p_utm_campaign => fixture.campaign,
        p_consent_version => 'fabsy-funnel-v1', p_consented_at => clock_timestamp() - interval '2 hours'
      ) is distinct from true then raise exception 'public checkpoint rejected: % %', fixture.page_key, event_name; end if;

      -- Both an identical retry and a newly generated ID for the same page,
      -- event and position must acknowledge success without another row.
      if public.record_paid_funnel_event(
        event_id, md5('photo-session-' || fixture.session_key)::uuid,
        event_name, clock_timestamp() - interval '1 hour', fixture.page_key,
        p_position => event_position, p_utm_source => 'google', p_utm_medium => 'cpc',
        p_utm_campaign => fixture.campaign,
        p_consent_version => 'fabsy-funnel-v1', p_consented_at => clock_timestamp() - interval '2 hours'
      ) is distinct from true or public.record_paid_funnel_event(
        md5(event_id::text || '-retry')::uuid, md5('photo-session-' || fixture.session_key)::uuid,
        event_name, clock_timestamp() - interval '1 hour', fixture.page_key,
        p_position => event_position, p_utm_source => 'google', p_utm_medium => 'cpc',
        p_utm_campaign => fixture.campaign,
        p_consent_version => 'fabsy-funnel-v1', p_consented_at => clock_timestamp() - interval '2 hours'
      ) is distinct from true then raise exception 'checkpoint retry not acknowledged'; end if;
    end loop;
  end loop;

  -- An event ID belonging to the other page cannot falsely acknowledge an
  -- unrecorded action at a new position on Photo Radar.
  if public.record_paid_funnel_event(
    md5('photo-event-realrapid_resolutionprimary_cta_click')::uuid,
    md5('photo-session-real')::uuid, 'primary_cta_click',
    clock_timestamp() - interval '1 hour', 'photo_radar', p_position => 'footer',
    p_consent_version => 'fabsy-funnel-v1', p_consented_at => clock_timestamp() - interval '2 hours'
  ) is distinct from false then raise exception 'other page event falsely acknowledged'; end if;
end
$$;
reset role;

do $$
begin
  if (select count(*) from analytics_private.paid_funnel_events) <> 33 or
      (select count(*) from analytics_private.paid_funnel_events where page_key = 'photo_radar') <> 22 or
      (select count(*) from analytics_private.paid_funnel_events where page_key = 'rapid_resolution') <> 11 then
    raise exception 'page-specific checkpoints were dropped or same-page retries duplicated';
  end if;
end
$$;

set role service_role;
do $$
declare
  fixture record;
  constraint_name text;
begin
  -- All intake diagnostics stay on intake, and canceled checkout stays on its
  -- existing private page. Public checkpoints cannot be emitted there either.
  for fixture in select * from (values
    ('intake_started', 'photo_radar', null::smallint),
    ('intake_step_viewed', 'photo_radar', 1::smallint),
    ('intake_validation_blocked', 'photo_radar', 1::smallint),
    ('ticket_upload_started', 'photo_radar', null::smallint),
    ('ticket_upload_failed', 'photo_radar', null::smallint),
    ('ticket_uploaded', 'photo_radar', null::smallint),
    ('lead_saved', 'photo_radar', null::smallint),
    ('intake_step_completed', 'photo_radar', 1::smallint),
    ('checkout_started', 'photo_radar', null::smallint),
    ('checkout_canceled', 'photo_radar', null::smallint),
    ('landing_view', 'intake', null::smallint),
    ('landing_view', 'payment_canceled', null::smallint),
    ('landing_view', 'thank_you', null::smallint)
  ) entry(event_name, page_key, step) loop
    begin
      perform public.record_paid_funnel_event(
        md5('invalid-event-' || fixture.event_name || fixture.page_key)::uuid,
        md5('invalid-session-' || fixture.event_name || fixture.page_key)::uuid,
        fixture.event_name, clock_timestamp(), fixture.page_key, p_step => fixture.step,
        p_consent_version => 'fabsy-funnel-v1', p_consented_at => clock_timestamp()
      );
      raise exception 'invalid page/event combination admitted: % %', fixture.page_key, fixture.event_name;
    exception when check_violation then
      get stacked diagnostics constraint_name = constraint_name;
      if constraint_name <> 'paid_funnel_event_page_check' then raise; end if;
    end;
  end loop;

  begin
    perform public.record_paid_funnel_event(
      md5('unknown-page-event')::uuid, md5('unknown-page-session')::uuid,
      'landing_view', clock_timestamp(), 'photo_radar_private',
      p_consent_version => 'fabsy-funnel-v1', p_consented_at => clock_timestamp()
    );
    raise exception 'unknown page admitted';
  exception when others then
    if sqlerrm <> 'FUNNEL_PAGE_INVALID' then raise; end if;
  end;

  for fixture in select * from (values
    (null::text, null::timestamptz),
    ('fabsy-funnel-v1', null::timestamptz),
    ('invalid-version', clock_timestamp()),
    ('fabsy-funnel-v1', clock_timestamp() - interval '181 days'),
    ('fabsy-funnel-v1', clock_timestamp() + interval '10 minutes')
  ) entry(version, consented_at) loop
    begin
      perform public.record_paid_funnel_event(
        md5('no-consent-event')::uuid, md5('no-consent-session')::uuid,
        'landing_view', clock_timestamp(), 'photo_radar',
        p_consent_version => fixture.version, p_consented_at => fixture.consented_at
      );
      raise exception 'invalid consent admitted';
    exception when others then
      if sqlerrm <> 'FUNNEL_CONSENT_INVALID' then raise; end if;
    end;
  end loop;

  begin
    perform public.record_paid_funnel_event(
      md5('browser-purchase-event')::uuid, md5('browser-purchase-session')::uuid,
      'purchase', clock_timestamp(), 'photo_radar', p_product => 'photo_radar',
      p_consent_version => 'fabsy-funnel-v1', p_consented_at => clock_timestamp()
    );
    raise exception 'browser purchase admitted';
  exception when others then
    if sqlerrm <> 'FUNNEL_PURCHASE_REQUIRES_VERIFIED_WEBHOOK' then raise; end if;
  end;

  -- A Photo Radar QA purchase stays in signed cash totals, while its
  -- consented purchase event inherits the QA marker and remains excluded.
  if public.record_paid_funnel_checkout(
    repeat('1', 64), md5('photo-session-qa')::uuid,
    'fabsy-funnel-v1', clock_timestamp() - interval '2 hours'
  ) is distinct from true or public.record_paid_payment_purchase(
    repeat('1', 64), repeat('2', 64), repeat('3', 64),
    clock_timestamp() - interval '30 minutes', 'photo_radar', 4200, 200, 'cad'
  ) is distinct from true or public.record_verified_paid_funnel_purchase(
    repeat('1', 64), md5('photo-verified-purchase')::uuid,
    clock_timestamp() - interval '30 minutes', 'photo_radar'
  ) is distinct from true then raise exception 'verified Photo Radar purchase rejected'; end if;
end
$$;
reset role;

create temporary table photo_radar_results (funnel jsonb, behavior jsonb);
grant insert on photo_radar_results to service_role;
set role service_role;
insert into photo_radar_results
select public.paid_funnel_report(clock_timestamp() - interval '1 day', clock_timestamp()),
  public.paid_funnel_behavior_report(clock_timestamp() - interval '1 day', clock_timestamp());
reset role;

do $$
declare
  funnel jsonb;
  behavior jsonb;
  recorder regprocedure := 'public.record_paid_funnel_event(uuid,uuid,text,timestamptz,text,smallint,text,text,text,text,text,text,text,text,text,text,timestamptz)'::regprocedure;
begin
  select result.funnel, result.behavior into funnel, behavior from photo_radar_results result;
  if jsonb_array_length(funnel->'events') <> 11 or exists (
    select 1 from jsonb_array_elements(funnel->'events') event
    where (event->>'event_count')::bigint <> 2 or (event->>'sessions')::bigint <> 1
  ) then raise exception 'two offer events should share one report session and exclude QA'; end if;
  if jsonb_array_length(funnel->'campaigns') <> 1 or
      funnel #>> '{campaigns,0,campaign}' <> 'photo_launch' or
      (funnel #>> '{campaigns,0,landing_sessions}')::bigint <> 1 or
      (funnel #>> '{campaigns,0,cta_sessions}')::bigint <> 1 or
      (funnel #>> '{campaigns,0,phone_sessions}')::bigint <> 1 or
      (select sum((day->>'landing_sessions')::bigint) from jsonb_array_elements(funnel->'daily') day) <> 1 then
    raise exception 'Photo Radar changed campaign/daily distinct-session totals';
  end if;
  if jsonb_array_length(behavior->'campaigns') <> 1 or
      behavior #>> '{campaigns,0,campaign}' <> 'photo_launch' or exists (
        select 1 from jsonb_each_text(behavior #> '{campaigns,0}') metric
        where metric.key in ('cta_viewed_sessions','engaged_10s_sessions','engaged_30s_sessions',
          'engaged_60s_sessions','scroll_25_sessions','scroll_50_sessions','scroll_75_sessions','scroll_90_sessions')
          and metric.value <> '1'
      ) then raise exception 'Photo Radar changed behavior distinct-session totals'; end if;
  if (funnel #>> '{financials,purchase_count}')::bigint <> 1 or
      (funnel #>> '{financials,purchase_cohort,gross_purchase_amount_cents}')::bigint <> 4200 or
      (funnel #>> '{financials,purchases_by_product_currency,0,product}') <> 'photo_radar' or
      (select count(*) from analytics_private.paid_funnel_events) <> 34 then
    raise exception 'Photo Radar QA exclusion changed cash facts or deleted private events';
  end if;
  if has_function_privilege('anon', recorder, 'execute') or
      has_function_privilege('authenticated', recorder, 'execute') or
      not has_function_privilege('service_role', recorder, 'execute') or
      exists (select 1 from pg_proc proc, lateral aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) acl
        where proc.oid = recorder and acl.grantee = 0 and acl.privilege_type = 'EXECUTE') or
      has_table_privilege('service_role', 'analytics_private.paid_funnel_events', 'select,insert') then
    raise exception 'Photo Radar migration expanded private ledger access';
  end if;
end
$$;

rollback;
select 'paid funnel Photo Radar page tests passed' as result;
