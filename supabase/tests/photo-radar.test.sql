-- All fixtures are synthetic. The Python harness creates and destroys the DB.
create function pg_temp.check_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'ASSERT FAILED: %',label; end if; end; $$;
create function pg_temp.expect_error(statement text,needle text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(needle in sqlerrm)>0 then return; end if;
    raise exception 'Wrong error (%), expected %',sqlerrm,needle;
  end;
  raise exception 'Expected error %, but statement succeeded',needle;
end; $$;

insert into public.clients(id,auth_user_id) values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003');
insert into public.ticket_submissions(id,client_id) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.ticket_submissions(id,client_id,ticket_type,order_type,review_path,registered_owner_on_offence_date) values
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','photo_radar','photo_radar','ate','yes'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','photo_radar','photo_radar','ate','stolen');
insert into public.idr_checkout_intents(id,client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','ticket','ticket_only',48800),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','photo_radar','photo_radar',7900),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','photo_radar','photo_radar',7900);

select pg_temp.check_true((select expected_amount_cents=48800 from public.idr_checkout_intents where id='30000000-0000-4000-8000-000000000001'),'legacy paid price preserved');
select pg_temp.expect_error($q$update public.idr_checkout_intents set type='photo_radar',checkout_kind='photo_radar',expected_amount_cents=7900 where id='30000000-0000-4000-8000-000000000001'$q$,'TICKET_PRODUCT_MISMATCH');
select pg_temp.expect_error($q$update public.idr_checkout_intents set type='addon',checkout_kind='ticket_with_addon',expected_amount_cents=3100 where id='30000000-0000-4000-8000-000000000002'$q$,'TICKET_PRODUCT_MISMATCH');
select pg_temp.expect_error($q$insert into public.idr_orders(ticket_submission_id) values('20000000-0000-4000-8000-000000000002')$q$,'PHOTO_RADAR_HAS_NO_INSURANCE_REPORT');
select pg_temp.expect_error($q$update public.ticket_submissions set ticket_type='officer_issued',order_type='rapid_resolution',review_path='standard',registered_owner_on_offence_date=null where id='20000000-0000-4000-8000-000000000002'$q$,'REPRESENTATION_CHECKOUT_IMMUTABLE');
select pg_temp.expect_error($q$update public.ticket_submissions set consent_form_path='forged.pdf' where id='20000000-0000-4000-8000-000000000002'$q$,'REPRESENTATION_CHECKOUT_IMMUTABLE');

set role service_role;
select pg_temp.check_true(public.activate_photo_radar_checkout('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','cs_test_ate_1',1,'pi_test_ate_1')='ticket_activated','first paid activation');
select pg_temp.check_true(public.activate_photo_radar_checkout('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','cs_test_ate_1',1,'pi_test_ate_1')='ticket_already_active','webhook replay idempotent');
select pg_temp.check_true((select count(*)=1 from public.ate_reviews),'one ATE review after replay');
update public.ticket_submissions set referral_payment_intent_id='pi_syntheticAccounting' where id='20000000-0000-4000-8000-000000000002';
select pg_temp.check_true((select count(*)=1 from public.ate_case_events where event_type='payment_confirmed'),'one durable payment event after replay');
select pg_temp.expect_error($q$update public.ticket_submissions set status='completed' where id='20000000-0000-4000-8000-000000000002'$q$,'ATE_ACTUAL_OUTCOME_REQUIRED');
select pg_temp.expect_error($q$update public.ticket_submissions set case_outcome='reduced' where id='20000000-0000-4000-8000-000000000002'$q$,'ATE_ACTUAL_OUTCOME_REQUIRED');
select pg_temp.expect_error($q$select public.activate_photo_radar_checkout('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','cs_test_other',1,'pi_test_other')$q$,'PHOTO_RADAR_PAYMENT_RESERVATION_MISMATCH');
select pg_temp.expect_error($q$select public.activate_photo_radar_checkout('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',null,'cs_test_ate_1',null,'pi_test_ate_1')$q$,'PHOTO_RADAR_PAYMENT_RESERVATION_MISMATCH');
select public.activate_photo_radar_checkout('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','cs_test_ate_2',1,'pi_test_ate_2');
reset role;

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select public.record_ate_crown_offer('20000000-0000-4000-8000-000000000002','Synthetic Crown offer version 1',10000,now()+interval '1 day') as first_offer \gset
select public.record_ate_crown_offer('20000000-0000-4000-8000-000000000002','Synthetic Crown offer version 2',9000,now()+interval '1 day') as second_offer \gset
select pg_temp.expect_error($q$select public.record_ate_outcome('20000000-0000-4000-8000-000000000002',20000,9000,'reduced','Synthetic court confirmation')$q$,'ATE_CLIENT_APPROVAL_REQUIRED');
select public.record_ate_crown_offer('20000000-0000-4000-8000-000000000003','Synthetic other-client offer',19000,now()+interval '1 day') as other_offer \gset
select public.save_ate_review('20000000-0000-4000-8000-000000000002','speed','Edmonton','{}',
  '[{"key":"plate_match","status":"pending"},{"key":"site_permission","status":"pending"},{"key":"zone_hours","status":"pending"},{"key":"construction_workers","status":"pending"},{"key":"five_minute_rule","status":"pending"},{"key":"mailing_service","status":"pending"},{"key":"ownership","status":"pending"},{"key":"operator_calibration","status":"pending"}]','[]',now(),'',null);
select pg_temp.check_true((select action_due_at-complete_disclosure_at=interval '48 hours' from public.ate_reviews where ticket_submission_id='20000000-0000-4000-8000-000000000002'),'48-hour clock exact');
select complete_disclosure_at as disclosure_time,checklist as saved_checklist from public.ate_reviews where ticket_submission_id='20000000-0000-4000-8000-000000000002' \gset
select public.save_ate_review('20000000-0000-4000-8000-000000000002','speed','Edmonton','{}',:'saved_checklist'::jsonb,'[]',:'disclosure_time'::timestamptz,'Prepared a synthetic authorized request',now());
select pg_temp.expect_error('select public.save_ate_review(''20000000-0000-4000-8000-000000000002'',''speed'',''Edmonton'',''{}'','||quote_literal(:'saved_checklist')||'::jsonb,''[]'','||quote_literal(:'disclosure_time')||'::timestamptz,''stale form'',null)','ATE_DISCLOSURE_TIMING_INVALID');
select pg_temp.check_true((select count(*)=1 from public.ate_case_events where event_type='disclosure_complete'),'one disclosure event');
select pg_temp.check_true((select count(*)=1 from public.ate_case_events where event_type='action_recorded'),'one action event');
select pg_temp.expect_error($q$select public.save_ate_review('20000000-0000-4000-8000-000000000002','speed','Edmonton','{}','[]','[]',null,'',null)$q$,'ATE_CHECKLIST_INVALID');

set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
select pg_temp.check_true((select count(*)=2 from public.ate_crown_offers),'client reads only their own versioned offers');
select pg_temp.check_true((select count(*)=0 from public.ate_reviews),'client cannot read private evidence review');
select pg_temp.check_true((select count(*)=0 from public.ate_case_events),'client cannot read private clone outbox');
select pg_temp.expect_error('select public.respond_to_ate_crown_offer('||quote_literal(:'first_offer')||',''approved'','''')','ATE_OFFER_NO_LONGER_CURRENT');
select pg_temp.expect_error('select public.respond_to_ate_crown_offer('||quote_literal(:'other_offer')||',''approved'','''')','CASE_OWNERSHIP_REQUIRED');
select public.respond_to_ate_crown_offer(:'second_offer','question','Please clarify the exact synthetic terms.');
select public.respond_to_ate_crown_offer(:'second_offer','approved','I approve this exact synthetic deal.');
select public.respond_to_ate_crown_offer(:'second_offer','approved','Retry of instruction');
select pg_temp.expect_error('select public.respond_to_ate_crown_offer('||quote_literal(:'second_offer')||',''declined'','''')','ATE_DECISION_ALREADY_RECORDED');
select pg_temp.expect_error($q$update public.ate_crown_offers set client_decision='approved'$q$,'permission denied');
select pg_temp.expect_error($q$select public.record_ate_crown_offer('20000000-0000-4000-8000-000000000002','forged',0,null)$q$,'ATE_STAFF_REQUIRED');
select pg_temp.expect_error($q$select public.ate_first_twenty_metrics()$q$,'ATE_STAFF_REQUIRED');
select pg_temp.expect_error($q$select public.activate_photo_radar_checkout(null,null,null,null,null,null)$q$,'permission denied');
select pg_temp.expect_error($q$select public.claim_ate_case_events(10)$q$,'permission denied');

set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select public.record_ate_outcome('20000000-0000-4000-8000-000000000002',20000,9000,'reduced','Synthetic final Crown/court record');
select public.record_ate_outcome('20000000-0000-4000-8000-000000000003',20000,20000,'unchanged','Synthetic no-reduction final record');
select pg_temp.check_true(public.ate_first_twenty_metrics()->>'resolved_count'='2','both outcomes counted');
select pg_temp.check_true((public.ate_first_twenty_metrics()->>'median_reduction_cad')::numeric=55,'zero outcome included in median of 0 and110');
select pg_temp.check_true(public.ate_first_twenty_metrics()->>'cohort_complete'='false','small sample stays provisional');
reset role;
set role service_role;
select id as claimed_event,claim_token as event_claim_token from public.claim_ate_case_events(1) \gset
select pg_temp.check_true(public.complete_ate_case_event(:'claimed_event',:'event_claim_token','synthetic operator draft reference'),'worker completes only matching claim');
select pg_temp.check_true(not public.complete_ate_case_event(:'claimed_event',:'event_claim_token','duplicate synthetic reference'),'worker completion retry does not duplicate');
reset role;
set role anon;
select pg_temp.expect_error($q$select * from public.ate_crown_offers$q$,'permission denied');
select pg_temp.expect_error($q$select public.respond_to_ate_crown_offer(null,'approved','')$q$,'permission denied');
reset role;
select 'ATE database assertions passed: product, privacy, replay, client approval, SLA and zero-outcome median' as result;
