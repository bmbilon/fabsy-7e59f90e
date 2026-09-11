begin;

-- Supabase supports pg_cron in pg_catalog. Installing it idempotently keeps the
-- retention schedule part of the same deployable migration on a fresh project.
create extension if not exists pg_cron with schema pg_catalog;

create table public.whatsapp_vapi_conversations (
  sender_hash text primary key
    check (sender_hash ~ '^[0-9a-f]{64}$'),
  assistant_id uuid not null,
  previous_chat_id text
    check (previous_chat_id is null or length(previous_chat_id) between 1 and 200),
  previous_chat_expires_at timestamptz,
  opted_out_at timestamptz,
  latest_control_message_sid text
    check (latest_control_message_sid is null or latest_control_message_sid ~ '^SM[0-9A-Fa-f]{32}$'),
  processing_message_sid text
    check (processing_message_sid is null or processing_message_sid ~ '^SM[0-9A-Fa-f]{32}$'),
  processing_until timestamptz,
  rate_window_started_at timestamptz,
  rate_window_count smallint not null default 0
    check (rate_window_count between 0 and 101),
  last_inbound_at timestamptz,
  last_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((processing_message_sid is null) = (processing_until is null)),
  check ((previous_chat_id is null) = (previous_chat_expires_at is null))
);

create table public.whatsapp_vapi_messages (
  message_sid text primary key
    check (message_sid ~ '^SM[0-9A-Fa-f]{32}$'),
  sender_hash text not null references public.whatsapp_vapi_conversations(sender_hash)
    on update cascade,
  body_length integer not null check (body_length between 0 and 100000),
  num_media smallint not null default 0 check (num_media between 0 and 10),
  control_action boolean,
  state text not null default 'processing'
    check (state in (
      'processing', 'busy', 'rate_limited', 'global_rate_limited',
      'opted_out', 're_enabled', 'suppressed',
      'media_rejected', 'empty', 'replied', 'fallback'
    )),
  vapi_chat_id text
    check (vapi_chat_id is null or length(vapi_chat_id) between 1 and 200),
  reply_length integer check (reply_length is null or reply_length between 0 and 100000),
  outbound_message_sid text
    check (outbound_message_sid is null or outbound_message_sid ~ '^SM[0-9A-Fa-f]{32}$'),
  delivery_status text
    check (delivery_status is null or delivery_status ~ '^[a-z][a-z0-9_-]{0,31}$'),
  delivery_error_code text
    check (delivery_error_code is null or delivery_error_code ~ '^\d{1,10}$'),
  received_at timestamptz not null default now(),
  retained_until timestamptz not null default (now() + interval '90 days'),
  chat_authorization_reason text
    check (chat_authorization_reason is null or chat_authorization_reason in (
      'allowed', 'disabled', 'not_current', 'ten_minute_limit', 'daily_limit'
    )),
  chat_authorization_at timestamptz,
  completed_at timestamptz,
  delivery_updated_at timestamptz
);

create table public.whatsapp_vapi_runtime (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  circuit_enabled boolean not null default false,
  ten_minute_window_started_at timestamptz not null default now(),
  ten_minute_chat_count integer not null default 0
    check (ten_minute_chat_count between 0 and 1001),
  daily_window_started_at timestamptz not null default now(),
  daily_chat_count integer not null default 0
    check (daily_chat_count between 0 and 10001),
  updated_at timestamptz not null default now()
);

insert into public.whatsapp_vapi_runtime(singleton_id)
values (1);

create index whatsapp_vapi_messages_sender_received_idx
  on public.whatsapp_vapi_messages(sender_hash, received_at desc);

create index whatsapp_vapi_messages_delivery_pending_idx
  on public.whatsapp_vapi_messages(received_at)
  where outbound_message_sid is not null and delivery_status is null;

create index whatsapp_vapi_messages_retention_idx
  on public.whatsapp_vapi_messages(retained_until);

alter table public.whatsapp_vapi_conversations enable row level security;
alter table public.whatsapp_vapi_messages enable row level security;
alter table public.whatsapp_vapi_runtime enable row level security;

revoke all on public.whatsapp_vapi_conversations from public, anon, authenticated;
revoke all on public.whatsapp_vapi_messages from public, anon, authenticated;
revoke all on public.whatsapp_vapi_runtime from public, anon, authenticated;

grant select on public.whatsapp_vapi_conversations to authenticated;
grant select on public.whatsapp_vapi_messages to authenticated;
grant select on public.whatsapp_vapi_runtime to authenticated;

create policy "Staff can read WhatsApp conversation metadata"
  on public.whatsapp_vapi_conversations
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'case_manager'::public.app_role)
  );

create policy "Staff can read WhatsApp message metadata"
  on public.whatsapp_vapi_messages
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'case_manager'::public.app_role)
  );

create policy "Staff can read WhatsApp runtime status"
  on public.whatsapp_vapi_runtime
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'case_manager'::public.app_role)
  );

comment on table public.whatsapp_vapi_conversations is
  'Minimal WhatsApp/Vapi continuity metadata. Sender identity is stored only as an HMAC-SHA-256 pseudonym; no phone number or message content is stored.';
comment on table public.whatsapp_vapi_messages is
  'Twilio MessageSid dedupe and delivery metadata only. Body, profile data, raw webhook payloads, and media URLs must never be stored here.';
comment on table public.whatsapp_vapi_runtime is
  'Singleton global Vapi Chat circuit and atomic spend-quota counters. Mutations are restricted to security-definer service functions.';
comment on column public.whatsapp_vapi_conversations.previous_chat_id is
  'Latest Vapi Chat API id used as previousChatId for the next inbound message.';
comment on column public.whatsapp_vapi_conversations.assistant_id is
  'Assistant binding for previous_chat_id; switching assistants invalidates prior chat continuity.';
comment on column public.whatsapp_vapi_conversations.opted_out_at is
  'Suppresses automated replies until an explicit START/UNSTOP control message clears it.';
comment on column public.whatsapp_vapi_conversations.latest_control_message_sid is
  'Serializes STOP/START authority by atomic claim order so delayed completions cannot reverse newer control state.';
comment on column public.whatsapp_vapi_messages.control_action is
  'Control metadata only: true is STOP, false is START, and null is an ordinary message.';
comment on column public.whatsapp_vapi_messages.retained_until is
  'Metadata retention deadline. The migration schedules purge_whatsapp_vapi_metadata daily through pg_cron.';

create or replace function public.claim_whatsapp_vapi_inbound(
  p_message_sid text,
  p_sender_hash text,
  p_body_length integer,
  p_num_media integer,
  p_assistant_id uuid,
  p_control boolean,
  p_previous_sender_hash text default null,
  p_rate_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  inserted_sid text;
  duplicate_sender_hash text;
  duplicate_control boolean;
  conversation public.whatsapp_vapi_conversations%rowtype;
  conversation_found boolean;
  context_reset boolean;
  is_busy boolean;
  is_rate_limited boolean;
  next_rate_window_started_at timestamptz;
  next_rate_window_count integer;
  operation_at timestamptz := clock_timestamp();
begin
  if p_message_sid is null or p_message_sid !~ '^SM[0-9A-Fa-f]{32}$' then
    raise exception 'WHATSAPP_MESSAGE_SID_INVALID' using errcode = '22023';
  end if;
  if p_sender_hash is null or p_sender_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'WHATSAPP_SENDER_HASH_INVALID' using errcode = '22023';
  end if;
  if p_previous_sender_hash is not null and
     (p_previous_sender_hash !~ '^[0-9a-f]{64}$' or p_previous_sender_hash = p_sender_hash) then
    raise exception 'WHATSAPP_PREVIOUS_SENDER_HASH_INVALID' using errcode = '22023';
  end if;
  if p_body_length is null or p_body_length < 0 or p_body_length > 100000 then
    raise exception 'WHATSAPP_BODY_LENGTH_INVALID' using errcode = '22023';
  end if;
  if p_num_media is null or p_num_media < 0 or p_num_media > 10 then
    raise exception 'WHATSAPP_MEDIA_COUNT_INVALID' using errcode = '22023';
  end if;
  if p_assistant_id is null then
    raise exception 'WHATSAPP_ASSISTANT_ID_INVALID' using errcode = '22023';
  end if;
  if p_rate_limit is null or p_rate_limit < 1 or p_rate_limit > 100 then
    raise exception 'WHATSAPP_RATE_LIMIT_INVALID' using errcode = '22023';
  end if;

  select * into conversation
  from public.whatsapp_vapi_conversations
  where sender_hash = p_sender_hash
  for update;
  conversation_found := found;

  if conversation_found and p_previous_sender_hash is not null then
    perform 1
    from public.whatsapp_vapi_conversations
    where sender_hash = p_previous_sender_hash;
    if found then
      raise exception 'WHATSAPP_SENDER_HASH_ROTATION_CONFLICT' using errcode = '23505';
    end if;
  end if;

  if not conversation_found and p_previous_sender_hash is not null then
    select * into conversation
    from public.whatsapp_vapi_conversations
    where sender_hash = p_previous_sender_hash
    for update;
    conversation_found := found;

    if conversation_found then
      update public.whatsapp_vapi_conversations
      set sender_hash = p_sender_hash,
          updated_at = operation_at
      where sender_hash = p_previous_sender_hash;
      conversation.sender_hash := p_sender_hash;
    end if;
  end if;

  if not conversation_found then
    insert into public.whatsapp_vapi_conversations(sender_hash, assistant_id)
    values (p_sender_hash, p_assistant_id)
    on conflict (sender_hash) do nothing;

    select * into conversation
    from public.whatsapp_vapi_conversations
    where sender_hash = p_sender_hash
    for update;
    conversation_found := found;
  end if;

  if not conversation_found then
    raise exception 'WHATSAPP_CONVERSATION_CLAIM_FAILED' using errcode = '40001';
  end if;

  insert into public.whatsapp_vapi_messages(
    message_sid, sender_hash, body_length, num_media, control_action
  ) values (
    p_message_sid, p_sender_hash, p_body_length, p_num_media, p_control
  )
  on conflict (message_sid) do nothing
  returning message_sid into inserted_sid;

  if inserted_sid is null then
    select sender_hash, control_action
    into duplicate_sender_hash, duplicate_control
    from public.whatsapp_vapi_messages
    where message_sid = p_message_sid;
    if not found or duplicate_sender_hash <> p_sender_hash then
      raise exception 'WHATSAPP_MESSAGE_SID_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'duplicate', true,
      'control', duplicate_control
    );
  end if;

  context_reset := conversation.assistant_id <> p_assistant_id
    or (conversation.previous_chat_expires_at is not null and
        conversation.previous_chat_expires_at <= operation_at);

  if conversation.rate_window_started_at is null or
     conversation.rate_window_started_at <= operation_at - interval '10 minutes' then
    next_rate_window_started_at := operation_at;
    next_rate_window_count := 1;
  else
    next_rate_window_started_at := conversation.rate_window_started_at;
    next_rate_window_count := least(conversation.rate_window_count + 1, 101);
  end if;
  is_rate_limited := next_rate_window_count > p_rate_limit;

  is_busy := p_control is null
    and not context_reset
    and conversation.processing_message_sid is not null
    and conversation.processing_message_sid <> p_message_sid
    and conversation.processing_until > operation_at;

  update public.whatsapp_vapi_conversations
  set assistant_id = p_assistant_id,
      previous_chat_id = case
        when p_control is not null or context_reset then null
        else previous_chat_id
      end,
      previous_chat_expires_at = case
        when p_control is not null or context_reset then null
        else previous_chat_expires_at
      end,
      opted_out_at = case
        when p_control is true then operation_at
        when p_control is false then null
        else opted_out_at
      end,
      latest_control_message_sid = case
        when p_control is not null then p_message_sid
        else latest_control_message_sid
      end,
      processing_message_sid = case
        when p_control is not null or not is_busy then p_message_sid
        else processing_message_sid
      end,
      processing_until = case
        when p_control is not null or not is_busy then operation_at + interval '30 seconds'
        else processing_until
      end,
      rate_window_started_at = next_rate_window_started_at,
      rate_window_count = next_rate_window_count,
      last_inbound_at = operation_at,
      updated_at = operation_at
  where sender_hash = p_sender_hash;

  return jsonb_build_object(
    'duplicate', false,
    'busy', is_busy,
    'rate_limited', is_rate_limited,
    'opted_out', case
      when p_control is true then true
      when p_control is false then false
      else conversation.opted_out_at is not null
    end,
    'previous_chat_id', case
      when p_control is not null or context_reset then null
      else conversation.previous_chat_id
    end
  );
end;
$$;

create or replace function public.authorize_whatsapp_vapi_chat(
  p_message_sid text,
  p_sender_hash text,
  p_limit_per_ten_minutes integer default 60,
  p_limit_per_day integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  conversation public.whatsapp_vapi_conversations%rowtype;
  message_state text;
  existing_reason text;
  runtime public.whatsapp_vapi_runtime%rowtype;
  operation_at timestamptz := clock_timestamp();
  next_ten_minute_window timestamptz;
  next_ten_minute_count integer;
  next_daily_window timestamptz;
  next_daily_count integer;
  authorization_reason text;
begin
  if p_message_sid is null or p_message_sid !~ '^SM[0-9A-Fa-f]{32}$' then
    raise exception 'WHATSAPP_MESSAGE_SID_INVALID' using errcode = '22023';
  end if;
  if p_sender_hash is null or p_sender_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'WHATSAPP_SENDER_HASH_INVALID' using errcode = '22023';
  end if;
  if p_limit_per_ten_minutes is null or
     p_limit_per_ten_minutes < 1 or p_limit_per_ten_minutes > 1000 then
    raise exception 'WHATSAPP_GLOBAL_TEN_MINUTE_LIMIT_INVALID' using errcode = '22023';
  end if;
  if p_limit_per_day is null or p_limit_per_day < 1 or p_limit_per_day > 10000 then
    raise exception 'WHATSAPP_GLOBAL_DAILY_LIMIT_INVALID' using errcode = '22023';
  end if;

  select * into conversation
  from public.whatsapp_vapi_conversations
  where sender_hash = p_sender_hash
  for update;
  if not found then
    raise exception 'WHATSAPP_CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select state, chat_authorization_reason
  into message_state, existing_reason
  from public.whatsapp_vapi_messages
  where message_sid = p_message_sid
    and sender_hash = p_sender_hash
  for update;
  if not found or message_state <> 'processing' then
    raise exception 'WHATSAPP_MESSAGE_NOT_AUTHORIZABLE' using errcode = '55000';
  end if;

  if existing_reason is not null then
    if conversation.opted_out_at is not null or
       conversation.processing_message_sid <> p_message_sid or
       conversation.processing_until <= operation_at then
      return jsonb_build_object('allowed', false, 'reason', 'not_current');
    end if;
    return jsonb_build_object(
      'allowed', existing_reason = 'allowed',
      'reason', existing_reason
    );
  end if;

  if conversation.opted_out_at is not null or
     conversation.processing_message_sid <> p_message_sid or
     conversation.processing_until <= operation_at then
    authorization_reason := 'not_current';
  else
    select * into runtime
    from public.whatsapp_vapi_runtime
    where singleton_id = 1
    for update;
    if not found then
      raise exception 'WHATSAPP_RUNTIME_NOT_FOUND' using errcode = 'P0002';
    end if;

    if runtime.ten_minute_window_started_at <= operation_at - interval '10 minutes' then
      next_ten_minute_window := operation_at;
      next_ten_minute_count := 0;
    else
      next_ten_minute_window := runtime.ten_minute_window_started_at;
      next_ten_minute_count := runtime.ten_minute_chat_count;
    end if;
    if runtime.daily_window_started_at <= operation_at - interval '1 day' then
      next_daily_window := operation_at;
      next_daily_count := 0;
    else
      next_daily_window := runtime.daily_window_started_at;
      next_daily_count := runtime.daily_chat_count;
    end if;

    authorization_reason := case
      when not runtime.circuit_enabled then 'disabled'
      when next_ten_minute_count >= p_limit_per_ten_minutes then 'ten_minute_limit'
      when next_daily_count >= p_limit_per_day then 'daily_limit'
      else 'allowed'
    end;

    if authorization_reason = 'allowed' then
      next_ten_minute_count := next_ten_minute_count + 1;
      next_daily_count := next_daily_count + 1;
    end if;

    update public.whatsapp_vapi_runtime
    set ten_minute_window_started_at = next_ten_minute_window,
        ten_minute_chat_count = next_ten_minute_count,
        daily_window_started_at = next_daily_window,
        daily_chat_count = next_daily_count,
        updated_at = operation_at
    where singleton_id = 1;
  end if;

  update public.whatsapp_vapi_messages
  set chat_authorization_reason = authorization_reason,
      chat_authorization_at = operation_at
  where message_sid = p_message_sid
    and sender_hash = p_sender_hash;

  return jsonb_build_object(
    'allowed', authorization_reason = 'allowed',
    'reason', authorization_reason
  );
end;
$$;

create or replace function public.set_whatsapp_vapi_circuit_enabled(
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_enabled is null then
    raise exception 'WHATSAPP_CIRCUIT_STATE_INVALID' using errcode = '22023';
  end if;

  update public.whatsapp_vapi_runtime
  set circuit_enabled = p_enabled,
      updated_at = clock_timestamp()
  where singleton_id = 1;
  return found;
end;
$$;

create or replace function public.complete_whatsapp_vapi_inbound(
  p_message_sid text,
  p_sender_hash text,
  p_state text,
  p_vapi_chat_id text,
  p_reply_length integer,
  p_set_opted_out boolean default null,
  p_reset_chat boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  conversation public.whatsapp_vapi_conversations%rowtype;
  message_updated boolean;
  reply_allowed boolean;
  effective_state text;
  effective_vapi_chat_id text;
  effective_reply_length integer;
  current_message_state text;
  current_control_action boolean;
begin
  if p_message_sid is null or p_message_sid !~ '^SM[0-9A-Fa-f]{32}$' then
    raise exception 'WHATSAPP_MESSAGE_SID_INVALID' using errcode = '22023';
  end if;
  if p_sender_hash is null or p_sender_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'WHATSAPP_SENDER_HASH_INVALID' using errcode = '22023';
  end if;
  if p_state is null or p_state not in (
    'busy', 'rate_limited', 'global_rate_limited', 'opted_out', 're_enabled',
    'suppressed', 'media_rejected',
    'empty', 'replied', 'fallback'
  ) then
    raise exception 'WHATSAPP_COMPLETION_STATE_INVALID' using errcode = '22023';
  end if;
  if p_vapi_chat_id is not null and length(p_vapi_chat_id) not between 1 and 200 then
    raise exception 'WHATSAPP_VAPI_CHAT_ID_INVALID' using errcode = '22023';
  end if;
  if p_state = 'replied' and p_vapi_chat_id is null then
    raise exception 'WHATSAPP_VAPI_CHAT_ID_REQUIRED' using errcode = '22023';
  end if;
  if p_reply_length is null or p_reply_length < 0 or p_reply_length > 100000 then
    raise exception 'WHATSAPP_REPLY_LENGTH_INVALID' using errcode = '22023';
  end if;

  select * into conversation
  from public.whatsapp_vapi_conversations
  where sender_hash = p_sender_hash
  for update;

  if not found then
    return jsonb_build_object('completed', false, 'reply_allowed', false);
  end if;

  select state, control_action
  into current_message_state, current_control_action
  from public.whatsapp_vapi_messages
  where message_sid = p_message_sid
    and sender_hash = p_sender_hash
  for update;

  if not found then
    return jsonb_build_object('completed', false, 'reply_allowed', false);
  end if;
  if current_control_action is distinct from p_set_opted_out then
    return jsonb_build_object('completed', false, 'reply_allowed', false);
  end if;
  if current_message_state <> 'processing' then
    if p_set_opted_out is not null and current_message_state in (p_state, 'suppressed') then
      return jsonb_build_object('completed', true, 'reply_allowed', false);
    end if;
    return jsonb_build_object('completed', false, 'reply_allowed', false);
  end if;

  -- Controls may acknowledge and invalidate an older lease. A busy notice does
  -- not own the lease. Every other outbound message needs the current, unexpired
  -- lease and is suppressed if STOP or a newer inbound claim won the row lock.
  reply_allowed := (
      p_set_opted_out is not null
      and conversation.latest_control_message_sid = p_message_sid
    )
    or (
      p_set_opted_out is null
      and
      conversation.opted_out_at is null
      and (
        p_state in ('busy', 'rate_limited')
        or (
          conversation.processing_message_sid = p_message_sid
          and conversation.processing_until > clock_timestamp()
        )
      )
    );
  effective_state := case when reply_allowed then p_state else 'suppressed' end;
  effective_vapi_chat_id := case
    when reply_allowed and p_state = 'replied' then p_vapi_chat_id
    else null
  end;
  effective_reply_length := case when reply_allowed then p_reply_length else 0 end;

  update public.whatsapp_vapi_messages
  set state = effective_state,
      vapi_chat_id = effective_vapi_chat_id,
      reply_length = effective_reply_length,
      completed_at = clock_timestamp()
  where message_sid = p_message_sid
    and sender_hash = p_sender_hash;
  message_updated := found;

  if not message_updated then
    return jsonb_build_object('completed', false, 'reply_allowed', false);
  end if;

  update public.whatsapp_vapi_conversations
  set previous_chat_id = case
        when reply_allowed and p_reset_chat and processing_message_sid = p_message_sid then null
        when reply_allowed and p_state = 'replied' then p_vapi_chat_id
        else previous_chat_id
      end,
      previous_chat_expires_at = case
        when reply_allowed and p_reset_chat and processing_message_sid = p_message_sid then null
        when reply_allowed and p_state = 'replied' then clock_timestamp() + interval '30 days'
        else previous_chat_expires_at
      end,
      opted_out_at = case
        when reply_allowed and p_set_opted_out is true then coalesce(opted_out_at, clock_timestamp())
        when reply_allowed and p_set_opted_out is false then null
        else opted_out_at
      end,
      processing_message_sid = case
        when processing_message_sid = p_message_sid then null
        else processing_message_sid
      end,
      processing_until = case
        when processing_message_sid = p_message_sid then null
        else processing_until
      end,
      last_reply_at = case
        when reply_allowed and effective_reply_length > 0 then clock_timestamp()
        else last_reply_at
      end,
      updated_at = clock_timestamp()
  where sender_hash = p_sender_hash;

  return jsonb_build_object(
    'completed', true,
    'reply_allowed', reply_allowed
  );
end;
$$;

create or replace function public.record_whatsapp_vapi_status(
  p_inbound_message_sid text,
  p_outbound_message_sid text,
  p_status text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  current_outbound_message_sid text;
  current_status text;
  current_rank integer;
  new_rank integer;
begin
  if p_inbound_message_sid is null or p_inbound_message_sid !~ '^SM[0-9A-Fa-f]{32}$' or
     p_outbound_message_sid is null or p_outbound_message_sid !~ '^SM[0-9A-Fa-f]{32}$' then
    raise exception 'WHATSAPP_STATUS_SID_INVALID' using errcode = '22023';
  end if;
  if p_status is null or p_status !~ '^[a-z][a-z0-9_-]{0,31}$' then
    raise exception 'WHATSAPP_DELIVERY_STATUS_INVALID' using errcode = '22023';
  end if;
  if p_error_code is not null and p_error_code !~ '^\d{1,10}$' then
    raise exception 'WHATSAPP_DELIVERY_ERROR_INVALID' using errcode = '22023';
  end if;

  select outbound_message_sid, delivery_status
  into current_outbound_message_sid, current_status
  from public.whatsapp_vapi_messages
  where message_sid = p_inbound_message_sid
  for update;

  if not found or (
    current_outbound_message_sid is not null and
    current_outbound_message_sid <> p_outbound_message_sid
  ) then
    return false;
  end if;

  current_rank := case current_status
    when 'queued' then 10
    when 'accepted' then 20
    when 'scheduled' then 20
    when 'sending' then 30
    when 'sent' then 40
    when 'delivered' then 50
    when 'read' then 60
    when 'canceled' then 100
    when 'failed' then 100
    when 'undelivered' then 100
    else 0
  end;
  new_rank := case p_status
    when 'queued' then 10
    when 'accepted' then 20
    when 'scheduled' then 20
    when 'sending' then 30
    when 'sent' then 40
    when 'delivered' then 50
    when 'read' then 60
    when 'canceled' then 100
    when 'failed' then 100
    when 'undelivered' then 100
    else 0
  end;

  if current_status is null or current_status = p_status or new_rank > current_rank then
    update public.whatsapp_vapi_messages
    set outbound_message_sid = coalesce(outbound_message_sid, p_outbound_message_sid),
        delivery_status = p_status,
        delivery_error_code = p_error_code,
        delivery_updated_at = clock_timestamp()
    where message_sid = p_inbound_message_sid;
  end if;

  -- A valid stale/retried callback is acknowledged without regressing state.
  return true;
end;
$$;

create or replace function public.purge_whatsapp_vapi_metadata()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  messages_deleted integer;
  chats_cleared integer;
  leases_cleared integer;
  conversations_deleted integer;
  operation_at timestamptz := clock_timestamp();
begin
  delete from public.whatsapp_vapi_messages
  where retained_until <= operation_at;
  get diagnostics messages_deleted = row_count;

  update public.whatsapp_vapi_conversations
  set previous_chat_id = null,
      previous_chat_expires_at = null,
      updated_at = operation_at
  where previous_chat_expires_at is not null
    and previous_chat_expires_at <= operation_at;
  get diagnostics chats_cleared = row_count;

  update public.whatsapp_vapi_conversations
  set processing_message_sid = null,
      processing_until = null,
      updated_at = operation_at
  where processing_until is not null
    and processing_until <= operation_at;
  get diagnostics leases_cleared = row_count;

  delete from public.whatsapp_vapi_conversations as conversation
  where conversation.opted_out_at is null
    and conversation.processing_message_sid is null
    and coalesce(conversation.last_inbound_at, conversation.created_at)
      <= operation_at - interval '90 days'
    and not exists (
      select 1
      from public.whatsapp_vapi_messages as message
      where message.sender_hash = conversation.sender_hash
    );
  get diagnostics conversations_deleted = row_count;

  return jsonb_build_object(
    'messages_deleted', messages_deleted,
    'chats_cleared', chats_cleared,
    'leases_cleared', leases_cleared,
    'conversations_deleted', conversations_deleted
  );
end;
$$;

do $whatsapp_purge_schedule$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'fabsy-whatsapp-vapi-metadata-purge'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'fabsy-whatsapp-vapi-metadata-purge',
    '17 3 * * *',
    'select public.purge_whatsapp_vapi_metadata();'
  );
end;
$whatsapp_purge_schedule$;

-- Transactional smoke assertions for the launch-critical STOP/START race and
-- non-regressing delivery status. Test rows are removed before commit.
do $whatsapp_migration_assertions$
declare
  test_sender_hash text := repeat('a', 64);
  start_then_stop_hash text := repeat('b', 64);
  stop_then_start_hash text := repeat('c', 64);
  global_allowed_hash text := repeat('d', 64);
  global_limited_hash text := repeat('e', 64);
  global_disabled_hash text := repeat('f', 64);
  global_daily_hash text := repeat('0', 64);
  purge_stale_hash text := repeat('1', 64);
  first_sid text := 'SM11111111111111111111111111111111';
  stop_sid text := 'SM22222222222222222222222222222222';
  start_sid text := 'SM33333333333333333333333333333333';
  outbound_sid text := 'SM44444444444444444444444444444444';
  old_start_sid text := 'SM55555555555555555555555555555555';
  new_stop_sid text := 'SM66666666666666666666666666666666';
  old_stop_sid text := 'SM77777777777777777777777777777777';
  new_start_sid text := 'SM88888888888888888888888888888888';
  global_allowed_sid text := 'SM99999999999999999999999999999999';
  global_limited_sid text := 'SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  global_disabled_sid text := 'SMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  global_daily_sid text := 'SMcccccccccccccccccccccccccccccccc';
  purge_stale_sid text := 'SMdddddddddddddddddddddddddddddddd';
  test_assistant_id uuid := '672c362f-c501-4cff-9c2b-977868dad856';
  result jsonb;
  stored_chat_id text;
  stored_opted_out_at timestamptz;
  stored_latest_control_sid text;
  stored_status text;
  stored_count integer;
begin
  select public.claim_whatsapp_vapi_inbound(
    first_sid, test_sender_hash, 5, 0, test_assistant_id, null, null, 10
  ) into result;
  if result ->> 'busy' <> 'false' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_FIRST_CLAIM';
  end if;

  select public.claim_whatsapp_vapi_inbound(
    stop_sid, test_sender_hash, 4, 0, test_assistant_id, true, null, 10
  ) into result;
  if result ->> 'busy' <> 'false' or result ->> 'opted_out' <> 'true' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STOP_CLAIM';
  end if;

  select public.complete_whatsapp_vapi_inbound(
    stop_sid, test_sender_hash, 'opted_out', null, 30, true, true
  ) into result;
  if result ->> 'reply_allowed' <> 'true' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STOP_ALLOWED';
  end if;

  select public.complete_whatsapp_vapi_inbound(
    stop_sid, test_sender_hash, 'opted_out', null, 30, true, true
  ) into result;
  if result ->> 'completed' <> 'true' or result ->> 'reply_allowed' <> 'false' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STOP_IDEMPOTENCE';
  end if;

  select public.claim_whatsapp_vapi_inbound(
    start_sid, test_sender_hash, 5, 0, test_assistant_id, false, null, 10
  ) into result;
  if result ->> 'opted_out' <> 'false' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_START_CLAIM';
  end if;

  select public.complete_whatsapp_vapi_inbound(
    start_sid, test_sender_hash, 're_enabled', null, 30, false, true
  ) into result;
  if result ->> 'reply_allowed' <> 'true' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_START_ALLOWED';
  end if;

  -- The old first request no longer owns the lease after STOP/START and cannot
  -- reply or restore an earlier Vapi chat even though opt-out is now cleared.
  select public.complete_whatsapp_vapi_inbound(
    first_sid, test_sender_hash, 'replied', 'stale_chat', 25, null, false
  ) into result;
  if result ->> 'reply_allowed' <> 'false' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STALE_REPLY_SUPPRESSED';
  end if;

  select previous_chat_id, opted_out_at
  into stored_chat_id, stored_opted_out_at
  from public.whatsapp_vapi_conversations
  where sender_hash = test_sender_hash;
  if stored_chat_id is not null or stored_opted_out_at is not null then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STALE_STATE_RESTORED';
  end if;

  perform public.record_whatsapp_vapi_status(
    start_sid, outbound_sid, 'delivered', null
  );
  perform public.record_whatsapp_vapi_status(
    start_sid, outbound_sid, 'sent', null
  );
  select delivery_status into stored_status
  from public.whatsapp_vapi_messages
  where message_sid = start_sid;
  if stored_status <> 'delivered' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STATUS_REGRESSION';
  end if;

  -- A delayed older START cannot reverse a newer STOP.
  perform public.claim_whatsapp_vapi_inbound(
    old_start_sid, start_then_stop_hash, 5, 0, test_assistant_id, false, null, 10
  );
  perform public.claim_whatsapp_vapi_inbound(
    new_stop_sid, start_then_stop_hash, 4, 0, test_assistant_id, true, null, 10
  );
  select public.complete_whatsapp_vapi_inbound(
    old_start_sid, start_then_stop_hash, 're_enabled', null, 30, false, true
  ) into result;
  if result ->> 'reply_allowed' <> 'false' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STALE_START_ALLOWED';
  end if;
  select public.complete_whatsapp_vapi_inbound(
    old_start_sid, start_then_stop_hash, 're_enabled', null, 30, false, true
  ) into result;
  if result ->> 'completed' <> 'true' or result ->> 'reply_allowed' <> 'false' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STALE_START_NOT_IDEMPOTENT';
  end if;
  select opted_out_at, latest_control_message_sid
  into stored_opted_out_at, stored_latest_control_sid
  from public.whatsapp_vapi_conversations
  where sender_hash = start_then_stop_hash;
  if stored_opted_out_at is null or stored_latest_control_sid <> new_stop_sid then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STALE_START_REVERSED_STOP';
  end if;

  -- A delayed older STOP cannot reverse a newer START.
  perform public.claim_whatsapp_vapi_inbound(
    old_stop_sid, stop_then_start_hash, 4, 0, test_assistant_id, true, null, 10
  );
  perform public.claim_whatsapp_vapi_inbound(
    new_start_sid, stop_then_start_hash, 5, 0, test_assistant_id, false, null, 10
  );
  select public.complete_whatsapp_vapi_inbound(
    old_stop_sid, stop_then_start_hash, 'opted_out', null, 30, true, true
  ) into result;
  if result ->> 'reply_allowed' <> 'false' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STALE_STOP_ALLOWED';
  end if;
  select public.complete_whatsapp_vapi_inbound(
    old_stop_sid, stop_then_start_hash, 'opted_out', null, 30, true, true
  ) into result;
  if result ->> 'completed' <> 'true' or result ->> 'reply_allowed' <> 'false' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STALE_STOP_NOT_IDEMPOTENT';
  end if;
  select opted_out_at, latest_control_message_sid
  into stored_opted_out_at, stored_latest_control_sid
  from public.whatsapp_vapi_conversations
  where sender_hash = stop_then_start_hash;
  if stored_opted_out_at is not null or stored_latest_control_sid <> new_start_sid then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_STALE_STOP_REVERSED_START';
  end if;

  -- Global authorization is atomic, MessageSid-idempotent, bounded, and starts
  -- disabled until a controlled launch explicitly enables the circuit.
  perform public.set_whatsapp_vapi_circuit_enabled(true);
  perform public.claim_whatsapp_vapi_inbound(
    global_allowed_sid, global_allowed_hash, 5, 0,
    test_assistant_id, null, null, 10
  );
  select public.authorize_whatsapp_vapi_chat(
    global_allowed_sid, global_allowed_hash, 1, 2
  ) into result;
  if result ->> 'allowed' <> 'true' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_GLOBAL_FIRST_DENIED';
  end if;
  perform public.authorize_whatsapp_vapi_chat(
    global_allowed_sid, global_allowed_hash, 1, 2
  );
  select ten_minute_chat_count into stored_count
  from public.whatsapp_vapi_runtime
  where singleton_id = 1;
  if stored_count <> 1 then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_GLOBAL_NOT_IDEMPOTENT';
  end if;

  perform public.claim_whatsapp_vapi_inbound(
    global_limited_sid, global_limited_hash, 5, 0,
    test_assistant_id, null, null, 10
  );
  select public.authorize_whatsapp_vapi_chat(
    global_limited_sid, global_limited_hash, 1, 2
  ) into result;
  if result ->> 'reason' <> 'ten_minute_limit' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_GLOBAL_TEN_MINUTE_LIMIT';
  end if;

  perform public.set_whatsapp_vapi_circuit_enabled(false);
  perform public.claim_whatsapp_vapi_inbound(
    global_disabled_sid, global_disabled_hash, 5, 0,
    test_assistant_id, null, null, 10
  );
  select public.authorize_whatsapp_vapi_chat(
    global_disabled_sid, global_disabled_hash, 60, 500
  ) into result;
  if result ->> 'reason' <> 'disabled' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_GLOBAL_CIRCUIT';
  end if;

  perform public.set_whatsapp_vapi_circuit_enabled(true);
  update public.whatsapp_vapi_runtime
  set ten_minute_window_started_at = clock_timestamp() - interval '11 minutes',
      ten_minute_chat_count = 0,
      daily_window_started_at = clock_timestamp(),
      daily_chat_count = 1
  where singleton_id = 1;
  perform public.claim_whatsapp_vapi_inbound(
    global_daily_sid, global_daily_hash, 5, 0,
    test_assistant_id, null, null, 10
  );
  select public.authorize_whatsapp_vapi_chat(
    global_daily_sid, global_daily_hash, 60, 1
  ) into result;
  if result ->> 'reason' <> 'daily_limit' then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_GLOBAL_DAILY_LIMIT';
  end if;

  -- An abandoned processing lease cannot retain otherwise-expired metadata.
  perform public.claim_whatsapp_vapi_inbound(
    purge_stale_sid, purge_stale_hash, 5, 0,
    test_assistant_id, null, null, 10
  );
  update public.whatsapp_vapi_messages
  set retained_until = clock_timestamp() - interval '1 second'
  where message_sid = purge_stale_sid;
  update public.whatsapp_vapi_conversations
  set last_inbound_at = clock_timestamp() - interval '91 days',
      processing_until = clock_timestamp() - interval '1 second'
  where sender_hash = purge_stale_hash;
  perform public.purge_whatsapp_vapi_metadata();
  if exists (
    select 1 from public.whatsapp_vapi_conversations
    where sender_hash = purge_stale_hash
  ) or exists (
    select 1 from public.whatsapp_vapi_messages
    where message_sid = purge_stale_sid
  ) then
    raise exception 'WHATSAPP_MIGRATION_ASSERT_EXPIRED_LEASE_RETAINED';
  end if;

  update public.whatsapp_vapi_runtime
  set circuit_enabled = false,
      ten_minute_window_started_at = clock_timestamp(),
      ten_minute_chat_count = 0,
      daily_window_started_at = clock_timestamp(),
      daily_chat_count = 0,
      updated_at = clock_timestamp()
  where singleton_id = 1;

  delete from public.whatsapp_vapi_messages
  where sender_hash in (
    test_sender_hash, start_then_stop_hash, stop_then_start_hash,
    global_allowed_hash, global_limited_hash, global_disabled_hash,
    global_daily_hash, purge_stale_hash
  );
  delete from public.whatsapp_vapi_conversations
  where sender_hash in (
    test_sender_hash, start_then_stop_hash, stop_then_start_hash,
    global_allowed_hash, global_limited_hash, global_disabled_hash,
    global_daily_hash, purge_stale_hash
  );
end;
$whatsapp_migration_assertions$;

revoke all on function public.claim_whatsapp_vapi_inbound(text, text, integer, integer, uuid, boolean, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_whatsapp_vapi_inbound(text, text, text, text, integer, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.authorize_whatsapp_vapi_chat(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.set_whatsapp_vapi_circuit_enabled(boolean)
  from public, anon, authenticated;
revoke all on function public.record_whatsapp_vapi_status(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.purge_whatsapp_vapi_metadata()
  from public, anon, authenticated;

grant execute on function public.claim_whatsapp_vapi_inbound(text, text, integer, integer, uuid, boolean, text, integer)
  to service_role;
grant execute on function public.complete_whatsapp_vapi_inbound(text, text, text, text, integer, boolean, boolean)
  to service_role;
grant execute on function public.authorize_whatsapp_vapi_chat(text, text, integer, integer)
  to service_role;
grant execute on function public.set_whatsapp_vapi_circuit_enabled(boolean)
  to service_role;
grant execute on function public.record_whatsapp_vapi_status(text, text, text, text)
  to service_role;
grant execute on function public.purge_whatsapp_vapi_metadata()
  to service_role;

commit;
