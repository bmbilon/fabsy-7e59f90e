begin;

-- Transport moves to Chatwoot; the existing WhatsApp tables/RPCs still own
-- sender HMACs, STOP/START and spend limits. This queue stores identifiers only.
create table public.chatwoot_vapi_conversations (
  account_id bigint not null check (account_id between 1 and 9007199254740991),
  conversation_id bigint not null check (conversation_id between 1 and 9007199254740991),
  inbox_id bigint check (inbox_id between 1 and 9007199254740991),
  generation bigint not null default 0 check (generation >= 0),
  human_hold boolean not null default false,
  hold_at timestamptz,
  status_changed_at timestamptz,
  lease_job_id uuid,
  lease_until timestamptz,
  previous_chat_id text check (previous_chat_id is null or length(previous_chat_id) between 1 and 200),
  previous_chat_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (account_id, conversation_id),
  check ((lease_job_id is null) = (lease_until is null)),
  check ((previous_chat_id is null) = (previous_chat_expires_at is null))
);

create table public.chatwoot_vapi_jobs (
  id uuid primary key default gen_random_uuid(),
  enqueue_sequence bigint generated always as identity unique,
  account_id bigint not null,
  conversation_id bigint not null,
  inbox_id bigint not null check (inbox_id between 1 and 9007199254740991),
  message_id bigint not null check (message_id between 1 and 9007199254740991),
  message_sid text not null unique check (message_sid ~ '^SM[0-9A-Fa-f]{32}$'),
  control_hint boolean not null default false,
  generation bigint not null check (generation >= 0),
  state text not null default 'queued' check (state in
    ('queued', 'processing', 'sending', 'uncertain', 'sent', 'suppressed', 'failed', 'send_uncertain')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  outgoing_message_id bigint check (outgoing_message_id between 1 and 9007199254740991),
  vapi_chat_id text check (vapi_chat_id is null or length(vapi_chat_id) between 1 and 200),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  retained_until timestamptz not null default (now() + interval '90 days'),
  unique (account_id, message_id),
  foreign key (account_id, conversation_id)
    references public.chatwoot_vapi_conversations(account_id, conversation_id),
  check ((lease_token is null) = (lease_until is null))
);

-- Opt-out is sender-scoped in the existing bridge, so its ordering clock must
-- span every Chatwoot conversation for that same pseudonymous sender.
create table public.chatwoot_vapi_control_clocks (
  sender_hash text primary key check (sender_hash ~ '^[0-9a-f]{64}$'),
  last_verified_control_at timestamptz not null,
  last_verified_control_sid text not null check (last_verified_control_sid ~ '^SM[0-9A-Fa-f]{32}$'),
  updated_at timestamptz not null default now()
);

create table public.chatwoot_vapi_events (
  delivery_id uuid primary key,
  account_id bigint not null check (account_id between 1 and 9007199254740991),
  conversation_id bigint not null check (conversation_id between 1 and 9007199254740991),
  event_kind text not null check (event_kind in ('invalidate', 'status')),
  received_at timestamptz not null default now()
);

create table public.chatwoot_vapi_runtime (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  circuit_enabled boolean not null default false,
  recovery_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.chatwoot_vapi_runtime(singleton_id) values (1);

create index chatwoot_vapi_jobs_ready_idx on public.chatwoot_vapi_jobs(available_at, created_at)
  where state in ('queued', 'processing', 'sending', 'uncertain');
create index chatwoot_vapi_jobs_conversation_idx on public.chatwoot_vapi_jobs(account_id, conversation_id, enqueue_sequence);
create index chatwoot_vapi_jobs_retention_idx on public.chatwoot_vapi_jobs(retained_until);
create index chatwoot_vapi_events_retention_idx on public.chatwoot_vapi_events(received_at);

alter table public.chatwoot_vapi_conversations enable row level security;
alter table public.chatwoot_vapi_jobs enable row level security;
alter table public.chatwoot_vapi_events enable row level security;
alter table public.chatwoot_vapi_control_clocks enable row level security;
alter table public.chatwoot_vapi_runtime enable row level security;
revoke all on public.chatwoot_vapi_conversations, public.chatwoot_vapi_jobs,
  public.chatwoot_vapi_events, public.chatwoot_vapi_control_clocks, public.chatwoot_vapi_runtime from public, anon, authenticated;
revoke all on sequence public.chatwoot_vapi_jobs_enqueue_sequence_seq from public, anon, authenticated;
-- No browser-role policies. Operators inspect metadata through service access.
grant select on public.chatwoot_vapi_conversations, public.chatwoot_vapi_jobs,
  public.chatwoot_vapi_events, public.chatwoot_vapi_control_clocks, public.chatwoot_vapi_runtime to service_role;

comment on table public.chatwoot_vapi_control_clocks is
  'Persistent HMAC sender control-order tombstones across conversations and signing-key rotation. No phone numbers, message text or media. Updated only by the atomic verified-control RPC.';
comment on table public.chatwoot_vapi_jobs is
  'Durable identifier-only work queue. Never store text, phone numbers, media URLs, webhook bodies, prompts, replies or secrets. Twilio REST supplies authoritative input at processing time.';
comment on column public.chatwoot_vapi_jobs.enqueue_sequence is
  'Monotonic receipt order under the per-conversation enqueue lock. Timestamp ties and random UUID order must not reorder verified controls.';
comment on column public.chatwoot_vapi_jobs.control_hint is
  'Untrusted cancellation hint only. STOP/START authority must be verified against Twilio REST by the worker.';
comment on column public.chatwoot_vapi_jobs.state is
  'sending is committed before the one outbound HTTP attempt. Expired sending and uncertain jobs may only reconcile; they must never be sent again.';
comment on column public.chatwoot_vapi_conversations.generation is
  'Fencing epoch advanced by human takeover and control hints. A stale worker cannot begin an outbound request or restore continuity.';
comment on column public.chatwoot_vapi_conversations.status_changed_at is
  'Timestamp of an explicit signed status change, not generic conversation updated_at. Only a newer explicit pending/no-human transition releases a human hold.';

create function public.enqueue_chatwoot_vapi_job(
  p_account_id bigint, p_inbox_id bigint, p_conversation_id bigint,
  p_message_id bigint, p_message_sid text, p_delivery_id uuid default null,
  p_control_hint boolean default false
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  c public.chatwoot_vapi_conversations%rowtype;
  j public.chatwoot_vapi_jobs%rowtype;
  preserve_send_lease boolean;
  op timestamptz := clock_timestamp();
begin
  if p_control_hint is null then raise exception 'CHATWOOT_CONTROL_HINT_INVALID' using errcode = '22023'; end if;
  insert into public.chatwoot_vapi_conversations(account_id, conversation_id, inbox_id)
    values (p_account_id, p_conversation_id, p_inbox_id) on conflict do nothing;
  select * into strict c from public.chatwoot_vapi_conversations
    where account_id = p_account_id and conversation_id = p_conversation_id for update;
  if c.inbox_id is not null and c.inbox_id <> p_inbox_id then
    raise exception 'CHATWOOT_INBOX_CONFLICT' using errcode = '23505';
  end if;
  -- Insert first: a duplicate control webhook must never advance the epoch twice.
  insert into public.chatwoot_vapi_jobs(account_id, inbox_id, conversation_id, message_id,
      message_sid, control_hint, generation)
    values (p_account_id, p_inbox_id, p_conversation_id, p_message_id,
      p_message_sid, p_control_hint, c.generation)
    on conflict do nothing returning * into j;
  if j.id is null then
    select * into j from public.chatwoot_vapi_jobs
      where message_sid = p_message_sid or (account_id = p_account_id and message_id = p_message_id)
      order by enqueue_sequence limit 1;
    if j.account_id is distinct from p_account_id or j.inbox_id is distinct from p_inbox_id
      or j.conversation_id is distinct from p_conversation_id or j.message_id is distinct from p_message_id
      or j.message_sid is distinct from p_message_sid then
      raise exception 'CHATWOOT_MESSAGE_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object('enqueued', false, 'duplicate', true, 'job_id', j.id);
  end if;
  if p_control_hint then
    select exists (select 1 from public.chatwoot_vapi_jobs
      where id = c.lease_job_id and state in ('sending', 'uncertain')) into preserve_send_lease;
    c.generation := c.generation + 1;
    update public.chatwoot_vapi_conversations set generation = c.generation,
      lease_job_id = case when preserve_send_lease then c.lease_job_id else null end,
      lease_until = case when preserve_send_lease then c.lease_until else null end, previous_chat_id = null,
      previous_chat_expires_at = null, updated_at = op
      where account_id = p_account_id and conversation_id = p_conversation_id;
    update public.chatwoot_vapi_jobs set state = 'suppressed', completed_at = op,
      lease_token = null, lease_until = null
      where account_id = p_account_id and conversation_id = p_conversation_id
        and id <> j.id and state in ('queued', 'processing') and not control_hint;
    -- A hint is not authenticated STOP/START content. It can cancel ordinary AI
    -- work but must not discard an earlier control awaiting Twilio verification.
    update public.chatwoot_vapi_jobs set state = 'queued', generation = c.generation,
      lease_token = null, lease_until = null, available_at = op
      where account_id = p_account_id and conversation_id = p_conversation_id
        and id <> j.id and state in ('queued', 'processing') and control_hint;
    update public.chatwoot_vapi_jobs set generation = c.generation where id = j.id;
  end if;
  update public.chatwoot_vapi_conversations set inbox_id = p_inbox_id, updated_at = op
    where account_id = p_account_id and conversation_id = p_conversation_id;
  -- Inbound delivery IDs need no separate ledger: both provider message keys are unique.
  return jsonb_build_object('enqueued', true, 'duplicate', false, 'job_id', j.id);
end;
$$;

create function public.invalidate_chatwoot_vapi_conversation(
  p_account_id bigint, p_conversation_id bigint,
  p_event_at timestamptz default now(), p_delivery_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  c public.chatwoot_vapi_conversations%rowtype;
  inserted_id uuid;
  preserve_send_lease boolean;
  op timestamptz := clock_timestamp();
begin
  if p_event_at is null or p_event_at > op + interval '5 minutes' then
    raise exception 'CHATWOOT_EVENT_TIME_INVALID' using errcode = '22023';
  end if;
  insert into public.chatwoot_vapi_conversations(account_id, conversation_id)
    values (p_account_id, p_conversation_id) on conflict do nothing;
  select * into strict c from public.chatwoot_vapi_conversations
    where account_id = p_account_id and conversation_id = p_conversation_id for update;
  if p_delivery_id is not null then
    insert into public.chatwoot_vapi_events(delivery_id, account_id, conversation_id, event_kind)
      values (p_delivery_id, p_account_id, p_conversation_id, 'invalidate')
      on conflict do nothing returning delivery_id into inserted_id;
    if inserted_id is null then
      return jsonb_build_object('generation', c.generation, 'held', c.human_hold, 'duplicate', true);
    end if;
  end if;
  if p_event_at < c.status_changed_at or (p_delivery_id is null and p_event_at <= c.hold_at) then
    return jsonb_build_object('generation', c.generation, 'held', c.human_hold, 'stale', true);
  end if;
  -- A request already marked sending must retain its receipt/reconciliation
  -- lease. Generation/hold changes still prohibit beginning any further send.
  select exists (select 1 from public.chatwoot_vapi_jobs
    where id = c.lease_job_id and state in ('sending', 'uncertain')) into preserve_send_lease;
  update public.chatwoot_vapi_conversations set generation = generation + 1,
    human_hold = true, hold_at = greatest(p_event_at, hold_at),
    lease_job_id = case when preserve_send_lease then c.lease_job_id else null end,
    lease_until = case when preserve_send_lease then c.lease_until else null end, previous_chat_id = null, previous_chat_expires_at = null, updated_at = op
    where account_id = p_account_id and conversation_id = p_conversation_id returning * into c;
  update public.chatwoot_vapi_jobs set state = 'suppressed', completed_at = op,
    lease_token = null, lease_until = null
    where account_id = p_account_id and conversation_id = p_conversation_id
      and state in ('queued', 'processing') and not control_hint;
  -- Hinted controls still need authoritative Twilio verification while held.
  -- Requeue/fence any current control worker rather than lose STOP/START state.
  update public.chatwoot_vapi_jobs set state = 'queued', generation = c.generation,
    lease_token = null, lease_until = null, available_at = op
    where account_id = p_account_id and conversation_id = p_conversation_id
      and state in ('queued', 'processing') and control_hint;
  return jsonb_build_object('generation', c.generation, 'held', true, 'duplicate', false);
end;
$$;

create function public.observe_chatwoot_vapi_conversation(
  p_account_id bigint, p_conversation_id bigint, p_status text,
  p_human_assigned boolean, p_status_changed_at timestamptz, p_delivery_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  c public.chatwoot_vapi_conversations%rowtype;
  inserted_id uuid;
  preserve_send_lease boolean;
  op timestamptz := clock_timestamp();
begin
  if p_status is null or p_status not in ('pending', 'open', 'resolved', 'snoozed')
    or p_human_assigned is null or p_status_changed_at is null
    or p_status_changed_at > op + interval '5 minutes' then
    raise exception 'CHATWOOT_STATUS_INVALID' using errcode = '22023';
  end if;
  insert into public.chatwoot_vapi_conversations(account_id, conversation_id)
    values (p_account_id, p_conversation_id) on conflict do nothing;
  select * into strict c from public.chatwoot_vapi_conversations
    where account_id = p_account_id and conversation_id = p_conversation_id for update;
  if p_delivery_id is not null then
    insert into public.chatwoot_vapi_events(delivery_id, account_id, conversation_id, event_kind)
      values (p_delivery_id, p_account_id, p_conversation_id, 'status')
      on conflict do nothing returning delivery_id into inserted_id;
    if inserted_id is null then
      return jsonb_build_object('generation', c.generation, 'held', c.human_hold, 'duplicate', true);
    end if;
  end if;
  if p_status_changed_at <= c.status_changed_at then
    return jsonb_build_object('generation', c.generation, 'held', c.human_hold, 'stale', true);
  end if;
  if p_status = 'pending' and not p_human_assigned then
    update public.chatwoot_vapi_conversations set status_changed_at = p_status_changed_at,
      human_hold = case when hold_at is null or p_status_changed_at > hold_at then false else human_hold end,
      updated_at = op where account_id = p_account_id and conversation_id = p_conversation_id
      returning * into c;
  else
    select exists (select 1 from public.chatwoot_vapi_jobs
      where id = c.lease_job_id and state in ('sending', 'uncertain')) into preserve_send_lease;
    update public.chatwoot_vapi_conversations set generation = generation + 1,
      human_hold = true, hold_at = greatest(p_status_changed_at, hold_at),
      status_changed_at = p_status_changed_at,
      lease_job_id = case when preserve_send_lease then c.lease_job_id else null end,
      lease_until = case when preserve_send_lease then c.lease_until else null end,
      previous_chat_id = null, previous_chat_expires_at = null, updated_at = op
      where account_id = p_account_id and conversation_id = p_conversation_id returning * into c;
    update public.chatwoot_vapi_jobs set state = 'suppressed', completed_at = op,
      lease_token = null, lease_until = null
      where account_id = p_account_id and conversation_id = p_conversation_id
        and state in ('queued', 'processing') and not control_hint;
    update public.chatwoot_vapi_jobs set state = 'queued', generation = c.generation,
      lease_token = null, lease_until = null, available_at = op
      where account_id = p_account_id and conversation_id = p_conversation_id
        and state in ('queued', 'processing') and control_hint;
  end if;
  return jsonb_build_object('generation', c.generation, 'held', c.human_hold, 'duplicate', false);
end;
$$;

create function public.claim_chatwoot_vapi_job()
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  c public.chatwoot_vapi_conversations%rowtype;
  j public.chatwoot_vapi_jobs%rowtype;
  enabled boolean;
  phase text;
  token uuid := gen_random_uuid();
  op timestamptz := clock_timestamp();
begin
  select circuit_enabled into enabled from public.chatwoot_vapi_runtime where singleton_id = 1;
  select conversation.* into c from public.chatwoot_vapi_conversations conversation
    where (conversation.lease_until is null or conversation.lease_until <= op)
      and exists (select 1 from public.chatwoot_vapi_jobs job
        where job.account_id = conversation.account_id and job.conversation_id = conversation.conversation_id
          and job.available_at <= op and (job.lease_until is null or job.lease_until <= op)
          and (job.state in ('sending', 'uncertain') or (enabled and job.state in ('queued', 'processing'))))
    order by conversation.updated_at for update skip locked limit 1;
  if not found then return null; end if;
  select * into j from public.chatwoot_vapi_jobs
    where account_id = c.account_id and conversation_id = c.conversation_id
      and available_at <= op and (lease_until is null or lease_until <= op)
      and (state in ('sending', 'uncertain') or (enabled and state in ('queued', 'processing')))
    order by case when state in ('sending', 'uncertain') then 0 when control_hint then 1 else 2 end,
      enqueue_sequence for update skip locked limit 1;
  if not found then return null; end if;
  phase := case when j.state in ('sending', 'uncertain') then j.state else 'queued' end;
  update public.chatwoot_vapi_jobs set state = case when phase = 'queued' then 'processing' else state end,
    attempt_count = least(attempt_count + 1, 1000), lease_token = token,
    lease_until = op + interval '90 seconds' where id = j.id returning * into j;
  update public.chatwoot_vapi_conversations set lease_job_id = j.id,
    lease_until = j.lease_until, updated_at = op
    where account_id = c.account_id and conversation_id = c.conversation_id;
  return to_jsonb(j) || jsonb_build_object('job_id', j.id, 'phase', phase,
    'marker', 'fabsy-wa:' || j.id::text, 'human_hold', c.human_hold,
    'previous_chat_id', case when c.previous_chat_expires_at > op then c.previous_chat_id else null end);
end;
$$;

create function public.current_chatwoot_vapi_job(p_job_id uuid, p_lease_token uuid, p_generation bigint)
returns boolean language sql security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.chatwoot_vapi_jobs j
    join public.chatwoot_vapi_conversations c using (account_id, conversation_id)
    cross join public.chatwoot_vapi_runtime r
    where j.id = p_job_id and j.lease_token = p_lease_token and j.generation = p_generation
      and c.generation = p_generation and c.lease_job_id = j.id
      and j.lease_until > clock_timestamp() and c.lease_until > clock_timestamp()
      and j.state in ('processing', 'sending') and not c.human_hold
      and r.singleton_id = 1 and r.circuit_enabled);
$$;

create function public.mark_chatwoot_vapi_sending(
  p_job_id uuid, p_lease_token uuid, p_generation bigint, p_vapi_chat_id text default null
) returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare c public.chatwoot_vapi_conversations%rowtype;
begin
  select conversation.* into c from public.chatwoot_vapi_conversations conversation
    join public.chatwoot_vapi_jobs job using (account_id, conversation_id)
    where job.id = p_job_id for update of conversation;
  if not found or not public.current_chatwoot_vapi_job(p_job_id, p_lease_token, p_generation) then return false; end if;
  update public.chatwoot_vapi_jobs set state = 'sending', vapi_chat_id = p_vapi_chat_id
    where id = p_job_id and state = 'processing' and lease_token = p_lease_token;
  return found;
end;
$$;

create function public.finish_chatwoot_vapi_job(
  p_job_id uuid, p_lease_token uuid, p_generation bigint, p_state text,
  p_outgoing_message_id bigint default null, p_vapi_chat_id text default null
) returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  c public.chatwoot_vapi_conversations%rowtype;
  j public.chatwoot_vapi_jobs%rowtype;
  op timestamptz := clock_timestamp();
begin
  if p_state is null or p_state not in ('sent', 'suppressed', 'failed', 'uncertain', 'send_uncertain') then
    raise exception 'CHATWOOT_FINISH_STATE_INVALID' using errcode = '22023';
  end if;
  select conversation.* into c from public.chatwoot_vapi_conversations conversation
    join public.chatwoot_vapi_jobs job using (account_id, conversation_id)
    where job.id = p_job_id for update of conversation;
  if not found then return false; end if;
  select * into j from public.chatwoot_vapi_jobs where id = p_job_id for update;
  if j.lease_token is distinct from p_lease_token or p_lease_token is null
    or j.generation is distinct from p_generation or j.lease_until <= op
    or c.lease_job_id is distinct from j.id then return false; end if;
  if p_state in ('sent', 'uncertain', 'send_uncertain') and j.state not in ('sending', 'uncertain') then return false; end if;
  -- Reconciliation can finish an already-started send after takeover or shutdown.
  -- It cannot resurrect the old AI context or authorize a second HTTP request.
  update public.chatwoot_vapi_jobs set state = p_state,
    outgoing_message_id = coalesce(p_outgoing_message_id, outgoing_message_id),
    vapi_chat_id = coalesce(p_vapi_chat_id, vapi_chat_id), lease_token = null, lease_until = null,
    available_at = case when p_state = 'uncertain' then op + interval '30 seconds' else available_at end,
    completed_at = case when p_state = 'uncertain' then null else op end
    where id = j.id;
  update public.chatwoot_vapi_conversations set lease_job_id = null, lease_until = null,
    previous_chat_id = case when p_state = 'sent' and c.generation = p_generation and not c.human_hold
      and coalesce(p_vapi_chat_id, j.vapi_chat_id) is not null
      then coalesce(p_vapi_chat_id, j.vapi_chat_id) else previous_chat_id end,
    previous_chat_expires_at = case when p_state = 'sent' and c.generation = p_generation and not c.human_hold
      and coalesce(p_vapi_chat_id, j.vapi_chat_id) is not null
      then op + interval '30 days' else previous_chat_expires_at end, updated_at = op
    where account_id = c.account_id and conversation_id = c.conversation_id;
  return true;
end;
$$;

create function public.retry_chatwoot_vapi_job(p_job_id uuid, p_lease_token uuid, p_generation bigint)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  c public.chatwoot_vapi_conversations%rowtype;
  j public.chatwoot_vapi_jobs%rowtype;
  op timestamptz := clock_timestamp();
begin
  select conversation.* into c from public.chatwoot_vapi_conversations conversation
    join public.chatwoot_vapi_jobs job using (account_id, conversation_id)
    where job.id = p_job_id for update of conversation;
  if not found then return false; end if;
  select * into j from public.chatwoot_vapi_jobs where id = p_job_id for update;
  if j.state <> 'processing' or j.lease_token is distinct from p_lease_token or p_lease_token is null
    or j.generation is distinct from p_generation or c.generation <> p_generation
    or j.lease_until <= op or c.lease_job_id is distinct from j.id then return false; end if;
  update public.chatwoot_vapi_jobs set state = case when attempt_count >= 3 then 'failed' else 'queued' end,
    available_at = op + interval '15 seconds', lease_token = null, lease_until = null,
    completed_at = case when attempt_count >= 3 then op else null end where id = j.id;
  update public.chatwoot_vapi_conversations set lease_job_id = null, lease_until = null, updated_at = op
    where account_id = c.account_id and conversation_id = c.conversation_id;
  return true;
end;
$$;

-- One transaction orders verified controls, checks the worker fence and applies
-- the existing opt-out claim. Never separate the order check from that mutation.
create function public.claim_chatwoot_vapi_control(
  p_job_id uuid, p_lease_token uuid, p_generation bigint, p_provider_created_at timestamptz,
  p_sender_hash text, p_previous_sender_hash text, p_body_length integer,
  p_num_media integer, p_assistant_id uuid, p_control boolean
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  c public.chatwoot_vapi_conversations%rowtype;
  j public.chatwoot_vapi_jobs%rowtype;
  latest_clock public.chatwoot_vapi_control_clocks%rowtype;
  lock_hash text;
  result jsonb;
  op timestamptz := clock_timestamp();
begin
  if p_control is null or p_provider_created_at is null or p_provider_created_at > op + interval '5 minutes'
    or p_sender_hash is null or p_sender_hash !~ '^[0-9a-f]{64}$'
    or (p_previous_sender_hash is not null and (p_previous_sender_hash !~ '^[0-9a-f]{64}$' or p_previous_sender_hash = p_sender_hash)) then
    raise exception 'CHATWOOT_CONTROL_INVALID' using errcode = '22023';
  end if;
  select conversation.* into c from public.chatwoot_vapi_conversations conversation
    join public.chatwoot_vapi_jobs job using (account_id, conversation_id)
    where job.id = p_job_id for update of conversation;
  if not found then return jsonb_build_object('stale_control', true); end if;
  select * into j from public.chatwoot_vapi_jobs where id = p_job_id for update;
  if j.state <> 'processing' or p_lease_token is null or j.lease_token is distinct from p_lease_token
    or j.generation is distinct from p_generation or c.generation <> p_generation
    or c.lease_job_id is distinct from j.id or j.lease_until <= op then
    return jsonb_build_object('stale_control', true);
  end if;
  -- Lock hash identities in deterministic order, including a previous HMAC key.
  -- Advisory locks also serialize the first INSERT, where no row exists to lock.
  for lock_hash in select distinct value from unnest(array[p_sender_hash, p_previous_sender_hash]) as hashes(value)
    where value is not null order by value
  loop
    perform pg_advisory_xact_lock(hashtextextended('chatwoot-vapi-control:' || lock_hash, 0));
  end loop;
  select * into latest_clock from public.chatwoot_vapi_control_clocks
    where sender_hash in (p_sender_hash, p_previous_sender_hash)
    order by last_verified_control_at desc, sender_hash limit 1 for update;
  if found then
    -- Merge the newest previous/current clock even when this inbound is stale;
    -- future requests using only the new hash retain the same ordering fence.
    insert into public.chatwoot_vapi_control_clocks(sender_hash, last_verified_control_at, last_verified_control_sid)
      values (p_sender_hash, latest_clock.last_verified_control_at, latest_clock.last_verified_control_sid)
      on conflict (sender_hash) do update set
        last_verified_control_at = excluded.last_verified_control_at,
        last_verified_control_sid = excluded.last_verified_control_sid, updated_at = op;
    delete from public.chatwoot_vapi_control_clocks where sender_hash = p_previous_sender_hash;
    if p_provider_created_at < latest_clock.last_verified_control_at then
      return jsonb_build_object('stale_control', true);
    end if;
  end if;
  -- The sender clock, conversation fence, and legacy opt-out mutation share one
  -- transaction. Equal-second provider timestamps use serialized receipt order;
  -- MessageSid is not a chronological clock.
  result := public.claim_whatsapp_vapi_inbound(j.message_sid, p_sender_hash, p_body_length,
    p_num_media, p_assistant_id, p_control, p_previous_sender_hash, 10);
  insert into public.chatwoot_vapi_control_clocks(sender_hash, last_verified_control_at, last_verified_control_sid)
    values (p_sender_hash, p_provider_created_at, j.message_sid)
    on conflict (sender_hash) do update set last_verified_control_at = excluded.last_verified_control_at,
      last_verified_control_sid = excluded.last_verified_control_sid, updated_at = op;
  return result;
end;
$$;

create function public.set_chatwoot_vapi_circuit_enabled(p_enabled boolean)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if p_enabled is null then raise exception 'CHATWOOT_CIRCUIT_INVALID' using errcode = '22023'; end if;
  update public.chatwoot_vapi_runtime set circuit_enabled = p_enabled, updated_at = clock_timestamp()
    where singleton_id = 1;
  return found;
end;
$$;

create function public.purge_chatwoot_vapi_metadata()
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare deleted_jobs integer; deleted_events integer;
begin
  -- Uncertain sends require an operator disposition; never erase them automatically.
  delete from public.chatwoot_vapi_jobs where retained_until <= clock_timestamp()
    and state in ('sent', 'suppressed', 'failed');
  get diagnostics deleted_jobs = row_count;
  delete from public.chatwoot_vapi_events where received_at < clock_timestamp() - interval '90 days';
  get diagnostics deleted_events = row_count;
  update public.chatwoot_vapi_conversations set previous_chat_id = null, previous_chat_expires_at = null
    where previous_chat_expires_at <= clock_timestamp();
  -- Keep compact conversation tombstones: replayed old status events must not
  -- recreate a conversation without its human-hold timestamp and generation.
  return jsonb_build_object('jobs_deleted', deleted_jobs, 'events_deleted', deleted_events);
end;
$$;

-- The schedule contains no credentials. This function resolves two named Vault
-- secrets at runtime and fails closed. Provision/enable only after deployment.
create function public.wake_chatwoot_vapi_worker()
returns bigint language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare worker_url text; worker_token text; request_id bigint;
begin
  if not exists (select 1 from public.chatwoot_vapi_runtime where singleton_id = 1 and recovery_enabled) then return null; end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into worker_url using 'chatwoot_vapi_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into worker_token using 'chatwoot_vapi_worker_token';
  if worker_url is null or worker_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/chatwoot-vapi-worker$'
    or worker_token is null or length(worker_token) < 32 then return null; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 5000)'
    into request_id using worker_url,
      jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || worker_token), '{}'::jsonb;
  return request_id;
end;
$$;

create function public.configure_chatwoot_vapi_recovery(p_enabled boolean)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare worker_url text; worker_token text; schedule_id bigint;
begin
  if p_enabled is null then raise exception 'CHATWOOT_RECOVERY_STATE_INVALID' using errcode = '22023'; end if;
  if p_enabled then
    if to_regclass('vault.decrypted_secrets') is null
      or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
      or to_regclass('cron.job') is null then
      raise exception 'CHATWOOT_RECOVERY_DEPENDENCIES_MISSING' using errcode = '55000';
    end if;
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
      into worker_url using 'chatwoot_vapi_worker_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
      into worker_token using 'chatwoot_vapi_worker_token';
    if worker_url is null or worker_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/chatwoot-vapi-worker$'
      or worker_token is null or length(worker_token) < 32 then
      raise exception 'CHATWOOT_RECOVERY_SECRETS_INVALID' using errcode = '55000';
    end if;
  end if;
  if to_regclass('cron.job') is not null then
    execute 'select jobid from cron.job where jobname = $1' into schedule_id using 'fabsy-chatwoot-vapi-recovery';
    if schedule_id is null and p_enabled then
      execute 'select cron.schedule($1,$2,$3)' into schedule_id using 'fabsy-chatwoot-vapi-recovery',
        '* * * * *', 'select public.wake_chatwoot_vapi_worker(); select public.purge_chatwoot_vapi_metadata();';
    end if;
    if schedule_id is not null then
      execute 'select cron.alter_job(job_id := $1, active := $2)' using schedule_id, p_enabled;
    end if;
  end if;
  update public.chatwoot_vapi_runtime set recovery_enabled = p_enabled, updated_at = clock_timestamp()
    where singleton_id = 1;
  return found;
end;
$$;

-- Create the minute recovery schedule inactive, even when Vault is preconfigured.
-- A transaction cannot dispatch an external call from this inactive schedule.
do $schedule$
declare schedule_id bigint;
begin
  if to_regclass('cron.job') is not null then
    execute 'select cron.schedule($1,$2,$3)' into schedule_id using 'fabsy-chatwoot-vapi-recovery',
      '* * * * *', 'select public.wake_chatwoot_vapi_worker(); select public.purge_chatwoot_vapi_metadata();';
    execute 'select cron.alter_job(job_id := $1, active := false)' using schedule_id;
  end if;
end;
$schedule$;

-- Restrict every new RPC, including operational switches, to server credentials.
do $privileges$
declare fn regprocedure;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'enqueue_chatwoot_vapi_job', 'invalidate_chatwoot_vapi_conversation', 'observe_chatwoot_vapi_conversation',
      'claim_chatwoot_vapi_job', 'current_chatwoot_vapi_job', 'mark_chatwoot_vapi_sending',
      'finish_chatwoot_vapi_job', 'retry_chatwoot_vapi_job', 'set_chatwoot_vapi_circuit_enabled',
      'purge_chatwoot_vapi_metadata', 'wake_chatwoot_vapi_worker', 'configure_chatwoot_vapi_recovery',
      'claim_chatwoot_vapi_control')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$privileges$;

commit;
