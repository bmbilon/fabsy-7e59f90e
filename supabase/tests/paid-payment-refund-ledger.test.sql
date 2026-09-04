\set ON_ERROR_STOP on

do $$
begin
  if has_function_privilege(
    'anon',
    'public.record_paid_payment_purchase(text,text,text,timestamptz,text,bigint,bigint,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.record_paid_payment_refund(text,text,text,timestamptz,timestamptz,bigint,text,text)',
    'execute'
  ) then
    raise exception 'paid payment ledger RPCs are exposed outside service_role';
  end if;
  if has_table_privilege('service_role', 'analytics_private.paid_payment_purchases', 'select') or
      has_table_privilege('service_role', 'analytics_private.paid_payment_refunds', 'select') then
    raise exception 'private ledger tables are directly readable';
  end if;
  if position(
    '587231904' in pg_get_functiondef(
      'public.record_paid_payment_purchase(text,text,text,timestamptz,text,bigint,bigint,text)'::regprocedure
    )
  ) = 0 then
    raise exception 'purchase attribution does not share the checkout-withdrawal lock';
  end if;
  if position(
    '932761506' in pg_get_functiondef(
      'public.record_paid_payment_purchase(text,text,text,timestamptz,text,bigint,bigint,text)'::regprocedure
    )
  ) = 0 or position(
    '932761506' in pg_get_functiondef(
      'public.record_paid_payment_refund(text,text,text,timestamptz,timestamptz,bigint,text,text)'::regprocedure
    )
  ) = 0 then
    raise exception 'purchase and refund RPCs do not share the PaymentIntent lock';
  end if;
end
$$;

set role service_role;

do $$
declare
  consent_time timestamptz := clock_timestamp() - interval '30 minutes';
  purchase_time timestamptz := clock_timestamp() - interval '20 minutes';
  refund_time timestamptz := clock_timestamp() - interval '10 minutes';
begin
  if not public.record_paid_funnel_event(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000010',
    'landing_view', consent_time + interval '1 minute', 'rapid_resolution',
    null, null, null, 'meta', 'paid_social', 'rr-test', null, 'shared-session',
    null, null, 'fabsy-funnel-v1', consent_time
  ) then raise exception 'funnel seed failed'; end if;

  -- Two independently paid checkouts may share one browser funnel session.
  if not public.record_paid_funnel_checkout(
    repeat('a', 64), '00000000-0000-4000-8000-000000000010',
    'fabsy-funnel-v1', consent_time
  ) or not public.record_paid_funnel_checkout(
    repeat('b', 64), '00000000-0000-4000-8000-000000000010',
    'fabsy-funnel-v1', consent_time
  ) then raise exception 'checkout correlation failed'; end if;
  perform public.record_verified_paid_funnel_purchase(
    repeat('a', 64), '00000000-0000-4000-8000-000000000011',
    purchase_time, 'rapid_resolution'
  );
  perform public.record_verified_paid_funnel_purchase(
    repeat('b', 64), '00000000-0000-4000-8000-000000000012',
    purchase_time + interval '1 minute', 'photo_radar'
  );
  if not public.record_paid_payment_purchase(
    repeat('a', 64), repeat('c', 64), repeat('d', 64), purchase_time,
    'rapid_resolution', 20000, 1000, 'cad'
  ) or not public.record_paid_payment_purchase(
    repeat('b', 64), repeat('e', 64), repeat('f', 64), purchase_time + interval '1 minute',
    'photo_radar', 10000, 500, 'cad'
  ) then raise exception 'two same-session purchases did not persist'; end if;

  -- An exact event replay is idempotent, but mutated financial facts fail closed.
  if not public.record_paid_payment_purchase(
    repeat('a', 64), repeat('c', 64), repeat('d', 64), purchase_time,
    'rapid_resolution', 20000, 1000, 'cad'
  ) then raise exception 'purchase replay was not idempotent'; end if;
  if not public.record_paid_payment_purchase(
    repeat('a', 64), repeat('c', 64), repeat('1', 64), purchase_time + interval '1 minute',
    'rapid_resolution', 20000, 1000, 'cad'
  ) then raise exception 'second valid checkout event was not idempotent'; end if;
  if public.record_paid_payment_purchase(
    repeat('a', 64), repeat('c', 64), repeat('2', 64), purchase_time,
    'rapid_resolution', 20001, 1000, 'cad'
  ) then raise exception 'mutated purchase replay was accepted'; end if;

  -- A post-purchase withdrawal remains permanent. Its refund corrects the
  -- already-admitted gross fact without deleting or reviving the tombstone.
  perform public.withdraw_known_paid_funnel_checkout(repeat('a', 64));

  -- One payment receives two separate partial refunds. Pending -> succeeded
  -- updates one refund id; exact and delayed pending replays cannot duplicate
  -- or reverse a succeeded refund.
  if not public.record_paid_payment_refund(
    repeat('2', 64), repeat('c', 64), repeat('3', 64), refund_time, refund_time,
    5000, 'cad', 'succeeded'
  ) or not public.record_paid_payment_refund(
    repeat('4', 64), repeat('c', 64), repeat('5', 64), refund_time + interval '1 minute',
    refund_time + interval '3 minutes', 1000, 'cad', 'pending'
  ) or not public.record_paid_payment_refund(
    repeat('4', 64), repeat('c', 64), repeat('6', 64), refund_time + interval '1 minute',
    refund_time + interval '2 minutes', 1000, 'cad', 'succeeded'
  ) or not public.record_paid_payment_refund(
    repeat('4', 64), repeat('c', 64), repeat('5', 64), refund_time + interval '1 minute',
    refund_time + interval '1 minute', 1000, 'cad', 'pending'
  ) then raise exception 'partial/multiple refund persistence failed'; end if;
  if public.record_paid_payment_refund(
    repeat('4', 64), repeat('c', 64), repeat('7', 64), refund_time + interval '1 minute',
    refund_time + interval '3 minutes', 1001, 'cad', 'succeeded'
  ) then raise exception 'mutated refund replay was accepted'; end if;

  -- Stripe may deliver a refund before its checkout event. The PII-free row is
  -- retained without attribution, then reconciled by hashed PaymentIntent.
  if not public.record_paid_payment_refund(
    repeat('8', 64), repeat('8', 64), repeat('0', 64), refund_time, refund_time,
    1000, 'cad', 'succeeded'
  ) then raise exception 'refund-before-purchase was dropped'; end if;
  -- A truly unrelated account refund stays visible as unmatched cash without
  -- contaminating product refund rates.
  if not public.record_paid_payment_refund(
    repeat('a', 64), repeat('6', 64), repeat('b', 64), refund_time, refund_time,
    700, 'cad', 'succeeded'
  ) then raise exception 'unmatched account refund was dropped'; end if;
  perform public.withdraw_paid_funnel_checkout(repeat('9', 64));
  if not public.record_paid_payment_purchase(
    repeat('9', 64), repeat('8', 64), repeat('7', 64), purchase_time,
    'rapid_resolution', 20000, 1000, 'cad'
  ) then raise exception 'unattributed verified purchase was suppressed'; end if;
end
$$;

reset role;

do $$
declare
  report jsonb;
begin
  if (select count(*) from analytics_private.paid_payment_purchases) <> 3 then
    raise exception 'expected three order-level purchases';
  end if;
  if (select funnel_session_id from analytics_private.paid_payment_purchases where checkout_session_hash = repeat('9', 64)) is not null then
    raise exception 'withdrawn purchase revived attribution';
  end if;
  if (select count(*) from analytics_private.paid_payment_refunds) <> 4 then
    raise exception 'expected partial, out-of-order and unmatched refunds';
  end if;
  if (select status from analytics_private.paid_payment_refunds where refund_hash = repeat('4', 64)) <> 'succeeded' then
    raise exception 'delayed pending replay reversed success';
  end if;
  if not exists (
    select 1 from analytics_private.paid_payment_refunds
    where refund_hash = repeat('8', 64)
      and checkout_session_hash = repeat('9', 64)
      and product = 'rapid_resolution'
  ) then raise exception 'refund-before-purchase was not reconciled'; end if;
  if not exists (
    select 1 from analytics_private.paid_payment_refunds
    where refund_hash = repeat('a', 64) and checkout_session_hash is null and product is null
  ) then raise exception 'unmatched refund gained attribution'; end if;
  if not exists (
    select 1 from analytics_private.paid_funnel_checkout_withdrawals
    where checkout_session_hash = repeat('a', 64)
  ) then raise exception 'post-purchase withdrawal tombstone was lost'; end if;

  report := public.paid_funnel_report(clock_timestamp() - interval '1 day', clock_timestamp());
  if (report #>> '{financials,scope}') <> 'all_customer_purchases_from_signed_stripe_webhooks' or
      (report #>> '{financials,purchase_count}')::bigint <> 3 or
      (report #>> '{financials,currently_attributed_purchase_count}')::bigint <> 1 or
      (report #>> '{financials,unattributed_or_withdrawn_purchase_count}')::bigint <> 2 or
      (report #>> '{financials,succeeded_refund_count}')::bigint <> 3 or
      (report #>> '{financials,succeeded_refund_amount_cents}')::bigint <> 7000 or
      (report #>> '{financials,unmatched_succeeded_refund_count}')::bigint <> 1 or
      (report #>> '{financials,unmatched_succeeded_refund_amount_cents}')::bigint <> 700 or
      (report #>> '{financials,purchase_cohort,purchase_count}')::bigint <> 3 or
      (report #>> '{financials,purchase_cohort,refunded_purchase_count}')::bigint <> 2 or
      (report #>> '{financials,purchase_cohort,any_refund_purchase_rate}')::numeric <> 0.666667 or
      (report #>> '{financials,purchase_cohort,gross_purchase_amount_cents}')::bigint <> 50000 or
      (report #>> '{financials,purchase_cohort,succeeded_refund_amount_cents}')::bigint <> 7000 or
      (report #>> '{financials,refund_outcomes,partial_purchase_count}')::bigint <> 2 or
      (report #>> '{financials,refund_outcomes,multiple_refund_purchase_count}')::bigint <> 1 or
      (report #>> '{financials,net_retained_customer_status}') <> 'not_measurable_without_qualifying_crown_rejection' then
    raise exception 'aggregate refund report was incorrect: %', report->'financials';
  end if;
  if position('00000000-0000-4000-8000-000000000010' in report::text) > 0 or
      position(repeat('c', 64) in report::text) > 0 then
    raise exception 'aggregate report exposed a row identifier';
  end if;
end
$$;

select 'paid payment refund ledger tests passed' as result;
