-- Make first-party checkout attribution withdrawal an irreversible fence for
-- each Stripe Checkout Session. A new consent grant must use a new Checkout
-- Session rather than reviving an already-withdrawn correlation.

begin;

create table analytics_private.paid_funnel_checkout_withdrawals (
  checkout_session_hash text primary key,
  withdrawn_at timestamptz not null default clock_timestamp(),
  constraint paid_funnel_checkout_withdrawal_hash_check
    check (checkout_session_hash ~ '^[0-9a-f]{64}$')
);

comment on table analytics_private.paid_funnel_checkout_withdrawals is
  'PII-free irreversible fences for withdrawn SHA-256 Stripe Checkout Session handles.';

alter table analytics_private.paid_funnel_checkout_withdrawals enable row level security;
revoke all on analytics_private.paid_funnel_checkout_withdrawals
  from public, anon, authenticated, service_role;

-- Preserve every withdrawal recorded before this fence table existed.
insert into analytics_private.paid_funnel_checkout_withdrawals (
  checkout_session_hash,
  withdrawn_at
)
select checkout_session_hash, revoked_at
from analytics_private.paid_funnel_checkouts
where revoked_at is not null
on conflict (checkout_session_hash) do update
set withdrawn_at = least(
  analytics_private.paid_funnel_checkout_withdrawals.withdrawn_at,
  excluded.withdrawn_at
);

create or replace function public.record_paid_funnel_checkout(
  p_checkout_session_hash text,
  p_session_id uuid,
  p_consent_version text,
  p_consented_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  affected integer;
begin
  if p_checkout_session_hash is null or p_checkout_session_hash !~ '^[0-9a-f]{64}$' or
      p_session_id is null or p_consent_version is distinct from 'fabsy-funnel-v1' or
      p_consented_at is null or p_consented_at < clock_timestamp() - interval '180 days' or
      p_consented_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'FUNNEL_CHECKOUT_INVALID';
  end if;

  -- Serialize the first record, every replay and both withdrawal paths on the
  -- opaque checkout hash. This also closes the missing-row withdrawal race.
  perform pg_advisory_xact_lock(
    hashtextextended(p_checkout_session_hash, 587231904::bigint)
  );

  if exists (
    select 1
    from analytics_private.paid_funnel_checkout_withdrawals withdrawal
    where withdrawal.checkout_session_hash = p_checkout_session_hash
  ) or exists (
    select 1
    from analytics_private.paid_funnel_checkouts checkout_record
    where checkout_record.checkout_session_hash = p_checkout_session_hash
      and checkout_record.revoked_at is not null
  ) then
    return false;
  end if;

  insert into analytics_private.paid_funnel_checkouts (
    checkout_session_hash, session_id, consent_version, consented_at
  ) values (
    p_checkout_session_hash, p_session_id, p_consent_version, p_consented_at
  ) on conflict (checkout_session_hash) do update
    set session_id = excluded.session_id,
        consent_version = excluded.consent_version,
        consented_at = excluded.consented_at,
        updated_at = clock_timestamp(),
        expires_at = clock_timestamp() + interval '7 days'
    where paid_funnel_checkouts.consumed_at is null
      and paid_funnel_checkouts.revoked_at is null;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

-- Trusted checkout compensation uses this function. It must persist an
-- unknown-handle fence because the record RPC may have committed even when its
-- result was lost, or a delayed record RPC may still be waiting to run.
create or replace function public.withdraw_paid_funnel_checkout(
  p_checkout_session_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_checkout_session_hash is null or p_checkout_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'FUNNEL_CHECKOUT_HASH_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_checkout_session_hash, 587231904::bigint)
  );
  insert into analytics_private.paid_funnel_checkout_withdrawals as withdrawal (
    checkout_session_hash
  ) values (
    p_checkout_session_hash
  ) on conflict (checkout_session_hash) do update
  set withdrawn_at = least(withdrawal.withdrawn_at, excluded.withdrawn_at);

  update analytics_private.paid_funnel_checkouts checkout_record
    set revoked_at = coalesce(checkout_record.revoked_at, clock_timestamp()),
        updated_at = clock_timestamp()
  where checkout_record.checkout_session_hash = p_checkout_session_hash
    and checkout_record.consumed_at is null;
  return true;
end;
$$;

-- Browser callers receive a handle only after a checkout attribution record
-- exists. Keep their public endpoint non-enumerating without allowing forged,
-- random hashes to create unbounded tombstones.
create or replace function public.withdraw_known_paid_funnel_checkout(
  p_checkout_session_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_checkout_session_hash is null or p_checkout_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'FUNNEL_CHECKOUT_HASH_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_checkout_session_hash, 587231904::bigint)
  );
  if exists (
    select 1
    from analytics_private.paid_funnel_checkouts checkout_record
    where checkout_record.checkout_session_hash = p_checkout_session_hash
  ) then
    insert into analytics_private.paid_funnel_checkout_withdrawals as withdrawal (
      checkout_session_hash
    ) values (
      p_checkout_session_hash
    ) on conflict (checkout_session_hash) do update
    set withdrawn_at = least(withdrawal.withdrawn_at, excluded.withdrawn_at);

    update analytics_private.paid_funnel_checkouts checkout_record
      set revoked_at = coalesce(checkout_record.revoked_at, clock_timestamp()),
          updated_at = clock_timestamp()
    where checkout_record.checkout_session_hash = p_checkout_session_hash
      and checkout_record.consumed_at is null;
  end if;
  return true;
end;
$$;

create or replace function public.record_verified_paid_funnel_purchase(
  p_checkout_session_hash text,
  p_event_id uuid,
  p_occurred_at timestamptz,
  p_product text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  checkout_row analytics_private.paid_funnel_checkouts%rowtype;
  seed analytics_private.paid_funnel_events%rowtype;
  inserted_count integer;
begin
  if p_checkout_session_hash is null or p_checkout_session_hash !~ '^[0-9a-f]{64}$' or
      p_event_id is null or p_occurred_at is null or
      p_product is null or p_product not in ('rapid_resolution','rapid_resolution_bundle','photo_radar') then
    raise exception 'FUNNEL_VERIFIED_PURCHASE_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_checkout_session_hash, 587231904::bigint)
  );
  if exists (
    select 1
    from analytics_private.paid_funnel_checkout_withdrawals withdrawal
    where withdrawal.checkout_session_hash = p_checkout_session_hash
  ) then
    return false;
  end if;

  select * into checkout_row
  from analytics_private.paid_funnel_checkouts
  where checkout_session_hash = p_checkout_session_hash
    and revoked_at is null
    and expires_at > clock_timestamp()
  for update;
  if not found then return false; end if;

  select * into seed
  from analytics_private.paid_funnel_events
  where session_id = checkout_row.session_id
  order by occurred_at desc, event_id desc
  limit 1;

  insert into analytics_private.paid_funnel_events (
    event_id,session_id,event_name,occurred_at,page_key,product,
    utm_source,utm_medium,utm_campaign,utm_term,utm_content,
    click_id_kind,click_id_hash,consent_version,consented_at
  ) values (
    p_event_id,checkout_row.session_id,'purchase',p_occurred_at,'thank_you',p_product,
    seed.utm_source,seed.utm_medium,seed.utm_campaign,seed.utm_term,seed.utm_content,
    seed.click_id_kind,seed.click_id_hash,checkout_row.consent_version,checkout_row.consented_at
  ) on conflict do nothing;
  get diagnostics inserted_count = row_count;

  update analytics_private.paid_funnel_checkouts
    set consumed_at = coalesce(consumed_at, clock_timestamp()),
        updated_at = clock_timestamp()
  where checkout_session_hash = p_checkout_session_hash;
  return inserted_count = 1 or exists (
    select 1 from analytics_private.paid_funnel_events
    where session_id = checkout_row.session_id and event_name = 'purchase'
  );
end;
$$;

revoke all on function public.record_paid_funnel_checkout(text,uuid,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.withdraw_paid_funnel_checkout(text)
  from public, anon, authenticated;
revoke all on function public.withdraw_known_paid_funnel_checkout(text)
  from public, anon, authenticated;
revoke all on function public.record_verified_paid_funnel_purchase(text,uuid,timestamptz,text)
  from public, anon, authenticated;

grant execute on function public.record_paid_funnel_checkout(text,uuid,text,timestamptz)
  to service_role;
grant execute on function public.withdraw_paid_funnel_checkout(text)
  to service_role;
grant execute on function public.withdraw_known_paid_funnel_checkout(text)
  to service_role;
grant execute on function public.record_verified_paid_funnel_purchase(text,uuid,timestamptz,text)
  to service_role;

commit;
