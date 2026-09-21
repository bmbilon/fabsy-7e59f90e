\i supabase/tests/admin-live-view.fixture.sql
\i supabase/migrations/20260909180000_admin_live_view.sql
alter table public.ticket_submissions add column deleted_at timestamptz;
\i supabase/migrations/20260921190000_all_source_traffic.sql

insert into public.ticket_submissions values('10000000-0000-4000-8000-000000000001',now()-interval '1 hour',null);
set role service_role;
select public.record_traffic_request('/content/speeding-ticket-calgary','Organic search','Google','','mobile');
select public.record_traffic_request('/content/speeding-ticket-calgary','Organic search','Google','','mobile');
select public.record_traffic_request('/','Direct / unknown','Direct / unknown','','desktop');
select public.ingest_live_visitor('20000000-0000-4000-8000-000000000001','/content/speeding-ticket-calgary','browsing','Google Ads','mobile',repeat('a',64));
select public.ingest_live_visitor('20000000-0000-4000-8000-000000000001','/content/speeding-ticket-calgary','browsing','Google Ads','mobile',repeat('a',64));
select public.ingest_live_visitor('20000000-0000-4000-8000-000000000001','/submit-ticket','intake','Google Ads','mobile',repeat('a',64));
reset role;

do $$
declare report jsonb;
begin
  report := public.all_source_traffic_report(now()-interval '7 days',now());
  if (report->>'requests')::bigint <> 3 or (report->>'submissions')::bigint <> 1 then raise exception 'bad request/case totals: %',report; end if;
  if report->>'collection_started_at' is null or (report->>'comparison_complete')::boolean then raise exception 'incorrect collection coverage'; end if;
  if (select count(*) from jsonb_array_elements(report->'channels') row where row->>'channel'='Organic search' and (row->>'requests')::bigint=2) <> 1 then raise exception 'bad channel rollup'; end if;
  if (select count(*) from jsonb_array_elements(report->'pages') row where row->>'page'='/content/speeding-ticket-calgary' and (row->>'requests')::bigint=2) <> 1 then raise exception 'bad page rollup'; end if;
  if jsonb_array_length(report->'recent_hours') <> 24 then raise exception 'hourly series has gaps'; end if;
  if (select count(*) from jsonb_array_elements(report->'consented_activity') row where row->>'source'='Google Ads' and row->>'stage'='browsing' and (row->>'sessions')::bigint=1) <> 1 then raise exception 'bad deduped activity'; end if;
  if exists(select 1 from information_schema.columns where table_schema='analytics_private' and table_name='traffic_requests_hourly' and column_name in ('ip','user_agent','referrer','url','session_id','click_id')) then raise exception 'identifier column present'; end if;
end $$;

set role authenticated;
do $$ begin
  begin perform public.all_source_traffic_report(now()-interval '1 day',now()); raise exception 'public report permitted';
  exception when insufficient_privilege then null; end;
  begin perform public.record_traffic_request('/','Referral','Other referral','','desktop'); raise exception 'public writer permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
