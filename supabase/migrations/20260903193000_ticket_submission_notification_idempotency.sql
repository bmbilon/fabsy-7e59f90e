-- At-most-once dispatch fence for the unpaid-submission notification bundle.
-- A browser can retry checkout, but the same stored submission must not send
-- the admin/client email and SMS bundle more than once.

begin;

create table if not exists public.ticket_submission_notification_dispatches (
  submission_id uuid primary key
    references public.ticket_submissions(id) on delete cascade,
  claim_id uuid not null unique,
  status text not null,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  failure_code text,
  constraint ticket_submission_notification_dispatches_status_check
    check (status in ('sending', 'sent', 'failed_before_delivery', 'indeterminate')),
  constraint ticket_submission_notification_dispatches_shape_check
    check (
      (status = 'sending' and completed_at is null and failure_code is null) or
      (status = 'sent' and completed_at is not null and failure_code is null) or
      (status in ('failed_before_delivery', 'indeterminate') and
        completed_at is not null and failure_code ~ '^[a-z0-9_]{1,80}$')
    )
);

alter table public.ticket_submission_notification_dispatches enable row level security;
alter table public.ticket_submission_notification_dispatches force row level security;

revoke all on table public.ticket_submission_notification_dispatches
  from public, anon, authenticated;
grant select, insert, update, delete on table public.ticket_submission_notification_dispatches
  to service_role;

create index if not exists ticket_submission_notification_dispatches_status_idx
  on public.ticket_submission_notification_dispatches (status, started_at);

create or replace function public.claim_ticket_submission_notification(
  p_submission_id uuid,
  p_claim_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer := 0;
  current_status text;
  current_failure_code text;
begin
  if p_submission_id is null or p_claim_id is null then
    raise exception using
      errcode = '22023',
      message = 'TICKET_NOTIFICATION_CLAIM_INVALID';
  end if;

  if not exists (
    select 1
    from public.ticket_submissions s
    where s.id = p_submission_id
      and s.service_type = 'representation'
      and s.status = 'awaiting_payment'
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'TICKET_NOTIFICATION_SUBMISSION_NOT_ELIGIBLE';
  end if;

  insert into public.ticket_submission_notification_dispatches (
    submission_id, claim_id, status, started_at
  ) values (
    p_submission_id, p_claim_id, 'sending', clock_timestamp()
  )
  on conflict (submission_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    return jsonb_build_object('acquired', true, 'status', 'sending');
  end if;

  -- A worker can terminate after acquiring its durable fence but before its
  -- catch block records an outcome. Once the claim is older than any normal
  -- function invocation, classify it for manual review. It must never become
  -- automatically claimable because an external provider may have accepted a
  -- request immediately before the worker disappeared.
  update public.ticket_submission_notification_dispatches d
  set status = 'indeterminate',
      completed_at = clock_timestamp(),
      failure_code = 'dispatch_timeout_manual_review'
  where d.submission_id = p_submission_id
    and d.status = 'sending'
    and d.started_at <= clock_timestamp() - interval '15 minutes';

  -- A failure known to have happened before any provider request is the only
  -- safe retry. Once a provider request starts, an ambiguous outcome remains
  -- fenced to prevent duplicate customer/admin messages.
  update public.ticket_submission_notification_dispatches d
  set claim_id = p_claim_id,
      status = 'sending',
      started_at = clock_timestamp(),
      completed_at = null,
      failure_code = null
  where d.submission_id = p_submission_id
    and d.status = 'failed_before_delivery';
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    return jsonb_build_object('acquired', true, 'status', 'sending');
  end if;

  select d.status, d.failure_code into current_status, current_failure_code
  from public.ticket_submission_notification_dispatches d
  where d.submission_id = p_submission_id;

  return jsonb_build_object(
    'acquired', false,
    'status', coalesce(current_status, 'indeterminate'),
    'failureCode', current_failure_code,
    'manualReviewRequired', coalesce(current_status, 'indeterminate') = 'indeterminate'
  );
end;
$$;

create or replace function public.mark_stale_ticket_submission_notifications_indeterminate(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using
      errcode = '22023',
      message = 'TICKET_NOTIFICATION_STALE_LIMIT_INVALID';
  end if;

  with stale as (
    select d.submission_id
    from public.ticket_submission_notification_dispatches d
    where d.status = 'sending'
      and d.started_at <= clock_timestamp() - interval '15 minutes'
    order by d.started_at, d.submission_id
    limit p_limit
    for update skip locked
  )
  update public.ticket_submission_notification_dispatches d
  set status = 'indeterminate',
      completed_at = clock_timestamp(),
      failure_code = 'dispatch_timeout_manual_review'
  from stale
  where d.submission_id = stale.submission_id
    and d.status = 'sending';
  get diagnostics updated_count = row_count;

  return updated_count;
end;
$$;

create or replace function public.finish_ticket_submission_notification(
  p_submission_id uuid,
  p_claim_id uuid,
  p_status text,
  p_failure_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer := 0;
begin
  if p_status not in ('sent', 'failed_before_delivery', 'indeterminate') or
     (p_status = 'sent' and p_failure_code is not null) or
     (p_status <> 'sent' and coalesce(p_failure_code, '') !~ '^[a-z0-9_]{1,80}$') then
    raise exception using
      errcode = '22023',
      message = 'TICKET_NOTIFICATION_FINISH_INVALID';
  end if;

  update public.ticket_submission_notification_dispatches d
  set status = p_status,
      completed_at = clock_timestamp(),
      failure_code = p_failure_code
  where d.submission_id = p_submission_id
    and d.claim_id = p_claim_id
    and d.status = 'sending';
  get diagnostics updated_count = row_count;

  return updated_count = 1;
end;
$$;

comment on table public.ticket_submission_notification_dispatches is
  'Service-only, at-most-once dispatch fence for the unpaid ticket-submission notification bundle. Contains no recipient or case payload.';
comment on function public.claim_ticket_submission_notification(uuid, uuid) is
  'Claims one notification bundle per eligible unpaid representation submission. Only a pre-provider failure can be reclaimed.';
comment on function public.finish_ticket_submission_notification(uuid, uuid, text, text) is
  'Completes the active notification claim as sent, safely retryable before delivery, or outcome-indeterminate.';
comment on function public.mark_stale_ticket_submission_notifications_indeterminate(integer) is
  'Marks abandoned notification claims outcome-indeterminate for manual review without making them retryable.';

revoke all on function public.claim_ticket_submission_notification(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finish_ticket_submission_notification(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.mark_stale_ticket_submission_notifications_indeterminate(integer)
  from public, anon, authenticated;
grant execute on function public.claim_ticket_submission_notification(uuid, uuid)
  to service_role;
grant execute on function public.finish_ticket_submission_notification(uuid, uuid, text, text)
  to service_role;
grant execute on function public.mark_stale_ticket_submission_notifications_indeterminate(integer)
  to service_role;

commit;
