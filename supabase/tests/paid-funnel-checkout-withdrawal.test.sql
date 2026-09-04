\set ON_ERROR_STOP on

do $$
begin
  if has_function_privilege(
    'anon',
    'public.record_paid_funnel_checkout(text,uuid,text,timestamptz)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.withdraw_paid_funnel_checkout(text)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.withdraw_known_paid_funnel_checkout(text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.record_verified_paid_funnel_purchase(text,uuid,timestamptz,text)',
    'execute'
  ) then
    raise exception 'paid funnel checkout RPCs are exposed outside service_role';
  end if;
  if has_table_privilege(
    'anon', 'analytics_private.paid_funnel_checkout_withdrawals', 'select'
  ) or has_table_privilege(
    'authenticated', 'analytics_private.paid_funnel_checkout_withdrawals', 'select'
  ) or has_table_privilege(
    'service_role', 'analytics_private.paid_funnel_checkout_withdrawals', 'select'
  ) then
    raise exception 'checkout withdrawal fences are directly readable';
  end if;
end
$$;

set role service_role;

-- Rows revoked before this migration are backfilled into the permanent fence.
do $$
begin
  if public.record_paid_funnel_checkout(
    repeat('e', 64),
    '00000000-0000-4000-8000-0000000000e2',
    'fabsy-funnel-v1',
    clock_timestamp()
  ) then
    raise exception 'pre-migration revocation was revived';
  end if;
end
$$;

-- A privacy withdrawal can win before the initial correlation RPC arrives.
-- The missing-row fence must survive and reject both that delayed record and
-- a later signed-webhook purchase attempt.
do $$
begin
  if not public.withdraw_paid_funnel_checkout(repeat('a', 64)) then
    raise exception 'unknown checkout withdrawal failed';
  end if;
  if public.record_paid_funnel_checkout(
    repeat('a', 64),
    '00000000-0000-4000-8000-0000000000a1',
    'fabsy-funnel-v1',
    clock_timestamp()
  ) then
    raise exception 'delayed first record crossed its withdrawal fence';
  end if;
  if public.record_verified_paid_funnel_purchase(
    repeat('a', 64),
    '00000000-0000-4000-8000-0000000000a2',
    clock_timestamp(),
    'rapid_resolution'
  ) then
    raise exception 'withdrawn unknown checkout recorded a purchase';
  end if;
end
$$;

-- Once a known correlation is withdrawn, stale record retries can never
-- clear revocation or bind the Stripe session to a different funnel session.
do $$
begin
  if not public.record_paid_funnel_checkout(
    repeat('b', 64),
    '00000000-0000-4000-8000-0000000000b1',
    'fabsy-funnel-v1',
    clock_timestamp()
  ) then
    raise exception 'initial checkout record failed';
  end if;
  if not public.withdraw_paid_funnel_checkout(repeat('b', 64)) then
    raise exception 'known checkout withdrawal failed';
  end if;
  if public.record_paid_funnel_checkout(
    repeat('b', 64),
    '00000000-0000-4000-8000-0000000000b2',
    'fabsy-funnel-v1',
    clock_timestamp()
  ) then
    raise exception 'stale record revived a withdrawn checkout';
  end if;
  if public.record_verified_paid_funnel_purchase(
    repeat('b', 64),
    '00000000-0000-4000-8000-0000000000b3',
    clock_timestamp(),
    'rapid_resolution_bundle'
  ) then
    raise exception 'withdrawn known checkout recorded a purchase';
  end if;
end
$$;

-- The browser endpoint uses the known-only RPC. Forged random handles remain
-- non-enumerating without creating unlimited permanent tombstones.
do $$
begin
  if not public.withdraw_known_paid_funnel_checkout(repeat('c', 64)) then
    raise exception 'known-only withdrawal did not remain non-enumerating';
  end if;
  if not public.record_paid_funnel_checkout(
    repeat('c', 64),
    '00000000-0000-4000-8000-0000000000c1',
    'fabsy-funnel-v1',
    clock_timestamp()
  ) then
    raise exception 'unknown public handle created a durable tombstone';
  end if;
  if not public.withdraw_known_paid_funnel_checkout(repeat('c', 64)) then
    raise exception 'known-only withdrawal failed for a recorded checkout';
  end if;
  if public.record_paid_funnel_checkout(
    repeat('c', 64),
    '00000000-0000-4000-8000-0000000000c2',
    'fabsy-funnel-v1',
    clock_timestamp()
  ) then
    raise exception 'known-only withdrawal was reversible';
  end if;
end
$$;

-- An untouched checkout still records one verified purchase, proving the
-- privacy fence does not interrupt payment measurement for consenting users.
do $$
begin
  if not public.record_paid_funnel_checkout(
    repeat('d', 64),
    '00000000-0000-4000-8000-0000000000d1',
    'fabsy-funnel-v1',
    clock_timestamp()
  ) then
    raise exception 'unwithdrawn checkout record failed';
  end if;
  if not public.record_verified_paid_funnel_purchase(
    repeat('d', 64),
    '00000000-0000-4000-8000-0000000000d2',
    clock_timestamp(),
    'rapid_resolution'
  ) then
    raise exception 'unwithdrawn checkout purchase failed';
  end if;
  if public.record_paid_funnel_checkout(
    repeat('d', 64),
    '00000000-0000-4000-8000-0000000000d3',
    'fabsy-funnel-v1',
    clock_timestamp()
  ) then
    raise exception 'consumed checkout accepted a stale record';
  end if;
end
$$;

reset role;

do $$
declare
  delayed_count integer;
  stale_count integer;
  known_count integer;
  backfill_count integer;
  purchase_count integer;
begin
  select count(*) into delayed_count
  from analytics_private.paid_funnel_checkout_withdrawals
  where checkout_session_hash = repeat('a', 64);
  select count(*) into stale_count
  from analytics_private.paid_funnel_checkout_withdrawals
  where checkout_session_hash = repeat('b', 64);
  select count(*) into known_count
  from analytics_private.paid_funnel_checkout_withdrawals
  where checkout_session_hash = repeat('c', 64);
  select count(*) into backfill_count
  from analytics_private.paid_funnel_checkout_withdrawals
  where checkout_session_hash = repeat('e', 64);
  select count(*) into purchase_count
  from analytics_private.paid_funnel_events
  where event_name = 'purchase';
  if delayed_count <> 1 or stale_count <> 1 or known_count <> 1 or backfill_count <> 1 then
    raise exception 'withdrawal fences were missing or duplicated';
  end if;
  if purchase_count <> 1 then
    raise exception 'expected exactly one unwithdrawn verified purchase, got %', purchase_count;
  end if;
end
$$;

select 'paid funnel checkout withdrawal tests passed' as result;
