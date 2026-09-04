-- Keep resume-link delivery bounded across contact edits and capability
-- rotations. The per-generation counter remains useful operational evidence;
-- this lifetime counter is the actual provider-send ceiling for one draft.

begin;

create table public.ticket_intake_resume_action_rate_limits (
  request_fingerprint text primary key
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  action_count smallint not null default 1
    check (action_count between 1 and 10)
);

create index ticket_intake_resume_action_rate_limits_window_started_idx
  on public.ticket_intake_resume_action_rate_limits (window_started_at);

alter table public.ticket_intake_resume_action_rate_limits enable row level security;
alter table public.ticket_intake_resume_action_rate_limits force row level security;
revoke all on table public.ticket_intake_resume_action_rate_limits
  from public, anon, authenticated;
grant select, insert, update, delete on table public.ticket_intake_resume_action_rate_limits
  to service_role;

comment on table public.ticket_intake_resume_action_rate_limits is
  'HMAC-only one-hour throttle for explicit delivery retries and contact rotations. Contains no raw address or contact value.';

create function public.consume_ticket_intake_resume_action_limit(
  p_request_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_window timestamptz;
  current_count smallint;
begin
  if p_request_fingerprint is null or
     p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'TICKET_INTAKE_RESUME_ACTION_FINGERPRINT_INVALID';
  end if;

  -- Each request creates at most one keyed fingerprint row, while every
  -- request retires up to 100 expired windows. The indexed, lock-skipping
  -- batch keeps retention bounded without making a public cleanup surface or
  -- turning one request into an unbounded delete.
  delete from public.ticket_intake_resume_action_rate_limits as expired
  where expired.ctid in (
    select candidate.ctid
    from public.ticket_intake_resume_action_rate_limits as candidate
    where candidate.window_started_at <= clock_timestamp() - interval '1 hour'
    order by candidate.window_started_at
    limit 100
    for update skip locked
  );

  perform pg_advisory_xact_lock(hashtextextended(p_request_fingerprint, 0));
  select window_started_at, action_count
    into current_window, current_count
  from public.ticket_intake_resume_action_rate_limits
  where request_fingerprint = p_request_fingerprint
  for update;

  if not found or current_window <= clock_timestamp() - interval '1 hour' then
    insert into public.ticket_intake_resume_action_rate_limits (
      request_fingerprint, window_started_at, action_count
    ) values (
      p_request_fingerprint, clock_timestamp(), 1
    )
    on conflict (request_fingerprint) do update
      set window_started_at = excluded.window_started_at,
          action_count = 1;
    return true;
  end if;

  if current_count >= 10 then
    raise exception using
      errcode = 'P0001',
      message = 'TICKET_INTAKE_RESUME_ACTION_RATE_LIMIT';
  end if;

  update public.ticket_intake_resume_action_rate_limits
  set action_count = action_count + 1
  where request_fingerprint = p_request_fingerprint;
  return true;
end;
$$;

revoke all on function public.consume_ticket_intake_resume_action_limit(text)
  from public, anon, authenticated;
grant execute on function public.consume_ticket_intake_resume_action_limit(text)
  to service_role;

alter table public.ticket_intake_drafts
  add column resume_delivery_lifetime_attempt_count smallint not null default 0;

alter table public.ticket_intake_drafts
  add constraint ticket_intake_drafts_resume_delivery_lifetime_attempt_count_check
    check (resume_delivery_lifetime_attempt_count between 0 and 5);

comment on column public.ticket_intake_drafts.resume_delivery_lifetime_attempt_count is
  'Service-only lifetime provider-send attempt count. Capability rotation never resets this five-attempt ceiling.';

-- Claiming is the only transition that authorizes an external provider call.
-- Both counters increment atomically so a contact edit can reset operational
-- state without restoring the lifetime send allowance.
create or replace function public.claim_ticket_intake_resume_delivery(
  p_id uuid,
  p_access_token_hash text,
  p_claim_id uuid,
  p_retry boolean
)
returns public.ticket_intake_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft
  from public.ticket_intake_drafts
  where id = p_id
    and access_token_hash = p_access_token_hash
    -- A converted row may remain readable for an outstanding checkout, but it
    -- must never authorize a new resume-message provider call.
    and status = 'active'
    and expires_at > now()
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_DELIVERY_ACCESS_DENIED';
  end if;
  if not draft.contact_permission or draft.ticket_uploaded_at is null then
    raise exception using errcode = 'P0001', message = 'TICKET_INTAKE_DELIVERY_NOT_READY';
  end if;

  if (
    (not p_retry and draft.resume_delivery_status <> 'pending') or
    (p_retry and draft.resume_delivery_status <> 'failed') or
    draft.resume_delivery_attempt_count >= 5 or
    draft.resume_delivery_lifetime_attempt_count >= 5
  ) then
    return draft;
  end if;

  update public.ticket_intake_drafts
    set resume_delivery_status = 'sending',
        resume_delivery_channel = case when email is not null then 'email' else 'sms' end,
        resume_delivery_claim_id = p_claim_id,
        resume_delivery_claimed_at = now(),
        resume_delivery_claim_expires_at = now() + interval '10 minutes',
        resume_delivery_attempted_at = now(),
        resume_delivery_sent_at = null,
        resume_delivery_failed_at = null,
        resume_delivery_attempt_count = resume_delivery_attempt_count + 1,
        resume_delivery_lifetime_attempt_count = resume_delivery_lifetime_attempt_count + 1,
        resume_delivery_failure_code = null
  where id = draft.id
  returning * into draft;

  return draft;
end;
$$;

revoke all on function public.claim_ticket_intake_resume_delivery(
  uuid, text, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.claim_ticket_intake_resume_delivery(
  uuid, text, uuid, boolean
) to service_role;

commit;
