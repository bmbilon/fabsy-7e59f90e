\set ON_ERROR_STOP on

do $$
begin
  if has_function_privilege(
    'anon',
    'public.claim_ticket_intake_resume_delivery(uuid,text,uuid,boolean)',
    'execute'
  ) or has_table_privilege(
    'authenticated', 'public.ticket_intake_drafts', 'update'
  ) or has_function_privilege(
    'anon',
    'public.consume_ticket_intake_resume_action_limit(text)',
    'execute'
  ) or has_table_privilege(
    'authenticated', 'public.ticket_intake_resume_action_rate_limits', 'select'
  ) then
    raise exception 'delivery lifetime controls are exposed outside service_role';
  end if;
end
$$;

set role service_role;

-- Conversion keeps the capability readable for an outstanding checkout but
-- permanently closes both the initial and retry provider-send transitions.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000308',
  repeat('a8', 32), repeat('7', 64), 'converted-delivery@example.com', null, 'en',
  '{"email":"converted-delivery@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000308/representation-ticket-r1.pdf',
  'application/pdf', 1200
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000308', repeat('a8', 32), 1
);
insert into public.clients (id)
values ('00000000-0000-4000-8000-000000000208');
insert into public.ticket_submissions (
  id, client_id, service_type, status, representation_access_token_hash,
  ticket_document_path, preferred_locale, email, phone
) values (
  '00000000-0000-4000-8000-000000000308',
  '00000000-0000-4000-8000-000000000208',
  'representation', 'awaiting_payment', repeat('a8', 32),
  '00000000-0000-4000-8000-000000000308/representation-ticket-r1.pdf',
  'en', 'converted-delivery@example.com', '4035550308'
);

do $$
declare
  before_attempts smallint;
begin
  select resume_delivery_lifetime_attempt_count into before_attempts
  from public.ticket_intake_drafts
  where id = '00000000-0000-4000-8000-000000000308';

  begin
    perform public.claim_ticket_intake_resume_delivery(
      '00000000-0000-4000-8000-000000000308', repeat('a8', 32),
      '00000000-0000-4000-8000-000000000381', false
    );
    raise exception 'converted pending delivery was claimable';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_DELIVERY_ACCESS_DENIED' then raise; end if;
  end;

  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000308'
      and status = 'converted'
      and resume_delivery_status = 'pending'
      and resume_delivery_lifetime_attempt_count = before_attempts
  ) then
    raise exception 'denied converted pending claim changed delivery state';
  end if;

  update public.ticket_intake_drafts
  set resume_delivery_status = 'failed',
      resume_delivery_channel = 'email',
      resume_delivery_claim_id = '00000000-0000-4000-8000-000000000382',
      resume_delivery_claimed_at = clock_timestamp(),
      resume_delivery_claim_expires_at = clock_timestamp() + interval '10 minutes',
      resume_delivery_attempted_at = clock_timestamp(),
      resume_delivery_failed_at = clock_timestamp(),
      resume_delivery_attempt_count = 1,
      resume_delivery_lifetime_attempt_count = 1,
      resume_delivery_failure_code = 'request_rejected'
  where id = '00000000-0000-4000-8000-000000000308';

  begin
    perform public.claim_ticket_intake_resume_delivery(
      '00000000-0000-4000-8000-000000000308', repeat('a8', 32),
      '00000000-0000-4000-8000-000000000383', true
    );
    raise exception 'converted failed delivery was retryable';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_DELIVERY_ACCESS_DENIED' then raise; end if;
  end;

  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000308'
      and status = 'converted'
      and resume_delivery_status = 'failed'
      and resume_delivery_claim_id = '00000000-0000-4000-8000-000000000382'
      and resume_delivery_attempt_count = 1
      and resume_delivery_lifetime_attempt_count = 1
  ) then
    raise exception 'denied converted retry changed delivery state';
  end if;
end
$$;

insert into public.ticket_intake_resume_action_rate_limits (
  request_fingerprint, window_started_at, action_count
)
select repeat(md5(series::text), 2), clock_timestamp() - interval '2 hours', 10
from generate_series(1, 105) as series;

insert into public.ticket_intake_resume_action_rate_limits (
  request_fingerprint, window_started_at, action_count
) values (repeat('b', 64), clock_timestamp(), 7);

select public.consume_ticket_intake_resume_action_limit(repeat('c', 64));

do $$
declare
  stale_count integer;
  fresh_count smallint;
begin
  select count(*) into stale_count
  from public.ticket_intake_resume_action_rate_limits
  where window_started_at <= clock_timestamp() - interval '1 hour';
  if stale_count <> 5 then
    raise exception 'bounded cleanup removed %, expected exactly 100 of 105 stale rows', 105 - stale_count;
  end if;

  select action_count into fresh_count
  from public.ticket_intake_resume_action_rate_limits
  where request_fingerprint = repeat('b', 64);
  if fresh_count <> 7 then
    raise exception 'stale cleanup removed or changed a live rate-limit window';
  end if;
end
$$;

select public.consume_ticket_intake_resume_action_limit(repeat('d', 64));

do $$
begin
  if exists (
    select 1
    from public.ticket_intake_resume_action_rate_limits
    where window_started_at <= clock_timestamp() - interval '1 hour'
  ) then
    raise exception 'subsequent bounded cleanup did not retire the remaining stale rows';
  end if;
end
$$;

do $$
declare
  attempt integer;
begin
  for attempt in 1..10 loop
    if not public.consume_ticket_intake_resume_action_limit(repeat('a', 64)) then
      raise exception 'resume action rate limiter returned false';
    end if;
  end loop;
  begin
    perform public.consume_ticket_intake_resume_action_limit(repeat('a', 64));
    raise exception 'eleventh resume action was allowed in one hour';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_RESUME_ACTION_RATE_LIMIT' then raise; end if;
  end;
end
$$;

select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000307',
  (repeat('a', 63) || '0'), (repeat('0', 63) || 'a'), 'rotate-0@example.com', null, 'en',
  '{"email":"rotate-0@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000307/representation-ticket-r1.pdf',
  'application/pdf', 1200
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000307', (repeat('a', 63) || '0'), 1
);

do $$
declare
  draft public.ticket_intake_drafts%rowtype;
  current_hash text := repeat('a', 63) || '0';
  next_hash text;
  attempt integer;
  current_revision bigint := 2;
begin
  for attempt in 1..5 loop
    select * into draft from public.claim_ticket_intake_resume_delivery(
      '00000000-0000-4000-8000-000000000307',
      current_hash,
      ('00000000-0000-4000-8000-' || lpad(attempt::text, 12, '0'))::uuid,
      false
    );
    if draft.resume_delivery_status <> 'sending' or
       draft.resume_delivery_lifetime_attempt_count <> attempt then
      raise exception 'lifetime delivery attempt % was not claimed exactly once', attempt;
    end if;

    perform public.complete_ticket_intake_resume_delivery(
      draft.id,
      draft.resume_delivery_claim_id,
      'failed',
      'request_rejected'
    );

    next_hash := repeat('a', 63) || attempt::text;
    select * into draft from public.save_ticket_intake_draft(
      draft.id,
      current_hash,
      current_revision,
      format('rotate-%s@example.com', attempt),
      null,
      1::smallint,
      0::smallint,
      jsonb_build_object('email', format('rotate-%s@example.com', attempt)),
      next_hash
    );
    current_hash := next_hash;
    current_revision := current_revision + 1;

    if draft.resume_delivery_status <> 'pending' or
       draft.resume_delivery_attempt_count <> 0 or
       draft.resume_delivery_lifetime_attempt_count <> attempt then
      raise exception 'contact rotation reset the lifetime ceiling at attempt %', attempt;
    end if;
  end loop;

  select * into draft from public.claim_ticket_intake_resume_delivery(
    draft.id,
    current_hash,
    '00000000-0000-4000-8000-000000000399',
    false
  );
  if draft.resume_delivery_status <> 'pending' or
     draft.resume_delivery_claim_id is not null or
     draft.resume_delivery_attempt_count <> 0 or
     draft.resume_delivery_lifetime_attempt_count <> 5 then
    raise exception 'sixth provider delivery was authorized after rotations';
  end if;
end
$$;

reset role;
select 'ticket intake delivery abuse-control assertions passed' as result;
