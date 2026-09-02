-- Private, consent-gated Meta Conversions API handoff for paid checkouts.
--
-- The raw Stripe Checkout Session id never enters the database. Callers hash it
-- with SHA-256 before using these RPCs. No contact, ticket, case, upload, or
-- user-authored data is accepted by this schema.
begin;

create schema if not exists meta_private;
revoke all on schema meta_private from public, anon, authenticated, service_role;

create table meta_private.meta_checkout_attribution (
  session_hash text primary key,
  consent_version text not null,
  consented_at timestamptz not null,
  fbp text,
  fbc text,
  client_user_agent text,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  constraint meta_checkout_attribution_session_hash_check
    check (session_hash ~ '^[0-9a-f]{64}$'),
  constraint meta_checkout_attribution_consent_version_check
    check (
      octet_length(consent_version) between 1 and 64
      and consent_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
    ),
  constraint meta_checkout_attribution_consent_time_check
    check (consented_at >= timestamptz '2024-01-01 00:00:00+00'),
  constraint meta_checkout_attribution_withdrawn_time_check
    check (withdrawn_at is null or withdrawn_at >= timestamptz '2024-01-01 00:00:00+00'),
  constraint meta_checkout_attribution_fbp_check
    check (
      fbp is null or (
        octet_length(fbp) between 1 and 255
        and fbp ~ '^fb\.[0-9]{1,3}\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,200}$'
      )
    ),
  constraint meta_checkout_attribution_fbc_check
    check (
      fbc is null or (
        octet_length(fbc) between 1 and 255
        and fbc ~ '^fb\.[0-9]{1,3}\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,200}$'
      )
    ),
  constraint meta_checkout_attribution_user_agent_check
    check (
      client_user_agent is null or (
        length(client_user_agent) between 1 and 512
        and octet_length(client_user_agent) <= 1024
        and client_user_agent !~ '[[:cntrl:]]'
      )
    ),
  constraint meta_checkout_attribution_match_key_check
    check (
      (client_user_agent is not null and (fbp is not null or fbc is not null))
      or (client_user_agent is null and fbp is null and fbc is null)
    )
);

create table meta_private.meta_capi_outbox (
  id uuid primary key default gen_random_uuid(),
  event_name text not null default 'Purchase',
  session_hash text not null references meta_private.meta_checkout_attribution(session_hash) on delete restrict,
  event_id text generated always as (session_hash) stored,
  event_time timestamptz not null,
  value_cents integer not null,
  currency text not null default 'CAD',
  content_id text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claimed_at timestamptz,
  send_started_at timestamptz,
  lease_expires_at timestamptz,
  last_error_code text,
  last_http_status integer,
  last_error_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_capi_outbox_purchase_only_check check (event_name = 'Purchase'),
  constraint meta_capi_outbox_event_id_check check (event_id = session_hash),
  constraint meta_capi_outbox_value_check check (
    (content_id = 'rapid_resolution' and value_cents in (19800, 15840))
    or (content_id = 'rapid_resolution_bundle' and value_cents in (22900, 18320))
  ),
  constraint meta_capi_outbox_currency_check check (currency = 'CAD'),
  constraint meta_capi_outbox_content_id_check
    check (content_id in ('rapid_resolution', 'rapid_resolution_bundle')),
  constraint meta_capi_outbox_status_check check (status in ('pending', 'processing', 'sending', 'sent', 'dead')),
  -- Retryable delivery is bounded by the seven-day event-age window below,
  -- rather than by an attempt count that could discard a prolonged outage.
  constraint meta_capi_outbox_attempts_check check (attempts >= 0),
  constraint meta_capi_outbox_http_status_check
    check (last_http_status is null or last_http_status between 100 and 599),
  constraint meta_capi_outbox_error_code_check
    check (
      last_error_code is null
      or last_error_code in (
        'network_error',
        'request_timeout',
        'invalid_response',
        'zero_events_received',
        'worker_exception',
        'consent_withdrawn',
        'delivery_window_expired'
      )
      or last_error_code ~ '^meta_http_[0-9]{3}$'
      or last_error_code ~ '^meta_graph_[0-9]{1,10}$'
    ),
  constraint meta_capi_outbox_claim_state_check
    check (
      (
        status = 'processing'
        and claim_token is not null
        and claimed_at is not null
        and send_started_at is null
        and lease_expires_at is not null
      )
      or (
        status = 'sending'
        and claim_token is not null
        and claimed_at is not null
        and send_started_at is not null
        and lease_expires_at is not null
      )
      or (
        status not in ('processing', 'sending')
        and claim_token is null
        and claimed_at is null
        and send_started_at is null
        and lease_expires_at is null
      )
    ),
  constraint meta_capi_outbox_sent_state_check
    check ((status = 'sent' and sent_at is not null) or (status <> 'sent' and sent_at is null)),
  constraint meta_capi_outbox_purchase_session_unique unique (event_name, session_hash)
);

create index meta_capi_outbox_claim_idx
  on meta_private.meta_capi_outbox(next_attempt_at, created_at, id)
  where status in ('pending', 'processing', 'sending');

alter table meta_private.meta_checkout_attribution enable row level security;
alter table meta_private.meta_capi_outbox enable row level security;

revoke all on all tables in schema meta_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema meta_private from public, anon, authenticated, service_role;

create or replace function public.record_meta_checkout_attribution(
  p_session_hash text,
  p_consent_version text,
  p_consented_at timestamptz,
  p_client_user_agent text,
  p_fbp text default null,
  p_fbc text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing meta_private.meta_checkout_attribution%rowtype;
  affected integer;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'META_ATTRIBUTION_SESSION_HASH_INVALID';
  end if;
  if p_consent_version is null
    or octet_length(p_consent_version) not between 1 and 64
    or p_consent_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' then
    raise exception 'META_ATTRIBUTION_CONSENT_VERSION_INVALID';
  end if;
  if p_consented_at is null
    or p_consented_at < timestamptz '2024-01-01 00:00:00+00'
    or p_consented_at <= clock_timestamp() - interval '180 days'
    or p_consented_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'META_ATTRIBUTION_CONSENT_TIME_INVALID';
  end if;
  if p_client_user_agent is null
    or length(p_client_user_agent) not between 1 and 512
    or octet_length(p_client_user_agent) > 1024
    or p_client_user_agent ~ '[[:cntrl:]]' then
    raise exception 'META_ATTRIBUTION_USER_AGENT_INVALID';
  end if;
  if p_fbp is not null and (
    octet_length(p_fbp) not between 1 and 255
    or p_fbp !~ '^fb\.[0-9]{1,3}\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,200}$'
  ) then
    raise exception 'META_ATTRIBUTION_FBP_INVALID';
  end if;
  if p_fbc is not null and (
    octet_length(p_fbc) not between 1 and 255
    or p_fbc !~ '^fb\.[0-9]{1,3}\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,200}$'
  ) then
    raise exception 'META_ATTRIBUTION_FBC_INVALID';
  end if;
  if p_fbp is null and p_fbc is null then
    raise exception 'META_ATTRIBUTION_BROWSER_ID_REQUIRED';
  end if;

  select * into existing
  from meta_private.meta_checkout_attribution attribution
  where attribution.session_hash = p_session_hash
  for update;

  if existing.session_hash is not null and exists (
    select 1
    from meta_private.meta_capi_outbox queued
    where queued.event_name = 'Purchase' and queued.session_hash = p_session_hash
  ) then
    -- Successful or terminal delivery cleanup deliberately removes identifiers.
    -- A replay must never put them back after an outbox row exists.
    if existing.client_user_agent is null then
      return false;
    end if;
    if existing.consent_version is distinct from p_consent_version
      or existing.consented_at is distinct from p_consented_at
      or existing.fbp is distinct from p_fbp
      or existing.fbc is distinct from p_fbc
      or existing.client_user_agent is distinct from p_client_user_agent then
      raise exception 'META_ATTRIBUTION_IMMUTABLE_CONFLICT';
    end if;
    return true;
  end if;

  -- Withdrawal is an irreversible fence for this checkout session. Browser
  -- clocks cannot prove that a later-looking consent record was actually made
  -- after withdrawal; a new checkout session is required for new attribution.
  if existing.session_hash is not null
    and existing.withdrawn_at is not null then
    return false;
  end if;

  insert into meta_private.meta_checkout_attribution (
    session_hash,
    consent_version,
    consented_at,
    fbp,
    fbc,
    client_user_agent
  ) values (
    p_session_hash,
    p_consent_version,
    p_consented_at,
    p_fbp,
    p_fbc,
    p_client_user_agent
  ) on conflict (session_hash) do update
  set consent_version = excluded.consent_version,
      consented_at = excluded.consented_at,
      fbp = excluded.fbp,
      fbc = excluded.fbc,
      client_user_agent = excluded.client_user_agent
  -- A concurrent withdrawal can insert or update the row after the initial
  -- SELECT. Never let this conflict path clear its irreversible tombstone.
  where meta_checkout_attribution.withdrawn_at is null;
  get diagnostics affected = row_count;
  if affected <> 1 then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.withdraw_meta_checkout_attribution(
  p_session_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  active_send boolean;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'META_ATTRIBUTION_SESSION_HASH_INVALID';
  end if;

  -- Browser withdrawal is update-only: an opaque unknown handle must not let a
  -- public endpoint create unlimited tombstone rows. A real handle is returned
  -- only after its attribution row exists. Trusted compensation uses clear().
  update meta_private.meta_checkout_attribution attribution
  set fbp = null,
      fbc = null,
      client_user_agent = null,
      withdrawn_at = coalesce(attribution.withdrawn_at, clock_timestamp())
  where attribution.session_hash = p_session_hash;

  select exists (
    select 1
    from meta_private.meta_capi_outbox queued
    where queued.session_hash = p_session_hash
      and queued.status = 'sending'
      and queued.send_started_at > clock_timestamp() - interval '15 minutes'
  ) into active_send;

  -- Withdrawal is already durable even if a request crossed the just-in-time
  -- boundary. That request may finish, but retry observes the tombstone and
  -- becomes terminal. No later send can begin.
  update meta_private.meta_capi_outbox queued
  set status = 'dead',
      claim_token = null,
      claimed_at = null,
      send_started_at = null,
      lease_expires_at = null,
      last_error_code = 'consent_withdrawn',
      last_error_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where queued.session_hash = p_session_hash
    and (
      queued.status in ('pending', 'processing')
      or (
        queued.status = 'sending'
        and queued.send_started_at <= clock_timestamp() - interval '15 minutes'
      )
    );

  -- Deliberately does not reveal whether the opaque handle matched a row.
  -- False only means an already-authorized request has not resolved yet; the
  -- withdrawal itself is already durable and prevents every subsequent retry.
  return not active_send;
end;
$$;

create or replace function public.clear_meta_checkout_attribution(
  p_session_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  withdrawal_complete boolean;
  withdrawal_time timestamptz := clock_timestamp();
begin
  -- This RPC is granted only to service_role and is used as compensation when
  -- the record RPC outcome is unknown. Unlike the public browser withdrawal
  -- path, it must create a missing-row tombstone so a delayed record can never
  -- resurrect identifiers after compensation returned.
  -- Establish and lock the fence first. Calling the update-only browser path
  -- before this upsert would leave an absent-row window in which a delayed
  -- record and webhook could enqueue before compensation cancelled the outbox.
  insert into meta_private.meta_checkout_attribution as attribution (
    session_hash,
    consent_version,
    consented_at,
    fbp,
    fbc,
    client_user_agent,
    withdrawn_at
  ) values (
    p_session_hash,
    'withdrawal-tombstone-v1',
    withdrawal_time,
    null,
    null,
    null,
    withdrawal_time
  )
  on conflict (session_hash) do update
  set fbp = null,
      fbc = null,
      client_user_agent = null,
      withdrawn_at = coalesce(attribution.withdrawn_at, excluded.withdrawn_at);
  withdrawal_complete := public.withdraw_meta_checkout_attribution(p_session_hash);
  return withdrawal_complete;
end;
$$;

create or replace function public.enqueue_meta_capi_purchase(
  p_session_hash text,
  p_value_cents integer,
  p_event_time timestamptz,
  p_content_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attribution meta_private.meta_checkout_attribution%rowtype;
  existing meta_private.meta_capi_outbox%rowtype;
  outbox_id uuid;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'META_CAPI_SESSION_HASH_INVALID';
  end if;
  if not (
    (p_content_id = 'rapid_resolution' and p_value_cents in (19800, 15840))
    or (p_content_id = 'rapid_resolution_bundle' and p_value_cents in (22900, 18320))
  ) then
    raise exception 'META_CAPI_VALUE_INVALID';
  end if;
  if p_event_time is null
    or p_event_time < timestamptz '2024-01-01 00:00:00+00'
    or p_event_time > clock_timestamp() + interval '5 minutes' then
    raise exception 'META_CAPI_EVENT_TIME_INVALID';
  end if;
  if p_content_id is null or p_content_id not in ('rapid_resolution', 'rapid_resolution_bundle') then
    raise exception 'META_CAPI_CONTENT_ID_INVALID';
  end if;

  select * into attribution
  from meta_private.meta_checkout_attribution stored
  where stored.session_hash = p_session_hash
  for update;
  if attribution.session_hash is null then
    return null;
  end if;
  if attribution.withdrawn_at is not null
    or attribution.client_user_agent is null
    or (attribution.fbp is null and attribution.fbc is null) then
    -- Terminal cleanup can leave a minimal audit row. A webhook replay should
    -- resolve an existing outbox id but must never create a new send from it.
    select * into existing
    from meta_private.meta_capi_outbox queued
    where queued.event_name = 'Purchase' and queued.session_hash = p_session_hash;
    if existing.id is not null then
      if existing.value_cents is distinct from p_value_cents
        or existing.currency <> 'CAD'
        or existing.content_id is distinct from p_content_id then
        raise exception 'META_CAPI_PURCHASE_IMMUTABLE_CONFLICT';
      end if;
      return existing.id;
    end if;
    return null;
  end if;
  if attribution.consented_at > p_event_time + interval '5 minutes' then
    raise exception 'META_CAPI_CONSENT_AFTER_PURCHASE';
  end if;
  if attribution.consented_at + interval '180 days' <= p_event_time then
    -- Consent expiry is a clean measurement no-op. Remove the unqueued
    -- browser identifiers immediately rather than waiting for retention purge.
    delete from meta_private.meta_checkout_attribution stored
    where stored.session_hash = p_session_hash
      and not exists (
        select 1 from meta_private.meta_capi_outbox queued
        where queued.session_hash = stored.session_hash
      );
    return null;
  end if;

  insert into meta_private.meta_capi_outbox (
    event_name,
    session_hash,
    event_time,
    value_cents,
    currency,
    content_id
  ) values (
    'Purchase',
    p_session_hash,
    p_event_time,
    p_value_cents,
    'CAD',
    p_content_id
  )
  on conflict (event_name, session_hash) do nothing
  returning id into outbox_id;

  if outbox_id is not null then
    return outbox_id;
  end if;

  select * into existing
  from meta_private.meta_capi_outbox queued
  where queued.event_name = 'Purchase' and queued.session_hash = p_session_hash;
  if existing.id is null then
    raise exception 'META_CAPI_PURCHASE_ENQUEUE_FAILED';
  end if;
  if existing.value_cents is distinct from p_value_cents
    or existing.currency <> 'CAD'
    or existing.content_id is distinct from p_content_id then
    raise exception 'META_CAPI_PURCHASE_IMMUTABLE_CONFLICT';
  end if;
  return existing.id;
end;
$$;

create or replace function public.claim_meta_capi_purchases(
  p_limit integer default 10,
  p_lease_seconds integer default 90
)
returns table (
  outbox_id uuid,
  lease_token uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'META_CAPI_BATCH_INVALID';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'META_CAPI_LEASE_INVALID';
  end if;

  -- Every path that mutates both tables locks attribution before outbox. Clear
  -- terminal identifiers first so this housekeeping cannot deadlock withdrawal.
  update meta_private.meta_checkout_attribution attribution
  set fbp = null, fbc = null, client_user_agent = null
  where exists (
    select 1
    from meta_private.meta_capi_outbox expired
    where expired.session_hash = attribution.session_hash
      and (
        expired.status in ('pending', 'processing')
        or (
          expired.status = 'sending'
          and expired.send_started_at <= clock_timestamp() - interval '15 minutes'
        )
      )
      and (
        expired.event_time < clock_timestamp() - interval '7 days'
        or expired.created_at < clock_timestamp() - interval '7 days'
      )
  );

  update meta_private.meta_capi_outbox expired
  set status = 'dead',
      claim_token = null,
      claimed_at = null,
      send_started_at = null,
      lease_expires_at = null,
      last_error_code = 'delivery_window_expired',
      last_error_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where (
      expired.status in ('pending', 'processing')
      or (
        expired.status = 'sending'
        and expired.send_started_at <= clock_timestamp() - interval '15 minutes'
      )
    )
    and (
      expired.event_time < clock_timestamp() - interval '7 days'
      or expired.created_at < clock_timestamp() - interval '7 days'
    );

  return query
  with candidates as (
    select queued.id
    from meta_private.meta_capi_outbox queued
    join meta_private.meta_checkout_attribution attribution
      on attribution.session_hash = queued.session_hash
      and attribution.withdrawn_at is null
      and attribution.client_user_agent is not null
      and (attribution.fbp is not null or attribution.fbc is not null)
    where queued.event_time >= clock_timestamp() - interval '7 days'
      and queued.created_at >= clock_timestamp() - interval '7 days'
      and (
        (queued.status = 'pending' and queued.next_attempt_at <= clock_timestamp())
        or (queued.status = 'processing' and queued.lease_expires_at <= clock_timestamp())
        or (
          queued.status = 'sending'
          and queued.send_started_at <= clock_timestamp() - interval '15 minutes'
        )
      )
    order by queued.next_attempt_at, queued.created_at, queued.id
    for update of queued skip locked
    limit p_limit
  ), claimed as (
    update meta_private.meta_capi_outbox queued
    set status = 'processing',
        claim_token = gen_random_uuid(),
        claimed_at = clock_timestamp(),
        send_started_at = null,
        lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
        updated_at = clock_timestamp()
    from candidates
    where queued.id = candidates.id
    returning queued.id, queued.claim_token
  )
  select claimed.id, claimed.claim_token
  from claimed;
end;
$$;

create or replace function public.begin_meta_capi_purchase_delivery(
  p_outbox_id uuid,
  p_lease_token uuid
)
returns table (
  outbox_id uuid,
  lease_token uuid,
  event_id text,
  event_time_epoch bigint,
  value_cents integer,
  currency text,
  content_id text,
  fbp text,
  fbc text,
  client_user_agent text,
  attempt_count integer,
  lease_expires_epoch bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_session_hash text;
begin
  if p_outbox_id is null or p_lease_token is null then
    raise exception 'META_CAPI_DELIVERY_IDENTITY_INVALID';
  end if;

  -- The session hash is immutable. Read it without a row lock, then follow the
  -- global attribution-before-outbox lock order used by every two-table writer.
  select queued.session_hash into target_session_hash
  from meta_private.meta_capi_outbox queued
  where queued.id = p_outbox_id;
  if target_session_hash is null then
    return;
  end if;

  perform 1
  from meta_private.meta_checkout_attribution attribution
  where attribution.session_hash = target_session_hash
  for update;

  -- Recheck the hard delivery window at the authoritative send boundary. This
  -- remains fail closed even when the worker's best-effort purge RPC failed.
  if exists (
    select 1
    from meta_private.meta_capi_outbox queued
    where queued.id = p_outbox_id
      and queued.claim_token = p_lease_token
      and queued.status = 'processing'
      and (
        queued.event_time < clock_timestamp() - interval '7 days'
        or queued.created_at < clock_timestamp() - interval '7 days'
      )
  ) then
    update meta_private.meta_checkout_attribution attribution
    set fbp = null, fbc = null, client_user_agent = null
    where attribution.session_hash = target_session_hash;
    update meta_private.meta_capi_outbox queued
    set status = 'dead',
        claim_token = null,
        claimed_at = null,
        send_started_at = null,
        lease_expires_at = null,
        last_error_code = 'delivery_window_expired',
        last_error_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where queued.id = p_outbox_id
      and queued.claim_token = p_lease_token
      and queued.status = 'processing';
    return;
  end if;

  if not exists (
    select 1
    from meta_private.meta_checkout_attribution attribution
    where attribution.session_hash = target_session_hash
      and attribution.withdrawn_at is null
      and attribution.client_user_agent is not null
      and (attribution.fbp is not null or attribution.fbc is not null)
  ) then
    update meta_private.meta_capi_outbox queued
    set status = 'dead',
        claim_token = null,
        claimed_at = null,
        send_started_at = null,
        lease_expires_at = null,
        last_error_code = 'consent_withdrawn',
        last_error_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where queued.id = p_outbox_id
      and queued.claim_token = p_lease_token
      and queued.status = 'processing';
    return;
  end if;

  return query
  with begun as (
    update meta_private.meta_capi_outbox queued
    set status = 'sending',
        send_started_at = clock_timestamp(),
        -- The provider fetch is aborted at ten seconds. Ninety seconds safely
        -- covers begin RPC latency, response parsing, and result persistence.
        lease_expires_at = clock_timestamp() + interval '90 seconds',
        attempts = queued.attempts + 1,
        updated_at = clock_timestamp()
    where queued.id = p_outbox_id
      and queued.claim_token = p_lease_token
      and queued.status = 'processing'
      and queued.lease_expires_at > clock_timestamp()
    returning queued.id,
      queued.claim_token,
      queued.event_id,
      queued.event_time,
      queued.value_cents,
      queued.currency,
      queued.content_id,
      queued.session_hash,
      queued.attempts,
      queued.lease_expires_at
  )
  select begun.id,
    begun.claim_token,
    begun.event_id,
    floor(extract(epoch from begun.event_time))::bigint,
    begun.value_cents,
    begun.currency,
    begun.content_id,
    attribution.fbp,
    attribution.fbc,
    attribution.client_user_agent,
    begun.attempts,
    floor(extract(epoch from begun.lease_expires_at))::bigint
  from begun
  join meta_private.meta_checkout_attribution attribution
    on attribution.session_hash = begun.session_hash
    and attribution.withdrawn_at is null
    and attribution.client_user_agent is not null
    and (attribution.fbp is not null or attribution.fbc is not null);
end;
$$;

create or replace function public.complete_meta_capi_purchase(
  p_outbox_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  affected integer;
  delivered_session_hash text;
begin
  if p_outbox_id is null or p_lease_token is null then
    raise exception 'META_CAPI_COMPLETION_INVALID';
  end if;
  select queued.session_hash into delivered_session_hash
  from meta_private.meta_capi_outbox queued
  where queued.id = p_outbox_id;
  if delivered_session_hash is null then
    return false;
  end if;
  perform 1
  from meta_private.meta_checkout_attribution attribution
  where attribution.session_hash = delivered_session_hash
  for update;

  update meta_private.meta_capi_outbox queued
  set status = 'sent',
      claim_token = null,
      claimed_at = null,
      send_started_at = null,
      lease_expires_at = null,
      last_error_code = null,
      last_http_status = null,
      last_error_at = null,
      sent_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where queued.id = p_outbox_id
    and queued.claim_token = p_lease_token
    and queued.status = 'sending';
  get diagnostics affected = row_count;
  if affected = 1 then
    update meta_private.meta_checkout_attribution attribution
    set fbp = null, fbc = null, client_user_agent = null
    where attribution.session_hash = delivered_session_hash;
  end if;
  return affected = 1;
end;
$$;

create or replace function public.retry_meta_capi_purchase(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_http_status integer,
  p_retry_after_seconds integer,
  p_permanent boolean default false
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  affected integer;
  terminal_session_hash text;
  resulting_status text;
  attribution_withdrawn boolean;
begin
  if p_outbox_id is null or p_lease_token is null then
    raise exception 'META_CAPI_RETRY_IDENTITY_INVALID';
  end if;
  if p_error_code is null or not (
    p_error_code in (
      'network_error',
      'request_timeout',
      'invalid_response',
      'zero_events_received',
      'worker_exception'
    )
    or p_error_code ~ '^meta_http_[0-9]{3}$'
    or p_error_code ~ '^meta_graph_[0-9]{1,10}$'
  ) then
    raise exception 'META_CAPI_RETRY_ERROR_CODE_INVALID';
  end if;
  if p_http_status is not null and p_http_status not between 100 and 599 then
    raise exception 'META_CAPI_RETRY_HTTP_STATUS_INVALID';
  end if;
  if p_permanent is null then
    raise exception 'META_CAPI_RETRY_PERMANENCE_INVALID';
  end if;
  if not p_permanent and (
    p_retry_after_seconds is null
    or p_retry_after_seconds not between 15 and 21600
  ) then
    raise exception 'META_CAPI_RETRY_DELAY_INVALID';
  end if;

  select queued.session_hash into terminal_session_hash
  from meta_private.meta_capi_outbox queued
  where queued.id = p_outbox_id;
  if terminal_session_hash is null then
    return null;
  end if;
  perform 1
  from meta_private.meta_checkout_attribution attribution
  where attribution.session_hash = terminal_session_hash
  for update;
  select (
    attribution.withdrawn_at is not null
    or attribution.client_user_agent is null
    or (attribution.fbp is null and attribution.fbc is null)
  ) into attribution_withdrawn
  from meta_private.meta_checkout_attribution attribution
  where attribution.session_hash = terminal_session_hash;
  attribution_withdrawn := coalesce(attribution_withdrawn, true);

  update meta_private.meta_capi_outbox queued
  set status = case
        when attribution_withdrawn or p_permanent then 'dead'
        else 'pending'
      end,
      next_attempt_at = case
        when attribution_withdrawn or p_permanent then queued.next_attempt_at
        else clock_timestamp() + make_interval(secs => p_retry_after_seconds)
      end,
      claim_token = null,
      claimed_at = null,
      send_started_at = null,
      lease_expires_at = null,
      last_error_code = case when attribution_withdrawn then 'consent_withdrawn' else p_error_code end,
      last_http_status = p_http_status,
      last_error_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where queued.id = p_outbox_id
    and queued.claim_token = p_lease_token
    and queued.status = 'sending'
  returning queued.status into resulting_status;
  get diagnostics affected = row_count;
  if affected = 1 and resulting_status = 'dead' then
    update meta_private.meta_checkout_attribution attribution
    set fbp = null, fbc = null, client_user_agent = null
    where attribution.session_hash = terminal_session_hash;
  end if;
  if affected = 1 then
    -- Consent withdrawal is an expected cancellation, while a permanent
    -- provider rejection must remain a visible dead-letter to the scheduler.
    return case when attribution_withdrawn then 'cancelled' else resulting_status end;
  end if;
  return null;
end;
$$;

create or replace function public.purge_meta_capi_history()
returns table (
  purged_outbox_count integer,
  purged_attribution_count integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  removed_outbox integer;
  removed_attribution integer;
begin
  -- Lock/clean attribution before mutating the related outbox row, matching the
  -- delivery and withdrawal functions. A still-active send is never purged.
  update meta_private.meta_checkout_attribution attribution
  set fbp = null, fbc = null, client_user_agent = null
  where exists (
    select 1
    from meta_private.meta_capi_outbox queued
    where queued.session_hash = attribution.session_hash
      and (
        queued.status in ('pending', 'processing')
        or (
          queued.status = 'sending'
          and queued.send_started_at <= clock_timestamp() - interval '15 minutes'
        )
      )
      and (
        queued.event_time < clock_timestamp() - interval '7 days'
        or queued.created_at < clock_timestamp() - interval '7 days'
      )
  );

  update meta_private.meta_capi_outbox queued
  set status = 'dead',
      claim_token = null,
      claimed_at = null,
      send_started_at = null,
      lease_expires_at = null,
      last_error_code = 'delivery_window_expired',
      last_error_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where (
      queued.status in ('pending', 'processing')
      or (
        queued.status = 'sending'
        and queued.send_started_at <= clock_timestamp() - interval '15 minutes'
      )
    )
    and (
      queued.event_time < clock_timestamp() - interval '7 days'
      or queued.created_at < clock_timestamp() - interval '7 days'
    );

  -- Delete attribution that was already unqueued before taking any outbox row
  -- lock. Attribution made unqueued below is removed on the next daily purge.
  delete from meta_private.meta_checkout_attribution attribution
  where attribution.created_at < clock_timestamp() - interval '30 days'
    and not exists (
      select 1 from meta_private.meta_capi_outbox retained
      where retained.session_hash = attribution.session_hash
    );
  get diagnostics removed_attribution = row_count;

  -- Pre-lock every parent in stable order before deleting its terminal child,
  -- preserving the attribution-before-outbox order under concurrent withdrawal.
  perform 1
  from meta_private.meta_checkout_attribution attribution
  where exists (
    select 1
    from meta_private.meta_capi_outbox queued
    where queued.session_hash = attribution.session_hash
      and (
        (queued.status = 'sent' and queued.sent_at < clock_timestamp() - interval '90 days')
        or (queued.status = 'dead' and queued.updated_at < clock_timestamp() - interval '30 days')
      )
  )
  order by attribution.session_hash
  for update of attribution;

  delete from meta_private.meta_capi_outbox queued
  where (
    queued.status = 'sent'
    and queued.sent_at < clock_timestamp() - interval '90 days'
  ) or (
    queued.status = 'dead'
    and queued.updated_at < clock_timestamp() - interval '30 days'
  );
  get diagnostics removed_outbox = row_count;

  return query select removed_outbox, removed_attribution;
end;
$$;

revoke all on function public.record_meta_checkout_attribution(text, text, timestamptz, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.withdraw_meta_checkout_attribution(text)
  from public, anon, authenticated, service_role;
revoke all on function public.clear_meta_checkout_attribution(text)
  from public, anon, authenticated, service_role;
revoke all on function public.enqueue_meta_capi_purchase(text, integer, timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_meta_capi_purchases(integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_meta_capi_purchase_delivery(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_meta_capi_purchase(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.retry_meta_capi_purchase(uuid, uuid, text, integer, integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.purge_meta_capi_history()
  from public, anon, authenticated, service_role;

grant execute on function public.record_meta_checkout_attribution(text, text, timestamptz, text, text, text)
  to service_role;
grant execute on function public.withdraw_meta_checkout_attribution(text)
  to service_role;
grant execute on function public.clear_meta_checkout_attribution(text)
  to service_role;
grant execute on function public.enqueue_meta_capi_purchase(text, integer, timestamptz, text)
  to service_role;
grant execute on function public.claim_meta_capi_purchases(integer, integer)
  to service_role;
grant execute on function public.begin_meta_capi_purchase_delivery(uuid, uuid)
  to service_role;
grant execute on function public.complete_meta_capi_purchase(uuid, uuid)
  to service_role;
grant execute on function public.retry_meta_capi_purchase(uuid, uuid, text, integer, integer, boolean)
  to service_role;
grant execute on function public.purge_meta_capi_history()
  to service_role;

comment on schema meta_private is
  'Non-API schema for consented Meta measurement state. Application roles have no direct access.';
comment on table meta_private.meta_checkout_attribution is
  'SHA-256 checkout correlation plus explicit measurement consent, sanitized _fbp/_fbc, and server-derived client user agent only. Browser identifiers are nulled at terminal delivery.';
comment on table meta_private.meta_capi_outbox is
  'Durable idempotent Meta Purchase delivery queue. Each event is unique by Purchase plus SHA-256 checkout session id.';
comment on function public.record_meta_checkout_attribution(text, text, timestamptz, text, text, text) is
  'Service-role-only consent record. The caller must pass a SHA-256 session hash, never the raw checkout session id.';
comment on function public.withdraw_meta_checkout_attribution(text) is
  'Service-role-only browser withdrawal path. Retires unsent delivery and nulls browser identifiers without revealing whether an opaque handle existed.';
comment on function public.clear_meta_checkout_attribution(text) is
  'Service-role-only cleanup alias. Retires unsent delivery and prevents an older consent timestamp from restoring checkout attribution.';
comment on function public.enqueue_meta_capi_purchase(text, integer, timestamptz, text) is
  'Service-role-only idempotent Purchase enqueue for officer-issued rapid_resolution or rapid_resolution_bundle. Returns null when no sendable consented attribution exists.';
comment on function public.claim_meta_capi_purchases(integer, integer) is
  'Service-role-only SKIP LOCKED reservation returning opaque lease identities only. Expired leases retry with the same stable Meta event_id.';
comment on function public.begin_meta_capi_purchase_delivery(uuid, uuid) is
  'Service-role-only just-in-time consent revalidation. Atomically marks one reserved event sending and returns its provider payload for an immediate bounded request.';
comment on function public.purge_meta_capi_history() is
  'Service-role-only retention purge: undeliverable events after 7 days, sent events after 90 days, dead events after 30 days, and every unqueued checkout attribution after 30 days.';
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'fabsy-meta-capi-retention',
  '17 4 * * *',
  $cron$select public.purge_meta_capi_history();$cron$
);

commit;
