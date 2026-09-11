\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.due_draft(label text default 'E123') returns uuid language plpgsql as $$
declare draft uuid; begin
  insert into public.ticket_intake_drafts(draft_data,ticket_uploaded_at)
    values(jsonb_build_object('firstName','Alex','ticketNumber',label,'violation','Speeding'),now()-interval '31 minutes') returning id into draft;
  return draft;
end $$;
select pg_temp.due_draft('disabled');
select pg_temp.assert_true(not exists(select 1 from public.abandoned_ticket_emails),'disabled migration enqueued an old upload');
update public.abandoned_ticket_email_settings set enabled=true,activated_at=now()-interval '1 hour';
insert into public.ticket_intake_drafts(ticket_uploaded_at) values(now()-interval '2 hours');
select pg_temp.assert_true(not exists(select 1 from public.abandoned_ticket_emails),'historical upload was backfilled');
update public.ticket_intake_drafts set ticket_uploaded_at=now();
select pg_temp.assert_true(not exists(select 1 from public.abandoned_ticket_emails),'replacing a historical upload enrolled it');

do $$ declare draft uuid; event public.abandoned_ticket_emails%rowtype; begin
  insert into public.ticket_intake_drafts default values returning id into draft;
  if exists(select 1 from public.abandoned_ticket_emails) then raise exception 'placeholder path counted as upload'; end if;
  perform public.confirm_ticket_intake_draft_upload(draft,repeat('a',64),1);
  perform public.confirm_ticket_intake_draft_upload(draft,repeat('a',64),2);
  select * into event from public.abandoned_ticket_emails where draft_id=draft;
  perform pg_temp.assert_true(event.due_at=event.uploaded_at+interval '30 minutes','delay not exactly 30 minutes');
  perform pg_temp.assert_true(not exists(select 1 from public.claim_abandoned_ticket_emails()),'email claimed before 30 minutes');
  update public.ticket_intake_drafts set pending_ticket_document_path='replacement.pdf',pending_ticket_document_content_type='application/pdf',pending_ticket_document_size_bytes=100 where id=draft;
  perform public.confirm_ticket_intake_draft_upload(draft,repeat('a',64),2);
  perform pg_temp.assert_true((select count(*)=1 from public.abandoned_ticket_emails where draft_id=draft),'replacement duplicated follow-up');
  perform pg_temp.assert_true((select due_at=event.due_at from public.abandoned_ticket_emails where draft_id=draft),'replacement reset delay');
end $$;

do $$ declare draft uuid; job public.abandoned_ticket_emails%rowtype; context jsonb; frozen jsonb; begin
  draft:=pg_temp.due_draft();
  select * into job from public.claim_abandoned_ticket_emails();
  perform pg_temp.assert_true(job.draft_id=draft,'due upload not claimed');
  perform pg_temp.assert_true(not exists(select 1 from public.claim_abandoned_ticket_emails()),'live lease claimed twice');
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true((context->>'eligible')::boolean and context->>'firstName'='Alex' and context->>'ticketType'='Speeding','personalization invalid');
  perform pg_temp.assert_true(context->'checkoutSessionIds'='[]'::jsonb,'no-checkout lead unexpectedly has session');
  begin
    perform public.freeze_abandoned_ticket_email(job.id,job.claim_id,'{"to":["wrong@example.com"],"subject":"s","html":"x"}');
    raise exception 'wrong recipient accepted';
  exception when others then if sqlerrm<>'ABANDONED_TICKET_EMAIL_PAYLOAD_INVALID' then raise; end if; end;
  frozen:=public.freeze_abandoned_ticket_email(job.id,job.claim_id,'{"to":["lead@example.com"],"subject":"s","html":"original"}');
  frozen:=public.freeze_abandoned_ticket_email(job.id,job.claim_id,'{"to":["lead@example.com"],"subject":"s","html":"changed"}');
  perform pg_temp.assert_true(frozen->>'html'='original','payload changed between retries');
  perform pg_temp.assert_true(not public.finish_abandoned_ticket_email(job.id,gen_random_uuid(),'sent','provider',null),'wrong claim completed');
  update public.ticket_intake_drafts set email='changed@example.com' where id=draft;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'reason'='recipient_changed','frozen stale recipient accepted');
  update public.ticket_intake_drafts set email='lead@example.com' where id=draft;
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'sent','provider',null);
  draft:=pg_temp.due_draft('E-123');
  select * into job from public.claim_abandoned_ticket_emails();
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'reason'='duplicate_ticket','same email/ticket not deduplicated');
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'suppressed',null,'duplicate_ticket');
end $$;

do $$ declare draft uuid; job public.abandoned_ticket_emails%rowtype; context jsonb; reason text; begin
  foreach reason in array array['contacted','dismissed','permission','alberta','deleted','expired'] loop
    draft:=pg_temp.due_draft(reason);
    select * into job from public.claim_abandoned_ticket_emails();
    update public.ticket_intake_drafts set
      staff_follow_up_status=case when reason in ('contacted','dismissed') then reason else 'open' end,
      contact_permission=reason<>'permission',alberta_confirmed=reason<>'alberta',
      deleted_at=case when reason='deleted' then now() end,
      expires_at=case when reason='expired' then now()-interval '1 second' else expires_at end where id=draft;
    context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
    perform pg_temp.assert_true(context->>'eligible'='false','ineligible intake accepted: '||reason);
    perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'suppressed',null,'intake_unavailable');
  end loop;
end $$;

do $$ declare draft uuid; duplicate uuid; job public.abandoned_ticket_emails%rowtype; context jsonb; intent uuid; begin
  draft:=pg_temp.due_draft('E-PAID');
  insert into public.ticket_submissions(id,email,ticket_number) values(draft,'lead@example.com','E-PAID');
  update public.ticket_intake_drafts set status='converted',converted_submission_id=draft where id=draft;
  select * into job from public.claim_abandoned_ticket_emails();
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'eligible'='true','converted but unpaid intake excluded');
  insert into public.idr_checkout_intents(ticket_submission_id) values(draft) returning id into intent;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'reason'='checkout_creating' and context->>'retryable'='true','in-flight checkout not deferred');
  update public.idr_checkout_intents set status='open' where id=intent;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'reason'='checkout_creating','open checkout without Stripe session accepted');
  update public.ticket_submissions set representation_checkout_session_id='cs_submission',first_name='Linked',violation='Speeding 20 over' where id=draft;
  update public.ticket_intake_drafts set draft_data='{}'::jsonb where id=draft;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'reason'='checkout_creating','old submission session bypassed unknown current open session');
  update public.idr_checkout_intents set status='creating' where id=intent;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'reason'='checkout_creating','old submission session bypassed unknown creating session');
  update public.idr_checkout_intents set status='expired' where id=intent;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'eligible'='true' and context->'checkoutSessionIds'='["cs_submission"]'::jsonb,'submission Stripe session fallback omitted');
  perform pg_temp.assert_true(context->>'firstName'='Linked' and context->>'ticketNumber'='E-PAID' and context->>'ticketType'='Speeding 20 over','linked submission personalization fallback missing');
  update public.ticket_submissions set representation_checkout_session_id=null where id=draft;
  update public.idr_checkout_intents set status='open',stripe_checkout_session_id='cs_open' where id=intent;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->'checkoutSessionIds'='["cs_open"]'::jsonb,'Stripe recheck session missing');
  update public.idr_checkout_intents set status='paid' where id=intent;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'eligible'='false','paid converted submission accepted');
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'suppressed',null,'already_paid_or_active');
  duplicate:=pg_temp.due_draft('e paid');
  select * into job from public.claim_abandoned_ticket_emails();
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'reason'='already_paid_or_active','separate paid intake with normalized ticket number missed');
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'suppressed',null,'already_paid_or_active');
  update public.idr_checkout_intents set status='open' where id=intent;
  update public.ticket_submissions set representation_paid_at=now() where id=draft;
  duplicate:=pg_temp.due_draft('E paid');
  select * into job from public.claim_abandoned_ticket_emails();
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'reason'='already_paid_or_active','representation_paid_at ignored');
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'suppressed',null,'already_paid_or_active');
end $$;

do $$ declare draft uuid; job public.abandoned_ticket_emails%rowtype; context jsonb; paid uuid; begin
  draft:=pg_temp.due_draft('');
  select * into job from public.claim_abandoned_ticket_emails();
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  -- Existing same-email payment in this fixture happened after the missing-number
  -- draft's upload and conservatively suppresses an unnecessary payment reminder.
  perform pg_temp.assert_true(context->>'reason'='already_paid_or_active','missing-number restart paid under same email was missed');
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'suppressed',null,'already_paid_or_active');
  draft:=pg_temp.due_draft('');
  update public.ticket_intake_drafts set email='another@example.com' where id=draft;
  select * into job from public.claim_abandoned_ticket_emails();
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'eligible'='true','other recipient payment suppressed unmatched intake');
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'suppressed',null,'test_complete');
end $$;

do $$ declare draft uuid; ticket uuid; intent uuid; job public.abandoned_ticket_emails%rowtype; context jsonb; begin
  -- A buyer may restart with a new upload, then pay their earlier checkout.
  -- Historical completed purchases must not suppress every future unknown-number intake.
  insert into public.ticket_submissions(id,email,ticket_number,status,created_at)
    values(gen_random_uuid(),'restart@example.com','OLDER','completed',now()-interval '2 days') returning id into ticket;
  insert into public.idr_checkout_intents(ticket_submission_id,status,stripe_checkout_session_id,updated_at)
    values(ticket,'paid','cs_old_paid',now()-interval '2 days') returning id into intent;
  draft:=pg_temp.due_draft('');
  update public.ticket_intake_drafts set email='restart@example.com' where id=draft;
  select * into job from public.claim_abandoned_ticket_emails();
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'eligible'='true' and context->'checkoutSessionIds'='[]'::jsonb,'unrelated historical purchase suppressed missing-number intake');
  update public.ticket_submissions set status='awaiting_payment' where id=ticket;
  update public.idr_checkout_intents set status='open',stripe_checkout_session_id='cs_older_open' where id=intent;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'eligible'='true' and context->'checkoutSessionIds'='["cs_older_open"]'::jsonb,'earlier unpaid checkout omitted for missing-number restart');
  update public.idr_checkout_intents set status='paid',updated_at=now() where id=intent;
  update public.ticket_submissions set status='pending' where id=ticket;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'reason'='already_paid_or_active','older submission newly paid checkout missed');
  update public.idr_checkout_intents set updated_at=now()-interval '2 days' where id=intent;
  update public.ticket_submissions set representation_paid_at=now() where id=ticket;
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'reason'='already_paid_or_active','older submission recently paid timestamp missed');
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'suppressed',null,'already_paid_or_active');
end $$;

do $$ declare draft uuid; job public.abandoned_ticket_emails%rowtype; old_claim uuid; begin
  draft:=pg_temp.due_draft('retry');
  select * into job from public.claim_abandoned_ticket_emails(); old_claim:=job.claim_id;
  update public.abandoned_ticket_emails set claim_expires_at=now()-interval '1 second' where id=job.id;
  perform pg_temp.assert_true(not public.finish_abandoned_ticket_email(job.id,old_claim,'sent','late',null),'expired lease completed');
  select * into job from public.claim_abandoned_ticket_emails();
  perform pg_temp.assert_true(job.attempt_count=2 and job.claim_id<>old_claim,'lease recovery lost durable identity');
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'retry',null,'provider_network_error');
  perform pg_temp.assert_true(not exists(select 1 from public.claim_abandoned_ticket_emails()),'retry delay ignored');
  update public.abandoned_ticket_emails set first_attempt_at=now()-interval '24 hours',next_attempt_at=now()-interval '1 minute' where id=job.id;
  perform pg_temp.assert_true(not exists(select 1 from public.claim_abandoned_ticket_emails()),'retry escaped provider idempotency window');
  perform pg_temp.assert_true((select status='indeterminate' from public.abandoned_ticket_emails where id=job.id),'indeterminate send not recorded');
  draft:=pg_temp.due_draft('expired-retry');
  select * into job from public.claim_abandoned_ticket_emails();
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'retry',null,'provider_network_error');
  update public.ticket_intake_drafts set expires_at=now()-interval '1 second' where id=draft;
  update public.abandoned_ticket_emails set next_attempt_at=now()-interval '1 second' where id=job.id;
  perform pg_temp.assert_true(not exists(select 1 from public.claim_abandoned_ticket_emails()),'expired intake retried');
  perform pg_temp.assert_true((select status='suppressed' from public.abandoned_ticket_emails where id=job.id),'expired retry not suppressed');
end $$;
do $$ declare draft uuid; job public.abandoned_ticket_emails%rowtype; context jsonb; begin
  draft:=pg_temp.due_draft('late-paid');
  select * into job from public.claim_abandoned_ticket_emails();
  context:=public.get_abandoned_ticket_email_context(job.id,job.claim_id);
  perform pg_temp.assert_true(context->>'eligible'='true','unpaid late-payment fixture was rejected');
  insert into public.ticket_submissions(id,email,ticket_number,status) values(draft,'lead@example.com','late-paid','pending');
  begin
    perform public.freeze_abandoned_ticket_email(job.id,job.claim_id,'{"to":["lead@example.com"],"subject":"s","html":"x"}');
    raise exception 'payment after first eligibility check was ignored at freeze';
  exception when others then if sqlerrm<>'ABANDONED_TICKET_EMAIL_INELIGIBLE' then raise; end if; end;
  perform public.finish_abandoned_ticket_email(job.id,job.claim_id,'suppressed',null,'already_paid_or_active');
end $$;
select pg_temp.assert_true(not has_table_privilege('anon','public.abandoned_ticket_emails','select'),'anonymous queue access granted');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.get_abandoned_ticket_email_context(uuid,uuid)','execute'),'customer data RPC exposed');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.abandoned_ticket_email_settings','update'),'activation exposed');
delete from public.ticket_intake_drafts;
select pg_temp.assert_true(not exists(select 1 from public.abandoned_ticket_emails),'outbox survives intake deletion');
rollback;
