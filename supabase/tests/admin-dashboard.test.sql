\set ON_ERROR_STOP on

set role anon;
do $$begin
  begin perform public.admin_dashboard_overview(); raise exception 'Anonymous report permitted'; exception when insufficient_privilege then null; end;
  begin perform public.admin_dashboard_queue(); raise exception 'Anonymous queue permitted'; exception when insufficient_privilege then null; end;
end$$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',false);
do $$begin
  begin perform public.admin_dashboard_overview(); raise exception 'Customer report permitted'; exception when insufficient_privilege then null; end;
  begin perform public.admin_dashboard_queue(); raise exception 'Customer queue permitted'; exception when insufficient_privilege then null; end;
end$$;
reset role;

-- Reproduce the reported incident: three confirmed uploads, one submitted case.
insert into public.ticket_submissions(id,first_name,last_name,ticket_number,status,created_at,updated_at,ticket_document_path) values
 ('20000000-0000-4000-8000-000000000001','Sample','Submitted','T-001','pending',now()-interval '1 minute',now()-interval '1 minute','20000000-0000-4000-8000-000000000001/ticket.jpg');
insert into public.ticket_intake_drafts(id,converted_submission_id,draft_data,status,current_step,ticket_uploaded_at,created_at,updated_at) values
 ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','{"firstName":"Sample","lastName":"Submitted"}','converted',6,now()-interval '1 minute',now()-interval '2 minutes',now()-interval '1 minute'),
 ('20000000-0000-4000-8000-000000000002',null,'{"firstName":"Sample","lastName":"Partial"}','active',2,now()-interval '1 minute',now()-interval '2 minutes',now()-interval '1 minute'),
 ('20000000-0000-4000-8000-000000000003',null,'{}','active',1,now()-interval '1 minute',now()-interval '2 minutes',now()-interval '1 minute');
insert into storage.objects values('assessment-tickets','20000000-0000-4000-8000-000000000001/ticket.jpg',now()-interval '1 minute');
-- Queue exclusions: dismissed, deleted, expired; contact-only lead is included.
insert into public.ticket_intake_drafts(id,staff_follow_up_status,deleted_at,expires_at,email) values
 ('20000000-0000-4000-8000-000000000004','dismissed',null,now()+interval '1 day','dismissed@example.test'),
 ('20000000-0000-4000-8000-000000000005','open',now(),now()+interval '1 day','deleted@example.test'),
 ('20000000-0000-4000-8000-000000000006','open',null,now()-interval '1 day','expired@example.test'),
 ('20000000-0000-4000-8000-000000000007','open',null,now()+interval '1 day','contact-only@example.test');
insert into public.ticket_submissions(id,first_name,status,created_at,deleted_at) values
 ('20000000-0000-4000-8000-000000000008','Unpaid','awaiting_payment',now()-interval '2 days',null),
 ('20000000-0000-4000-8000-000000000009','Completed','completed',now()-interval '2 days',null),
 ('20000000-0000-4000-8000-000000000010','Deleted','pending',now()-interval '1 minute',now());
insert into analytics_private.paid_payment_purchases values
 (now()-interval '1 minute',20790,990,'cad'),(now()-interval '8 days',8295,395,'cad');
insert into analytics_private.paid_payment_refunds values
 (now()-interval '1 minute',5000,'cad','succeeded'),(now()-interval '1 minute',1000,'cad','pending');
insert into analytics_private.paid_funnel_events values
 ('landing_view','30000000-0000-4000-8000-000000000001',now()-interval '1 minute','google','cpc','real',null,null),
 ('landing_view','30000000-0000-4000-8000-000000000001',now()-interval '1 minute','google','cpc','real',null,null),
 ('ticket_uploaded','30000000-0000-4000-8000-000000000001',now()-interval '1 minute','google','cpc','real',null,null),
 ('landing_view','30000000-0000-4000-8000-000000000002',now()-interval '1 minute','qa','cpc','real',null,null),
 ('landing_view','30000000-0000-4000-8000-000000000003',now()-interval '1 minute',null,null,null,'gclid','proof');

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select public.test_assert((public.admin_dashboard_overview()->'today'->>'uploads')::int=3,'Three uploads deduplicated across draft and saved file');
select public.test_assert((public.admin_dashboard_overview()->'today'->>'submissions')::int=1,'One submitted case, excluding deleted');
select public.test_assert((public.admin_dashboard_overview()->'current'->>'revenue_cents')::int=19800,'Revenue excludes GST');
select public.test_assert((public.admin_dashboard_overview()->'current'->>'refunds_cents')::int=5000,'Only successful refunds in their observation period');
select public.test_assert((public.admin_dashboard_overview()->'previous'->>'revenue_cents')::int=7900,'Previous period amount');
select public.test_assert((public.admin_dashboard_overview()->'current'->>'tracked_visits')::int=2,'Distinct sessions, QA excluded');
select public.test_assert((select (x->>'sessions')::int from jsonb_array_elements(public.admin_dashboard_overview()->'sources') x where x->>'source'='google')=2,'Click proof source fallback');
select public.test_assert(jsonb_array_length(public.admin_dashboard_overview()->'daily')=7,'Zero-filled seven-day trend');
select public.test_assert(jsonb_array_length(public.admin_dashboard_overview(30)->'daily')=30,'Zero-filled thirty-day trend');
select public.test_assert((select sum((x->>'revenue_cents')::int) from jsonb_array_elements(public.admin_dashboard_overview()->'daily') x)=19800,'Daily revenue reconciles with KPI');
select public.test_assert((public.admin_dashboard_queue()->'counts'->>'partial')::int=3,'Partial queue excludes converted, expired, dismissed and deleted; includes contact-only');
select public.test_assert((public.admin_dashboard_queue()->'counts'->>'attention')::int=5,'Attention includes review, partial and payment');
select public.test_assert((public.admin_dashboard_queue('partial','contact-only')->>'total')::int=1,'Server-side search');
select public.test_assert((public.admin_dashboard_queue('completed')->>'total')::int=1,'Completed separate from active');
select public.test_assert((public.admin_dashboard_queue('uploads')->>'total')::int=3,'Upload drilldown has the same three tickets');
select public.test_assert((public.admin_dashboard_queue('submitted','',0,now()-interval '1 day',now())->>'total')::int=1,'Date-filtered submission drilldown');
select public.test_assert(not (public.admin_dashboard_queue()::text like '%access_token%'),'No capabilities in queue');
do $$begin
  begin perform public.admin_dashboard_overview(90); raise exception 'Bad window allowed'; exception when raise_exception then if sqlerrm<>'DASHBOARD_WINDOW_INVALID' then raise; end if; end;
  begin perform public.admin_dashboard_queue('oops'); raise exception 'Bad filter allowed'; exception when raise_exception then if sqlerrm<>'DASHBOARD_QUEUE_FILTER_INVALID' then raise; end if; end;
  begin perform public.admin_dashboard_queue('partial','',-1); raise exception 'Bad offset allowed'; exception when raise_exception then if sqlerrm<>'DASHBOARD_QUEUE_FILTER_INVALID' then raise; end if; end;
end$$;
-- Case managers retain the existing staff data scope.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select public.test_assert((public.admin_dashboard_overview()->>'days')::int=7,'Case manager access');
do $$begin
  begin perform count(*) from analytics_private.paid_payment_purchases; raise exception 'Ledger exposed'; exception when insufficient_privilege then null; end;
end$$;
reset role;
insert into public.ticket_submissions(id,first_name,status,created_at,updated_at)
select gen_random_uuid(),'Paging fixture','in_progress',now()-interval '3 days',now() from generate_series(1,20);
set role authenticated;
select public.test_assert((public.admin_dashboard_queue('active')->>'total')::int=21,'Totals are not truncated to a page');
select public.test_assert(jsonb_array_length(public.admin_dashboard_queue('active')->'items')=8,'Bounded page');
select public.test_assert(not exists(select 1 from jsonb_array_elements(public.admin_dashboard_queue('active')->'items') a join jsonb_array_elements(public.admin_dashboard_queue('active','',8)->'items') b on a->>'id'=b->>'id'),'Stable pagination without overlap');
reset role;
select 'Admin dashboard security and aggregation tests passed' as result;

-- Upload history must not silently discard dismissed or expired intakes.
update public.ticket_intake_drafts set ticket_uploaded_at=now()-interval '1 minute'
where id in ('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000006');
-- Assessment-to-representation upgrades can share the exact same stored file.
insert into public.ticket_submissions(id,first_name,status,ticket_document_path)
values('20000000-0000-4000-8000-000000000011','Upgraded','in_progress','20000000-0000-4000-8000-000000000001/ticket.jpg');
set role authenticated;
select public.test_assert((public.admin_dashboard_overview()->'today'->>'uploads')::int=5,'Inactive uploads retained and shared file deduplicated');
select public.test_assert((public.admin_dashboard_queue('uploads','',0,(public.admin_dashboard_overview()->>'today_since')::timestamptz,now())->>'total')::int=5,'Upload history matches header');
select public.test_assert((public.admin_dashboard_queue()->'counts'->>'partial')::int=3,'Inactive upload history does not inflate follow-up queue');
select public.test_assert(not (public.admin_dashboard_queue('uploads')::text like '%upload_key%'),'File keys stay server-side');
select public.test_assert((public.admin_dashboard_overview()->>'since')::timestamptz=((now() at time zone 'America/Edmonton')::date-6)::timestamp at time zone 'America/Edmonton','Weekly window starts at Edmonton midnight');
select public.test_assert((public.admin_dashboard_overview(30)->>'since')::timestamptz=((now() at time zone 'America/Edmonton')::date-29)::timestamp at time zone 'America/Edmonton','Monthly window starts at Edmonton midnight');
reset role;
select 'Upload history, shared-file and timezone tests passed' as result;

-- Paid clients use payment time, not submission time, and deduplicate emails.
insert into public.ticket_submissions(id,email,status,created_at,representation_paid_at,assessment_paid_at,deleted_at) values
 ('40000000-0000-4000-8000-000000000001','client@example.test','in_progress',now()-interval '10 days',now()-interval '1 second',null,null),
 ('40000000-0000-4000-8000-000000000002',' CLIENT@example.test ','assessment_pending',now()-interval '3 days',null,now()-interval '1 second',null),
 ('40000000-0000-4000-8000-000000000003','midnight@example.test','completed',now()-interval '3 days',((now() at time zone 'America/Edmonton')::date)::timestamp at time zone 'America/Edmonton',null,null),
 ('40000000-0000-4000-8000-000000000004','yesterday@example.test','in_progress',now(),(((now() at time zone 'America/Edmonton')::date)::timestamp at time zone 'America/Edmonton')-interval '1 second',null,null),
 ('40000000-0000-4000-8000-000000000005','future@example.test','in_progress',now(),now()+interval '1 day',null,null),
 ('40000000-0000-4000-8000-000000000006','deleted@example.test','in_progress',now(),now()-interval '1 second',null,now()),
 ('40000000-0000-4000-8000-000000000007','unpaid@example.test','pending',now(),null,null,null);
set role authenticated;
select public.test_assert((public.admin_dashboard_overview()->'today'->>'paid_clients')::int=2,'Paid clients deduplicate emails and use Edmonton payment dates');
select public.test_assert((public.admin_dashboard_queue('paid','',0,(public.admin_dashboard_overview()->>'today_since')::timestamptz,now())->>'total')::int=2,'Paid client drilldown reconciles to header');
select public.test_assert((public.admin_dashboard_queue('paid','client@example.test',0,(public.admin_dashboard_overview()->>'today_since')::timestamptz,now())->>'total')::int=1,'Paid client search retains deduplication');
select public.test_assert(not (public.admin_dashboard_queue('paid')::text like '%client_key%'),'Internal client keys stay server-side');
reset role;
select 'Paid-client date, deduplication and drilldown tests passed' as result;
