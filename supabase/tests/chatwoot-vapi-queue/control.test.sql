-- Refuse to run outside run.py's guarded disposable local cluster.
select public.assert_chatwoot_queue_test();
begin;
do $test$
declare a jsonb; b jsonb; original_job jsonb; result jsonb; provider_at timestamptz := clock_timestamp() - interval '1 minute';
  sender text := repeat('a',64); assistant uuid := '82b869f5-d7bd-4cdd-8230-68f27fb0bf18';
begin
  perform public.set_chatwoot_vapi_circuit_enabled(true);
  perform public.enqueue_chatwoot_vapi_job(5,6,7,8,'SM11111111111111111111111111111111',gen_random_uuid(),true);
  original_job := public.claim_chatwoot_vapi_job();
  perform public.enqueue_chatwoot_vapi_job(5,6,7,9,'SM22222222222222222222222222222222',gen_random_uuid(),true);
  result := public.claim_chatwoot_vapi_control((original_job->>'job_id')::uuid,(original_job->>'lease_token')::uuid,
    (original_job->>'generation')::bigint,provider_at,sender,null,4,0,assistant,true);
  assert (result->>'stale_control')::boolean, 'old processing control cannot mutate after newer hint fence';
  a := public.claim_chatwoot_vapi_job();
  assert (a->>'message_id')::integer=8, 'earlier hinted STOP preserved FIFO after later hint';
  result := public.claim_chatwoot_vapi_control((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
    (a->>'generation')::bigint,provider_at,sender,null,4,0,assistant,true);
  assert (result->>'opted_out')::boolean, 'atomic wrapper applies actual legacy STOP';
  perform public.finish_chatwoot_vapi_job((a->>'job_id')::uuid,(a->>'lease_token')::uuid,(a->>'generation')::bigint,'suppressed');
  b := public.claim_chatwoot_vapi_job();
  assert (b->>'message_id')::integer=9, 'later potentially forged hint remains next';
  -- Its authoritative provider body is not a control, so the worker never invokes
  -- the wrapper. Merely enqueueing/processing its hint cannot remove true STOP.
  perform public.finish_chatwoot_vapi_job((b->>'job_id')::uuid,(b->>'lease_token')::uuid,(b->>'generation')::bigint,'suppressed');
  assert (select opted_out_at is not null from public.whatsapp_vapi_conversations where sender_hash=sender), 'forged hint cannot remove STOP';
  perform public.enqueue_chatwoot_vapi_job(5,6,7,10,'SM33333333333333333333333333333333',gen_random_uuid(),true);
  a := public.claim_chatwoot_vapi_job();
  result := public.claim_chatwoot_vapi_control((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
    (a->>'generation')::bigint,provider_at + interval '5 seconds',sender,null,5,0,assistant,false);
  assert not (result->>'opted_out')::boolean, 'newer actual START clears opt-out';
  perform public.finish_chatwoot_vapi_job((a->>'job_id')::uuid,(a->>'lease_token')::uuid,(a->>'generation')::bigint,'suppressed');
  perform public.enqueue_chatwoot_vapi_job(5,6,7,11,'SM44444444444444444444444444444444',gen_random_uuid(),true);
  a := public.claim_chatwoot_vapi_job();
  result := public.claim_chatwoot_vapi_control((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
    (a->>'generation')::bigint,provider_at,sender,null,4,0,assistant,true);
  assert (result->>'stale_control')::boolean, 'late older verified STOP rejected';
  assert (select opted_out_at is null from public.whatsapp_vapi_conversations where sender_hash=sender), 'late older STOP cannot undo START';
  assert not exists(select 1 from public.whatsapp_vapi_messages where message_sid='SM44444444444444444444444444444444'), 'stale rejected before legacy mutation';
  raise notice 'CONTROL_ASSERTIONS_PASSED';
end;
$test$;

do $cross_conversation$
declare a jsonb; result jsonb; provider_at timestamptz := clock_timestamp() - interval '2 minutes';
  old_hash text := repeat('b',64); new_hash text := repeat('c',64);
  assistant uuid := '82b869f5-d7bd-4cdd-8230-68f27fb0bf18';
begin
  perform public.enqueue_chatwoot_vapi_job(5,6,51,51,'SM55555555555555555555555555555555',gen_random_uuid(),true);
  a := public.claim_chatwoot_vapi_job();
  result := public.claim_chatwoot_vapi_control((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
    (a->>'generation')::bigint,provider_at + interval '10 seconds',old_hash,null,4,0,assistant,true);
  assert (result->>'opted_out')::boolean, 'newer STOP applied in conversation B';
  perform public.finish_chatwoot_vapi_job((a->>'job_id')::uuid,(a->>'lease_token')::uuid,(a->>'generation')::bigint,'suppressed');
  perform public.enqueue_chatwoot_vapi_job(5,6,50,50,'SM66666666666666666666666666666666',gen_random_uuid(),true);
  a := public.claim_chatwoot_vapi_job();
  result := public.claim_chatwoot_vapi_control((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
    (a->>'generation')::bigint,provider_at,old_hash,null,5,0,assistant,false);
  assert (result->>'stale_control')::boolean, 'older START from conversation A rejected sender-wide';
  assert (select opted_out_at is not null from public.whatsapp_vapi_conversations where sender_hash=old_hash), 'cross-conversation stale START cannot clear STOP';
  perform public.finish_chatwoot_vapi_job((a->>'job_id')::uuid,(a->>'lease_token')::uuid,(a->>'generation')::bigint,'suppressed');
  perform public.enqueue_chatwoot_vapi_job(5,6,52,52,'SM77777777777777777777777777777777',gen_random_uuid(),true);
  a := public.claim_chatwoot_vapi_job();
  result := public.claim_chatwoot_vapi_control((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
    (a->>'generation')::bigint,provider_at + interval '1 second',new_hash,old_hash,5,0,assistant,false);
  assert (result->>'stale_control')::boolean, 'hash rotation cannot bypass provider order';
  assert (select last_verified_control_at=provider_at + interval '10 seconds' from public.chatwoot_vapi_control_clocks where sender_hash=new_hash), 'new hash inherits latest clock even when request rejected';
  assert not exists(select 1 from public.chatwoot_vapi_control_clocks where sender_hash=old_hash), 'old hash clock merged';
  perform public.finish_chatwoot_vapi_job((a->>'job_id')::uuid,(a->>'lease_token')::uuid,(a->>'generation')::bigint,'suppressed');
  perform public.enqueue_chatwoot_vapi_job(5,6,53,53,'SM88888888888888888888888888888888',gen_random_uuid(),true);
  a := public.claim_chatwoot_vapi_job();
  result := public.claim_chatwoot_vapi_control((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
    (a->>'generation')::bigint,provider_at + interval '20 seconds',new_hash,old_hash,5,0,assistant,false);
  assert not (result->>'opted_out')::boolean, 'newer verified START and legacy hash rotation atomic';
  assert (select opted_out_at is null from public.whatsapp_vapi_conversations where sender_hash=new_hash), 'legacy optout moves to new hash';
  assert not exists(select 1 from public.whatsapp_vapi_conversations where sender_hash=old_hash), 'legacy old hash removed by actual claim';
  perform public.finish_chatwoot_vapi_job((a->>'job_id')::uuid,(a->>'lease_token')::uuid,(a->>'generation')::bigint,'suppressed');
  perform public.enqueue_chatwoot_vapi_job(5,6,54,54,'SM99999999999999999999999999999999',gen_random_uuid(),true);
  a := public.claim_chatwoot_vapi_job();
  result := public.claim_chatwoot_vapi_control((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
    (a->>'generation')::bigint,provider_at + interval '15 seconds',new_hash,null,4,0,assistant,true);
  assert (result->>'stale_control')::boolean, 'new hash alone retains merged ordering fence';
  assert (select opted_out_at is null from public.whatsapp_vapi_conversations where sender_hash=new_hash), 'late STOP after rotation cannot override START';
  assert (select relrowsecurity from pg_class where oid='public.chatwoot_vapi_control_clocks'::regclass), 'sender clocks have RLS';
  assert not has_table_privilege('authenticated','public.chatwoot_vapi_control_clocks','select'), 'browser cannot read sender clocks';
  raise notice 'CROSS_CONVERSATION_CONTROL_ASSERTIONS_PASSED';
end;
$cross_conversation$;
rollback;
