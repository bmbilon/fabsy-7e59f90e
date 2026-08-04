-- Make the public standalone IDR rate limit atomic across concurrent Edge
-- Function instances. Core/report intent lanes and product constraints are
-- established by the preceding IDR security-hardening migration.

create index if not exists idx_idr_checkout_intents_email_rate
  on public.idr_checkout_intents (purchaser_email, created_at desc);

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
     p_expected_amount_cents <> 12900 or
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
  'Atomically rate-limits and reserves a public standalone IDR Stripe checkout.';
