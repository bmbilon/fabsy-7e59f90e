create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
create function pg_temp.case_id(n integer) returns uuid language sql immutable as $$ select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.make_case(n integer,with_consent boolean default true) returns uuid language plpgsql as $$
declare source uuid:=pg_temp.case_id(n); begin
  insert into clients values(source,'Alex','Example','alex'||n||'@example.test');
  insert into storage.objects(bucket_id,name) values('assessment-tickets',source||'/ticket.pdf'),('consent-forms',source||'/consent-form-0123456789abcdef.pdf');
  insert into ticket_submissions(id,client_id,ticket_number,first_name,last_name,email,ticket_document_path,consent_form_path,intake_consent)
    values(source,source,'E'||lpad(n::text,8,'0')||'P','Alex','Example','alex'||n||'@example.test',source||'/ticket.pdf',
      case when with_consent then source||'/consent-form-0123456789abcdef.pdf' end,
      jsonb_build_object('method','checkbox','accepted',true,'acceptedAt',now()));
  return source;
end $$;
create function pg_temp.claim_case(n integer) returns consent_welcome_notifications language plpgsql as $$
declare result consent_welcome_notifications%rowtype; begin
  -- Keep each scenario deterministic without bypassing the real claimant.
  update consent_welcome_notifications set next_attempt_at=now()+interval '1 day' where status='pending';
  update consent_welcome_notifications set next_attempt_at=now()-interval '1 second' where submission_id=pg_temp.case_id(n) and status='pending';
  select * into result from claim_consent_welcome_notifications(1); return result;
end $$;
create function pg_temp.proofs(context jsonb) returns jsonb language plpgsql as $$
declare result jsonb:=jsonb_build_array(jsonb_build_object('path','consent-forms/'||(context->>'consent_form_path'),'sha256',coalesce(context->>'consent_sha256',repeat('a',64)))); begin
  if context->'ticket_upload_required'='true'::jsonb then result:=result||jsonb_build_array(jsonb_build_object('path','assessment-tickets/'||(context->>'ticket_document_path'),'sha256',repeat('b',64))); end if;
  if context->>'signature_method'='manual_scan' then result:=result||jsonb_build_array(jsonb_build_object('path','representation-consent-scans/'||(context->>'manual_scan_pdf_path'),'sha256',context->>'manual_scan_pdf_sha256')); end if;
  return result;
end $$;
set request.jwt.claim.role='service_role';
select pg_temp.assert((select count(*)=0 from consent_welcome_notifications),'no historical backfill');
select pg_temp.make_case(1);
select pg_temp.assert((select count(*)=1 from consent_welcome_notifications),'new native consent queues');
update ticket_submissions set consent_form_path=consent_form_path where id=pg_temp.case_id(1);
select pg_temp.assert((select count(*)=1 from consent_welcome_notifications),'repeated same PDF does not queue twice');
select pg_temp.assert(claim_ticket_submission_notification(pg_temp.case_id(1),gen_random_uuid())->>'clientEmailOwner'='consent_welcome','new legacy bundle delegates client email');
do $$ declare job consent_welcome_notifications%rowtype; context jsonb; begin
  job:=pg_temp.claim_case(1); context:=get_consent_welcome_context(job.id,job.claim_id);
  perform pg_temp.assert(context->'eligible'='true','native real files and email eligible');
  perform pg_temp.assert(context->'payment_not_started_verified'='true','no checkout is verified unpaid');
  perform pg_temp.assert(begin_consent_welcome_send(job.id,job.claim_id,context->>'source_fingerprint',repeat('c',64),pg_temp.proofs(context)),'durable send fence');
  perform pg_temp.assert(not begin_consent_welcome_send(job.id,job.claim_id,context->>'source_fingerprint',repeat('c',64),pg_temp.proofs(context)),'send fence cannot repeat');
  perform pg_temp.assert(not finish_consent_welcome_notification(job.id,job.claim_id,'pending',null,'unsafe_retry'),'sending cannot requeue');
  perform pg_temp.assert(finish_consent_welcome_notification(job.id,job.claim_id,'sent','provider-fixture',null),'provider receipt saved');
end $$;

-- The whole legacy bundle is ambiguous even if its client component succeeded.
select pg_temp.make_case(2,false),pg_temp.make_case(3,false),pg_temp.make_case(4,false),pg_temp.make_case(5,false);
insert into ticket_submission_notification_dispatches(submission_id,claim_id,status,completed_at,failure_code) values
 (pg_temp.case_id(2),gen_random_uuid(),'sent',now(),null),
 (pg_temp.case_id(3),gen_random_uuid(),'sending',null,null),
 (pg_temp.case_id(4),gen_random_uuid(),'indeterminate',now(),'lost_response'),
 (pg_temp.case_id(5),gen_random_uuid(),'failed_before_delivery',now(),'preflight_failed');
update ticket_submissions set consent_form_path=id||'/consent-form-0123456789abcdef.pdf' where id in(pg_temp.case_id(2),pg_temp.case_id(3),pg_temp.case_id(4),pg_temp.case_id(5));
select pg_temp.assert((select count(*)=3 from consent_welcome_notifications where failure_code='legacy_delivery_exists'),'prior legacy sends held');
select pg_temp.assert((select status='pending' from consent_welcome_notifications where submission_id=pg_temp.case_id(5)),'legacy preflight failure safe');
select pg_temp.assert(claim_ticket_submission_notification(pg_temp.case_id(5),gen_random_uuid())->>'clientEmailOwner'='consent_welcome','safe legacy retry delegates email');

-- Missing contact or physical upload waits; late data makes the same row ready.
select pg_temp.make_case(6);
update clients set email='' where id=pg_temp.case_id(6);
update ticket_submissions set email='' where id=pg_temp.case_id(6);
delete from storage.objects where bucket_id='assessment-tickets' and name=pg_temp.case_id(6)||'/ticket.pdf';
do $$ declare job consent_welcome_notifications%rowtype; context jsonb; begin
  job:=pg_temp.claim_case(6); context:=get_consent_welcome_context(job.id,job.claim_id);
  perform pg_temp.assert(context->'eligible'='false','missing source held before provider');
  perform pg_temp.assert(finish_consent_welcome_notification(job.id,job.claim_id,'pending',null,'email_unavailable'),'missing source retries safely');
end $$;
update clients set email='alex6@example.test' where id=pg_temp.case_id(6);
update ticket_submissions set email='alex6@example.test' where id=pg_temp.case_id(6);
insert into storage.objects(bucket_id,name) values('assessment-tickets',pg_temp.case_id(6)||'/ticket.pdf');
do $$ declare job consent_welcome_notifications%rowtype; context jsonb; begin
  job:=pg_temp.claim_case(6); context:=get_consent_welcome_context(job.id,job.claim_id);
  perform pg_temp.assert(context->'eligible'='true','late contact/upload unblocks same consent');
  update idr_checkout_intents set status='paid' where ticket_submission_id=pg_temp.case_id(6);
  insert into idr_checkout_intents values(gen_random_uuid(),pg_temp.case_id(6),pg_temp.case_id(6),'paid','ticket_only','cs_live_paid');
  perform pg_temp.assert(not begin_consent_welcome_send(job.id,job.claim_id,context->>'source_fingerprint',repeat('c',64),pg_temp.proofs(context)),'payment transition invalidates unpaid content');
  context:=get_consent_welcome_context(job.id,job.claim_id);
  perform pg_temp.assert(context->'payment_recorded'='true','paid reservation suppresses reminder without timestamp');
  update storage.objects set updated_at=now()+interval '1 second' where bucket_id='consent-forms' and name=job.consent_form_path;
  perform pg_temp.assert(not begin_consent_welcome_send(job.id,job.claim_id,context->>'source_fingerprint',repeat('c',64),pg_temp.proofs(context)),'replaced object invalidates prior proof');
  perform finish_consent_welcome_notification(job.id,job.claim_id,'pending',null,'source_changed');
end $$;

select pg_temp.make_case(7);
do $$ declare job consent_welcome_notifications%rowtype; context jsonb; old_claim uuid; begin
  job:=pg_temp.claim_case(7); old_claim:=job.claim_id;
  update consent_welcome_notifications set claim_expires_at=now()-interval '1 second' where id=job.id;
  job:=pg_temp.claim_case(7);
  perform pg_temp.assert(job.claim_id<>old_claim,'expired preparation safely reclaimed');
  context:=get_consent_welcome_context(job.id,job.claim_id);
  perform begin_consent_welcome_send(job.id,job.claim_id,context->>'source_fingerprint',repeat('c',64),pg_temp.proofs(context));
  update consent_welcome_notifications set claim_expires_at=now()-interval '1 second' where id=job.id;
  perform pg_temp.claim_case(7);
  perform pg_temp.assert((select status='indeterminate' and attempted_at is not null from consent_welcome_notifications where id=job.id),'expired sending never retries');
end $$;

-- Completed invite plus mirrored case path produces exactly one delivery.
select pg_temp.make_case(8,false);
insert into representation_consent_invites(id,ticket_submission_id,client_legal_name,client_first_name,client_email,ticket_number,pdf_path,pdf_sha256,signed_at,signature_method)
 values('30000000-0000-4000-8000-000000000008',pg_temp.case_id(8),'Alex Example','Alex','alex8@example.test','E00000008P',
 'standalone/30000000-0000-4000-8000-000000000008/claim/signed-consent.pdf',repeat('d',64),now(),'typed');
update ticket_submissions set consent_form_path='standalone/30000000-0000-4000-8000-000000000008/claim/signed-consent.pdf' where id=pg_temp.case_id(8);
update representation_consent_invites set status='completed' where id='30000000-0000-4000-8000-000000000008';
insert into storage.objects(bucket_id,name) values('consent-forms','standalone/30000000-0000-4000-8000-000000000008/claim/signed-consent.pdf');
select pg_temp.assert((select count(*)=1 and bool_and(source_type='invite') from consent_welcome_notifications where submission_id=pg_temp.case_id(8)),'canonical PDF upgrades to authoritative invite without duplicate');
do $$ declare job consent_welcome_notifications%rowtype; context jsonb; begin
  job:=pg_temp.claim_case(8); context:=get_consent_welcome_context(job.id,job.claim_id);
  perform pg_temp.assert(context->'eligible'='true','linked completed invite ready');
  perform pg_temp.assert(context->>'consent_sha256'=repeat('d',64),'completed hash preserved');
  perform finish_consent_welcome_notification(job.id,job.claim_id,'pending',null,'test_wait');
end $$;

-- Unlinked authoritative invitation can deliver consent only, never invent payment.
insert into representation_consent_invites(id,status,client_legal_name,client_email,ticket_number,ticket_numbers,pdf_path,pdf_sha256,signed_at,signature_method,
 manual_scan_pdf_path,manual_scan_pdf_sha256,manual_scan_review_status) values
 ('30000000-0000-4000-8000-000000000009','completed','Alex Example','invite@example.test','E 00000009-P',array['E00000010P'],
 'standalone/30000000-0000-4000-8000-000000000009/claim/signed-consent.pdf',repeat('d',64),now(),'manual_scan',
 'manual/30000000-0000-4000-8000-000000000009/claim/signed-scan.pdf',repeat('e',64),'pending');
insert into storage.objects(bucket_id,name) values
 ('consent-forms','standalone/30000000-0000-4000-8000-000000000009/claim/signed-consent.pdf'),
 ('representation-consent-scans','manual/30000000-0000-4000-8000-000000000009/claim/signed-scan.pdf');
update consent_welcome_notifications set next_attempt_at=now()+interval '1 day' where status='pending' and invite_id is distinct from '30000000-0000-4000-8000-000000000009';
do $$ declare job consent_welcome_notifications%rowtype; context jsonb; begin
  select * into job from claim_consent_welcome_notifications(1); context:=get_consent_welcome_context(job.id,job.claim_id);
  perform pg_temp.assert(context->'eligible'='true' and context->'payment_unknown'='true' and context->'ticket_upload_required'='false','unlinked signed invitation copy only');
  perform pg_temp.assert(context->>'ticket_number'='E 00000009-P','full original ticket reference retained');
  begin
    perform begin_consent_welcome_send(job.id,job.claim_id,context->>'source_fingerprint',repeat('c',64),jsonb_build_array(pg_temp.proofs(context)->0));
    raise exception 'manual scan omitted';
  exception when others then if sqlerrm<>'CONSENT_WELCOME_ATTACHMENTS_INVALID' then raise; end if; end;
  perform pg_temp.assert(begin_consent_welcome_send(job.id,job.claim_id,context->>'source_fingerprint',repeat('c',64),pg_temp.proofs(context)),'actual manual scan plus audit required');
  perform pg_temp.assert(finish_consent_welcome_notification(job.id,job.claim_id,'indeterminate',null,'provider_timeout'),'uncertain delivery permanently held');
end $$;

-- Queued welcome replaces only its own abandoned consent/payment reminder.
insert into ticket_intake_drafts values(pg_temp.case_id(18),pg_temp.case_id(1)),(pg_temp.case_id(19),null);
insert into abandoned_ticket_emails values(pg_temp.case_id(18),pg_temp.case_id(18)),(pg_temp.case_id(19),pg_temp.case_id(19));
select pg_temp.assert(get_abandoned_ticket_email_context(pg_temp.case_id(18),gen_random_uuid())->>'reason'='consent_welcome_owns_followup','contradictory old reminder suppressed');
select pg_temp.assert(get_abandoned_ticket_email_context(pg_temp.case_id(19),gen_random_uuid())->>'reason'='original_guard_preserved','unrelated reminder unchanged');

insert into portal_activity_events(event_type,status,last_error,claim_token,lease_until) values
 ('representation_consent_signed','processing','consent_provider_request_started',gen_random_uuid(),now()-interval '1 minute'),
 ('representation_consent_signed','processing','missing_pdf',gen_random_uuid(),now()-interval '1 minute'),
 ('other_event','processing','consent_provider_request_started',gen_random_uuid(),now()-interval '1 minute');
select pg_temp.assert((select count(*)=2 from claim_portal_activity_events(10)),'only uncertain consent staff copy stops retrying');
select pg_temp.assert((select count(*)=1 from portal_activity_events where status='needs_review'),'Gmail crash marker held');

select pg_temp.make_case(10);
update ticket_submissions set ticket_number='unclear / two tickets' where id=pg_temp.case_id(10);
do $$ declare job consent_welcome_notifications%rowtype; context jsonb; begin
  job:=pg_temp.claim_case(10); context:=get_consent_welcome_context(job.id,job.claim_id);
  perform pg_temp.assert(context->>'reason'='ticket_number_unavailable','ambiguous ticket string waits for correction');
  perform finish_consent_welcome_notification(job.id,job.claim_id,'pending',null,'ticket_number_unavailable');
end $$;
select pg_temp.make_case(11);
update ticket_submissions set representation_payment_intent_id='pi_Hold' where id=pg_temp.case_id(11);
insert into referral_payment_holds values('pi_Hold');
do $$ declare job consent_welcome_notifications%rowtype; context jsonb; begin
  job:=pg_temp.claim_case(11); context:=get_consent_welcome_context(job.id,job.claim_id);
  perform pg_temp.assert(context->'payment_unknown'='true' and context->'payment_not_started_verified'='false','refund dispute hold prevents payment demand');
  perform finish_consent_welcome_notification(job.id,job.claim_id,'pending',null,'test_wait');
end $$;
set role authenticated;
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*)=0 from consent_welcome_notifications),'client cannot read private deliveries');
do $$ begin
  begin perform claim_consent_welcome_notifications(1); raise exception 'public worker allowed'; exception when insufficient_privilege then null; end;
  begin perform get_abandoned_ticket_email_context_before_consent_welcome(gen_random_uuid(),gen_random_uuid()); raise exception 'private guard bypass allowed'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*)>0 from consent_welcome_notifications),'staff can inspect delivery holds');
reset role;
set request.jwt.claim.role='service_role';
select record_consent_welcome_worker_health('consent_preparation_waiting');
select pg_temp.assert((select last_worker_at is not null from consent_welcome_state),'worker health stored');

-- The runner uses this untouched row for two independent concurrent claims.
select pg_temp.make_case(99);
update consent_welcome_notifications set next_attempt_at=now()+interval '1 day' where status='pending' and submission_id<>pg_temp.case_id(99);
select 'consent welcome SQL tests passed';
