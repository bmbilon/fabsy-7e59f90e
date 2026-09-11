-- Refuse to run outside run.py's guarded disposable local cluster.
select public.assert_chatwoot_queue_test();
do $test$
begin
 assert (select not circuit_enabled and not recovery_enabled from public.chatwoot_vapi_runtime),'runtime initially off';
 assert (select not active from cron.job where jobname='fabsy-chatwoot-vapi-recovery'),'schedule inactive';
 assert not exists(select 1 from net.test_calls),'no HTTP at migration';
 assert public.wake_chatwoot_vapi_worker() is null,'disabled wake silent';
 begin
  perform public.configure_chatwoot_vapi_recovery(true);
  raise exception 'missing secrets must fail closed';
 exception when object_not_in_prerequisite_state then null;
 end;
 insert into vault.decrypted_secrets values('chatwoot_vapi_worker_url','https://example.supabase.co/functions/v1/chatwoot-vapi-worker'),('chatwoot_vapi_worker_token',repeat('x',32));
 assert public.configure_chatwoot_vapi_recovery(true),'activate with named Vault secrets';
 assert (select active from cron.job where jobname='fabsy-chatwoot-vapi-recovery'),'active only after explicit config';
 assert not exists(select 1 from net.test_calls),'configuration itself sends nothing';
 assert public.wake_chatwoot_vapi_worker() is not null,'runtime resolves secret and posts';
 assert (select count(*)=1 from net.test_calls),'exact one stub call';
 assert public.configure_chatwoot_vapi_recovery(false),'deactivate';
 assert public.wake_chatwoot_vapi_worker() is null,'deactivated wake silent';
 assert (select not active from cron.job where jobname='fabsy-chatwoot-vapi-recovery'),'schedule deactivated';
 assert (select position(repeat('x',32) in command)=0 from cron.job where jobname='fabsy-chatwoot-vapi-recovery'),'no token in cron command';
 raise notice 'SCHEDULER_ASSERTIONS_PASSED';
end;
$test$;
