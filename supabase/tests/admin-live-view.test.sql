\set ON_ERROR_STOP on

create function public.test_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',message; end if; end $$;

set role anon;
do $$ begin
  begin perform public.admin_live_view(); raise exception 'Anon snapshot access'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.live_visitor_sessions; raise exception 'Anon visitor read'; exception when insufficient_privilege then null; end;
  begin perform public.ingest_live_visitor(gen_random_uuid(),'/','browsing','Direct','mobile',repeat('a',64)); raise exception 'Anon ingestion'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$ begin
  begin perform public.admin_live_view(); raise exception 'Non-admin snapshot access'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.live_visitor_sessions; raise exception 'Direct visitor read'; exception when insufficient_privilege then null; end;
  begin perform public.cleanup_live_view(); raise exception 'Client cleanup'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set role service_role;
select public.ingest_live_visitor('20000000-0000-4000-8000-000000000001','/','browsing','Google','mobile',repeat('a',64),'Calgary','Alberta','CA',51.0,-114.1);
select public.ingest_live_visitor('20000000-0000-4000-8000-000000000001','/submit-ticket','intake','Direct','mobile',repeat('a',64),'Calgary','Alberta','CA',51.0,-114.1);
reset role;
select public.test_assert((select count(*)=1 from public.live_visitor_sessions),'Duplicate tabs deduplicate');
select public.test_assert((select source='Google' and page='/submit-ticket' and stage='intake' from public.live_visitor_sessions),'Source preserved, current page changes');

insert into public.live_visitor_sessions(id,page,stage,source,device,started_at,last_seen_at) values
 ('20000000-0000-4000-8000-000000000002','/','browsing','Direct','desktop',now()-interval '5 minutes',now()-interval '91 seconds'),
 ('20000000-0000-4000-8000-000000000003','/','browsing','Direct','tablet',now()-interval '3 days',now()-interval '3 days');
insert into public.ticket_submissions values
 ('30000000-0000-4000-8000-000000000001',now(),now(),now()),
 ('30000000-0000-4000-8000-000000000002',now(),null,null),
 ('30000000-0000-4000-8000-000000000003',now()-interval '2 days',now()-interval '2 days',null);

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select public.test_assert((public.admin_live_view()->>'active')::integer=1,'90-second expiry');
select public.test_assert((public.admin_live_view()->>'submissions_today')::integer=2,'Edmonton daily submissions');
select public.test_assert((public.admin_live_view()->>'paid_cases_today')::integer=1,'Each paid case counted once');
select public.test_assert((public.admin_live_view()->'stages'->>'intake')::integer=1,'Stage aggregation');
select public.test_assert(jsonb_array_length(public.admin_live_view()->'timeline')=30,'All minutes including zero buckets');
select public.test_assert((public.admin_live_view()->'locations'->0->>'count')::integer=1,'Location aggregation');
select public.test_assert((public.admin_live_view()->'visitors'->0->>'source')='Google','Attribution preserved');
select public.test_assert((public.admin_live_view()->>'sessions_today')::integer=(select count(*) from generate_series(1,1))+case when now()-interval '5 minutes'>=(date_trunc('day',now() at time zone 'America/Edmonton') at time zone 'America/Edmonton') then 1 else 0 end,'Session date boundary');
reset role;

insert into public.live_visitor_sessions(id,page,stage,source,device)
select gen_random_uuid(),'/','browsing','Direct','desktop' from generate_series(1,205);
set role authenticated;
select public.test_assert((public.admin_live_view()->>'active')::integer=206,'Totals not capped with visitor list');
select public.test_assert(jsonb_array_length(public.admin_live_view()->'visitors')=200,'Bounded visitor list');
select public.test_assert((public.admin_live_view()->>'visitors_truncated')::boolean,'Explicit truncation');
reset role;

insert into public.live_visitor_rate_limits values(repeat('b',64),date_trunc('minute',now()),180);
set role service_role;
select public.test_assert(public.ingest_live_visitor(gen_random_uuid(),'/','browsing','Direct','mobile',repeat('b',64))=false,'Network throttle enforced');
reset role;
select public.test_assert((select count(*)=208 from public.live_visitor_sessions),'Throttled request created no session');
insert into public.live_visitor_rate_limits values(repeat('c',64),now()-interval '3 hours',1);
select public.cleanup_live_view();
select public.test_assert(not exists(select 1 from public.live_visitor_sessions where last_seen_at < now()-interval '48 hours'),'Visitor retention');
select public.test_assert(not exists(select 1 from public.live_visitor_rate_limits where bucket < now()-interval '2 hours'),'Rate-limit retention');
select public.test_assert((select count(*)=1 from cron.test_jobs where name='live-view-retention'),'Retention scheduled');
select 'Live View database security and aggregation tests passed' as result;
