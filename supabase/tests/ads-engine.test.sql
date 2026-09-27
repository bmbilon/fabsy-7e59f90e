insert into ads_batches(id,payload,payload_hash) values('33333333-3333-4333-8333-333333333333','{"holds":[],"aiReview":{"passed":true},"config":{"spendingAuthorized":true,"learningSpendLimitCad":2100,"currency":"CAD","timezone":"America/Edmonton"}}',repeat('a',64));
do $$ begin
 if has_function_privilege('service_role','public.ads_review_batch(uuid,text,boolean)','EXECUTE') then raise exception 'Service role must not approve'; end if;
 if has_table_privilege('authenticated','public.ads_batches','UPDATE') then raise exception 'Staff cannot directly fabricate approval'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.ads_review_batch('33333333-3333-4333-8333-333333333333',repeat('a',64),true);
reset role;
do $$ begin
 if not exists(select 1 from ads_batches where approved_by='11111111-1111-4111-8111-111111111111' and status='approved') then raise exception 'Admin identity missing'; end if;
end $$;
set role service_role;
select public.ads_claim_action('action-key','33333333-3333-4333-8333-333333333333','sync','{}','{"operations":[]}','{}');
do $$ declare a jsonb; begin
 a=public.ads_claim_action('action-key','33333333-3333-4333-8333-333333333333','sync','{}','{"operations":[]}','{}');
 if not (a->>'duplicate')::boolean then raise exception 'Duplicate write was reserved twice'; end if;
 begin
 perform public.ads_claim_action('other-key','33333333-3333-4333-8333-333333333333','sync','{}','{}','{}');
 raise exception 'Overlap was permitted';
 exception when others then if sqlerrm='Overlap was permitted' then raise; end if; end;
 begin
 perform public.ads_claim_action('action-key','33333333-3333-4333-8333-333333333333','sync','{}','{"changed":true}','{}');
 raise exception 'Idempotency conflict was permitted';
 exception when others then if sqlerrm='Idempotency conflict was permitted' then raise; end if; end;
end $$;
reset role;
select public.ads_finish_action(id,'uncertain','{}','{}') from public.ads_actions where idempotency_key='action-key';
do $$ begin if not exists(select 1 from ads_engine_state where frozen) then raise exception 'Uncertain write did not freeze'; end if; end $$;
insert into ads_funnel_events(event_id,submission_id,event_type,service,value_cents,tax_cents) values('paid:cs_test_ONE','22222222-2222-4222-8222-222222222222','client_paid','officer',15840,792) on conflict do nothing;
insert into ads_funnel_events(event_id,submission_id,event_type,service,value_cents,tax_cents) values('paid:cs_test_ONE','22222222-2222-4222-8222-222222222222','client_paid','officer',15840,792) on conflict do nothing;
do $$ begin if (select count(*) from ads_funnel_events)<>1 then raise exception 'Duplicate purchase'; end if; end $$;
select 'Ads database tests passed' as result;

update ads_engine_state set paused=true,frozen=false;
insert into ads_batches(id,payload,payload_hash) values('44444444-4444-4444-8444-444444444444','{"kind":"measurement_setup","holds":[],"config":{"spendingAuthorized":false,"currency":"CAD","timezone":"America/Edmonton"},"plan":{"operations":[{"conversionActionOperation":{"create":{"name":"Qualified Ticket Upload"}}}]}}',repeat('b',64));
set role authenticated;
select public.ads_review_batch('44444444-4444-4444-8444-444444444444',repeat('b',64),true);
reset role;
do $$ begin
 if not exists(select 1 from ads_engine_state where paused) then raise exception 'Conversion approval enabled campaigns'; end if;
end $$;
select 'Measurement approval keeps campaign spending paused' as result;
