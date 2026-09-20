create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
update payment_sms_state set activated_at=now()-interval '1 hour';
set request.jwt.claim.role='service_role';
create function pg_temp.case_event(n integer,kind text default 'ticket_only') returns jsonb language plpgsql as $$
declare client_id uuid:=('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  ticket_id uuid:=('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  intent_id uuid:=('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  checkout text:='cs_live_Fixture'||n; payment text:='pi_Fixture'||n;
begin
  insert into clients values(client_id,'Alex','Example');
  insert into ticket_submissions values(ticket_id,client_id,'E'||lpad(n::text,8,'0')||'P',null,
    case when kind='ticket_assessment' then 'ticket_insurance_assessment' else 'representation' end,checkout,payment,checkout,payment);
  insert into idr_checkout_intents values(intent_id,client_id,ticket_id,'paid',kind,checkout,
    case when kind='ticket_with_addon' then 'addon' when kind='idr_only' then 'standalone' else 'ticket' end);
  if kind in ('ticket_with_addon','idr_only') then
    insert into idr_orders values(intent_id,client_id,ticket_id,case when kind='ticket_with_addon' then 'addon' else 'standalone' end,checkout,payment,now());
  end if;
  return jsonb_build_object('event_id','evt_Fixture'||n,'event_type','checkout.session.completed','occurred_at',now(),'livemode',true,
    'checkout_session_id',checkout,'payment_intent_id',payment,'amount_total',20790,'currency','CAD','checkout_kind',kind,
    'intent_id',intent_id,'submission_id',ticket_id,'client_id',client_id,
    'order_id',case when kind in ('ticket_with_addon','idr_only') then intent_id end);
end $$;
create temporary table events(n integer primary key,event jsonb);
insert into events values(1,pg_temp.case_event(1)),(2,pg_temp.case_event(2,'ticket_with_addon')),
  (3,pg_temp.case_event(3,'photo_radar')),(4,pg_temp.case_event(4,'ticket_assessment')),(5,pg_temp.case_event(5,'idr_only'));
select pg_temp.assert(enqueue_verified_payment_sms(event)->>'status'='pending','fulfilled product queued') from events;
select pg_temp.assert((select count(*)=5 from payment_sms_notifications),'all5products enqueue');
select pg_temp.assert((select bool_and(amount_total=20790 and currency='CAD' and client_name='Alex Example') from payment_sms_notifications),'gross amount+stored name freeze');
select pg_temp.assert(enqueue_verified_payment_sms(event||'{"event_id":"evt_Async","event_type":"checkout.session.async_payment_succeeded"}'::jsonb)->>'created'='false','async replay dedup') from events where n=1;
select pg_temp.assert((select count(*)=5 from payment_sms_notifications),'replay does not add row');

insert into events values(6,pg_temp.case_event(6));
select pg_temp.assert(enqueue_verified_payment_sms(event||jsonb_build_object('occurred_at',now()-interval '2 hours'))->>'status'='before_activation','historical event held outside queue') from events where n=6;
select pg_temp.assert(not exists(select 1 from payment_sms_notifications where checkout_session_id='cs_live_Fixture6'),'nohistoricalbackfill');
do $$ declare event jsonb:=(select e.event from events e where n=6); begin
  begin perform enqueue_verified_payment_sms(event||'{"livemode":false}'); raise exception 'testmode accepted'; exception when others then if sqlerrm<>'PAYMENT_SMS_SOURCE_INVALID' then raise; end if; end;
  begin perform enqueue_verified_payment_sms(event||'{"event_type":"checkout.session.async_payment_failed"}'); raise exception 'failedpayment accepted'; exception when others then if sqlerrm<>'PAYMENT_SMS_SOURCE_INVALID' then raise; end if; end;
end $$;

insert into events values(7,pg_temp.case_event(7)),(8,pg_temp.case_event(8)),(9,pg_temp.case_event(9)),(10,pg_temp.case_event(10,'idr_only'));
update clients set last_name=null where id=(select (event->>'client_id')::uuid from events where n=7);
update ticket_submissions set client_id='20000000-0000-4000-8000-000000000001' where id=(select (event->>'submission_id')::uuid from events where n=8);
update idr_checkout_intents set status='open' where id=(select (event->>'intent_id')::uuid from events where n=9);
update idr_checkout_intents set ticket_submission_id=null,client_id=null where id=(select (event->>'intent_id')::uuid from events where n=10);
update idr_orders set ticket_submission_id=null where id=(select (event->>'order_id')::uuid from events where n=10);
update events set event=event||'{"submission_id":null,"client_id":null}' where n=10;
select pg_temp.assert(enqueue_verified_payment_sms(event)->>'status'='needs_review','missing/mismatched identity held') from events where n in(7,8,9,10);
select pg_temp.assert((select failure_code='ticket_number_missing' and client_name='Alex Example' from payment_sms_notifications where checkout_session_id='cs_live_Fixture10'),'guestIDR resolvesorderclient without inventedticket');
select pg_temp.assert(enqueue_verified_payment_sms(event||'{"checkout_session_id":"cs_live_ReusedPayment"}')->>'status'='identity_conflict','payment id cannot create secondalert') from events where n=5;
select pg_temp.assert((select count(*)=1 from payment_sms_notifications where payment_intent_id='pi_Fixture5'),'paymentuniqueenforced');
select pg_temp.assert((select status='needs_review' from payment_sms_notifications where payment_intent_id='pi_Fixture5'),'identityconflictholdsbeforeattempt');

-- Claimed identity cannot be borrowed, repeated or recycled after uncertainty.
create temporary table claims as select * from claim_payment_sms_notifications(5);
select pg_temp.assert((select count(*)=4 from claims),'onlycompleteeligibleidentitiesclaimed');
select pg_temp.assert(not finish_payment_sms_notification(id,gen_random_uuid(),'accepted','SM'||repeat('a',32)),'wrongclaimtokenfails') from claims;
select pg_temp.assert(finish_payment_sms_notification(id,claim_id,'accepted','SM'||repeat('a',32)),'acceptedpersisted') from claims where checkout_session_id='cs_live_Fixture1';
select pg_temp.assert(not finish_payment_sms_notification(id,claim_id,'accepted','SM'||repeat('a',32)),'completiononeuse') from claims where checkout_session_id='cs_live_Fixture1';
select pg_temp.assert(finish_payment_sms_notification(id,claim_id,'indeterminate',null,'provider_network_error'),'uncertainheld') from claims where checkout_session_id='cs_live_Fixture2';
update payment_sms_notifications set claim_expires_at=now()-interval '1 second' where checkout_session_id='cs_live_Fixture3';
select pg_temp.assert((select count(*)=0 from claim_payment_sms_notifications(5)),'noheldorattemptedreclaim');
select pg_temp.assert((select status='indeterminate' and attempted_at is not null from payment_sms_notifications where checkout_session_id='cs_live_Fixture3'),'expiredclaimneedsreview');
insert into events values(11,pg_temp.case_event(11));
select enqueue_verified_payment_sms(event) from events where n=11;
update clients set first_name='Changed' where id=(select (event->>'client_id')::uuid from events where n=11);
select pg_temp.assert((select count(*)=0 from claim_payment_sms_notifications(5)),'identitychangeheldbeforesend');

-- Service RPC ownership, private client read, staff-only health visibility.
set role authenticated;
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*)=0 from payment_sms_notifications),'ordinaryclientcannotread');
select pg_temp.assert((select count(*)=0 from payment_sms_state),'ordinaryclientcannotreadhealth');
do $$ begin
  begin perform claim_payment_sms_notifications(1); raise exception 'clientclaimallowed'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*)>0 from payment_sms_notifications),'staffcanseeheldqueue');
reset role;
set request.jwt.claim.role='service_role';
select record_payment_sms_worker_health('payment_sms_attempt_needs_review');
select pg_temp.assert((select last_worker_at is not null and last_worker_error='payment_sms_attempt_needs_review' from payment_sms_state),'healthsaved');
select record_payment_sms_worker_health();
select pg_temp.assert((select last_worker_error is null from payment_sms_state),'healthclearsafterhealthyworker');

-- A report add-on can be bought later through idr_only, without a new ticket fee.
insert into events values(13,pg_temp.case_event(13,'idr_only'));
update idr_checkout_intents set type='addon' where id=(select (event->>'intent_id')::uuid from events where n=13);
update idr_orders set type='addon' where id=(select (event->>'order_id')::uuid from events where n=13);
select pg_temp.assert(enqueue_verified_payment_sms(event)->>'status'='pending','separatelypaidIDRaddonmatchesitsreservation') from events where n=13;
select pg_temp.assert(finish_payment_sms_notification(id,claim_id,'failed',null,'provider_http_400'),'directaddonclaimworks') from claim_payment_sms_notifications(1);

-- Fresh row for independent concurrentclaim transactions in the runner.
insert into events values(12,pg_temp.case_event(12));
select enqueue_verified_payment_sms(event) from events where n=12;
select 'payment SMS SQL tests passed';
