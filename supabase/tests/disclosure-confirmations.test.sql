set request.jwt.claim.role='service_role';
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.event(message_id text,ticket text default 'T12345678Z',confirmed text default '2026-09-09T01:00:00Z',parse_error text default null) returns jsonb language sql as $$
  select jsonb_build_object('source_message_id',message_id,'sender','noreply@gov.ab.ca','ticket_number',ticket,'confirmed_at',confirmed,
    'timeframe_text','Disclosure can take between 6 and 10 weeks.','body_excerpt','Synthetic fixture only','authentication_result','mx1.improvmx.com; dkim=pass header.d=gov.ab.ca','parse_error',parse_error)
$$;
select public.ingest_disclosure_confirmation(pg_temp.event('message-1'));
select pg_temp.assert((select count(*)=1 from public.disclosure_notification_outbox),'matching atomically enqueues one notice');
select pg_temp.assert((select confirmed_on='2026-09-08' from public.disclosure_confirmations where source_message_id='message-1'),'confirmation date uses Alberta timezone');
select public.ingest_disclosure_confirmation(pg_temp.event('message-1'));
select public.ingest_disclosure_confirmation(pg_temp.event('message-2'));
select pg_temp.assert((select count(*)=1 from public.disclosure_notification_outbox),'transport and same-day semantic duplicates do not enqueue');
select pg_temp.assert((select status='duplicate' from public.disclosure_confirmations where source_message_id='message-2'),'semantic duplicate remains auditable');

select public.ingest_disclosure_confirmation(pg_temp.event('unknown','E99999999A'));
select pg_temp.assert((select status='needs_review' from public.disclosure_confirmations where source_message_id='unknown'),'unknown ticket needs review');
select public.ingest_disclosure_confirmation(pg_temp.event('unverified','T12345678Z','2026-09-10T12:00:00Z','sender_authentication_unverified'));
select pg_temp.assert((select status='needs_review' from public.disclosure_confirmations where source_message_id='unverified'),'authentication fail cannot send');
insert into public.ticket_submissions(id,client_id,ticket_number,representation_paid_at) values('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','T12345678Z',now());
select public.ingest_disclosure_confirmation(pg_temp.event('ambiguous','T12345678Z','2026-09-11T12:00:00Z'));
select pg_temp.assert((select status='needs_review' from public.disclosure_confirmations where source_message_id='ambiguous'),'duplicate case identity requires review');
update public.ticket_submissions set ticket_number='T12345679Z',representation_paid_at=null where id='30000000-0000-4000-8000-000000000002';
select public.ingest_disclosure_confirmation(pg_temp.event('unpaid','T12345679Z','2026-09-11T12:00:00Z'));
select pg_temp.assert((select status='needs_review' from public.disclosure_confirmations where source_message_id='unpaid'),'unpaid case cannot auto notify');
update public.ticket_submissions set status='completed',representation_paid_at=now() where id='30000000-0000-4000-8000-000000000002';
select public.ingest_disclosure_confirmation(pg_temp.event('closed','T12345679Z','2026-09-11T12:00:00Z'));
select pg_temp.assert((select status='needs_review' from public.disclosure_confirmations where source_message_id='closed'),'closed case cannot auto notify');

select pg_temp.assert((select count(*)=0 from public.claim_disclosure_notices()),'delivery circuit defaults off');
update public.disclosure_automation_state set delivery_enabled=true;
create temporary table claim as select * from public.claim_disclosure_notices();
select pg_temp.assert((select count(*)=1 from claim),'one pending notice claimed');
select pg_temp.assert((select count(*)=0 from public.claim_disclosure_notices()),'overlapping worker cannot claim leased notice');
select public.freeze_disclosure_notice(id,claim_token,'{"subject":"Original frozen payload"}') from claim;
select public.freeze_disclosure_notice(id,claim_token,'{"subject":"Changed payload"}') from claim;
select pg_temp.assert((select email_payload->>'subject'='Original frozen payload' from public.disclosure_notification_outbox limit 1),'payload stays immutable across retries');
select pg_temp.assert(not public.complete_disclosure_notice(id,gen_random_uuid(),'wrong-provider',null),'stale worker cannot complete lease') from claim;
select public.complete_disclosure_notice(id,claim_token,null,'network_timeout') from claim;
select pg_temp.assert((select status='pending' and attempts=1 and next_attempt_at>now() from public.disclosure_notification_outbox),'failed send receives backoff');
update public.disclosure_notification_outbox set next_attempt_at=now()-interval '1 second';
truncate claim;
insert into claim select * from public.claim_disclosure_notices();
select public.complete_disclosure_notice(id,claim_token,'provider-123',null) from claim;
select pg_temp.assert((select status='sent' and provider_email_id='provider-123' from public.disclosure_notification_outbox),'provider acceptance recorded');
select pg_temp.assert((select count(*)=0 from public.claim_disclosure_notices()),'sent notice is never reclaimed');

-- A distinct day is a distinct acknowledgement; an expired uncertain send is held.
select public.match_disclosure_confirmation(id) from public.disclosure_confirmations where source_message_id='ambiguous';
select * from public.claim_disclosure_notices();
update public.disclosure_notification_outbox set first_attempt_at=now()-interval '25 hours',lease_until=now()-interval '1 minute' where status='processing';
select pg_temp.assert((select count(*)=0 from public.claim_disclosure_notices()),'expired provider idempotency window is not retried');
select pg_temp.assert((select count(*)=1 from public.disclosure_notification_outbox where status='needs_review'),'expired notice is visible for staff review');

-- Transaction failure must roll back both confirmation matching and notification creation.
do $$ begin
  begin
    perform public.ingest_disclosure_confirmation(pg_temp.event('invalid-timeframe') || jsonb_build_object('timeframe_text',repeat('x',300)));
    raise exception 'oversized estimate accepted';
  exception when check_violation then null; end;
  perform pg_temp.assert(not exists(select 1 from public.disclosure_confirmations where source_message_id='invalid-timeframe'),'invalid transaction leaves no partial ledger');
end $$;

set role authenticated;
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*)=0 from public.disclosure_confirmations),'client cannot read raw email ledger');
select pg_temp.assert((select count(*)=0 from public.disclosure_notification_outbox),'client cannot read recipients or private payloads');
select pg_temp.assert((select count(*)=2 from public.get_case_disclosure_confirmations('30000000-0000-4000-8000-000000000001')),'owner sees safe case updates');
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000003';
select pg_temp.assert((select count(*)=0 from public.get_case_disclosure_confirmations('30000000-0000-4000-8000-000000000001')),'other client cannot read updates');
do $$ begin
  begin perform public.claim_disclosure_notices(); raise exception 'client worker privilege accepted'; exception when insufficient_privilege then null; end;
  begin perform public.match_disclosure_confirmation('00000000-0000-4000-8000-000000000000'); raise exception 'client staff privilege accepted'; exception when raise_exception then if sqlerrm<>'STAFF_REQUIRED' then raise; end if; end;
  begin update public.disclosure_automation_state set delivery_enabled=true; raise exception 'client changed delivery switch'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*)>0 from public.disclosure_confirmations),'staff can review inbound ledger');
select pg_temp.assert((select count(*)=2 from public.disclosure_notification_outbox),'staff can review delivery status');
set role anon;
set request.jwt.claim.role='anon';
do $$ begin
  begin perform public.get_case_disclosure_confirmations('30000000-0000-4000-8000-000000000001'); raise exception 'anonymous case access accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Disclosure SQL/RLS tests passed' as result;
