begin;
select set_config('request.jwt.claim.role','service_role',false);
select public.assert_test(not has_table_privilege('anon','public.service_order_portal_lookups','SELECT'),'public clients cannot read order lookup values');
select public.assert_test(not has_table_privilege('authenticated','public.service_order_portal_lookups','SELECT'),'staff lists do not expose order lookup values');
select public.assert_test(not has_function_privilege('anon','public.record_service_order_portal_lookup(uuid,text,text,text,text,jsonb,text)','EXECUTE'),'public clients cannot forge confirmation evidence');
select public.assert_test(not public.portal_lookup_value_valid('drivers_license','PHOTO-INTAKE-123456'),'upload placeholders do not count as DL');
select public.assert_test(not public.portal_lookup_value_valid('plate','N/A'),'N/A does not count as plate');
select public.assert_test(not public.portal_lookup_value_valid('date_of_birth','1990-02-30'),'invalid calendar DOB is rejected');
select public.assert_test(not public.portal_lookup_value_valid('date_of_birth',(current_date+1)::text),'future DOB is rejected');

insert into public.ticket_submissions(id,ticket_number,first_name,last_name,fine_amount,ticket_document_path,consent_form_path,intake_review_status,representation_access_token_hash)
 values('10000000-0000-4000-8000-000000000021','T12345621Z','FIXTURE','MISSING',373,'source/21.jpg','consent/21.pdf','ready',repeat('e',64)),
 ('10000000-0000-4000-8000-000000000022','T12345622Z','FIXTURE','DL',373,'source/22.jpg','consent/22.pdf','ready',repeat('e',64)),
 ('10000000-0000-4000-8000-000000000023','T12345623Z','FIXTURE','DOB',373,'source/23.jpg','consent/23.pdf','ready',repeat('e',64)),
 ('10000000-0000-4000-8000-000000000024','T12345624Z','FIXTURE','PLATE',373,'source/24.jpg','consent/24.pdf','ready',repeat('e',64)),
 ('10000000-0000-4000-8000-000000000025','T12345625Z','FIXTURE','ORDER',373,'source/25.jpg','consent/25.pdf','ready',repeat('e',64)),
 ('10000000-0000-4000-8000-000000000026','T12345626Z','FIXTURE','OWN UPLOAD',373,'service-orders/26/source.jpg','consent/26.pdf','ready',repeat('e',64));
select public.expect_error($q$insert into public.idr_checkout_intents(ticket_submission_id,checkout_kind,status) values('10000000-0000-4000-8000-000000000021','ticket_only','creating')$q$,'PORTAL_LOOKUP_REQUIRED');
update public.ticket_submissions set drivers_license='NOT SUPPLIED' where id='10000000-0000-4000-8000-000000000021';
select public.expect_error($q$insert into public.idr_checkout_intents(ticket_submission_id,checkout_kind,status) values('10000000-0000-4000-8000-000000000021','photo_radar','creating')$q$,'PORTAL_LOOKUP_REQUIRED');
update public.ticket_submissions set drivers_license='123456-789' where id='10000000-0000-4000-8000-000000000022';
update public.ticket_submissions set date_of_birth='1990-02-28' where id='10000000-0000-4000-8000-000000000023';
insert into public.idr_checkout_intents(ticket_submission_id,checkout_kind,status) values
 ('10000000-0000-4000-8000-000000000022','ticket_only','creating'),('10000000-0000-4000-8000-000000000023','ticket_with_addon','creating');
select public.record_case_portal_verification('10000000-0000-4000-8000-000000000024','T12345624Z','plate','{"version":2,"iv":"fixture","value":"encrypted"}',repeat('b',64),'source/24.jpg',repeat('a',64),null,repeat('e',64));
insert into public.idr_checkout_intents(ticket_submission_id,checkout_kind,status) values('10000000-0000-4000-8000-000000000024','photo_radar','creating');
update public.ticket_submissions set ticket_document_path='source/changed.jpg' where id='10000000-0000-4000-8000-000000000024';
select public.expect_error($q$update public.idr_checkout_intents set status='creating' where ticket_submission_id='10000000-0000-4000-8000-000000000024'$q$,'PORTAL_LOOKUP_REQUIRED');
-- Reconcile historical real payments; collecting lookup is not permission to
-- erase or lose a charge which has already occurred.
insert into public.idr_checkout_intents(ticket_submission_id,checkout_kind,status) values('10000000-0000-4000-8000-000000000021','ticket_only','paid');

select public.expect_error($q$insert into public.service_orders(id,access_token_hash,product) values('20000000-0000-4000-8000-000000000025',repeat('e',64),'rapid_resolution')$q$,'PORTAL_LOOKUP_REQUIRED');
insert into public.service_orders(id,access_token_hash,product) values('20000000-0000-4000-8000-000000000029',repeat('e',64),'insurance_report');
select public.record_service_order_portal_lookup('20000000-0000-4000-8000-000000000025',repeat('e',64),'rapid_resolution','T12345625Z','plate','{"version":2,"iv":"fixture","value":"encrypted"}',repeat('c',64));
select public.expect_error($q$select public.record_service_order_portal_lookup('20000000-0000-4000-8000-000000000025',repeat('f',64),'rapid_resolution','T12345625Z','plate','{"version":2,"iv":"fixture","value":"encrypted"}',repeat('c',64))$q$,'PRIVATE_ORDER_ACCESS_REQUIRED');
select public.expect_error($q$insert into public.service_orders(id,access_token_hash,product,ticket_number) values('20000000-0000-4000-8000-000000000025',repeat('f',64),'rapid_resolution','T12345625Z')$q$,'PORTAL_LOOKUP_REQUIRED');
select public.expect_error($q$insert into public.service_orders(id,access_token_hash,product,ticket_number) values('20000000-0000-4000-8000-000000000025',repeat('e',64),'rapid_resolution','T12345626Z')$q$,'PORTAL_LOOKUP_REQUIRED');
insert into public.service_orders(id,access_token_hash,product,ticket_number,ticket_submission_id) values('20000000-0000-4000-8000-000000000025',repeat('e',64),'rapid_resolution','T12345625Z','10000000-0000-4000-8000-000000000025');
select public.assert_test((select count(*)=1 from public.service_order_lookup_for_case('10000000-0000-4000-8000-000000000025')),'exact normalized ticket binds the order lookup');
select public.expect_error($q$select public.attach_service_order_portal_lookup('20000000-0000-4000-8000-000000000025','10000000-0000-4000-8000-000000000025',repeat('d',64),'{"version":2,"iv":"fixture","value":"encrypted"}',repeat('b',64),'source/25.jpg',repeat('a',64))$q$,'EXACT_ORDER_CASE_REQUIRED');
select public.attach_service_order_portal_lookup('20000000-0000-4000-8000-000000000025','10000000-0000-4000-8000-000000000025',repeat('c',64),'{"version":2,"iv":"fixture","value":"encrypted"}',repeat('b',64),'source/25.jpg',repeat('a',64));
select public.assert_test(public.case_has_portal_lookup('10000000-0000-4000-8000-000000000025'),'the agent can use the client-confirmed identifier');
select public.expect_error($q$select public.record_service_order_portal_lookup('20000000-0000-4000-8000-000000000025',repeat('e',64),'rapid_resolution','T12345625Z','plate','{"version":2,"iv":"fixture","value":"encrypted"}',repeat('d',64))$q$,'LOOKUP_FORM_LOCKED');

select public.record_service_order_portal_lookup('20000000-0000-4000-8000-000000000026',repeat('e',64),'rapid_resolution',null,'date_of_birth','{"version":2,"iv":"fixture","value":"encrypted"}',repeat('c',64));
insert into public.service_orders(id,access_token_hash,product,ticket_submission_id) values('20000000-0000-4000-8000-000000000026',repeat('e',64),'rapid_resolution','10000000-0000-4000-8000-000000000026');
select public.assert_test((select count(*)=0 from public.service_order_lookup_for_case('10000000-0000-4000-8000-000000000026')),'email or name matching cannot transfer an identifier');
select public.record_service_order_portal_lookup('10000000-0000-4000-8000-000000000026',repeat('e',64),'rapid_resolution',null,'date_of_birth','{"version":2,"iv":"fixture","value":"encrypted"}',repeat('c',64));
insert into public.service_orders(id,access_token_hash,product,ticket_submission_id,ticket_document_path) values('10000000-0000-4000-8000-000000000026',repeat('e',64),'rapid_resolution','10000000-0000-4000-8000-000000000026','service-orders/26/source.jpg');
select public.assert_test((select count(*)=1 from public.service_order_lookup_for_case('10000000-0000-4000-8000-000000000026')),'the order original upload supplies an unambiguous binding');
select public.attach_service_order_portal_lookup('10000000-0000-4000-8000-000000000026','10000000-0000-4000-8000-000000000026',repeat('c',64),'{"version":2,"iv":"fixture","value":"encrypted"}',repeat('b',64),'service-orders/26/source.jpg',repeat('a',64));
select public.assert_test(not exists(select 1 from public.portal_agent_jobs where submission_id='10000000-0000-4000-8000-000000000026'),'lookup does not start unpaid service');
select set_config('request.jwt.claim.role','anon',false);
select public.expect_error($q$select public.record_service_order_portal_lookup('20000000-0000-4000-8000-000000000027',repeat('e',64),'rapid_resolution',null,'plate','{"version":2,"iv":"fixture","value":"encrypted"}',repeat('c',64))$q$,'SERVICE_REQUIRED');
select 'Required identifier, prospective checkout, private order and exact-case binding tests passed' as result;
rollback;
