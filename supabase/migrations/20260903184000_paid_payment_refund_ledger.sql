-- Durable, PII-free financial facts from the Stripe-signature-verified payment
-- webhook. Financial admission is independent of optional measurement consent;
-- only the nullable funnel-session link is consent-fenced. A refund can update
-- a verified purchase but can never create or revive campaign attribution.

begin;

create table analytics_private.paid_payment_purchases (
  checkout_session_hash text primary key,
  payment_intent_hash text not null unique,
  first_stripe_event_hash text not null,
  last_stripe_event_hash text not null,
  funnel_session_id uuid,
  product text not null,
  amount_cents bigint not null,
  tax_cents bigint not null,
  currency text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint paid_payment_purchase_checkout_hash_check
    check (checkout_session_hash ~ '^[0-9a-f]{64}$'),
  constraint paid_payment_purchase_intent_hash_check
    check (payment_intent_hash ~ '^[0-9a-f]{64}$'),
  constraint paid_payment_purchase_event_hash_check
    check (first_stripe_event_hash ~ '^[0-9a-f]{64}$' and last_stripe_event_hash ~ '^[0-9a-f]{64}$'),
  constraint paid_payment_purchase_product_check
    check (product in ('rapid_resolution','rapid_resolution_bundle','photo_radar')),
  constraint paid_payment_purchase_amount_check
    check (amount_cents between 1 and 100000000 and tax_cents between 0 and amount_cents),
  constraint paid_payment_purchase_currency_check check (currency = 'cad')
);

create table analytics_private.paid_payment_refunds (
  refund_hash text primary key,
  payment_intent_hash text not null,
  checkout_session_hash text,
  product text,
  first_stripe_event_hash text not null,
  last_stripe_event_hash text not null,
  amount_cents bigint not null,
  currency text not null,
  status text not null,
  occurred_at timestamptz not null,
  status_observed_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint paid_payment_refund_hash_check check (refund_hash ~ '^[0-9a-f]{64}$'),
  constraint paid_payment_refund_intent_hash_check check (payment_intent_hash ~ '^[0-9a-f]{64}$'),
  constraint paid_payment_refund_checkout_hash_check
    check (checkout_session_hash is null or checkout_session_hash ~ '^[0-9a-f]{64}$'),
  constraint paid_payment_refund_event_hash_check
    check (first_stripe_event_hash ~ '^[0-9a-f]{64}$' and last_stripe_event_hash ~ '^[0-9a-f]{64}$'),
  constraint paid_payment_refund_product_check
    check (product is null or product in ('rapid_resolution','rapid_resolution_bundle','photo_radar')),
  constraint paid_payment_refund_amount_check check (amount_cents between 1 and 100000000),
  constraint paid_payment_refund_currency_check check (currency = 'cad'),
  constraint paid_payment_refund_status_check
    check (status in ('pending','requires_action','succeeded','failed','canceled')),
  constraint paid_payment_refund_time_check check (status_observed_at >= occurred_at - interval '5 minutes')
);

create index paid_payment_purchase_time_idx
  on analytics_private.paid_payment_purchases(occurred_at, product, currency);
create index paid_payment_refund_intent_idx
  on analytics_private.paid_payment_refunds(payment_intent_hash);
create index paid_payment_refund_status_time_idx
  on analytics_private.paid_payment_refunds(status, status_observed_at, product, currency);

alter table analytics_private.paid_payment_purchases enable row level security;
alter table analytics_private.paid_payment_refunds enable row level security;
revoke all on analytics_private.paid_payment_purchases
  from public, anon, authenticated, service_role;
revoke all on analytics_private.paid_payment_refunds
  from public, anon, authenticated, service_role;

create or replace function public.record_paid_payment_purchase(
  p_checkout_session_hash text,
  p_payment_intent_hash text,
  p_stripe_event_hash text,
  p_occurred_at timestamptz,
  p_product text,
  p_amount_cents bigint,
  p_tax_cents bigint,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attributed_session uuid;
  affected integer;
begin
  if p_checkout_session_hash is null or p_checkout_session_hash !~ '^[0-9a-f]{64}$' or
      p_payment_intent_hash is null or p_payment_intent_hash !~ '^[0-9a-f]{64}$' or
      p_stripe_event_hash is null or p_stripe_event_hash !~ '^[0-9a-f]{64}$' or
      p_occurred_at is null or p_occurred_at < timestamptz '2026-01-01 00:00:00+00' or
      p_occurred_at > clock_timestamp() + interval '5 minutes' or
      p_product not in ('rapid_resolution','rapid_resolution_bundle','photo_radar') or
      p_amount_cents is null or p_amount_cents not between 1 and 100000000 or
      p_tax_cents is null or p_tax_cents not between 0 and p_amount_cents or
      p_currency is distinct from 'cad' then
    raise exception 'PAID_PAYMENT_PURCHASE_INVALID';
  end if;

  -- Use the exact checkout-consent lock namespace from the withdrawal fence so
  -- attribution cannot be decided concurrently with a completed withdrawal.
  perform pg_advisory_xact_lock(hashtextextended(p_checkout_session_hash, 587231904::bigint));
  -- Serialize the order/refund join by the opaque PaymentIntent as well. Lock
  -- checkout first whenever both are needed; refund writers take only this lock.
  perform pg_advisory_xact_lock(hashtextextended(p_payment_intent_hash, 932761506::bigint));

  -- Financial facts are necessary payment operations. Only this optional
  -- anonymous attribution link depends on the first-party consent fence.
  select checkout_record.session_id into attributed_session
  from analytics_private.paid_funnel_checkouts checkout_record
  where checkout_record.checkout_session_hash = p_checkout_session_hash
    and checkout_record.revoked_at is null
    and not exists (
      select 1 from analytics_private.paid_funnel_checkout_withdrawals withdrawal
      where withdrawal.checkout_session_hash = p_checkout_session_hash
    )
  limit 1;

  insert into analytics_private.paid_payment_purchases as purchase (
    checkout_session_hash, payment_intent_hash,
    first_stripe_event_hash, last_stripe_event_hash, funnel_session_id,
    product, amount_cents, tax_cents, currency, occurred_at
  ) values (
    p_checkout_session_hash, p_payment_intent_hash,
    p_stripe_event_hash, p_stripe_event_hash, attributed_session,
    p_product, p_amount_cents, p_tax_cents, p_currency, p_occurred_at
  ) on conflict (checkout_session_hash) do update
    set last_stripe_event_hash = excluded.last_stripe_event_hash,
        occurred_at = least(purchase.occurred_at, excluded.occurred_at),
        updated_at = clock_timestamp()
  where purchase.payment_intent_hash = excluded.payment_intent_hash
    and purchase.product = excluded.product
    and purchase.amount_cents = excluded.amount_cents
    and purchase.tax_cents = excluded.tax_cents
    and purchase.currency = excluded.currency;
  get diagnostics affected = row_count;
  if affected <> 1 then return false; end if;

  -- Stripe does not guarantee webhook ordering. Resolve any earlier refund rows
  -- by their hashed PaymentIntent without introducing a funnel-session link.
  update analytics_private.paid_payment_refunds refund
    set checkout_session_hash = p_checkout_session_hash,
        product = p_product,
        updated_at = clock_timestamp()
  where refund.payment_intent_hash = p_payment_intent_hash
    and refund.checkout_session_hash is null
    and refund.product is null
    and refund.currency = p_currency;

  return true;
end;
$$;

create or replace function public.record_paid_payment_refund(
  p_refund_hash text,
  p_payment_intent_hash text,
  p_stripe_event_hash text,
  p_occurred_at timestamptz,
  p_status_observed_at timestamptz,
  p_amount_cents bigint,
  p_currency text,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  matched_purchase analytics_private.paid_payment_purchases%rowtype;
  affected integer;
begin
  if p_refund_hash is null or p_refund_hash !~ '^[0-9a-f]{64}$' or
      p_payment_intent_hash is null or p_payment_intent_hash !~ '^[0-9a-f]{64}$' or
      p_stripe_event_hash is null or p_stripe_event_hash !~ '^[0-9a-f]{64}$' or
      p_occurred_at is null or p_occurred_at < timestamptz '2026-01-01 00:00:00+00' or
      p_status_observed_at is null or p_status_observed_at < p_occurred_at - interval '5 minutes' or
      p_status_observed_at > clock_timestamp() + interval '5 minutes' or
      p_amount_cents is null or p_amount_cents not between 1 and 100000000 or
      p_currency is distinct from 'cad' or
      p_status not in ('pending','requires_action','succeeded','failed','canceled') then
    raise exception 'PAID_PAYMENT_REFUND_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_payment_intent_hash, 932761506::bigint));
  select * into matched_purchase
  from analytics_private.paid_payment_purchases purchase
  where purchase.payment_intent_hash = p_payment_intent_hash
  limit 1;
  -- A refund never creates attribution. When Stripe delivers it before its
  -- checkout event, retain only the hashed financial fact and reconcile product
  -- and checkout after the verified purchase arrives.
  if found and matched_purchase.currency <> p_currency then return false; end if;

  insert into analytics_private.paid_payment_refunds as refund (
    refund_hash, payment_intent_hash, checkout_session_hash, product,
    first_stripe_event_hash, last_stripe_event_hash,
    amount_cents, currency, status, occurred_at, status_observed_at
  ) values (
    p_refund_hash, p_payment_intent_hash,
    matched_purchase.checkout_session_hash, matched_purchase.product,
    p_stripe_event_hash, p_stripe_event_hash,
    p_amount_cents, p_currency, p_status, p_occurred_at, p_status_observed_at
  ) on conflict (refund_hash) do update
    set status = case
          when refund.status = 'succeeded' then refund.status
          when excluded.status = 'succeeded' then excluded.status
          when excluded.status_observed_at >= refund.status_observed_at then excluded.status
          else refund.status
        end,
        status_observed_at = greatest(refund.status_observed_at, excluded.status_observed_at),
        last_stripe_event_hash = case
          when excluded.status_observed_at >= refund.status_observed_at
            then excluded.last_stripe_event_hash
          else refund.last_stripe_event_hash
        end,
        updated_at = clock_timestamp()
  where refund.payment_intent_hash = excluded.payment_intent_hash
    and refund.amount_cents = excluded.amount_cents
    and refund.currency = excluded.currency
    and refund.occurred_at = excluded.occurred_at;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.record_paid_payment_purchase(
  text,text,text,timestamptz,text,bigint,bigint,text
) from public, anon, authenticated;
revoke all on function public.record_paid_payment_refund(
  text,text,text,timestamptz,timestamptz,bigint,text,text
) from public, anon, authenticated;
grant execute on function public.record_paid_payment_purchase(
  text,text,text,timestamptz,text,bigint,bigint,text
) to service_role;
grant execute on function public.record_paid_payment_refund(
  text,text,text,timestamptz,timestamptz,bigint,text,text
) to service_role;

comment on table analytics_private.paid_payment_purchases is
  'PII-free verified payment facts for all customers. Stripe Checkout Session, PaymentIntent and Event identifiers are stored only as SHA-256 hashes; optional anonymous campaign linkage remains consent-fenced.';
comment on table analytics_private.paid_payment_refunds is
  'PII-free Stripe refund facts, including out-of-order, partial and multiple refunds as separate hashed Refund identifiers. Unmatched rows have no product or checkout attribution. No refund row is sent to Google or Meta.';

commit;
