\set ON_ERROR_STOP on

begin;

-- Isolate synthetic traffic from any fixtures already loaded by the runner.
truncate analytics_private.paid_funnel_events,
  analytics_private.paid_funnel_checkouts,
  analytics_private.paid_funnel_checkout_withdrawals,
  analytics_private.paid_payment_purchases,
  analytics_private.paid_payment_refunds;

create temporary table verification_fixtures (
  id integer primary key,
  source text,
  medium text,
  campaign text,
  content text,
  excluded boolean,
  click_kind text default null,
  expected_source text default null,
  expected_medium text default null
);
insert into verification_fixtures (id, source, medium, campaign, content, excluded) values
  (1, 'readiness', 'qa', 'paid_acquisition_final', 'google_provider_readback_20260906', true),
  (2, 'meta', 'paid_social', 'qa_measurement_20260911', null, true),
  (3, 'chatgpt.com', 'referral', 'fabsy_aeo_verification_20260915', null, true),
  (4, 'QA', 'paid', 'launch', null, true),
  (5, 'google', 'Qa', 'launch', null, true),
  (6, 'meta', 'paid_social', 'QA_BROWSER_SMOKE', null, true),
  (7, null, null, null, null, false),
  (8, 'meta', 'paid_social', 'rr_alberta', null, false),
  (9, 'google', 'cpc', 'split_test_autumn', 'qa_measurement', false),
  (10, 'quality', 'paid', 'qaXmeasurement', null, false),
  (11, 'readiness', 'paid', 'paid_acquisition_final', null, false),
  (12, 'chatgpt.com', 'referral', 'fabsy_aeoXverification_20260915', null, false),
  (13, 'meta', 'paid_social', 'autumn_qa_measurement', null, false);

insert into verification_fixtures (id, source, medium, campaign, excluded, click_kind, expected_source, expected_medium) values
  (14, null, null, 'gclid_only', false, 'gclid', 'google', 'cpc'),
  (15, null, null, 'gbraid_only', false, 'gbraid', 'google', 'cpc'),
  (16, null, null, 'wbraid_only', false, 'wbraid', 'google', 'cpc'),
  (17, null, null, 'fbclid_only', false, 'fbclid', 'meta', '(none)'),
  (18, 'explicit_source', null, 'preserve_source', false, 'gclid', 'explicit_source', '(none)'),
  (19, null, 'referral', 'preserve_medium', false, 'gclid', 'google', 'referral'),
  (20, 'explicit_source', 'explicit_medium', 'preserve_both', false, 'fbclid', 'explicit_source', 'explicit_medium');

-- Give every fixture a complete journey plus diagnostic checkpoints. This
-- catches partial filtering (cards only, campaigns only, or daily only).
insert into analytics_private.paid_funnel_events (
  event_id, session_id, event_name, occurred_at, page_key, step, product,
  utm_source, utm_medium, utm_campaign, utm_content, click_id_kind, click_id_hash, consent_version, consented_at
)
select md5('verification-event-' || fixture.id || '-' || event.name)::uuid,
  md5('verification-session-' || fixture.id)::uuid,
  event.name, clock_timestamp() - interval '2 hours', event.page_key, event.step,
  case when event.name = 'purchase' then 'rapid_resolution' else null end,
  fixture.source, fixture.medium, fixture.campaign, fixture.content,
  fixture.click_kind, case when fixture.click_kind is not null then repeat('9', 64) else null end,
  'fabsy-funnel-v1', clock_timestamp() - interval '3 hours'
from verification_fixtures fixture
cross join (values
  ('landing_view', 'rapid_resolution', null::smallint),
  ('engaged_10s', 'rapid_resolution', null::smallint),
  ('scroll_25', 'rapid_resolution', null::smallint),
  ('intake_started', 'intake', null::smallint),
  ('ticket_upload_started', 'intake', null::smallint),
  ('ticket_upload_failed', 'intake', null::smallint),
  ('ticket_uploaded', 'intake', null::smallint),
  ('lead_saved', 'intake', null::smallint),
  ('intake_step_viewed', 'intake', 1::smallint),
  ('intake_validation_blocked', 'intake', 1::smallint),
  ('intake_step_completed', 'intake', 1::smallint),
  ('purchase', 'thank_you', null::smallint)
) event(name, page_key, step);

-- Signed cash facts must remain all-customer even when their optional funnel
-- link has a verification marker. Attribution and cash have different scopes.
set role service_role;
do $$
begin
  perform public.record_paid_funnel_checkout(
    repeat('1', 64), md5('verification-session-1')::uuid,
    'fabsy-funnel-v1', clock_timestamp() - interval '3 hours'
  );
  perform public.record_paid_payment_purchase(
    repeat('1', 64), repeat('2', 64), repeat('3', 64),
    clock_timestamp() - interval '1 hour', 'rapid_resolution', 21000, 1000, 'cad'
  );
  perform public.record_paid_payment_purchase(
    repeat('4', 64), repeat('5', 64), repeat('6', 64),
    clock_timestamp() - interval '1 hour', 'rapid_resolution', 21000, 1000, 'cad'
  );
  perform public.record_paid_payment_refund(
    repeat('7', 64), repeat('2', 64), repeat('8', 64),
    clock_timestamp() - interval '30 minutes', clock_timestamp() - interval '30 minutes',
    1000, 'cad', 'succeeded'
  );
end
$$;
reset role;

create temporary table verification_results (funnel jsonb, behavior jsonb);
grant insert on verification_results to service_role;
set role service_role;
insert into verification_results
select public.paid_funnel_report(clock_timestamp() - interval '1 day', clock_timestamp()),
  public.paid_funnel_behavior_report(clock_timestamp() - interval '1 day', clock_timestamp());
reset role;

do $$
declare
  funnel jsonb;
  behavior jsonb;
  expected_sessions bigint := (select count(*) from verification_fixtures where not excluded);
  expected_rows bigint := (select count(*) * 12 from verification_fixtures);
begin
  select result.funnel, result.behavior into funnel, behavior from verification_results result;
  if (funnel->>'verification_traffic_excluded')::boolean is distinct from true or
      (behavior->>'verification_traffic_excluded')::boolean is distinct from true then
    raise exception 'report does not disclose verification exclusion';
  end if;
  if jsonb_array_length(funnel->'events') <> 12 or exists (
    select 1 from jsonb_array_elements(funnel->'events') event
    where (event->>'event_count')::bigint <> expected_sessions or
      (event->>'sessions')::bigint <> expected_sessions
  ) then raise exception 'event totals include verification or dropped real traffic'; end if;
  if jsonb_array_length(funnel->'campaigns') <> expected_sessions or
      jsonb_array_length(behavior->'campaigns') <> expected_sessions then
    raise exception 'campaign totals include verification or dropped real traffic';
  end if;
  if exists (
    select 1 from jsonb_array_elements(funnel->'campaigns') campaign
    where analytics_private.is_paid_funnel_verification(
      campaign->>'source', campaign->>'medium', campaign->>'campaign'
    )
  ) or exists (
    select 1 from jsonb_array_elements(behavior->'campaigns') campaign
    where analytics_private.is_paid_funnel_verification(
      campaign->>'source', campaign->>'medium', campaign->>'campaign'
    )
  ) then raise exception 'verification campaign leaked into a report'; end if;
  if (select sum((day->>'landing_sessions')::bigint) from jsonb_array_elements(funnel->'daily') day) <> expected_sessions or
      (select sum((day->>'lead_sessions')::bigint) from jsonb_array_elements(funnel->'daily') day) <> expected_sessions or
      (select sum((day->>'purchase_sessions')::bigint) from jsonb_array_elements(funnel->'daily') day) <> expected_sessions then
    raise exception 'daily totals do not share the verification exclusion';
  end if;
  if (behavior #>> '{steps,0,viewed_sessions}')::bigint <> expected_sessions or
      (behavior #>> '{steps,0,blocked_sessions}')::bigint <> expected_sessions or
      (behavior #>> '{steps,0,completed_sessions}')::bigint <> expected_sessions or
      (select sum((campaign->>'engaged_10s_sessions')::bigint) from jsonb_array_elements(behavior->'campaigns') campaign) <> expected_sessions then
    raise exception 'behavior totals do not share the verification exclusion';
  end if;
  if exists (
    select 1 from verification_fixtures fixture
    left join lateral (
      select entry.value as campaign from jsonb_array_elements(funnel->'campaigns') entry(value)
      where entry.value->>'campaign' = fixture.campaign
    ) reported on true
    left join lateral (
      select entry.value as campaign from jsonb_array_elements(behavior->'campaigns') entry(value)
      where entry.value->>'campaign' = fixture.campaign
    ) diagnostic on true
    where fixture.click_kind is not null and (
      reported.campaign->>'source' is distinct from fixture.expected_source or
      reported.campaign->>'medium' is distinct from fixture.expected_medium or
      diagnostic.campaign->>'source' is distinct from fixture.expected_source or
      diagnostic.campaign->>'medium' is distinct from fixture.expected_medium
    )
  ) then raise exception 'stored click source recovery failed or overwrote explicit UTMs'; end if;
  if exists (
    select 1 from analytics_private.paid_funnel_events event
    join verification_fixtures fixture on event.session_id = md5('verification-session-' || fixture.id)::uuid
    where event.utm_source is distinct from fixture.source or event.utm_medium is distinct from fixture.medium
  ) then raise exception 'report source recovery rewrote original attribution'; end if;
  if (select count(*) from analytics_private.paid_funnel_events) <> expected_rows then
    raise exception 'raw verification events were deleted';
  end if;
  if (funnel #>> '{financials,scope}') <> 'all_customer_purchases_from_signed_stripe_webhooks' or
      (funnel #>> '{financials,purchase_count}')::bigint <> 2 or
      (funnel #>> '{financials,currently_attributed_purchase_count}')::bigint <> 1 or
      (funnel #>> '{financials,unattributed_or_withdrawn_purchase_count}')::bigint <> 1 or
      (funnel #>> '{financials,succeeded_refund_amount_cents}')::bigint <> 1000 or
      (funnel #>> '{financials,purchase_cohort,gross_purchase_amount_cents}')::bigint <> 42000 or
      (funnel #>> '{financials,purchase_cohort,gross_refund_adjusted_amount_cents}')::bigint <> 41000 then
    raise exception 'verification exclusion changed all-customer cash facts';
  end if;
end
$$;

-- Window boundaries and service-only access remain in force.
set role service_role;
do $$
declare
  empty_funnel jsonb;
  empty_behavior jsonb;
begin
  empty_funnel := public.paid_funnel_report(clock_timestamp() - interval '1 minute', clock_timestamp());
  empty_behavior := public.paid_funnel_behavior_report(clock_timestamp() - interval '1 minute', clock_timestamp());
  if empty_funnel->'events' <> '[]'::jsonb or empty_funnel->'daily' <> '[]'::jsonb or
      empty_behavior->'steps' <> '[]'::jsonb then
    raise exception 'out-of-window events leaked into reports';
  end if;
  begin
    perform public.paid_funnel_report(clock_timestamp() - interval '91 days', clock_timestamp());
    raise exception 'invalid report window accepted';
  exception when others then
    if sqlerrm <> 'FUNNEL_REPORT_WINDOW_INVALID' then raise; end if;
  end;
  begin
    perform public.paid_funnel_behavior_report(clock_timestamp(), clock_timestamp() - interval '1 minute');
    raise exception 'invalid behavior window accepted';
  exception when others then
    if sqlerrm <> 'FUNNEL_REPORT_WINDOW_INVALID' then raise; end if;
  end;
end
$$;
reset role;

do $$
begin
  if has_function_privilege('anon', 'public.paid_funnel_report(timestamptz,timestamptz)', 'execute') or
      has_function_privilege('authenticated', 'public.paid_funnel_behavior_report(timestamptz,timestamptz)', 'execute') or
      has_function_privilege('service_role', 'analytics_private.is_paid_funnel_verification(text,text,text)', 'execute') or
      has_table_privilege('service_role', 'analytics_private.paid_funnel_events', 'select') then
    raise exception 'report migration expanded private-data access';
  end if;
end
$$;

rollback;
select 'paid funnel verification exclusion tests passed' as result;
