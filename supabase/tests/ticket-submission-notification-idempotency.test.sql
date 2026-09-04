\set ON_ERROR_STOP on

do $$
begin
  if has_table_privilege('anon', 'public.ticket_submission_notification_dispatches', 'select') or
     has_table_privilege('anon', 'public.ticket_submission_notification_dispatches', 'insert') or
     has_table_privilege('anon', 'public.ticket_submission_notification_dispatches', 'update') or
     has_table_privilege('anon', 'public.ticket_submission_notification_dispatches', 'delete') or
     has_table_privilege('authenticated', 'public.ticket_submission_notification_dispatches', 'select') or
     has_table_privilege('authenticated', 'public.ticket_submission_notification_dispatches', 'insert') or
     has_table_privilege('authenticated', 'public.ticket_submission_notification_dispatches', 'update') or
     has_table_privilege('authenticated', 'public.ticket_submission_notification_dispatches', 'delete') or
     has_function_privilege('anon', 'public.claim_ticket_submission_notification(uuid,uuid)', 'execute') or
     has_function_privilege('authenticated', 'public.claim_ticket_submission_notification(uuid,uuid)', 'execute') or
     has_function_privilege('anon', 'public.finish_ticket_submission_notification(uuid,uuid,text,text)', 'execute') or
     has_function_privilege('authenticated', 'public.finish_ticket_submission_notification(uuid,uuid,text,text)', 'execute') or
     has_function_privilege('anon', 'public.mark_stale_ticket_submission_notifications_indeterminate(integer)', 'execute') or
     has_function_privilege('authenticated', 'public.mark_stale_ticket_submission_notifications_indeterminate(integer)', 'execute') then
    raise exception 'notification dispatch state is exposed outside service_role';
  end if;
end
$$;

insert into public.ticket_submissions (id, service_type, status)
values
  ('00000000-0000-4000-8000-000000000501', 'representation', 'awaiting_payment'),
  ('00000000-0000-4000-8000-000000000502', 'representation', 'awaiting_payment'),
  ('00000000-0000-4000-8000-000000000504', 'representation', 'awaiting_payment'),
  ('00000000-0000-4000-8000-000000000505', 'representation', 'awaiting_payment'),
  ('00000000-0000-4000-8000-000000000506', 'representation', 'awaiting_payment'),
  ('00000000-0000-4000-8000-000000000503', 'ticket_insurance_assessment', 'assessment_awaiting_payment');

set role service_role;

do $$
begin
  begin
    perform public.mark_stale_ticket_submission_notifications_indeterminate(0);
    raise exception 'zero stale-notification sweep limit was accepted';
  exception
    when invalid_parameter_value then null;
  end;
  begin
    perform public.mark_stale_ticket_submission_notifications_indeterminate(1001);
    raise exception 'oversized stale-notification sweep limit was accepted';
  exception
    when invalid_parameter_value then null;
  end;
end
$$;

do $$
declare
  result jsonb;
begin
  result := public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000511'
  );
  if result <> '{"acquired": true, "status": "sending"}'::jsonb then
    raise exception 'first notification claim was not acquired: %', result;
  end if;

  result := public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000512'
  );
  if result <> '{"acquired": false, "status": "sending", "failureCode": null, "manualReviewRequired": false}'::jsonb then
    raise exception 'concurrent/retry notification claim crossed the fence: %', result;
  end if;

  if not public.finish_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000511',
    'sent',
    null
  ) then
    raise exception 'active notification claim did not finish';
  end if;

  result := public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000513'
  );
  if result <> '{"acquired": false, "status": "sent", "failureCode": null, "manualReviewRequired": false}'::jsonb then
    raise exception 'completed notification was claimable again: %', result;
  end if;
end
$$;

-- Model a worker crash by leaving a claim in sending. A later request must
-- surface a manual-review state without acquiring or replacing the fence.
do $$
declare
  result jsonb;
  original_claim uuid := '00000000-0000-4000-8000-000000000541';
begin
  result := public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000504', original_claim
  );
  if coalesce((result ->> 'acquired')::boolean, false) is not true then
    raise exception 'crash fixture was not claimed';
  end if;
  update public.ticket_submission_notification_dispatches
  set started_at = clock_timestamp() - interval '16 minutes'
  where submission_id = '00000000-0000-4000-8000-000000000504';

  result := public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000504',
    '00000000-0000-4000-8000-000000000542'
  );
  if result <> '{"acquired": false, "status": "indeterminate", "failureCode": "dispatch_timeout_manual_review", "manualReviewRequired": true}'::jsonb then
    raise exception 'abandoned claim did not become observable manual review: %', result;
  end if;
  if exists (
    select 1 from public.ticket_submission_notification_dispatches
    where submission_id = '00000000-0000-4000-8000-000000000504'
      and (claim_id <> original_claim or status <> 'indeterminate' or
        failure_code <> 'dispatch_timeout_manual_review')
  ) then
    raise exception 'abandoned claim fence was replaced or made retryable';
  end if;
  result := public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000504',
    '00000000-0000-4000-8000-000000000543'
  );
  if coalesce((result ->> 'acquired')::boolean, true) is not false or
     result ->> 'status' <> 'indeterminate' then
    raise exception 'manual-review notification became retryable: %', result;
  end if;
end
$$;

-- The maintenance sweep is bounded, skips live claims, and never makes an
-- abandoned provider outcome automatically retryable.
do $$
declare
  marked integer;
begin
  perform public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000505',
    '00000000-0000-4000-8000-000000000551'
  );
  perform public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000506',
    '00000000-0000-4000-8000-000000000561'
  );
  update public.ticket_submission_notification_dispatches
  set started_at = clock_timestamp() - interval '16 minutes'
  where submission_id = '00000000-0000-4000-8000-000000000505';

  marked := public.mark_stale_ticket_submission_notifications_indeterminate(1);
  if marked <> 1 then
    raise exception 'stale notification sweep marked %, expected 1', marked;
  end if;
  if not exists (
    select 1 from public.ticket_submission_notification_dispatches
    where submission_id = '00000000-0000-4000-8000-000000000505'
      and status = 'indeterminate'
      and failure_code = 'dispatch_timeout_manual_review'
  ) or not exists (
    select 1 from public.ticket_submission_notification_dispatches
    where submission_id = '00000000-0000-4000-8000-000000000506'
      and status = 'sending'
      and completed_at is null
  ) then
    raise exception 'stale sweep changed the wrong notification state';
  end if;
end
$$;

-- A failure before any external provider request can be safely retried once
-- the handler supplies a fresh claim. Its superseded claim cannot finish.
do $$
declare
  result jsonb;
begin
  result := public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000521'
  );
  if coalesce((result ->> 'acquired')::boolean, false) is not true then
    raise exception 'retry fixture was not claimed';
  end if;
  if not public.finish_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000521',
    'failed_before_delivery',
    'admin_directory_unavailable'
  ) then
    raise exception 'pre-delivery failure was not recorded';
  end if;

  result := public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000522'
  );
  if result <> '{"acquired": true, "status": "sending"}'::jsonb then
    raise exception 'safe pre-delivery retry was not acquired: %', result;
  end if;
  if public.finish_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000521',
    'sent',
    null
  ) then
    raise exception 'superseded claim could finish the notification';
  end if;
  if not public.finish_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000522',
    'indeterminate',
    'provider_outcome_unknown'
  ) then
    raise exception 'indeterminate provider outcome was not fenced';
  end if;
  result := public.claim_ticket_submission_notification(
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000523'
  );
  if result <> '{"acquired": false, "status": "indeterminate", "failureCode": "provider_outcome_unknown", "manualReviewRequired": true}'::jsonb then
    raise exception 'indeterminate provider outcome was retried: %', result;
  end if;
end
$$;

reset role;

do $$
begin
  begin
    perform public.claim_ticket_submission_notification(
      '00000000-0000-4000-8000-000000000503',
      '00000000-0000-4000-8000-000000000531'
    );
    raise exception 'non-representation submission was claimable';
  exception
    when no_data_found then null;
  end;

  delete from public.ticket_submissions
  where id = '00000000-0000-4000-8000-000000000501';
  if exists (
    select 1 from public.ticket_submission_notification_dispatches
    where submission_id = '00000000-0000-4000-8000-000000000501'
  ) then
    raise exception 'notification dispatch did not follow canonical submission deletion';
  end if;
end
$$;

select 'ticket submission notification idempotency tests passed' as result;
