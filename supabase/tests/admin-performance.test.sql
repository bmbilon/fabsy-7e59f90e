\set ON_ERROR_STOP on
set role anon;
do $$begin
  begin perform public.admin_dashboard_activity(); raise exception 'Anonymous activity permitted'; exception when insufficient_privilege then null; end;
  begin perform public.admin_performance_report(); raise exception 'Anonymous report permitted'; exception when insufficient_privilege then null; end;
end$$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',false);
do $$begin
  begin perform public.admin_dashboard_activity(); raise exception 'Customer activity permitted'; exception when insufficient_privilege then null; end;
  begin perform public.admin_performance_report(); raise exception 'Customer report permitted'; exception when insufficient_privilege then null; end;
end$$;
reset role;

insert into public.ticket_submissions(id,first_name,status,created_at) values
 ('51000000-0000-4000-8000-000000000001','Historical','completed','2021-01-05 12:00Z'),
 ('51000000-0000-4000-8000-000000000002','Before midnight','completed','2024-03-10 06:59:59Z'),
 ('51000000-0000-4000-8000-000000000003','Midnight','completed','2024-03-10 07:00:00Z'),
 ('51000000-0000-4000-8000-000000000004','Before DST midnight','completed','2024-03-11 05:59:59Z'),
 ('51000000-0000-4000-8000-000000000005','Next day','completed','2024-03-11 06:00:00Z');
insert into analytics_private.paid_payment_purchases(occurred_at,amount_cents,tax_cents,currency,product) values
 ('2022-01-06 12:00Z',10500,500,'cad','photo_radar'),
 ('2024-03-10 07:00Z',21000,1000,'cad','rapid_resolution'),
 ('2024-03-11 06:00Z',42000,2000,'cad','rapid_resolution_bundle');
insert into analytics_private.paid_payment_refunds(status_observed_at,amount_cents,currency,status) values
 ('2024-03-10 09:00Z',5000,'cad','succeeded'), ('2024-03-10 10:00Z',3000,'cad','failed');
insert into analytics_private.paid_funnel_events values
 ('landing_view','61000000-0000-4000-8000-000000000001','2024-03-10 08:00Z','google',null,null,null,null),
 ('landing_view','61000000-0000-4000-8000-000000000001','2024-03-10 09:00Z','meta',null,null,null,null),
 ('landing_view','61000000-0000-4000-8000-000000000002','2024-03-10 09:00Z','qa',null,null,null,null);
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select public.test_assert(public.admin_dashboard_activity()->'today'=public.admin_dashboard_overview()->'today','Lightweight activity matches existing counters');
select public.test_assert(public.admin_performance_report()->>'start_day'='2021-01-05','All time includes first saved case without 30/90/365-day cap');
select public.test_assert(public.admin_performance_report()->>'comparison'='none','All time has no artificial comparison');
select public.test_assert(public.admin_performance_report()->>'granularity'='month','Long history uses bounded month buckets');
select public.test_assert(jsonb_array_length(public.admin_performance_report()->'series')<200,'Bounded response');
select public.test_assert(public.admin_performance_report()->'series'->0->'current'->>'revenue_cents' is null,'Before payment collection remains unavailable, not zero');
select public.test_assert((public.admin_performance_report()->'series'->0->'current'->>'submissions')::int=1,'Historical case rendered in first bucket');
select public.test_assert((public.admin_performance_report('custom','2024-03-10','2024-03-10')->'current'->>'submissions')::int=2,'Edmonton DST day uses inclusive local dates and exclusive end');
select public.test_assert((public.admin_performance_report('custom','2024-03-10','2024-03-10')->'current'->>'revenue_cents')::int=20000,'Start included, next midnight excluded');
select public.test_assert((public.admin_performance_report('custom','2024-03-10','2024-03-10')->'current'->>'refunds_cents')::int=5000,'Failed refunds excluded');
select public.test_assert((public.admin_performance_report('custom','2024-03-10','2024-03-10')->'current'->>'tracked_visits')::int=1,'Session deduplication and QA exclusion');
select public.test_assert(jsonb_array_length(public.admin_performance_report('custom','2024-03-10','2024-03-10')->'sources')=1,'First landing attributes each session once');
select public.test_assert(public.admin_performance_report('custom','2024-03-10','2024-03-10')->'sources'->0->>'source'='google','Source uses earliest landing');
select public.test_assert((public.admin_performance_report('custom','2024-03-10','2024-03-10')->>'until')::timestamptz-(public.admin_performance_report('custom','2024-03-10','2024-03-10')->>'since')::timestamptz=interval '23 hours','DST day is 23 hours');
select public.test_assert((public.admin_performance_report('custom','2024-02-28','2024-03-01','year')->>'previous_until')::timestamptz-(public.admin_performance_report('custom','2024-02-28','2024-03-01','year')->>'previous_since')::timestamptz=interval '3 days','Leap-year comparison preserves number of calendar days');
select public.test_assert((public.admin_performance_report('today')->>'since')::timestamptz=((now() at time zone 'America/Edmonton')::date)::timestamp at time zone 'America/Edmonton','Today starts at Edmonton midnight');
select public.test_assert((public.admin_performance_report('90d')->>'days')::int=90,'Ninety-day range');
select public.test_assert(public.admin_performance_report('ytd')->>'start_day'=to_char(now() at time zone 'America/Edmonton','YYYY')||'-01-01','Year to date');
select public.test_assert(public.admin_performance_report('last_year')->>'end_day'=to_char((now() at time zone 'America/Edmonton')-interval '1 year','YYYY')||'-12-31','Last year');
select public.test_assert((select sum((x->'current'->>'revenue_cents')::bigint) from jsonb_array_elements(public.admin_performance_report()->'series') x)=(public.admin_performance_report()->'current'->>'revenue_cents')::bigint,'All-time bucket revenue reconciles with total');
select public.test_assert((select sum((x->>'revenue_cents')::bigint) from jsonb_array_elements(public.admin_performance_report()->'services') x)=(public.admin_performance_report()->'current'->>'revenue_cents')::bigint,'Service breakdown reconciles with revenue');
select public.test_assert((select sum((x->>'sessions')::bigint) from jsonb_array_elements(public.admin_performance_report()->'sources') x)=(public.admin_performance_report()->'current'->>'tracked_visits')::bigint,'Sources partition distinct visitors');
select public.test_assert(not (public.admin_performance_report()::text ~ 'payment_intent|session_id|@|access_token'),'No private identifiers in aggregates');
do $$begin
  begin perform public.admin_performance_report('custom','2024-03-11','2024-03-10'); raise exception 'Invalid dates permitted'; exception when raise_exception then if sqlerrm<>'PERFORMANCE_DATE_INVALID' then raise; end if; end;
  begin perform public.admin_performance_report('custom',null,null); raise exception 'Missing dates permitted'; exception when raise_exception then if sqlerrm<>'PERFORMANCE_DATE_INVALID' then raise; end if; end;
  begin perform public.admin_performance_report('custom',current_date,current_date+3); raise exception 'Future dates permitted'; exception when raise_exception then if sqlerrm<>'PERFORMANCE_DATE_INVALID' then raise; end if; end;
  begin perform public.admin_performance_report('oops'); raise exception 'Invalid filter permitted'; exception when raise_exception then if sqlerrm<>'PERFORMANCE_FILTER_INVALID' then raise; end if; end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select public.test_assert(public.admin_performance_report()->>'period'='all_time','Case manager access preserved');
reset role;
select 'Historical reporting, privacy, aggregation and time boundaries passed' as result;
