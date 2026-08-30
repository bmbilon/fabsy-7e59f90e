-- Cut over new checkout reservations to Rapid Resolution pricing while keeping
-- legacy reservations valid for paid-session reconciliation and rolling deploys.

begin;

-- Fulfilment persists dollar amounts after Stripe confirms payment. Keep this
-- constraint aligned with checkout so new paid reports can be created while
-- historical payments remain valid.
alter table public.idr_orders
  drop constraint if exists idr_orders_type_price_check;

alter table public.idr_orders
  add constraint idr_orders_type_price_check
    check (
      (type = 'standalone' and price_paid in (49.00, 129.00)) or
      (type = 'addon' and price_paid in (31.00, 99.00))
    );

alter table public.idr_checkout_intents
  drop constraint if exists idr_checkout_intents_expected_amount_cents_check,
  drop constraint if exists idr_checkout_intents_product_price_check;

alter table public.idr_checkout_intents
  add constraint idr_checkout_intents_expected_amount_cents_check
    check (expected_amount_cents in (3100, 4900, 9900, 12900, 14900, 19800, 48800)),
  add constraint idr_checkout_intents_product_price_check
    check (
      (type = 'ticket' and expected_amount_cents in (19800, 48800) and checkout_kind = 'ticket_only') or
      (type = 'standalone' and expected_amount_cents in (4900, 12900) and checkout_kind = 'idr_only') or
      (type = 'addon' and expected_amount_cents in (3100, 9900) and checkout_kind in ('idr_only', 'ticket_with_addon')) or
      (type = 'assessment' and expected_amount_cents = 14900 and checkout_kind = 'ticket_assessment')
    );

create or replace function public.reserve_standalone_idr_checkout_intent(
  p_id uuid,
  p_expected_amount_cents integer,
  p_purchaser_email text,
  p_request_fingerprint text
)
returns setof public.idr_checkout_intents
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved public.idr_checkout_intents%rowtype;
  normalized_email text := lower(trim(p_purchaser_email));
  normalized_fingerprint text := trim(p_request_fingerprint);
  window_start timestamptz := now() - interval '1 hour';
begin
  if p_id is null or
     p_expected_amount_cents is null or
     p_expected_amount_cents not in (4900, 12900) or
     normalized_email is null or
     normalized_email = '' or
     normalized_fingerprint is null or
     normalized_fingerprint = '' then
    raise exception 'IDR_CHECKOUT_INVALID_RESERVATION';
  end if;

  -- Every caller takes both locks in the same order. Counts and insert then run
  -- in one transaction, so concurrent requests cannot all pass the limit.
  perform pg_advisory_xact_lock(hashtextextended(normalized_fingerprint, 0));
  perform pg_advisory_xact_lock(hashtextextended(normalized_email, 1));

  select *
  into reserved
  from public.idr_checkout_intents
  where id = p_id;

  if found then
    return next reserved;
    return;
  end if;

  if (
    select count(*) >= 5
    from public.idr_checkout_intents
    where request_fingerprint = normalized_fingerprint
      and created_at >= window_start
  ) or (
    select count(*) >= 3
    from public.idr_checkout_intents
    where purchaser_email = normalized_email
      and created_at >= window_start
  ) then
    raise exception 'IDR_CHECKOUT_RATE_LIMIT';
  end if;

  insert into public.idr_checkout_intents (
    id,
    client_id,
    ticket_submission_id,
    type,
    checkout_kind,
    expected_amount_cents,
    purchaser_email,
    request_fingerprint
  ) values (
    p_id,
    null,
    null,
    'standalone',
    'idr_only',
    p_expected_amount_cents,
    normalized_email,
    normalized_fingerprint
  )
  returning * into reserved;

  return next reserved;
end;
$$;

revoke all on function public.reserve_standalone_idr_checkout_intent(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_standalone_idr_checkout_intent(uuid, integer, text, text)
  to service_role;

comment on function public.reserve_standalone_idr_checkout_intent(uuid, integer, text, text) is
  'Atomically rate-limits and reserves a standalone insurance impact review checkout; accepts current and legacy prices during the pricing transition.';

commit;
