-- Focused regression checks for 20260825211000. Run only against an isolated
-- test database after the base and follow-up consent migrations are applied.

begin;

insert into public.representation_consent_invites (
  id,
  token_hash,
  status,
  created_at,
  expires_at,
  client_legal_name,
  client_email,
  ticket_number,
  charge_description,
  base_fee_cents,
  signed_at,
  digital_signature,
  signed_client_phone,
  signed_client_date_of_birth,
  signed_client_address,
  signed_client_city,
  signed_client_province,
  signed_client_postal_code,
  signed_client_drivers_license,
  client_reported_signed_at,
  signed_consent_text,
  signed_consent_text_version,
  signed_consent_text_hash,
  pdf_path,
  pdf_sha256
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    repeat('a', 64),
    'completed',
    clock_timestamp() - interval '1 hour',
    clock_timestamp() + interval '1 hour',
    'Test Client',
    'test-active@example.invalid',
    'TEST-ACTIVE',
    'Test charge',
    48800,
    clock_timestamp() - interval '30 minutes',
    'Test Client',
    '403-555-0100',
    date '1990-01-01',
    '1 Test Street',
    'Calgary',
    'Alberta',
    'T1T 1T1',
    'TEST123',
    clock_timestamp() - interval '30 minutes',
    'Test signed consent text',
    'test-v1',
    repeat('b', 64),
    'standalone/00000000-0000-0000-0000-000000000001/test.pdf',
    repeat('c', 64)
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    repeat('d', 64),
    'completed',
    clock_timestamp() - interval '2 hours',
    clock_timestamp() - interval '1 hour',
    'Expired Test Client',
    'test-expired@example.invalid',
    'TEST-EXPIRED',
    'Test charge',
    48800,
    clock_timestamp() - interval '90 minutes',
    'Expired Test Client',
    '403-555-0101',
    date '1990-01-01',
    '2 Test Street',
    'Edmonton',
    'Alberta',
    'T2T 2T2',
    'TEST456',
    clock_timestamp() - interval '90 minutes',
    'Expired test signed consent text',
    'test-v1',
    repeat('e', 64),
    'standalone/00000000-0000-0000-0000-000000000002/test.pdf',
    repeat('f', 64)
  );

do $$
declare
  resolved jsonb;
  stored_status text;
  stored_hash text;
begin
  resolved := public.resolve_representation_consent_invite(repeat('a', 64));
  if resolved->>'status' <> 'completed' or
     resolved->>'client_email' <> 'test-active@example.invalid' then
    raise exception 'active completed invite did not resolve normally';
  end if;

  update public.representation_consent_invites
  set access_revoked_at = clock_timestamp(),
      access_revocation_reason = 'Focused access-control test'
  where id = '00000000-0000-0000-0000-000000000001'
  returning status, signed_consent_text_hash into stored_status, stored_hash;

  if stored_status <> 'completed' or stored_hash <> repeat('b', 64) then
    raise exception 'access revocation modified the completed audit';
  end if;

  resolved := public.resolve_representation_consent_invite(repeat('a', 64));
  if resolved <> jsonb_build_object('status', 'revoked') then
    raise exception 'revoked resolver response exposed more than synthetic status: %', resolved;
  end if;

  begin
    update public.representation_consent_invites
    set access_revoked_at = null,
        access_revocation_reason = null
    where id = '00000000-0000-0000-0000-000000000001';
    raise exception 'TEST_DID_NOT_REJECT_ACCESS_REVOCATION_REVERSAL';
  exception
    when others then
      if sqlerrm = 'TEST_DID_NOT_REJECT_ACCESS_REVOCATION_REVERSAL' then
        raise;
      end if;
  end;

  begin
    update public.representation_consent_invites
    set signed_consent_text = 'tampered'
    where id = '00000000-0000-0000-0000-000000000001';
    raise exception 'TEST_DID_NOT_REJECT_COMPLETED_AUDIT_CHANGE';
  exception
    when others then
      if sqlerrm = 'TEST_DID_NOT_REJECT_COMPLETED_AUDIT_CHANGE' then
        raise;
      end if;
  end;

  resolved := public.resolve_representation_consent_invite(repeat('d', 64));
  if resolved <> jsonb_build_object('status', 'expired') then
    raise exception 'expired resolver response exposed more than synthetic status: %', resolved;
  end if;

  select status into stored_status
  from public.representation_consent_invites
  where id = '00000000-0000-0000-0000-000000000002';
  if stored_status <> 'completed' then
    raise exception 'expired bearer access changed completed status';
  end if;

  if has_table_privilege('anon', 'public.representation_consent_invites', 'select') or
     has_table_privilege('authenticated', 'public.representation_consent_invites', 'select') or
     not has_table_privilege('service_role', 'public.representation_consent_invites', 'select') then
    raise exception 'representation consent table privileges are not service-role-only';
  end if;
end;
$$;

rollback;
