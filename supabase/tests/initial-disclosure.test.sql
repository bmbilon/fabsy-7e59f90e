create function public.assert_test(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED: %',label;end if;end$$;
create function public.expect_error(statement text,expected text) returns void language plpgsql as $$
declare message text;begin
 begin execute statement;exception when others then get stacked diagnostics message=MESSAGE_TEXT;end;
 if message is null or position(expected in message)=0 then raise exception 'Expected %, got % for %',expected,message,statement;end if;
end$$;
select set_config('request.jwt.claim.role','service_role',false);
insert into auth.users values('00000000-0000-4000-8000-000000000001',true),('00000000-0000-4000-8000-000000000002',false);
insert into public.portal_push_subscriptions default values;
insert into public.ticket_submissions(id,ticket_number,first_name,last_name,fine_amount,ticket_document_path,consent_form_path,intake_consent,intake_review_status,representation_paid_at,created_at)
values
 ('10000000-0000-4000-8000-000000000001','T12345678Z','FIXTURE','DEFENDANT',373,'source/1.jpg','consent/1.pdf','{"accepted":true}','ready',now(),now()),
 ('10000000-0000-4000-8000-000000000002','T12345679Z','FIXTURE','UNPAID',373,'source/2.jpg','consent/2.pdf','{"accepted":true}','ready',null,now()),
 ('10000000-0000-4000-8000-000000000003','T12345670Z','FIXTURE','NO CONSENT',373,'source/3.jpg',null,null,'ready',now(),now()),
 ('10000000-0000-4000-8000-000000000004','T12345671Z','FIXTURE','HISTORICAL',373,'source/4.jpg','consent/4.pdf','{"accepted":true}','ready',now(),now()-interval '1 day'),
 ('10000000-0000-4000-8000-000000000005','T12345672Z','FIXTURE','HELD',373,'source/5.jpg','consent/5.pdf','{"accepted":true}','ready',now(),now());
update public.ticket_submissions set allow_disclosure=false where id='10000000-0000-4000-8000-000000000005';
select public.assert_test(public.discover_initial_disclosures()=0,'disabled until deployment');
update public.portal_agent_state set initial_disclosures_enabled=true,initial_disclosures_from=now()-interval '1 hour';
select public.assert_test(public.discover_initial_disclosures()=1,'only paid, signed, eligible prospective case admitted');
select public.assert_test(public.discover_initial_disclosures()=0,'repeat scan creates no duplicate');
select public.assert_test(public.queue_initial_disclosure('10000000-0000-4000-8000-000000000004') is null,'historical case does not backfill');
select public.assert_test(public.queue_initial_disclosure('10000000-0000-4000-8000-000000000005',true) is null,'explicit admission does not bypass gates');
insert into public.case_payment_confirmations(submission_id) values('10000000-0000-4000-8000-000000000002');
select public.assert_test(exists(select 1 from public.portal_agent_jobs where ticket_number='T12345679Z'),'verified payment trigger admits');
update public.portal_agent_jobs set status='needs_review' where ticket_number='T12345679Z';
select public.assert_test(not has_function_privilege('service_role','public.accept_portal_browser_session(uuid,text)','EXECUTE'),'runner has no terms acceptance privilege');
select public.assert_test(not has_function_privilege('anon','public.accept_portal_browser_session(uuid,text)','EXECUTE'),'public cannot accept terms');
select public.assert_test(has_function_privilege('authenticated','public.accept_portal_browser_session(uuid,text)','EXECUTE'),'staff JWT may call administrator-gated acceptance');

do $$declare j public.portal_agent_jobs;s uuid;hash text:=encode(sha256(convert_to('The government terms for this isolated synthetic browser session.','UTF8')),'hex');form jsonb;receipt jsonb;begin
 select * into j from public.claim_portal_agent_job();
 perform public.assert_test(j.ticket_number='T12345678Z' and j.lease_expires_at>=now()+interval '7 minutes','initial claim gets sufficient bounded lease');
 perform public.expect_error(format('select public.begin_initial_disclosure(%L,%L,%L)',j.id,j.lease_token,'{}'),'INITIAL_FILING_MATERIAL_CHANGED');
 s:=public.register_portal_browser_session(j.id,j.lease_token,'synthetic-browser','The government terms for this isolated synthetic browser session.',hash,now()+interval '9 minutes');
 perform public.assert_test((select count(*)=1 from public.portal_push_outbox where dedupe_key='terms/'||s),'one exact-session push');
 perform public.expect_error(format('select public.assert_portal_browser_session(%L,%L,%L)',j.id,'synthetic-browser',hash),'ACCEPTED_SESSION_REQUIRED');
 perform public.expect_error(format('update public.portal_browser_sessions set status=''accepted'',accepted_by=''00000000-0000-4000-8000-000000000001'',accepted_at=now() where id=%L',s),'ADMINISTRATOR_TAP_REQUIRED');
 perform set_config('request.jwt.claim.role','authenticated',false);perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
 perform public.expect_error(format('select public.accept_portal_browser_session(%L,%L)',s,hash),'ADMINISTRATOR_REQUIRED');
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
 perform public.expect_error(format('select public.accept_portal_browser_session(%L,%L)',s,repeat('a',64)),'SESSION_EXPIRED_OR_CHANGED');
 perform public.assert_test(public.accept_portal_browser_session(s,hash)=j.id,'authenticated administrator accepts actual hash');
 perform public.assert_test(public.accept_portal_browser_session(s,hash)=j.id,'acceptance idempotent');
 perform set_config('request.jwt.claim.role','service_role',false);perform set_config('request.jwt.claim.sub','',false);
 select * into j from public.claim_portal_agent_job();
 perform public.assert_test((public.assert_portal_browser_session(j.id,'synthetic-browser',hash)).id=s,'accepted session is scoped to exact job/browser/hash');
 perform public.expect_error(format('select public.assert_portal_browser_session(%L,%L,%L)',j.id,'different-browser',hash),'ACCEPTED_SESSION_REQUIRED');
 perform public.expect_error(format('update public.portal_browser_sessions set terms_text=''Changed terms'' where id=%L',s),'SESSION_TERMS_IMMUTABLE');
 insert into public.initial_disclosure_material(submission_id,case_fingerprint,source_path,source_sha256,consent_path,consent_sha256,verification_ciphertext,evidence)
 values(j.submission_id,public.initial_disclosure_fingerprint(j.submission_id),'source/1.jpg',repeat('a',64),'consent/1.pdf',repeat('b',64),'{}',jsonb_build_object('lookup_fingerprints',jsonb_build_array(jsonb_build_object('kind','plate','sha256',repeat('c',64)))));
 form:=jsonb_build_object('case_fingerprint',public.initial_disclosure_fingerprint(j.submission_id),'source_sha256',repeat('a',64),'consent_sha256',repeat('b',64),'ticket_number',j.ticket_number,'representative_email','hello@fabsy.ca','defendant_no_email',true,'agent',true,'browser_session_id','synthetic-browser','terms_sha256',hash,'session_record_id',s,'lookup_kind','plate','lookup_fingerprint',repeat('c',64));
 perform public.expect_error(format('select public.begin_initial_disclosure(%L,%L,%L)',j.id,j.lease_token,form||'{"defendant_no_email":false}'),'INITIAL_FILING_MATERIAL_CHANGED');
 update public.ticket_submissions set allow_disclosure=false where id=j.submission_id;
 perform public.expect_error(format('select public.begin_initial_disclosure(%L,%L,%L)',j.id,j.lease_token,form),'INITIAL_FILING_GATES_CHANGED');
 update public.ticket_submissions set allow_disclosure=true where id=j.submission_id;
 perform public.begin_initial_disclosure(j.id,j.lease_token,form);
 perform public.expect_error(format('update public.portal_agent_jobs set status=''completed'' where id=%L',j.id),'CONFIRMED_DISCLOSURE_RECEIPT_REQUIRED');
 update public.portal_agent_jobs set status='needs_review',result=result||'{"phase":"verification"}' where id=j.id;
 perform public.assert_test((select status='uncertain' and result->>'phase'='committing' and result->'form_snapshot'=form from public.portal_agent_jobs where id=j.id),'post-commit failure cannot become ordinary retry');
 perform set_config('request.jwt.claim.role','authenticated',false);perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
 perform public.expect_error(format('select public.request_portal_handoff(%L,false)',j.id),'HANDOFF_NOT_AVAILABLE');
 perform public.request_portal_handoff(j.id,true);
 perform set_config('request.jwt.claim.role','service_role',false);perform set_config('request.jwt.claim.sub','',false);
 select * into j from public.claim_portal_agent_job();
 perform public.assert_test(j.result->>'phase'='committing','reconciliation preserves committing phase');
 receipt:=jsonb_build_object('ticket_number',j.ticket_number,'url','https://traffictickets.alberta.ca/request-disclosure-confirmation','source','cloud_verified_disclosure','confirmation','We have received your disclosure request for T12345678Z','recorded_at',now());
 perform public.expect_error(format('select public.complete_initial_disclosure(%L,%L,%L,%L)',j.id,j.lease_token,receipt||'{"ticket_number":"T99999999Z"}',encode(sha256(convert_to(receipt->>'confirmation','UTF8')),'hex')),'CONFIRMED_DISCLOSURE_RECEIPT_REQUIRED');
 perform public.expect_error(format('select public.complete_initial_disclosure(%L,%L,%L,%L)',j.id,j.lease_token,receipt||'{"confirmation":"Ticket T12345678Z. We have received your disclosure request for ticket T99999999Z"}',encode(sha256(convert_to('Ticket T12345678Z. We have received your disclosure request for ticket T99999999Z','UTF8')),'hex')),'CONFIRMED_DISCLOSURE_RECEIPT_REQUIRED');
 perform public.complete_initial_disclosure(j.id,j.lease_token,receipt,encode(sha256(convert_to(receipt->>'confirmation','UTF8')),'hex'));
 perform public.complete_initial_disclosure(j.id,j.lease_token,receipt,encode(sha256(convert_to(receipt->>'confirmation','UTF8')),'hex'));
 perform public.assert_test((select count(*)=1 from public.initial_disclosure_receipts where job_id=j.id),'exact receipt stored once');
 perform public.assert_test((select count(*)=1 from public.disclosure_request_receipts where submission_id=j.submission_id),'existing receipt synchronization runs once');
 perform public.assert_test((select status='completed' and result->>'phase'='submitted' from public.portal_agent_jobs where id=j.id),'only actual receipt completes');
end $$;
select 'Initial disclosure database gates and session/receipt tests passed' as result;
