-- Focused regression for the secure standalone consent identifier, immutable
-- reissue chain, and durable operator notification. Run after migration
-- 20260915140000_consent_completion_notifications.sql.
begin;

create function pg_temp.assert(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'Assertion failed: %', message; end if;
end $$;

insert into public.representation_consent_invites(
  id, token_hash, expires_at, client_legal_name, client_first_name,
  client_last_name, client_email, ticket_number, ticket_numbers,
  charge_description, base_fee_cents
) values
(
  '31000000-0000-4000-8000-000000000001', repeat('1', 64),
  clock_timestamp() + interval '1 hour', 'Consent Test', 'Consent', 'Test',
  'consent-notification@example.invalid', 'CONSENT-NOTIFY-1',
  array['CONSENT-NOTIFY-1'], 'Focused consent notification test', 0
),
(
  '31000000-0000-4000-8000-000000000004', repeat('4', 64),
  clock_timestamp() + interval '1 hour', 'Reissue Test', 'Reissue', 'Test',
  'consent-reissue@example.invalid', 'CONSENT-REISSUE-1',
  array['CONSENT-REISSUE-1'], 'Focused consent reissue test', 0
);

do $$
declare
  result jsonb;
begin
  result := public.claim_representation_consent_invite_v3(
    p_token_hash => repeat('1', 64),
    p_claim_id => '31000000-0000-4000-8000-000000000002',
    p_accepted => true,
    p_signature_method => 'typed',
    p_digital_signature => 'Consent Test',
    p_manual_signed_name => null,
    p_manual_signed_date => null,
    p_manual_scan_temp_path => null,
    p_manual_scan_source_path => null,
    p_manual_scan_source_sha256 => null,
    p_manual_scan_source_content_type => null,
    p_manual_scan_source_size => null,
    p_manual_scan_pdf_path => null,
    p_manual_scan_pdf_sha256 => null,
    p_manual_scan_uploaded_at => null,
    p_client_phone => '',
    p_client_date_of_birth => date '1994-06-03',
    p_client_address => '3 Test Street',
    p_client_city => 'Calgary',
    p_client_province => 'AB',
    p_client_postal_code => 'T2P 5P7',
    p_disclosure_lookup_type => 'drivers_licence',
    p_disclosure_lookup_value => '',
    p_client_reported_signed_at => clock_timestamp(),
    p_signing_ip => '127.0.0.1',
    p_signing_user_agent => 'consent-notification-sql-test',
    p_consent_text => repeat('Signed authorization text for the focused regression. ', 3),
    p_consent_text_version => 'consent-notification-test-v1',
    p_consent_text_hash => repeat('a', 64)
  );
  perform pg_temp.assert(
    result->>'result' = 'invalid_client_details',
    'missing disclosure lookup is rejected'
  );

  result := public.claim_representation_consent_invite_v3(
    p_token_hash => repeat('1', 64),
    p_claim_id => '31000000-0000-4000-8000-000000000002',
    p_accepted => true,
    p_signature_method => 'typed',
    p_digital_signature => 'Consent Test',
    p_manual_signed_name => null,
    p_manual_signed_date => null,
    p_manual_scan_temp_path => null,
    p_manual_scan_source_path => null,
    p_manual_scan_source_sha256 => null,
    p_manual_scan_source_content_type => null,
    p_manual_scan_source_size => null,
    p_manual_scan_pdf_path => null,
    p_manual_scan_pdf_sha256 => null,
    p_manual_scan_uploaded_at => null,
    p_client_phone => '',
    p_client_date_of_birth => date '1994-06-03',
    p_client_address => '3 Test Street',
    p_client_city => 'Calgary',
    p_client_province => 'AB',
    p_client_postal_code => 'T2P 5P7',
    p_disclosure_lookup_type => 'drivers_licence',
    p_disclosure_lookup_value => '169071743',
    p_client_reported_signed_at => clock_timestamp(),
    p_signing_ip => '127.0.0.1',
    p_signing_user_agent => 'consent-notification-sql-test',
    p_consent_text => repeat('Signed authorization text for the focused regression. ', 3),
    p_consent_text_version => 'consent-notification-test-v1',
    p_consent_text_hash => repeat('a', 64)
  );
  perform pg_temp.assert(result->>'result' = 'claimed', 'valid lookup is claimed');

  result := public.finalize_representation_consent_invite_v2(
    repeat('1', 64),
    '31000000-0000-4000-8000-000000000002',
    'standalone/31000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000002/signed-consent.pdf',
    repeat('b', 64)
  );
  perform pg_temp.assert(result->>'result' = 'completed', 'valid consent finalizes');
end $$;

select pg_temp.assert(
  (
    select status = 'completed' and
      signed_client_date_of_birth = date '1994-06-03' and
      disclosure_lookup_type = 'drivers_licence' and
      disclosure_lookup_value = '169071743'
    from public.representation_consent_invites
    where id = '31000000-0000-4000-8000-000000000001'
  ),
  'signed DOB and lookup are sealed on the completed invitation'
);

select pg_temp.assert(
  (
    select count(*) = 1 and
      min(payload->>'client_date_of_birth') = '1994-06-03' and
      min(payload->>'disclosure_lookup_value') = '169071743'
    from public.portal_activity_events
    where event_key = 'legacy-representation-consent:31000000-0000-4000-8000-000000000001'
  ),
  'completion enqueues one actionable operator event'
);

do $$
declare
  first_result jsonb;
  replay_result jsonb;
begin
  first_result := public.reissue_representation_consent_invite(
    '31000000-0000-4000-8000-000000000004', repeat('5', 64),
    clock_timestamp() + interval '7 days'
  );
  replay_result := public.reissue_representation_consent_invite(
    '31000000-0000-4000-8000-000000000004', repeat('6', 64),
    clock_timestamp() + interval '7 days'
  );
  perform pg_temp.assert(first_result->>'result' = 'created', 'first reissue succeeds');
  perform pg_temp.assert(replay_result->>'result' = 'already_reissued', 'reissue replay is rejected');
end $$;

select pg_temp.assert(
  (
    select count(*) = 1
    from public.representation_consent_invites
    where reissued_from_invite_id = '31000000-0000-4000-8000-000000000004'
      and status = 'pending'
  ),
  'only one live replacement token exists'
);

select pg_temp.assert(
  not has_function_privilege(
    'anon',
    'public.claim_representation_consent_invite_v3(text,uuid,boolean,text,text,text,date,text,text,text,text,bigint,text,text,timestamptz,text,date,text,text,text,text,text,text,timestamptz,text,text,text,text,text)',
    'EXECUTE'
  ) and not has_function_privilege(
    'authenticated',
    'public.reissue_representation_consent_invite(uuid,text,timestamptz)',
    'EXECUTE'
  ),
  'bearer claim and staff reissue RPCs remain service-role only'
);

rollback;
