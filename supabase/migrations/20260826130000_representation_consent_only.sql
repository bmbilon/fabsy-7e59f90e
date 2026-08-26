-- Keep the consent endpoint limited to APTO13348 authorization fields.
-- The legacy driver's-licence RPC parameter remains for signature compatibility,
-- but an empty string is now the canonical v3 consent-only audit value.
begin;

create or replace function public.claim_representation_consent_invite_v2(
  p_token_hash text, p_claim_id uuid, p_accepted boolean, p_signature_method text,
  p_digital_signature text, p_manual_signed_name text, p_manual_signed_date date,
  p_manual_scan_temp_path text, p_manual_scan_source_path text, p_manual_scan_source_sha256 text,
  p_manual_scan_source_content_type text, p_manual_scan_source_size bigint,
  p_manual_scan_pdf_path text, p_manual_scan_pdf_sha256 text, p_manual_scan_uploaded_at timestamptz,
  p_client_phone text, p_client_date_of_birth date, p_client_address text, p_client_city text,
  p_client_province text, p_client_postal_code text, p_client_drivers_license text,
  p_client_reported_signed_at timestamptz, p_signing_ip text, p_signing_user_agent text,
  p_consent_text text, p_consent_text_version text, p_consent_text_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invite public.representation_consent_invites%rowtype;
  current_upload public.representation_consent_manual_uploads%rowtype;
  normalized_name text;
  expected_name text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_claim_id is null or
     p_accepted is distinct from true or p_signature_method not in ('typed', 'manual_scan') then
    return jsonb_build_object('result', 'invalid');
  end if;

  select * into current_invite from public.representation_consent_invites
  where token_hash = p_token_hash for update;
  if not found then return null; end if;
  if current_invite.access_revoked_at is not null or current_invite.status = 'revoked' then
    return jsonb_build_object('result', 'revoked');
  end if;
  if current_invite.expires_at <= now() or current_invite.status = 'expired' then
    return jsonb_build_object('result', 'expired');
  end if;
  if current_invite.status = 'completed' then
    return jsonb_build_object('result', 'completed', 'invite', to_jsonb(current_invite));
  end if;
  if current_invite.status = 'signing' and current_invite.processing_expires_at > now() then
    return jsonb_build_object('result', 'processing');
  end if;
  if current_invite.status = 'signing' then
    perform public.release_representation_consent_invite_claim(p_token_hash, current_invite.processing_claim_id);
    select * into current_invite from public.representation_consent_invites where id = current_invite.id for update;
  end if;

  normalized_name := regexp_replace(trim(coalesce(
    case when p_signature_method = 'typed' then p_digital_signature else p_manual_signed_name end, ''
  )), '[[:space:]]+', ' ', 'g');
  expected_name := regexp_replace(trim(current_invite.client_legal_name), '[[:space:]]+', ' ', 'g');
  if normalized_name = '' or normalized_name <> expected_name then
    return jsonb_build_object('result', 'signature_mismatch');
  end if;
  if p_signature_method = 'manual_scan' and (p_manual_signed_date is null or p_manual_signed_date > current_date or
     p_manual_signed_date < date '1900-01-01') then
    return jsonb_build_object('result', 'invalid_manual_scan');
  end if;
  if p_client_phone is null or (
       trim(p_client_phone) <> '' and (
         length(trim(p_client_phone)) not between 7 and 30 or
         length(regexp_replace(p_client_phone, '[^0-9]', '', 'g')) not between 10 and 15
       )
     ) or
     p_client_date_of_birth is null or p_client_date_of_birth < date '1900-01-01' or p_client_date_of_birth > current_date or
     p_client_address is null or length(trim(p_client_address)) not between 1 and 160 or
     p_client_city is null or length(trim(p_client_city)) not between 1 and 80 or
     p_client_province is null or length(trim(p_client_province)) > 80 or
     p_client_postal_code is null or (
       trim(p_client_postal_code) <> '' and length(trim(p_client_postal_code)) not between 3 and 12
     ) or
     p_client_drivers_license is null or (
       trim(p_client_drivers_license) <> '' and
       length(trim(p_client_drivers_license)) not between 3 and 40
     ) or
     p_client_reported_signed_at is null or p_client_reported_signed_at < now() - interval '24 hours' or
     p_client_reported_signed_at > now() + interval '10 minutes' then
    return jsonb_build_object('result', 'invalid_client_details');
  end if;
  if p_consent_text is null or length(p_consent_text) not between 100 and 30000 or
     p_consent_text_version is null or length(trim(p_consent_text_version)) not between 1 and 100 or
     p_consent_text_hash is null or p_consent_text_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;

  if p_signature_method = 'manual_scan' then
    select * into current_upload from public.representation_consent_manual_uploads
    where invite_id = current_invite.id and temp_path = p_manual_scan_temp_path for update;
    if not found or current_upload.status <> 'issued' or current_upload.expires_at <= now() or
       current_upload.expected_content_type <> p_manual_scan_source_content_type or
       current_upload.expected_size_bytes <> p_manual_scan_source_size or
       p_manual_scan_source_sha256 !~ '^[0-9a-f]{64}$' or p_manual_scan_pdf_sha256 !~ '^[0-9a-f]{64}$' or
       p_manual_scan_source_path not like ('manual/' || current_invite.id::text || '/' || p_claim_id::text || '/source.%') or
       p_manual_scan_pdf_path not like ('manual/' || current_invite.id::text || '/' || p_claim_id::text || '/signed-scan.pdf') or
       position('..' in p_manual_scan_source_path) > 0 or position('..' in p_manual_scan_pdf_path) > 0 then
      return jsonb_build_object('result', 'invalid_manual_scan');
    end if;
    update public.representation_consent_manual_uploads
    set status = 'claimed', claim_id = p_claim_id, claimed_at = clock_timestamp()
    where id = current_upload.id;
  end if;

  update public.representation_consent_invites
  set status = 'signing', processing_claim_id = p_claim_id, processing_started_at = clock_timestamp(),
      processing_expires_at = clock_timestamp() + interval '10 minutes', pending_signed_at = clock_timestamp(),
      pending_signature_method = p_signature_method,
      pending_digital_signature = case when p_signature_method = 'typed' then normalized_name else null end,
      pending_manual_signed_name = case when p_signature_method = 'manual_scan' then normalized_name else null end,
      pending_manual_signed_date = case when p_signature_method = 'manual_scan' then p_manual_signed_date else null end,
      pending_manual_scan_source_path = case when p_signature_method = 'manual_scan' then p_manual_scan_source_path else null end,
      pending_manual_scan_source_sha256 = case when p_signature_method = 'manual_scan' then p_manual_scan_source_sha256 else null end,
      pending_manual_scan_source_content_type = case when p_signature_method = 'manual_scan' then p_manual_scan_source_content_type else null end,
      pending_manual_scan_source_size = case when p_signature_method = 'manual_scan' then p_manual_scan_source_size else null end,
      pending_manual_scan_pdf_path = case when p_signature_method = 'manual_scan' then p_manual_scan_pdf_path else null end,
      pending_manual_scan_pdf_sha256 = case when p_signature_method = 'manual_scan' then p_manual_scan_pdf_sha256 else null end,
      pending_manual_scan_uploaded_at = case when p_signature_method = 'manual_scan' then p_manual_scan_uploaded_at else null end,
      pending_manual_scan_review_status = case when p_signature_method = 'manual_scan' then 'pending' else null end,
      pending_client_phone = trim(p_client_phone), pending_client_date_of_birth = p_client_date_of_birth,
      pending_client_address = trim(p_client_address), pending_client_city = trim(p_client_city),
      pending_client_province = trim(p_client_province), pending_client_postal_code = upper(trim(p_client_postal_code)),
      pending_client_drivers_license = trim(p_client_drivers_license),
      pending_client_reported_signed_at = p_client_reported_signed_at,
      pending_signing_ip = nullif(left(trim(coalesce(p_signing_ip, '')), 100), ''),
      pending_signing_user_agent = nullif(left(trim(coalesce(p_signing_user_agent, '')), 500), ''),
      pending_consent_text = p_consent_text, pending_consent_text_version = trim(p_consent_text_version),
      pending_consent_text_hash = p_consent_text_hash
  where id = current_invite.id and status = 'pending'
  returning * into current_invite;
  if not found then return jsonb_build_object('result', 'processing'); end if;
  return jsonb_build_object('result', 'claimed', 'invite', to_jsonb(current_invite));
end;
$$;

revoke all on function public.claim_representation_consent_invite_v2(text, uuid, boolean, text, text, text, date, text, text, text, text, bigint, text, text, timestamptz, text, date, text, text, text, text, text, timestamptz, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_representation_consent_invite_v2(text, uuid, boolean, text, text, text, date, text, text, text, text, bigint, text, text, timestamptz, text, date, text, text, text, text, text, timestamptz, text, text, text, text, text) to service_role;

comment on column public.representation_consent_invites.signed_client_drivers_license is
  'Legacy compatibility field. Consent-only v3 submissions store an empty string; APTO13348 does not request this value.';

commit;
