-- Refuse to run outside run.py's guarded disposable local cluster.
select public.assert_chatwoot_queue_test();
begin;
do $test$
declare a jsonb; variant integer; conv bigint; sid text;
begin
  perform public.set_chatwoot_vapi_circuit_enabled(true);
  for variant in 1..3 loop
    conv := 100 + variant;
    sid := 'SM' || repeat(variant::text, 32);
    perform public.enqueue_chatwoot_vapi_job(10,20,conv,conv,sid);
    a := public.claim_chatwoot_vapi_job();
    assert public.mark_chatwoot_vapi_sending((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
      (a->>'generation')::bigint,'old-chat'), 'begin only outbound attempt';
    if variant = 1 then
      perform public.invalidate_chatwoot_vapi_conversation(10,conv,clock_timestamp(),gen_random_uuid());
    elsif variant = 2 then
      perform public.observe_chatwoot_vapi_conversation(10,conv,'open',false,clock_timestamp(),gen_random_uuid());
    else
      perform public.enqueue_chatwoot_vapi_job(10,20,conv,200,'SM44444444444444444444444444444444',gen_random_uuid(),true);
    end if;
    assert not public.current_chatwoot_vapi_job((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
      (a->>'generation')::bigint), 'takeover or control hint fences new sends';
    -- The in-flight HTTP response arrives after the epoch changed. Its known
    -- receipt must settle without waiting for lease expiry or restoring context.
    assert public.finish_chatwoot_vapi_job((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
      (a->>'generation')::bigint,'sent',1000+variant,'old-chat'), 'record receipt after in-flight takeover';
    assert (select state='sent' and outgoing_message_id=1000+variant from public.chatwoot_vapi_jobs
      where id=(a->>'job_id')::uuid), 'known outgoing receipt persisted';
    assert (select lease_job_id is null and previous_chat_id is null from public.chatwoot_vapi_conversations
      where account_id=10 and conversation_id=conv), 'receipt releases lease without reviving stale continuity';
    if variant = 3 then
      a := public.claim_chatwoot_vapi_job();
      assert (a->>'message_id')::integer=200 and (a->>'control_hint')::boolean, 'control claims once prior send receipt settled';
      perform public.finish_chatwoot_vapi_job((a->>'job_id')::uuid,(a->>'lease_token')::uuid,
        (a->>'generation')::bigint,'suppressed');
    end if;
  end loop;
  raise notice 'SEND_RACE_ASSERTIONS_PASSED';
end;
$test$;
rollback;
