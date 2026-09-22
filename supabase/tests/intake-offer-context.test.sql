-- Runs after the real photo-intake migrations in the disposable plea test DB.
do $$
declare
  ticket_id uuid := gen_random_uuid();
  camera_id uuid := gen_random_uuid();
  invalid_id uuid := gen_random_uuid();
  consent jsonb;
  statement text;
begin
  consent := jsonb_build_object('accepted',true,'method','checkbox','version','photo-upload-consent-v3',
    'acceptedAt','2026-09-22T12:00:00Z','pleadNotGuilty',false,
    'ticketSubmissionId',ticket_id::text,'ticketDocumentPath',ticket_id::text||'/ticket.pdf');
  perform public.prepare_photo_ticket_with_contact(ticket_id,repeat('a',64),consent,ticket_id::text||'/ticket.pdf',
    'Person@Example.test','officer_issued',true,'rapid-resolution');
  perform pg_temp.check_true((select email='person@example.test' and intake_ticket_type='officer_issued'
    and intake_bundle_requested and landing_page_variant='rapid-resolution' and consent_form_path is null
    and intake_consent->'pleadNotGuilty'='false'::jsonb from public.ticket_submissions where id=ticket_id),
    'contact and chosen offer saved before upload, without changing plea');
  perform pg_temp.check_true((select email='person@example.test' from public.clients where id=ticket_id),'client contact saved atomically');
  perform public.prepare_photo_ticket_with_contact(ticket_id,repeat('a',64),consent,ticket_id::text||'/ticket.pdf',
    'person@example.test','officer_issued',true,'rapid-resolution');
  foreach statement in array array[
    format('select public.prepare_photo_ticket_with_contact(%L,%L,%L::jsonb,%L,%L,%L,true,%L)',ticket_id,repeat('a',64),consent,ticket_id||'/ticket.pdf','changed@example.test','officer_issued','rapid-resolution'),
    format('select public.prepare_photo_ticket_with_contact(%L,%L,%L::jsonb,%L,%L,%L,false,%L)',ticket_id,repeat('a',64),consent,ticket_id||'/ticket.pdf','person@example.test','officer_issued','rapid-resolution'),
    format('select public.prepare_photo_ticket_with_contact(%L,%L,%L::jsonb,%L,%L,%L,false,%L)',ticket_id,repeat('a',64),consent,ticket_id||'/ticket.pdf','person@example.test','photo_radar','rapid-resolution')
  ] loop
    perform pg_temp.expect_error(statement,case when position('photo_radar' in statement)>0 then 'INTAKE_TICKET_TYPE_CHANGED' else 'INTAKE_CONTEXT_CHANGED' end);
  end loop;
  perform pg_temp.check_true((select email='person@example.test' and intake_bundle_requested from public.ticket_submissions where id=ticket_id),'changed retries cannot alter saved data');
  consent := consent || jsonb_build_object('ticketSubmissionId',camera_id::text,'ticketDocumentPath',camera_id::text||'/ticket.pdf');
  perform public.prepare_photo_ticket_with_contact(camera_id,repeat('b',64),consent,camera_id||'/ticket.pdf',
    'camera@example.test','photo_radar',false,'photo-radar');
  perform pg_temp.check_true((select intake_ticket_type='photo_radar' and ticket_type='photo_radar'
    and ticket_type_source='manual' and intake_review_status='pending_scan' and not intake_bundle_requested from public.ticket_submissions where id=camera_id),
    'selected service stays pending scan before checkout');
  consent := consent || jsonb_build_object('ticketSubmissionId',invalid_id::text,'ticketDocumentPath',invalid_id::text||'/ticket.pdf');
  perform pg_temp.expect_error(format('select public.prepare_photo_ticket_with_contact(%L,%L,%L::jsonb,%L,%L,%L,true,%L)',
    invalid_id,repeat('c',64),consent,invalid_id||'/ticket.pdf','bad-email','officer_issued','rapid-resolution'),'INTAKE_CONTEXT_INVALID');
  perform pg_temp.expect_error(format('select public.prepare_photo_ticket_with_contact(%L,%L,%L::jsonb,%L,%L,%L,true,%L)',
    invalid_id,repeat('c',64),consent,invalid_id||'/ticket.pdf','valid@example.test','photo_radar','photo-radar'),'INTAKE_CONTEXT_INVALID');
  perform pg_temp.check_true(not exists(select 1 from public.ticket_submissions where id=invalid_id)
    and not exists(select 1 from public.clients where id=invalid_id),'rejected contact creates no orphan records');
end; $$;
select pg_temp.check_true(not has_function_privilege('anon','public.prepare_photo_ticket_with_contact(uuid,text,jsonb,text,text,text,boolean,text,uuid)','execute'),'anonymous offer context writes denied');
select pg_temp.check_true(not has_function_privilege('authenticated','public.prepare_photo_ticket_with_contact(uuid,text,jsonb,text,text,text,boolean,text,uuid)','execute'),'customer offer context writes denied');
select pg_temp.check_true(has_function_privilege('service_role','public.prepare_photo_ticket_with_contact(uuid,text,jsonb,text,text,text,boolean,text,uuid)','execute'),'validated service can create with contact');

-- The challenger is accepted as a bounded entry label; it cannot change on retry.
do $$ declare alternate_id uuid:=gen_random_uuid(); consent jsonb; begin
  consent:=jsonb_build_object('accepted',true,'method','checkbox','version','photo-upload-consent-v3',
    'acceptedAt','2026-09-22T12:00:00Z','pleadNotGuilty',false,'ticketSubmissionId',alternate_id::text,'ticketDocumentPath',alternate_id||'/ticket.pdf');
  perform public.prepare_photo_ticket_with_contact(alternate_id,repeat('d',64),consent,alternate_id||'/ticket.pdf','alternate@example.test','officer_issued',false,'rapid-resolution-alt');
  perform pg_temp.check_true((select landing_page_variant='rapid-resolution-alt' from public.ticket_submissions where ticket_submissions.id=alternate_id),'alternate persists');
  perform pg_temp.expect_error(format('select public.prepare_photo_ticket_with_contact(%L,%L,%L::jsonb,%L,%L,%L,false,%L)',alternate_id,repeat('d',64),consent,alternate_id||'/ticket.pdf','alternate@example.test','officer_issued','rapid-resolution'),'INTAKE_CONTEXT_CHANGED');
end; $$;
