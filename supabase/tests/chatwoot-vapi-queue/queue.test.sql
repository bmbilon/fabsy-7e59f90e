-- Refuse to run outside run.py's guarded disposable local cluster.
select public.assert_chatwoot_queue_test();
begin;
do $test$
declare
  a jsonb; b jsonb; c jsonb; job_id uuid; token uuid; generation bigint; saved_generation bigint;
  delivery uuid := gen_random_uuid(); result boolean; n integer;
begin
  a := public.enqueue_chatwoot_vapi_job(1, 2, 3, 4, 'SM11111111111111111111111111111111');
  assert (a->>'enqueued')::boolean, 'enqueue';
  b := public.enqueue_chatwoot_vapi_job(1, 2, 3, 4, 'SM11111111111111111111111111111111');
  assert (b->>'duplicate')::boolean and a->>'job_id' = b->>'job_id', 'dedupe';
  assert public.claim_chatwoot_vapi_job() is null, 'circuit starts off';
  begin
    perform public.enqueue_chatwoot_vapi_job(1, 2, 3, 9, 'SM11111111111111111111111111111111');
    raise exception 'conflicting sender should be rejected';
  exception when unique_violation then null;
  end;
  perform public.set_chatwoot_vapi_circuit_enabled(true);
  a := public.claim_chatwoot_vapi_job();
  job_id := (a->>'job_id')::uuid; token := (a->>'lease_token')::uuid; generation := (a->>'generation')::bigint;
  assert a->>'phase' = 'queued', 'initial phase';
  assert a->>'job_id' = a->>'id', 'runtime job_id is present and equals primary id';
  assert public.current_chatwoot_vapi_job(job_id, token, generation), 'current initial job';
  assert public.claim_chatwoot_vapi_job() is null, 'conversation serialization';
  assert public.mark_chatwoot_vapi_sending(job_id, token, generation, 'chat_one'), 'mark sending';
  assert not public.mark_chatwoot_vapi_sending(job_id, token, generation, 'chat_one'), 'only one transition to sending';
  assert not public.retry_chatwoot_vapi_job(job_id, token, generation), 'never retry a send';
  b := public.invalidate_chatwoot_vapi_conversation(1, 3, clock_timestamp(), delivery);
  assert (b->>'held')::boolean, 'human hold';
  assert not public.current_chatwoot_vapi_job(job_id, token, generation), 'takeover fences old worker';
  c := public.invalidate_chatwoot_vapi_conversation(1, 3, clock_timestamp(), delivery);
  assert c->>'generation' = b->>'generation' and (c->>'duplicate')::boolean, 'invalidation replay dedupe';
  assert (select cv.lease_job_id=job_id from public.chatwoot_vapi_conversations cv where account_id=1 and conversation_id=3), 'takeover preserves sending receipt lease';
  perform public.set_chatwoot_vapi_circuit_enabled(false);
  update public.chatwoot_vapi_jobs set lease_until = clock_timestamp() - interval '1 second' where id = job_id;
  update public.chatwoot_vapi_conversations set lease_until = clock_timestamp() - interval '1 second' where lease_job_id = job_id;
  a := public.claim_chatwoot_vapi_job();
  assert a->>'phase' = 'sending' and (a->>'human_hold')::boolean, 'reconcile while off and held';
  perform public.invalidate_chatwoot_vapi_conversation(1,3,clock_timestamp(),gen_random_uuid());
  assert public.finish_chatwoot_vapi_job((a->>'job_id')::uuid,(a->>'lease_token')::uuid,(a->>'generation')::bigint,'sent',100,'chat_one'), 'reconciliation handoff preserves lease to finish old generation';
  assert (select previous_chat_id is null from public.chatwoot_vapi_conversations where account_id=1 and conversation_id=3), 'no stale continuity after takeover';
  b := public.observe_chatwoot_vapi_conversation(1, 3, 'pending', false, clock_timestamp() - interval '1 day', gen_random_uuid());
  assert (b->>'held')::boolean, 'old pending cannot resume';
  b := public.observe_chatwoot_vapi_conversation(1, 3, 'pending', false, clock_timestamp(), gen_random_uuid());
  assert not (b->>'held')::boolean, 'new explicit pending resumes';

  perform public.set_chatwoot_vapi_circuit_enabled(true);
  perform public.enqueue_chatwoot_vapi_job(1, 2, 3, 5, 'SM22222222222222222222222222222222');
  a := public.claim_chatwoot_vapi_job();
  job_id := (a->>'job_id')::uuid; token := (a->>'lease_token')::uuid; generation := (a->>'generation')::bigint;
  b := public.enqueue_chatwoot_vapi_job(1, 2, 3, 6, 'SM33333333333333333333333333333333', gen_random_uuid(), true);
  assert not public.current_chatwoot_vapi_job(job_id, token, generation), 'control hint fences';
  saved_generation := (select cv.generation from public.chatwoot_vapi_conversations cv where account_id=1 and conversation_id=3);
  perform public.enqueue_chatwoot_vapi_job(1, 2, 3, 6, 'SM33333333333333333333333333333333', gen_random_uuid(), true);
  assert (select cv.generation=saved_generation and not cv.human_hold from public.chatwoot_vapi_conversations cv where account_id=1 and conversation_id=3), 'control duplicate neither refences nor holds';
  a := public.claim_chatwoot_vapi_job();
  assert (a->>'control_hint')::boolean, 'control can claim immediately';
  job_id := (a->>'job_id')::uuid; token := (a->>'lease_token')::uuid; generation := (a->>'generation')::bigint;
  assert public.mark_chatwoot_vapi_sending(job_id, token, generation), 'control response sending';
  assert public.finish_chatwoot_vapi_job(job_id, token, generation, 'uncertain'), 'mark uncertain releases lease';
  update public.chatwoot_vapi_jobs set available_at = clock_timestamp() - interval '1 second' where id=job_id;
  perform public.set_chatwoot_vapi_circuit_enabled(false);
  a := public.claim_chatwoot_vapi_job();
  assert a->>'phase' = 'uncertain', 'uncertain reconcile while off';
  assert not public.retry_chatwoot_vapi_job(job_id,(a->>'lease_token')::uuid,generation), 'uncertain never queues';
  assert public.finish_chatwoot_vapi_job(job_id,(a->>'lease_token')::uuid,generation,'send_uncertain'), 'terminal ambiguous state';
  assert public.claim_chatwoot_vapi_job() is null, 'terminal ambiguous never auto retries';

  perform public.set_chatwoot_vapi_circuit_enabled(true);
  perform public.enqueue_chatwoot_vapi_job(1, 2, 3, 7, 'SM44444444444444444444444444444444');
  for n in 1..3 loop
    a := public.claim_chatwoot_vapi_job();
    job_id := (a->>'job_id')::uuid;
    assert (a->>'attempt_count')::integer = n, 'attempt count';
    assert public.retry_chatwoot_vapi_job(job_id,(a->>'lease_token')::uuid,(a->>'generation')::bigint), 'retry before send';
    update public.chatwoot_vapi_jobs set available_at = clock_timestamp() - interval '1 second' where id=job_id;
  end loop;
  assert (select state='failed' from public.chatwoot_vapi_jobs where id=job_id), 'retry max3';
  assert public.claim_chatwoot_vapi_job() is null, 'no further pre-send retry';
  assert not has_function_privilege('anon','public.claim_chatwoot_vapi_job()','execute'), 'anon cannot claim';
  assert not has_function_privilege('authenticated','public.enqueue_chatwoot_vapi_job(bigint,bigint,bigint,bigint,text,uuid,boolean)','execute'), 'users cannot enqueue';
  assert has_function_privilege('service_role','public.claim_chatwoot_vapi_job()','execute'), 'service can claim';
  perform public.enqueue_chatwoot_vapi_job(1, 2, 10, 11, 'SM55555555555555555555555555555555', gen_random_uuid(), true);
  a := public.claim_chatwoot_vapi_job();
  assert (a->>'control_hint')::boolean, 'claim held control before takeover';
  perform public.invalidate_chatwoot_vapi_conversation(1,10,clock_timestamp(),gen_random_uuid());
  b := public.claim_chatwoot_vapi_job();
  assert b->>'job_id'=a->>'job_id' and (b->>'generation')::bigint > (a->>'generation')::bigint
    and (b->>'human_hold')::boolean, 'processing control survives human hold with new fence';
  assert not public.current_chatwoot_vapi_job((b->>'job_id')::uuid,(b->>'lease_token')::uuid,(b->>'generation')::bigint), 'held control cannot send acknowledgement';
  perform public.finish_chatwoot_vapi_job((b->>'job_id')::uuid,(b->>'lease_token')::uuid,(b->>'generation')::bigint,'suppressed');
  perform public.enqueue_chatwoot_vapi_job(1, 2, 10, 12, 'SM66666666666666666666666666666666', gen_random_uuid(), true);
  perform public.observe_chatwoot_vapi_conversation(1,10,'open',false,clock_timestamp(),gen_random_uuid());
  b := public.claim_chatwoot_vapi_job();
  assert (b->>'message_id')::integer=12 and (b->>'human_hold')::boolean, 'queued control survives explicit open';
  perform public.finish_chatwoot_vapi_job((b->>'job_id')::uuid,(b->>'lease_token')::uuid,(b->>'generation')::bigint,'suppressed');
  assert public.wake_chatwoot_vapi_worker() is null, 'recovery disabled';
  begin
    perform public.configure_chatwoot_vapi_recovery(true);
    raise exception 'recovery missing dependencies must fail';
  exception when object_not_in_prerequisite_state then null;
  end;
  raise notice 'QUEUE_ASSERTIONS_PASSED';
end;
$test$;
rollback;
