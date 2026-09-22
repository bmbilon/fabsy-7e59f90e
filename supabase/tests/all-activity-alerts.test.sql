-- Run after the migration, in a transaction that is always rolled back.
begin;
do $$
declare n integer; object_id uuid:=gen_random_uuid();
begin
  perform public.enqueue_portal_activity('test:payment:first','payment_paid','stripe_checkout',null,
    '{"stripe_checkout_session_id":"cs_test_activity_regression","amount_total_cents":8295}');
  perform public.enqueue_portal_activity('test:payment:fulfillment','payment_paid','checkout_intent',gen_random_uuid(),
    '{"stripe_checkout_session_id":"cs_test_activity_regression","ticket_number":"E12345678T"}');
  select count(*) into n from public.portal_activity_events where payload->>'stripe_checkout_session_id'='cs_test_activity_regression';
  if n<>1 then raise exception 'duplicate payment alert'; end if;
  if not exists(select 1 from public.portal_activity_events where payload->>'stripe_checkout_session_id'='cs_test_activity_regression'
    and payload->>'ticket_number'='E12345678T' and (payload->>'amount_total_cents')::int=8295) then
    raise exception 'payment enrichment lost data'; end if;
  -- Simulate legacy sent alert: replay must not enqueue another notification.
  insert into public.portal_activity_events(event_key,event_type,entity_type,payload,status,provider_email_id,sent_at)
    values('test:legacy','payment_paid','checkout_intent','{"stripe_checkout_session_id":"cs_test_old_activity"}','sent','test-provider',now());
  perform public.enqueue_portal_activity('payment:checkout:cs_test_old_activity','payment_paid','stripe_checkout',null,
    '{"stripe_checkout_session_id":"cs_test_old_activity"}');
  select count(*) into n from public.portal_activity_events where payload->>'stripe_checkout_session_id'='cs_test_old_activity';
  if n<>1 then raise exception 'legacy payment replay duplicated'; end if;
  -- A stored file without any case/draft/contact creates a private operator alert.
  insert into storage.objects(id,bucket_id,name,version,metadata)
    values(object_id,'assessment-tickets','activity-regression/'||object_id||'.pdf',gen_random_uuid()::text,'{"size":5,"mimetype":"application/pdf"}');
  if not exists(select 1 from public.portal_activity_events where event_type='ticket_uploaded'
    and payload->>'file_name'='activity-regression/'||object_id||'.pdf' and entity_id is null) then
    raise exception 'anonymous upload was not queued'; end if;
  if has_function_privilege('anon','public.enqueue_portal_activity(text,text,text,uuid,jsonb)','execute') then
    raise exception 'public queue access'; end if;
  if (select recipient from public.portal_activity_state where id) <> 'hello@fabsy.ca' then raise exception 'wrong recipient'; end if;
end $$;
rollback;
