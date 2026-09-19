\set ON_ERROR_STOP on
begin;
create function pg_temp.inbound(n integer, sender text, body text, control boolean default null, help boolean default false,
  previous_sender text default null, destination text default '+14035550102') returns jsonb language sql as $$
  select public.claim_sms_intake_inbound('SM'||lpad(to_hex(n),32,'0'),sender,length(body),0,
    '00000000-0000-4000-8000-000000000010',control,'+14035550101',destination,body,previous_sender,100,help);
$$;
create function pg_temp.complete(n integer,sender text,state text default 'fallback',reply text default 'Reply')
returns jsonb language sql as $$
  select public.complete_sms_intake_inbound('SM'||lpad(to_hex(n),32,'0'),sender,state,
    case when state='replied' then 'chat-test' else null end,length(reply),null,false,reply);
$$;
do $$ begin
  if exists(select 1 from public.sms_intake_inquiries) or exists(select 1 from public.sms_intake_email_notifications) then
    raise exception 'historical metadata was backfilled'; end if;
  if has_table_privilege('anon','public.sms_intake_messages','select')
    or has_table_privilege('authenticated','public.sms_intake_messages','select')
    or has_table_privilege('authenticated','public.sms_intake_email_notifications','select')
    or has_table_privilege('authenticated','public.sms_intake_inquiries','select') then
    raise exception 'raw SMS tables exposed'; end if;
  if has_function_privilege('anon','public.admin_sms_intake_inbox()','execute')
    or has_function_privilege('anon','public.sms_intake_readiness()','execute')
    or has_function_privilege('authenticated','public.sms_intake_readiness()','execute')
    or has_function_privilege('authenticated','public.claim_sms_intake_email_notifications(integer)','execute')
    or has_function_privilege('authenticated','public.claim_sms_intake_inbound(text,text,integer,integer,uuid,boolean,text,text,text,text,integer,boolean)','execute')
    or has_function_privilege('authenticated','public.complete_sms_intake_inbound(text,text,text,text,integer,boolean,boolean,text)','execute') then
    raise exception 'SMS RPC privileges too broad'; end if;
  if public.sms_intake_readiness() <> '{"version":1,"contracts_ready":true,"circuit_enabled":false}'::jsonb then
    raise exception 'read-only readiness contract incorrect'; end if;
  if exists(select 1 from public.sms_intake_inquiries) or exists(select 1 from public.sms_intake_email_notifications) then
    raise exception 'readiness created operational records'; end if;
  begin perform public.admin_sms_intake_inbox(); raise exception 'anonymous inbox allowed';
    exception when insufficient_privilege then null; end;
  begin perform pg_temp.inbound(1,repeat('a',64),repeat('x',4001)); raise exception 'oversized content accepted';
    exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.sms_vapi_conversations where sender_hash=repeat('a',64)) then
    raise exception 'invalid wrapper mutated base metadata'; end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
do $$ begin
  begin perform public.admin_sms_intake_inbox(); raise exception 'customer inbox allowed';
    exception when insufficient_privilege then null; end;
  begin perform 1 from public.sms_intake_messages; raise exception 'customer direct read allowed';
    exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ declare a jsonb; duplicate jsonb; begin
  a := pg_temp.inbound(1,repeat('a',64),'First question');
  duplicate := pg_temp.inbound(1,repeat('a',64),'Changed replay');
  if a->>'inquiry_id' is null or (a->>'duplicate')::boolean or not (duplicate->>'duplicate')::boolean then
    raise exception 'claim/duplicate contract invalid'; end if;
  if (select count(*) from public.sms_intake_messages)<>1
    or (select count(*) from public.sms_intake_email_notifications)<>1
    or (select body from public.sms_intake_messages)<>'First question' then
    raise exception 'duplicate altered capture'; end if;
  perform pg_temp.complete(1,repeat('a',64),'replied','First reply');
  perform pg_temp.complete(1,repeat('a',64),'replied','Mutated replay');
  if (select reply_text from public.sms_intake_messages)<>'First reply' then raise exception 'reply replay mutated content'; end if;
  perform pg_temp.inbound(2,repeat('a',64),'Follow-up');
  perform pg_temp.complete(2,repeat('a',64));
  perform pg_temp.inbound(3,repeat('b',64),'Rotated sender',null,false,repeat('a',64));
  perform pg_temp.complete(3,repeat('b',64));
  if (select count(*) from public.sms_intake_inquiries)<>1
    or (select count(*) from public.sms_intake_email_notifications)<>1
    or (select count(*) from public.sms_intake_messages)<>3
    or (select sender_hash from public.sms_intake_inquiries)<>repeat('b',64)
    or (select snapshot->>'body' from public.sms_intake_email_notifications)<>'First question' then
    raise exception 'follow-up grouping, snapshot or HMAC rotation failed'; end if;
end $$;

-- STOP interrupts an in-flight reply, and controls/opted-out traffic create no
-- new raw message or notification. HELP also stays metadata-only.
do $$ declare result jsonb; begin
  perform pg_temp.inbound(4,repeat('b',64),'Before STOP');
  perform pg_temp.inbound(5,repeat('b',64),'STOP',true);
  result := pg_temp.complete(4,repeat('b',64),'replied','Must be suppressed');
  if (result->>'reply_allowed')::boolean then raise exception 'reply allowed after STOP'; end if;
  if exists(select 1 from public.sms_intake_messages where message_sid='SM'||lpad(to_hex(4),32,'0') and reply_text is not null) then
    raise exception 'suppressed reply stored'; end if;
  perform pg_temp.inbound(6,repeat('b',64),'After STOP');
  perform pg_temp.inbound(7,repeat('b',64),'START',false);
  perform pg_temp.inbound(8,repeat('b',64),'HELP',null,true);
  if (select count(*) from public.sms_intake_messages)<>4 or (select count(*) from public.sms_intake_email_notifications)<>1 then
    raise exception 'control or opt-out traffic captured'; end if;
  update public.sms_intake_inquiries set last_message_at=clock_timestamp()-interval '25 hours';
  perform pg_temp.inbound(9,repeat('b',64),'New inquiry');
  if (select count(*) from public.sms_intake_inquiries)<>2 or (select count(*) from public.sms_intake_email_notifications)<>2 then
    raise exception '24-hour inactivity did not open new inquiry'; end if;
  perform pg_temp.inbound(10,repeat('b',64),'Other destination',null,false,null,'+14035550103');
  if (select count(*) from public.sms_intake_inquiries)<>3 then raise exception 'destinations merged'; end if;
end $$;

-- Email leases freeze bytes, tolerate worker loss inside the provider window,
-- reject stale claims, and stop retrying before idempotency expires.
create temporary table claims as select * from public.claim_sms_intake_email_notifications(10);
do $$ declare a public.sms_intake_email_notifications%rowtype; frozen jsonb; payload jsonb :=
  '{"from":"Fabsy SMS <hello@fabsy.ca>","to":["hello@fabsy.ca"],"bcc":["brett@execom.ca"],"subject":"First","html":"<p>First</p>"}';
begin
  if (select count(*) from claims)<>3 or exists(select 1 from public.claim_sms_intake_email_notifications(10)) then
    raise exception 'claim lease or batch count wrong'; end if;
  select * into a from claims order by created_at limit 1;
  begin perform public.freeze_sms_intake_email_notification(a.id,a.claim_id,jsonb_set(payload,'{to}','["unapproved@example.com"]'));
    raise exception 'unapproved recipient frozen'; exception when invalid_parameter_value then null; end;
  frozen := public.freeze_sms_intake_email_notification(a.id,a.claim_id,payload);
  if public.freeze_sms_intake_email_notification(a.id,a.claim_id,jsonb_set(payload,'{subject}','"Changed"'))<>frozen then
    raise exception 'frozen payload changed'; end if;
  if public.finish_sms_intake_email_notification(a.id,gen_random_uuid(),'sent','provider-id') then raise exception 'wrong claim finalized'; end if;
  if not public.finish_sms_intake_email_notification(a.id,a.claim_id,'retry',null,'provider_network_error') then raise exception 'retry not persisted'; end if;
  update public.sms_intake_email_notifications set next_attempt_at=clock_timestamp()-interval '1 second' where id=a.id;
end $$;
create temporary table retries as select * from public.claim_sms_intake_email_notifications(10);
do $$ declare a public.sms_intake_email_notifications%rowtype; old_claim uuid; begin
  if (select count(*) from retries)<>1 then raise exception 'retry missing'; end if;
  select * into a from retries;
  select claim_id into old_claim from claims where id=a.id;
  if a.claim_id=old_claim or a.attempt_count<>2 or a.email_payload->>'subject'<>'First' then
    raise exception 'retry changed identity, payload or attempt count'; end if;
  if public.finish_sms_intake_email_notification(a.id,old_claim,'sent','old-provider') then raise exception 'stale worker finalized new lease'; end if;
  update public.sms_intake_email_notifications set claim_expires_at=clock_timestamp()-interval '1 second' where id=a.id;
end $$;
create temporary table recovered as select * from public.claim_sms_intake_email_notifications(10);
do $$ declare a public.sms_intake_email_notifications%rowtype; begin
  if (select count(*) from recovered)<>1 then raise exception 'worker-loss lease not recovered'; end if;
  select * into a from recovered;
  if a.attempt_count<>3 or a.email_payload->>'subject'<>'First' then raise exception 'recovery payload changed'; end if;
  update public.sms_intake_email_notifications set first_attempt_at=clock_timestamp()-interval '24 hours',
    claim_expires_at=clock_timestamp()-interval '1 second' where id=a.id;
  if exists(select 1 from public.claim_sms_intake_email_notifications(10)) then raise exception 'expired idempotency retried'; end if;
  if (select status from public.sms_intake_email_notifications where id=a.id)<>'indeterminate' then raise exception 'uncertain send not held'; end if;
end $$;
do $$ declare a public.sms_intake_email_notifications%rowtype; n integer := 0; begin
  for a in select * from claims where id not in(select id from recovered) order by created_at loop
    n := n+1;
    if not public.finish_sms_intake_email_notification(a.id,a.claim_id,
      case when n=1 then 'sent' else 'failed' end,
      case when n=1 then 'provider-success' else null end,
      case when n=1 then null else 'provider_http_422' end) then raise exception 'terminal outcome not saved'; end if;
  end loop;
  if exists(select 1 from public.claim_sms_intake_email_notifications(10)) then raise exception 'terminal notification reclaimed'; end if;
end $$;

-- Staff sees message text, reply text and the monotonic provider delivery result.
select public.record_sms_vapi_status('SM'||lpad(to_hex(1),32,'0'),'SM'||repeat('f',32),'delivered',null);
select public.record_sms_vapi_status('SM'||lpad(to_hex(1),32,'0'),'SM'||repeat('f',32),'sent',null);
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
do $$ declare inbox jsonb; begin
  inbox:=public.admin_sms_intake_inbox();
  if jsonb_array_length(inbox->'inquiries')<>3 or not exists(
    select 1 from jsonb_array_elements(inbox->'inquiries') i,
      jsonb_array_elements(i->'messages') m where m->>'body'='First question'
      and m->>'reply_text'='First reply' and m->>'delivery_status'='delivered') then
    raise exception 'staff inbox incomplete'; end if;
  if inbox::text like '%sender_hash%' or inbox::text like '%email_payload%' then raise exception 'unnecessary private metadata in inbox'; end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$ begin perform public.admin_sms_intake_inbox(); end $$;
reset role;

-- Raw content expires independently from an active inquiry and before the daily
-- purge runs; transport metadata/STOP state remain for their separate policy.
update public.sms_intake_messages set retained_until=clock_timestamp()-interval '1 second'
  where message_sid='SM'||lpad(to_hex(1),32,'0');
update public.sms_intake_email_notifications set retained_until=clock_timestamp()-interval '1 second'
  where snapshot->>'body'='First question';
do $$ declare inbox jsonb; begin
  inbox:=public.admin_sms_intake_inbox();
  if exists(select 1 from jsonb_array_elements(inbox->'inquiries') i,
    jsonb_array_elements(i->'messages') m where m->>'body'='First question') then raise exception 'expired raw content visible'; end if;
  perform public.purge_sms_intake_content();
  if exists(select 1 from public.sms_intake_messages where body='First question')
    or exists(select 1 from public.sms_intake_email_notifications where snapshot->>'body'='First question')
    or not exists(select 1 from public.sms_vapi_messages where message_sid='SM'||lpad(to_hex(1),32,'0')) then
    raise exception 'content retention incorrectly removed or retained data'; end if;
  perform pg_temp.inbound(11,repeat('b',64),'STOP',true);
  update public.sms_intake_inquiries set expires_at=clock_timestamp()-interval '1 second';
  perform public.purge_sms_intake_content();
  if exists(select 1 from public.sms_intake_messages) or exists(select 1 from public.sms_intake_email_notifications)
    or exists(select 1 from public.sms_intake_inquiries)
    or not exists(select 1 from public.sms_vapi_conversations where sender_hash=repeat('b',64) and opted_out_at is not null) then
    raise exception 'inquiry deletion or opt-out retention failed'; end if;
end $$;

-- Bound both dimensions of staff responses, while flagging truncated messages.
do $$ declare n integer; inbox jsonb; i jsonb; begin
  for n in 100..151 loop perform pg_temp.inbound(n,repeat('c',64),'Message '||n); end loop;
  inbox:=public.admin_sms_intake_inbox(); i:=inbox->'inquiries'->0;
  if (i->>'message_count')::int<>52 or not(i->>'messages_truncated')::boolean
    or jsonb_array_length(i->'messages')<>50 or i->'messages'->0->>'body'<>'Message 102' then
    raise exception 'message bound or ordering wrong'; end if;
  for n in 200..251 loop perform pg_temp.inbound(n,lpad(to_hex(n),64,'0'),'Inquiry '||n); end loop;
  if jsonb_array_length(public.admin_sms_intake_inbox()->'inquiries')<>50 then raise exception 'inquiry bound wrong'; end if;
  if not exists(select 1 from cron.job where jobname='fabsy-sms-intake-content-purge') then raise exception 'content purge schedule missing'; end if;
  raise notice 'SMS inquiry contracts, controls, permissions, retries, retention and staff bounds passed';
end $$;
rollback;
