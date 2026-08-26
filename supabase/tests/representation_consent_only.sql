-- Focused regression for the consent-only v3 RPC contract. APTO13348 does not
-- request a driver's-licence number, so the legacy audit field remains empty.
begin;

insert into public.representation_consent_invites (
  id, token_hash, expires_at, client_legal_name, client_first_name,
  client_last_name, client_email, ticket_number, ticket_numbers,
  charge_description, base_fee_cents
) values (
  '30000000-0000-4000-8000-000000000001', repeat('7', 64),
  clock_timestamp() + interval '1 hour', 'Consent Test', 'Consent', 'Test',
  'consent-only-test@example.invalid', 'CONSENT-ONLY-1',
  array['CONSENT-ONLY-1'], 'Focused consent-only test charge', 14900
);

do $$
declare
  claimed jsonb;
  completed jsonb;
  stored public.representation_consent_invites%rowtype;
begin
  claimed := public.claim_representation_consent_invite_v2(
    repeat('7', 64), '30000000-0000-4000-8000-000000000002', true,
    'typed', 'Consent Test', null, null,
    null, null, null, null, null, null, null, null,
    '', date '1990-01-01', '3 Test Street', 'Edmonton', 'AB', 'T5J 0N3', '',
    clock_timestamp(), '127.0.0.1', 'consent-only-sql-test',
    repeat('Signed consent-only authorization text without commercial terms. ', 3),
    'standalone-representation-consent-v3-consent-only-test', repeat('a', 64)
  );
  if claimed->>'result' <> 'claimed' then
    raise exception 'empty legacy driver field was rejected: %', claimed;
  end if;

  completed := public.finalize_representation_consent_invite_v2(
    repeat('7', 64), '30000000-0000-4000-8000-000000000002',
    'standalone/30000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/signed-consent.pdf',
    repeat('b', 64)
  );
  if completed->>'result' <> 'completed' then
    raise exception 'consent-only finalization failed: %', completed;
  end if;

  select * into stored from public.representation_consent_invites
  where id = '30000000-0000-4000-8000-000000000001';
  if stored.status <> 'completed' or stored.signature_method <> 'typed' or
     stored.signed_client_drivers_license is distinct from '' or
     stored.signed_consent_text_version <> 'standalone-representation-consent-v3-consent-only-test' then
    raise exception 'consent-only audit was not sealed as expected';
  end if;
end;
$$;

rollback;
