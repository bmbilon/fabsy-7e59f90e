-- Focused regression for APTO metadata, optional APTO contact fields, manual
-- scan completion, service-role ACLs, and immutable completed audit fields.
begin;

insert into public.representation_consent_invites (
  id, token_hash, expires_at, client_legal_name, client_first_name,
  client_last_name, client_email, ticket_number, ticket_numbers,
  charge_description, base_fee_cents, success_fee_waived
) values (
  '10000000-0000-4000-8000-000000000001', repeat('9', 64),
  clock_timestamp() + interval '1 hour', 'Test Person', 'Test', 'Person',
  'manual-test@example.invalid', 'TEST-1', array['TEST-1', 'TEST-2'],
  'Focused test charge', 48800, true
);

do $$
declare
  issued_first jsonb;
  issued_second jsonb;
  claimed jsonb;
  completed jsonb;
  replayed jsonb;
  reviewed jsonb;
  reviewed_again jsonb;
  active_upload_count integer;
  first_upload_status text;
  stored public.representation_consent_invites%rowtype;
begin
  select * into stored from public.representation_consent_invites
  where id = '10000000-0000-4000-8000-000000000001';
  if stored.representative_first_name <> 'Brett' or stored.representative_last_name <> 'Bilon' or
     stored.representative_firm <> 'Fabsy Traffic Ticket Services' or
     stored.representative_phone <> '(825) 793-2279' or stored.representative_province <> 'AB' or
     stored.government_form_code <> 'APTO13348' or stored.government_form_revision <> '2023-08' then
    raise exception 'APTO/representative defaults are incorrect';
  end if;

  issued_first := public.issue_representation_consent_manual_upload(
    repeat('9', 64), '10000000-0000-4000-8000-000000000002',
    'temporary/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/upload.pdf',
    'application/pdf', 1234, clock_timestamp() + interval '10 minutes'
  );
  if issued_first->>'result' <> 'issued' then
    raise exception 'first manual upload grant failed: %', issued_first;
  end if;

  issued_second := public.issue_representation_consent_manual_upload(
    repeat('9', 64), '10000000-0000-4000-8000-000000000004',
    'temporary/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000004/upload.pdf',
    'application/pdf', 1234, clock_timestamp() + interval '10 minutes'
  );
  if issued_second->>'result' <> 'issued' or
     not (issued_second->'replaced_temp_paths' ?
       'temporary/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/upload.pdf') then
    raise exception 'manual upload rotation failed: %', issued_second;
  end if;
  select count(*) into active_upload_count
  from public.representation_consent_manual_uploads
  where invite_id = '10000000-0000-4000-8000-000000000001' and status in ('issued', 'claimed');
  select status into first_upload_status
  from public.representation_consent_manual_uploads
  where id = '10000000-0000-4000-8000-000000000002';
  if active_upload_count <> 1 or first_upload_status <> 'expired' then
    raise exception 'manual upload active-grant cap failed';
  end if;
  begin
    insert into public.representation_consent_manual_uploads (
      id, invite_id, temp_path, expected_content_type, expected_size_bytes, expires_at
    ) values (
      '10000000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000001',
      'temporary/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000005/upload.pdf',
      'application/pdf', 1234, clock_timestamp() + interval '10 minutes'
    );
    raise exception 'TEST_DID_NOT_REJECT_CONCURRENT_ACTIVE_UPLOAD';
  exception when unique_violation then null;
  end;

  claimed := public.claim_representation_consent_invite_v2(
    repeat('9', 64), '10000000-0000-4000-8000-000000000003', true,
    'manual_scan', null, 'Test Person', current_date,
    'temporary/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000004/upload.pdf',
    'manual/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000003/source.pdf',
    repeat('a', 64), 'application/pdf', 1234,
    'manual/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000003/signed-scan.pdf',
    repeat('b', 64), clock_timestamp(),
    '', date '1990-01-01', '1 Test Street', 'Red Deer', '', '', 'TESTDL1',
    clock_timestamp(), '127.0.0.1', 'focused-sql-test',
    repeat('Signed APTO-style representation-consent test text. ', 4),
    'test-apto-v2', repeat('c', 64)
  );
  if claimed->>'result' <> 'claimed' then
    raise exception 'manual scan claim failed: %', claimed;
  end if;

  completed := public.finalize_representation_consent_invite_v2(
    repeat('9', 64), '10000000-0000-4000-8000-000000000003',
    'standalone/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000003/signed-consent.pdf',
    repeat('d', 64)
  );
  if completed->>'result' <> 'completed' then
    raise exception 'manual scan finalization failed: %', completed;
  end if;

  select * into stored from public.representation_consent_invites
  where id = '10000000-0000-4000-8000-000000000001';
  if stored.status <> 'completed' or stored.signature_method <> 'manual_scan' or
     stored.digital_signature is not null or stored.manual_signed_name <> 'Test Person' or
     stored.manual_scan_review_status <> 'pending' or stored.manual_scan_pdf_sha256 <> repeat('b', 64) or
     stored.signed_client_phone <> '' or stored.signed_client_province <> '' or
     stored.signed_client_postal_code <> '' then
    raise exception 'manual scan completion audit is incorrect';
  end if;

  reviewed := public.transition_representation_consent_manual_review(
    stored.id, 'approved', 'Focused SQL reviewer', null
  );
  if reviewed->>'result' <> 'updated' or reviewed->>'status' <> 'approved' then
    raise exception 'manual review transition failed: %', reviewed;
  end if;
  if (select status from public.representation_consent_manual_reviews where invite_id = stored.id) <> 'approved' or
     (select manual_scan_review_status from public.representation_consent_invites where id = stored.id) <> 'pending' then
    raise exception 'current review state did not remain separate from immutable signed audit';
  end if;
  reviewed_again := public.transition_representation_consent_manual_review(
    stored.id, 'rejected', 'Focused SQL reviewer', 'Should not be accepted'
  );
  if reviewed_again->>'result' <> 'already_reviewed' or reviewed_again->>'status' <> 'approved' then
    raise exception 'terminal review state was changed: %', reviewed_again;
  end if;

  replayed := public.claim_representation_consent_invite_v2(
    repeat('9', 64), gen_random_uuid(), true, 'typed', 'Test Person', null, null,
    null, null, null, null, null, null, null, null,
    '', date '1990-01-01', '1 Test Street', 'Red Deer', '', '', 'TESTDL1',
    clock_timestamp(), null, null,
    repeat('Signed APTO-style representation-consent test text. ', 4),
    'test-apto-v2', repeat('c', 64)
  );
  if replayed->>'result' <> 'completed' then
    raise exception 'completed replay was not idempotent: %', replayed;
  end if;

  begin
    update public.representation_consent_invites
    set manual_scan_review_status = 'approved'
    where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'TEST_DID_NOT_REJECT_COMPLETED_MANUAL_AUDIT_CHANGE';
  exception when others then
    if sqlerrm = 'TEST_DID_NOT_REJECT_COMPLETED_MANUAL_AUDIT_CHANGE' then raise; end if;
  end;

  if has_table_privilege('anon', 'public.representation_consent_manual_uploads', 'select') or
     has_table_privilege('authenticated', 'public.representation_consent_manual_uploads', 'select') or
     not has_table_privilege('service_role', 'public.representation_consent_manual_uploads', 'select') or
     has_table_privilege('service_role', 'public.representation_consent_manual_uploads', 'insert') or
     has_table_privilege('service_role', 'public.representation_consent_manual_reviews', 'update') then
    raise exception 'manual upload grants are not service-role-only';
  end if;
end;
$$;

insert into public.representation_consent_invites (
  id, token_hash, expires_at, client_legal_name, client_first_name,
  client_last_name, client_email, ticket_number, ticket_numbers,
  charge_description, base_fee_cents, success_fee_waived
) values (
  '20000000-0000-4000-8000-000000000001', repeat('8', 64),
  clock_timestamp() + interval '1 hour', 'Typed Person', 'Typed', 'Person',
  'typed-test@example.invalid', 'TEST-3', array['TEST-3'],
  'Focused switched-method test', 48800, true
);

do $$
declare
  issued jsonb;
  claimed jsonb;
  completed jsonb;
  cleanup jsonb;
  grant_status text;
begin
  issued := public.issue_representation_consent_manual_upload(
    repeat('8', 64), '20000000-0000-4000-8000-000000000002',
    'temporary/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002/upload.pdf',
    'application/pdf', 4321, clock_timestamp() + interval '10 minutes'
  );
  if issued->>'result' <> 'issued' then raise exception 'typed switch upload issue failed'; end if;

  claimed := public.claim_representation_consent_invite_v2(
    repeat('8', 64), '20000000-0000-4000-8000-000000000003', true,
    'typed', 'Typed Person', null, null,
    null, null, null, null, null, null, null, null,
    '', date '1990-01-01', '2 Test Street', 'Calgary', '', '', 'TESTDL2',
    clock_timestamp(), null, null,
    repeat('Signed typed representation-consent test text. ', 4),
    'test-apto-v2', repeat('e', 64)
  );
  if claimed->>'result' <> 'claimed' then raise exception 'typed switch claim failed: %', claimed; end if;

  completed := public.finalize_representation_consent_invite_v2(
    repeat('8', 64), '20000000-0000-4000-8000-000000000003',
    'standalone/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000003/signed-consent.pdf',
    repeat('f', 64)
  );
  if completed->>'result' <> 'completed' then raise exception 'typed switch finalize failed: %', completed; end if;

  select status into grant_status from public.representation_consent_manual_uploads
  where id = '20000000-0000-4000-8000-000000000002';
  cleanup := public.expire_representation_consent_manual_uploads(repeat('8', 64));
  if grant_status <> 'expired' or not (cleanup->'paths' ?
    'temporary/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002/upload.pdf') then
    raise exception 'typed completion did not queue unused manual temp for deletion';
  end if;
end;
$$;

rollback;
