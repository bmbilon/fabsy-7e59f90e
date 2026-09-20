set request.jwt.claim.role='service_role';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.new_case(p_id uuid,p_ticket text) returns void language sql as $$
  insert into public.ticket_submissions(id,client_id,ticket_number,representation_paid_at,ticket_document_path,
    consent_form_path,intake_mode,intake_review_status,intake_consent)
  values(p_id,'20000000-0000-4000-8000-000000000001',p_ticket,now(),'fixture/ticket.pdf','fixture/consent.pdf',
    'photo_only','ready','{"version":"photo-upload-consent-v3","accepted":true,"pleadNotGuilty":true}')
$$;
create function pg_temp.receipt(p_id uuid,p_ticket text,p_key text,p_confirmed boolean default true) returns jsonb language sql as $$
  select public.record_disclosure_request_receipt(p_id,p_ticket,'portal',p_key,now(),
    'Synthetic visible portal receipt',repeat('a',64),'80000000-0000-4000-8000-000000000001',null,p_confirmed)
$$;
create function pg_temp.event(p_key text,p_ticket text,p_confirmed timestamptz default now()) returns jsonb language sql as $$
  select jsonb_build_object('source_message_id',p_key,'sender','noreply@gov.ab.ca','ticket_number',p_ticket,
    'confirmed_at',p_confirmed,'timeframe_text',null,'body_excerpt','Synthetic verified request acknowledgement',
    'authentication_result','dkim=pass header.d=gov.ab.ca','parse_error',null)
$$;
create temporary table results(label text primary key,body jsonb);

-- Actual portal success advances the existing staff version and retains session attribution.
select pg_temp.new_case('70000000-0000-4000-8000-000000000002','P90000002Z');
select set_admin_ticket_case_status('submission','70000000-0000-4000-8000-000000000002','paid',0);
insert into results values('portal',pg_temp.receipt('70000000-0000-4000-8000-000000000002','p 90000002 z','operation-1'));
select pg_temp.assert((select body->>'status_sync'='advanced' and body->>'staff_stage_before'='paid'
  and body->>'staff_version_before'='1' and body->>'staff_version_after'='2'
  and body->>'portal_session_id'='80000000-0000-4000-8000-000000000001' from results where label='portal'),
  'receipt exposes exact own-session before/after transition');
select pg_temp.assert((select stage='disclosure_requested' and version=2 and note like 'Confirmed disclosure request receipt %'
  from admin_ticket_case_status where kind='submission' and ticket_id='70000000-0000-4000-8000-000000000002'),
  'portal request updates canonical staff stage once');
select pg_temp.assert((select count(*)=2 from admin_ticket_case_status_history
  where kind='submission' and ticket_id='70000000-0000-4000-8000-000000000002'),'staff audit records original and receipt advance');
select pg_temp.assert(not disclosure_approval_case_eligible('70000000-0000-4000-8000-000000000002'),
  'receipt prevents starting a fresh automatic workflow');
select set_admin_ticket_case_status('submission','70000000-0000-4000-8000-000000000002','paid',2);
select pg_temp.assert(not disclosure_approval_case_eligible('70000000-0000-4000-8000-000000000002'),
  'staff stage reset cannot erase a confirmed request or allow refiling');
insert into results values('replay',pg_temp.receipt('70000000-0000-4000-8000-000000000002','P90000002Z','operation-repeat'));
select pg_temp.assert((select body->>'created'='false' and body->>'receipt_id'=(select body->>'receipt_id' from results where label='portal')
  from results where label='replay'),'normalized-ticket duplicate returns the immutable first receipt');
select pg_temp.assert((select version=3 and stage='paid' from admin_ticket_case_status
  where kind='submission' and ticket_id='70000000-0000-4000-8000-000000000002'),'duplicate receipt does not overwrite a later staff action');
select ingest_disclosure_confirmation(pg_temp.event('portal-later-ack','P90000002Z'));
select ingest_disclosure_confirmation(pg_temp.event('portal-next-day-ack','P90000002Z',now()-interval '1 day'));
select pg_temp.assert((select count(*)=1 from disclosure_notification_outbox
  where submission_id='70000000-0000-4000-8000-000000000002'),'portal plus multiple dates of Crown acknowledgement sends only once');

-- Historical matched evidence repairs only status and attaches the old sent notice.
select ingest_disclosure_confirmation(pg_temp.event('historical-duplicate','H90000001Z',
  (select confirmed_at from disclosure_confirmations where id='71000000-0000-4000-8000-000000000001')));
select pg_temp.assert((select status='duplicate' from disclosure_confirmations where source_message_id='historical-duplicate'),
  'new duplicate acknowledgement retains duplicate identity while repairing historical receipt');
select match_disclosure_confirmation('71000000-0000-4000-8000-000000000001');
select match_disclosure_confirmation('71000000-0000-4000-8000-000000000001');
select pg_temp.assert((select stage='disclosure_requested' and version=1 from admin_ticket_case_status
  where kind='submission' and ticket_id='70000000-0000-4000-8000-000000000001'),'historical acknowledgement backfills status idempotently');
select pg_temp.assert((select count(*)=1 from disclosure_notification_outbox where submission_id='70000000-0000-4000-8000-000000000001'),
  'historical sent notice is reused, never resent');
select pg_temp.assert((select status='sent' and attempts=1 and provider_email_id='synthetic-existing-provider'
  and email_payload='{"subject":"Original historical notice","html":"Frozen original"}'::jsonb
  and request_receipt_id is not null and sent_at<now()-interval '23 hours'
  from disclosure_notification_outbox where id='72000000-0000-4000-8000-000000000001'),
  'historical provider receipt, timestamps and frozen content remain intact');

-- Missing estimates do not prevent a verified request from being recorded.
select pg_temp.new_case('70000000-0000-4000-8000-000000000003','P90000003Z');
select ingest_disclosure_confirmation(pg_temp.event('no-estimate','P90000003Z'));
select pg_temp.assert((select status='matched' and timeframe_text is null from disclosure_confirmations where source_message_id='no-estimate'),
  'verified acknowledgement can match without inventing an estimate');
select pg_temp.assert((select stage='disclosure_requested' from admin_ticket_case_status
  where ticket_id='70000000-0000-4000-8000-000000000003'),'inbound confirmation automatically advances staff stage');

-- Every later/closed staff stage, including lapsed, is preserved.
do $$ declare later_stage text; case_id uuid; n integer:=10; result jsonb; begin
  foreach later_stage in array array['crown_offer_received','done_reduced','done_withdrawn','lapsed_expired',
    'trial_proceeding','trial_date_pending','trial_date_set','trial_concluded_reduced','trial_concluded_upheld'] loop
    case_id:=('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
    perform pg_temp.new_case(case_id,'L'||lpad(n::text,8,'0')||'Z');
    perform set_admin_ticket_case_status('submission',case_id,later_stage,0);
    result:=pg_temp.receipt(case_id,'L'||lpad(n::text,8,'0')||'Z','later-'||n);
    perform pg_temp.assert(result->>'status_sync'='held_later_stage','later stage is held: '||later_stage);
    perform pg_temp.assert((select stage=later_stage and version=1 from admin_ticket_case_status
      where kind='submission' and ticket_id=case_id),'later stage/version cannot regress: '||later_stage);
    perform pg_temp.assert((select status=case when later_stage in
      ('crown_offer_received','trial_proceeding','trial_date_pending','trial_date_set') then 'pending' else 'needs_review' end
      from disclosure_notification_outbox where submission_id=case_id),
      'active later stage gets one notice while closed staff stages remain held: '||later_stage);
    n:=n+1;
  end loop;
end $$;
select pg_temp.new_case('70000000-0000-4000-8000-000000000004','P90000004Z');
update ticket_submissions set deleted_at=now() where id='70000000-0000-4000-8000-000000000004';
select pg_temp.assert(pg_temp.receipt('70000000-0000-4000-8000-000000000004','P90000004Z','deleted')->>'status_sync'='held_deleted',
  'deleted case retains receipt without stage/email resurrection');
select pg_temp.new_case('70000000-0000-4000-8000-000000000005','P90000005Z');
update ticket_submissions set status='completed' where id='70000000-0000-4000-8000-000000000005';
select pg_temp.assert(pg_temp.receipt('70000000-0000-4000-8000-000000000005','P90000005Z','closed')->>'status_sync'='held_inactive',
  'closed submission retains receipt without reopening');

-- Converted draft stage/version is inherited before creating canonical status.
select pg_temp.new_case('70000000-0000-4000-8000-000000000006','P90000006Z');
insert into ticket_intake_drafts(id,converted_submission_id) values
  ('76000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000006');
insert into admin_ticket_case_status(kind,ticket_id,stage,version) values('draft','76000000-0000-4000-8000-000000000001','paid',7);
select pg_temp.assert(pg_temp.receipt('70000000-0000-4000-8000-000000000006','P90000006Z','inherited')->>'staff_version_after'='8',
  'inherited staff version advances monotonically');

-- No receipt/stage is manufactured from a mere intention or wrong evidence source.
select pg_temp.new_case('70000000-0000-4000-8000-000000000007','P90000007Z');
do $$ begin
  begin perform pg_temp.receipt('70000000-0000-4000-8000-000000000007','P90000007Z','unconfirmed',false);
    raise exception 'unconfirmed request accepted';
  exception when raise_exception then if sqlerrm<>'ACTUAL_DISCLOSURE_RECEIPT_REQUIRED' then raise; end if; end;
  begin perform record_disclosure_request_receipt('70000000-0000-4000-8000-000000000007','P90000007Z','inbound','fake',now(),'fake');
    raise exception 'unmatched inbound accepted';
  exception when raise_exception then if sqlerrm<>'MATCHED_DISCLOSURE_CONFIRMATION_REQUIRED' then raise; end if; end;
  perform pg_temp.assert(not exists(select 1 from disclosure_request_receipts where submission_id='70000000-0000-4000-8000-000000000007'),
    'unconfirmed attempts leave no receipt');
end $$;

-- Frozen attempted Gmail notices have no automatic retry, including a lost lease.
update disclosure_automation_state set delivery_enabled=true;
create temporary table claims as select * from claim_disclosure_notices(5);
select freeze_disclosure_notice(id,claim_token,'{"subject":"Frozen once","html":"Synthetic"}') from claims
  where submission_id='70000000-0000-4000-8000-000000000002';
select complete_disclosure_notice(id,claim_token,null,'uncertain Gmail result') from claims
  where submission_id='70000000-0000-4000-8000-000000000002';
select pg_temp.assert((select status='needs_review' and attempts=1 and email_payload->>'subject'='Frozen once'
  from disclosure_notification_outbox where submission_id='70000000-0000-4000-8000-000000000002'),
  'Gmail failure holds the frozen message without scheduling another send');
update disclosure_notification_outbox set lease_until=now()-interval '1 second' where status='processing';
select * from claim_disclosure_notices(5);
select pg_temp.assert(not exists(select 1 from disclosure_notification_outbox where status='processing' and id in (select id from claims)),
  'expired leases cannot be reclaimed for an automatic send');
update disclosure_notification_outbox set status='pending',first_attempt_at=now(),attempts=1
  where submission_id='70000000-0000-4000-8000-000000000003';
select * from claim_disclosure_notices(5);
select pg_temp.assert((select status='needs_review' from disclosure_notification_outbox
  where submission_id='70000000-0000-4000-8000-000000000003'),'legacy attempted pending notices are held too');

select pg_temp.receipt('70000000-0000-4000-8000-000000000007','P90000007Z','real-after-intention');
update ticket_submissions set ticket_number='P90000077Z' where id='70000000-0000-4000-8000-000000000007';
select * from claim_disclosure_notices(5);
select pg_temp.assert((select status='needs_review' and attempts=0 from disclosure_notification_outbox
  where submission_id='70000000-0000-4000-8000-000000000007'),'current ticket mismatch stops first delivery');

set role authenticated;
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*)=1 from get_case_disclosure_requests('70000000-0000-4000-8000-000000000002')),
  'owner sees actual portal request before any assumption of evidence receipt');
select pg_temp.assert((select count(*)=0 from disclosure_request_receipts),'owner cannot read private receipt metadata');
do $$ begin
  begin perform record_disclosure_request_receipt('70000000-0000-4000-8000-000000000007','P90000077Z','manual','fake',now(),
    'fake',repeat('a',64),null,null,true); raise exception 'client created receipt';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000003';
select pg_temp.assert((select count(*)=0 from get_case_disclosure_requests('70000000-0000-4000-8000-000000000002')),
  'another client cannot read the request');
reset role;
set request.jwt.claim.role='service_role';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select pg_temp.new_case('70000000-0000-4000-8000-000000000008','P90000008Z');
set role authenticated;
set request.jwt.claim.role='authenticated';
select record_disclosure_request_receipt('70000000-0000-4000-8000-000000000008','P90000008Z','manual','staff-confirmed',now(),
  'Staff verified actual request receipt',repeat('b',64),null,null,true);
select pg_temp.assert((select stage='disclosure_requested' from admin_ticket_case_status
  where ticket_id='70000000-0000-4000-8000-000000000008'),'explicit staff confirmation uses the same atomic status path');
reset role;
set request.jwt.claim.role='service_role';

-- Simulate pre-receipt, different-day notices without invoking the new recorder.
-- Trigger suspension is isolated fixture construction, never application behavior.
create function pg_temp.legacy_notice(p_case uuid,p_ticket text,p_key text,p_status text default 'pending',p_attempts integer default 0)
returns uuid language plpgsql as $$
declare confirmation uuid:=gen_random_uuid(); notice uuid:=gen_random_uuid(); days integer;
begin
  select count(*)+1 into days from disclosure_confirmations where submission_id=p_case;
  insert into disclosure_confirmations(id,source_message_id,sender,ticket_number,confirmed_at,timeframe_text,
    body_excerpt,authentication_result,status,submission_id) values
    (confirmation,p_key,'noreply@gov.ab.ca',p_ticket,now()-make_interval(days=>days),null,
      'Synthetic historical fixture','dkim=pass','matched',p_case);
  insert into disclosure_notification_outbox(id,confirmation_id,submission_id,snapshot,status,attempts,first_attempt_at,
    provider_email_id,sent_at,email_payload) values
    (notice,confirmation,p_case,jsonb_build_object('recipient','client@example.test','first_name','Fixture',
      'ticket_number',p_ticket,'submission_id',p_case),p_status,p_attempts,
      case when p_attempts>0 then now()-interval '1 hour' end,
      case when p_status='sent' then 'historical-accepted' end,
      case when p_status='sent' then now()-interval '1 hour' end,
      case when p_attempts>0 then '{"subject":"Frozen legacy content"}'::jsonb end);
  return notice;
end $$;
create temporary table legacy_notices(label text primary key,id uuid);
select pg_temp.new_case('70000000-0000-4000-8000-000000000030','D90000030Z');
select pg_temp.new_case('70000000-0000-4000-8000-000000000031','D90000031Z');
select pg_temp.new_case('70000000-0000-4000-8000-000000000032','D90000032Z');
select pg_temp.new_case('70000000-0000-4000-8000-000000000033','d 90000032 z');
alter table disclosure_confirmations disable trigger record_matched_disclosure_request;
insert into legacy_notices values
  ('sent',pg_temp.legacy_notice('70000000-0000-4000-8000-000000000030','D90000030Z','legacy-sent','sent',1)),
  ('after-sent',pg_temp.legacy_notice('70000000-0000-4000-8000-000000000030','D90000030Z','legacy-after-sent')),
  ('uncertain',pg_temp.legacy_notice('70000000-0000-4000-8000-000000000031','D90000031Z','legacy-uncertain','needs_review',1)),
  ('after-uncertain',pg_temp.legacy_notice('70000000-0000-4000-8000-000000000031','D90000031Z','legacy-after-uncertain')),
  ('oldest-fresh',pg_temp.legacy_notice('70000000-0000-4000-8000-000000000032','D90000032Z','legacy-fresh-one')),
  ('newer-fresh',pg_temp.legacy_notice('70000000-0000-4000-8000-000000000032','D90000032Z','legacy-fresh-two')),
  ('other-submission',pg_temp.legacy_notice('70000000-0000-4000-8000-000000000033','D90000032Z','legacy-fresh-three'));
alter table disclosure_confirmations enable trigger record_matched_disclosure_request;
update disclosure_notification_outbox set created_at=now()-interval '3 days'
  where id=(select id from legacy_notices where label='oldest-fresh');
update disclosure_notification_outbox set created_at=now()-interval '2 days'
  where id=(select id from legacy_notices where label='newer-fresh');
create temporary table legacy_claims as select * from claim_disclosure_notices(5);
select pg_temp.assert((select count(*)=1 from legacy_claims where id in (select id from legacy_notices)),
  'claim alone selects at most one historical notice per submission or normalized ticket');
select pg_temp.assert((select count(*)=1 from legacy_claims where id=(select id from legacy_notices where label='oldest-fresh')),
  'oldest fresh notice wins independently of receipt replay');
select pg_temp.assert((select count(*)=4 from disclosure_notification_outbox where status='needs_review' and attempts=0
  and id in (select id from legacy_notices where label in ('after-sent','after-uncertain','newer-fresh','other-submission'))),
  'sent, uncertain and duplicate fresh siblings hold all extra sends');
select pg_temp.assert((select status='sent' and provider_email_id='historical-accepted' and attempts=1
  and email_payload->>'subject'='Frozen legacy content' from disclosure_notification_outbox
  where id=(select id from legacy_notices where label='sent')),'accepted legacy evidence stays unchanged');
select pg_temp.assert(not exists(select 1 from disclosure_request_receipts where submission_id in
  ('70000000-0000-4000-8000-000000000030','70000000-0000-4000-8000-000000000031',
   '70000000-0000-4000-8000-000000000032','70000000-0000-4000-8000-000000000033')),
  'historical deduplication does not depend on a receipt RPC');

-- Leave a fresh historical pair for two actual concurrent worker transactions.
select pg_temp.new_case('70000000-0000-4000-8000-000000000034','D90000034Z');
alter table disclosure_confirmations disable trigger record_matched_disclosure_request;
select pg_temp.legacy_notice('70000000-0000-4000-8000-000000000034','D90000034Z','concurrent-first');
select pg_temp.legacy_notice('70000000-0000-4000-8000-000000000034','D90000034Z','concurrent-second');
alter table disclosure_confirmations enable trigger record_matched_disclosure_request;
select 'Disclosure request receipt/status/outbox tests passed' as result;
