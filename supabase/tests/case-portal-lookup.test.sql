select set_config('request.jwt.claim.role','service_role',false);
select public.assert_test(not has_function_privilege('authenticated','public.record_case_portal_verification(uuid,text,text,jsonb,text,text,text,uuid,text)','EXECUTE'),'clients and staff cannot bypass endpoint verification');
select public.assert_test(not has_table_privilege('authenticated','public.case_portal_verifications','SELECT'),'lookup ciphertext stays private');
insert into public.ticket_submissions(id,ticket_number,first_name,last_name,fine_amount,ticket_document_path,consent_form_path,intake_consent,intake_review_status,representation_paid_at,representation_access_token_hash)
values ('10000000-0000-4000-8000-000000000006','T12345673Z','FIXTURE','LOOKUP',373,'source/6.jpg','consent/6.pdf','{"accepted":true}','ready',now(),repeat('e',64)),
 ('10000000-0000-4000-8000-000000000007','T12345674Z','FIXTURE','UNPAID LOOKUP',373,'source/7.jpg','consent/7.pdf','{"accepted":true}','ready',null,repeat('e',64));
update public.portal_agent_jobs set status='needs_review',result='{"phase":"verification"}',review_reason='Filing requires attention before submission. VERIFICATION_DETAIL_REQUIRED' where ticket_number='T12345673Z';
do $$declare saved uuid; changed uuid; j public.portal_agent_jobs; s uuid; form jsonb; terms text:='The actual terms of this isolated synthetic browser session.'; hash text:=encode(sha256(convert_to(terms,'UTF8')),'hex'); cipher jsonb:='{"version":2,"iv":"fixture","value":"encrypted-fixture"}';begin
 perform public.expect_error(format('select public.record_case_portal_verification(%L,%L,%L,%L,%L,%L,%L,null,%L)','10000000-0000-4000-8000-000000000006','T12345673Z','plate',cipher,repeat('c',64),'source/6.jpg',repeat('a',64),repeat('f',64)),'PRIVATE_CASE_ACCESS_REQUIRED');
 perform public.expect_error(format('select public.record_case_portal_verification(%L,%L,%L,%L,%L,%L,%L,%L,null)','10000000-0000-4000-8000-000000000006','T12345673Z','plate',cipher,repeat('c',64),'source/6.jpg',repeat('a',64),'00000000-0000-4000-8000-000000000002'),'STAFF_REQUIRED');
 saved:=public.record_case_portal_verification('10000000-0000-4000-8000-000000000006','T12345673Z','plate',cipher,repeat('c',64),'source/6.jpg',repeat('a',64),null,repeat('e',64));
 perform public.assert_test((select status='queued' from public.portal_agent_jobs where ticket_number='T12345673Z'),'saving the missing detail resumes the existing job');
 perform public.assert_test(public.record_case_portal_verification('10000000-0000-4000-8000-000000000006','T12345673Z','plate',cipher,repeat('c',64),'source/6.jpg',repeat('a',64),null,repeat('e',64))=saved,'uncertain repeat save is idempotent');
 changed:=public.record_case_portal_verification('10000000-0000-4000-8000-000000000006','T12345673Z','drivers_license',cipher,repeat('d',64),'source/6.jpg',repeat('a',64),'00000000-0000-4000-8000-000000000001',null);
 perform public.assert_test((select count(*)=2 and count(*) filter(where revoked_at is null)=1 from public.case_portal_verifications where submission_id='10000000-0000-4000-8000-000000000006'),'changes preserve the earlier lookup record and one current value');
 perform public.record_case_portal_verification('10000000-0000-4000-8000-000000000007','T12345674Z','plate',cipher,repeat('c',64),'source/7.jpg',repeat('a',64),null,repeat('e',64));
 perform public.assert_test(not exists(select 1 from public.portal_agent_jobs where ticket_number='T12345674Z'),'lookup detail cannot start unpaid service');
 select * into j from public.claim_portal_agent_job();
 perform public.expect_error(format('select public.record_case_portal_verification(%L,%L,%L,%L,%L,%L,%L,null,%L)',j.submission_id,j.ticket_number,'plate',cipher,repeat('c',64),'source/6.jpg',repeat('a',64),repeat('e',64)),'LOOKUP_FORM_LOCKED');
 s:=public.register_portal_browser_session(j.id,j.lease_token,'synthetic-lookup-browser',terms,hash,now()+interval '9 minutes');
 perform set_config('request.jwt.claim.role','authenticated',false);perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
 perform public.accept_portal_browser_session(s,hash);
 perform set_config('request.jwt.claim.role','service_role',false);perform set_config('request.jwt.claim.sub','',false);
 select * into j from public.claim_portal_agent_job();
 insert into public.initial_disclosure_material(submission_id,case_fingerprint,source_path,source_sha256,consent_path,consent_sha256,verification_ciphertext,evidence)
 values(j.submission_id,public.initial_disclosure_fingerprint(j.submission_id),'source/6.jpg',repeat('a',64),'consent/6.pdf',repeat('b',64),cipher,'{"defendant":"LOOKUP, FIXTURE","lookup_fingerprints":[]}');
 form:=jsonb_build_object('case_fingerprint',public.initial_disclosure_fingerprint(j.submission_id),'source_sha256',repeat('a',64),'consent_sha256',repeat('b',64),'ticket_number',j.ticket_number,'representative_email','hello@fabsy.ca','defendant_no_email',true,'agent',true,'browser_session_id','synthetic-lookup-browser','terms_sha256',hash,'session_record_id',s,'lookup_kind','drivers_license','lookup_fingerprint',repeat('d',64),'lookup_record_id',changed);
 perform public.expect_error(format('select public.begin_initial_disclosure(%L,%L,%L)',j.id,j.lease_token,form-'lookup_fingerprint'),'VERIFIED_LOOKUP_REQUIRED');
 perform public.expect_error(format('select public.begin_initial_disclosure(%L,%L,%L)',j.id,j.lease_token,form||jsonb_build_object('lookup_record_id',saved)),'VERIFIED_LOOKUP_CHANGED');
 perform public.expect_error(format('select public.begin_initial_disclosure(%L,%L,%L)',j.id,j.lease_token,form||'{"lookup_record_id":null}'),'VERIFIED_LOOKUP_CHANGED');
 perform public.begin_initial_disclosure(j.id,j.lease_token,form);
 perform public.assert_test((select defendant='LOOKUP, FIXTURE' from public.verified_ticket_display_names() where submission_id=j.submission_id),'case display retains the printed surname-first name');
 perform public.expect_error(format('select public.record_case_portal_verification(%L,%L,%L,%L,%L,%L,%L,null,%L)',j.submission_id,j.ticket_number,'plate',cipher,repeat('c',64),'source/6.jpg',repeat('a',64),repeat('e',64)),'LOOKUP_FORM_LOCKED');
end $$;
select 'Case portal lookup authorization, payment and frozen identifier tests passed' as result;
