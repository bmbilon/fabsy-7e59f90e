-- Standalone, single-use representation-consent invitations.
--
-- Invitation creation is deliberately not exposed publicly. Staff create an
-- invite with the service role after hashing a cryptographically random token;
-- the plaintext token is sent to the client and is never stored in Postgres.

begin;

create table public.representation_consent_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revocation_reason text,

  ticket_submission_id uuid references public.ticket_submissions(id) on delete set null,
  client_legal_name text not null,
  client_email text not null,
  client_phone text,
  client_date_of_birth date,
  client_address text,
  client_city text,
  client_province text,
  client_postal_code text,
  client_drivers_license text,
  ticket_number text not null,
  charge_description text not null,
  offence_date_text text,
  court_location text,
  court_date_text text,
  matter_details text,

  base_fee_cents integer not null,
  fee_currency text not null default 'CAD',
  tax_terms text not null default 'plus applicable GST',
  success_fee_percent numeric(5, 2) not null default 30,
  success_fee_waived boolean not null default false,
  additional_fee_terms text,
  additional_authorization_terms text,

  processing_claim_id uuid,
  processing_started_at timestamptz,
  processing_expires_at timestamptz,
  pending_signed_at timestamptz,
  pending_digital_signature text,
  pending_client_phone text,
  pending_client_date_of_birth date,
  pending_client_address text,
  pending_client_city text,
  pending_client_province text,
  pending_client_postal_code text,
  pending_client_drivers_license text,
  pending_client_reported_signed_at timestamptz,
  pending_signing_ip text,
  pending_signing_user_agent text,
  pending_consent_text text,
  pending_consent_text_version text,
  pending_consent_text_hash text,

  signed_at timestamptz,
  digital_signature text,
  signed_client_phone text,
  signed_client_date_of_birth date,
  signed_client_address text,
  signed_client_city text,
  signed_client_province text,
  signed_client_postal_code text,
  signed_client_drivers_license text,
  client_reported_signed_at timestamptz,
  signing_ip text,
  signing_user_agent text,
  signed_consent_text text,
  signed_consent_text_version text,
  signed_consent_text_hash text,
  pdf_path text,
  pdf_sha256 text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint representation_consent_invites_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint representation_consent_invites_status_check
    check (status in ('pending', 'signing', 'completed', 'revoked', 'expired')),
  constraint representation_consent_invites_expiry_check
    check (expires_at > created_at),
  constraint representation_consent_invites_client_name_check
    check (length(trim(client_legal_name)) between 1 and 200),
  constraint representation_consent_invites_client_email_check
    check (length(trim(client_email)) between 3 and 320),
  constraint representation_consent_invites_ticket_number_check
    check (length(trim(ticket_number)) between 1 and 120),
  constraint representation_consent_invites_charge_check
    check (length(trim(charge_description)) between 1 and 500),
  constraint representation_consent_invites_base_fee_check
    check (base_fee_cents >= 0 and base_fee_cents <= 100000000),
  constraint representation_consent_invites_currency_check
    check (fee_currency ~ '^[A-Z]{3}$'),
  constraint representation_consent_invites_success_fee_check
    check (success_fee_percent >= 0 and success_fee_percent <= 100),
  constraint representation_consent_invites_revocation_check
    check (
      (status = 'revoked' and revoked_at is not null) or
      (status <> 'revoked' and revoked_at is null)
    ),
  constraint representation_consent_invites_processing_check
    check (
      (
        status = 'signing' and
        processing_claim_id is not null and
        processing_started_at is not null and
        processing_expires_at is not null and
        pending_signed_at is not null and
        pending_digital_signature is not null and
        pending_client_phone is not null and
        pending_client_date_of_birth is not null and
        pending_client_address is not null and
        pending_client_city is not null and
        pending_client_province is not null and
        pending_client_postal_code is not null and
        pending_client_drivers_license is not null and
        pending_client_reported_signed_at is not null and
        pending_consent_text is not null and
        pending_consent_text_version is not null and
        pending_consent_text_hash ~ '^[0-9a-f]{64}$'
      ) or
      (
        status <> 'signing' and
        processing_claim_id is null and
        processing_started_at is null and
        processing_expires_at is null and
        pending_signed_at is null and
        pending_digital_signature is null and
        pending_client_phone is null and
        pending_client_date_of_birth is null and
        pending_client_address is null and
        pending_client_city is null and
        pending_client_province is null and
        pending_client_postal_code is null and
        pending_client_drivers_license is null and
        pending_client_reported_signed_at is null and
        pending_signing_ip is null and
        pending_signing_user_agent is null and
        pending_consent_text is null and
        pending_consent_text_version is null and
        pending_consent_text_hash is null
      )
    ),
  constraint representation_consent_invites_completion_check
    check (
      (
        status = 'completed' and
        signed_at is not null and
        digital_signature is not null and
        signed_client_phone is not null and
        signed_client_date_of_birth is not null and
        signed_client_address is not null and
        signed_client_city is not null and
        signed_client_province is not null and
        signed_client_postal_code is not null and
        signed_client_drivers_license is not null and
        client_reported_signed_at is not null and
        signed_consent_text is not null and
        signed_consent_text_version is not null and
        signed_consent_text_hash ~ '^[0-9a-f]{64}$' and
        pdf_path is not null and
        pdf_sha256 ~ '^[0-9a-f]{64}$'
      ) or
      (
        status <> 'completed' and
        signed_at is null and
        digital_signature is null and
        signed_client_phone is null and
        signed_client_date_of_birth is null and
        signed_client_address is null and
        signed_client_city is null and
        signed_client_province is null and
        signed_client_postal_code is null and
        signed_client_drivers_license is null and
        client_reported_signed_at is null and
        signing_ip is null and
        signing_user_agent is null and
        signed_consent_text is null and
        signed_consent_text_version is null and
        signed_consent_text_hash is null and
        pdf_path is null and
        pdf_sha256 is null
      )
    )
);

create index representation_consent_invites_status_expiry_idx
  on public.representation_consent_invites(status, expires_at);
create index representation_consent_invites_ticket_submission_idx
  on public.representation_consent_invites(ticket_submission_id)
  where ticket_submission_id is not null;

alter table public.representation_consent_invites enable row level security;
alter table public.representation_consent_invites force row level security;

revoke all on table public.representation_consent_invites
  from public, anon, authenticated;
grant select, insert, update, delete on table public.representation_consent_invites
  to service_role;

create trigger update_representation_consent_invites_updated_at
  before update on public.representation_consent_invites
  for each row execute function public.update_updated_at_column();

create or replace function public.protect_representation_consent_invite_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.token_hash is distinct from old.token_hash or
     new.ticket_submission_id is distinct from old.ticket_submission_id or
     new.client_legal_name is distinct from old.client_legal_name or
     new.client_email is distinct from old.client_email or
     new.client_phone is distinct from old.client_phone or
     new.client_date_of_birth is distinct from old.client_date_of_birth or
     new.client_address is distinct from old.client_address or
     new.client_city is distinct from old.client_city or
     new.client_province is distinct from old.client_province or
     new.client_postal_code is distinct from old.client_postal_code or
     new.client_drivers_license is distinct from old.client_drivers_license or
     new.ticket_number is distinct from old.ticket_number or
     new.charge_description is distinct from old.charge_description or
     new.offence_date_text is distinct from old.offence_date_text or
     new.court_location is distinct from old.court_location or
     new.court_date_text is distinct from old.court_date_text or
     new.matter_details is distinct from old.matter_details or
     new.base_fee_cents is distinct from old.base_fee_cents or
     new.fee_currency is distinct from old.fee_currency or
     new.tax_terms is distinct from old.tax_terms or
     new.success_fee_percent is distinct from old.success_fee_percent or
     new.success_fee_waived is distinct from old.success_fee_waived or
     new.additional_fee_terms is distinct from old.additional_fee_terms or
     new.additional_authorization_terms is distinct from old.additional_authorization_terms or
     new.expires_at is distinct from old.expires_at or
     new.created_at is distinct from old.created_at then
    raise exception 'REPRESENTATION_CONSENT_INVITE_TERMS_IMMUTABLE';
  end if;

  if old.status = 'completed' and (
    new.status is distinct from old.status or
    new.signed_at is distinct from old.signed_at or
    new.digital_signature is distinct from old.digital_signature or
    new.signed_client_phone is distinct from old.signed_client_phone or
    new.signed_client_date_of_birth is distinct from old.signed_client_date_of_birth or
    new.signed_client_address is distinct from old.signed_client_address or
    new.signed_client_city is distinct from old.signed_client_city or
    new.signed_client_province is distinct from old.signed_client_province or
    new.signed_client_postal_code is distinct from old.signed_client_postal_code or
    new.signed_client_drivers_license is distinct from old.signed_client_drivers_license or
    new.client_reported_signed_at is distinct from old.client_reported_signed_at or
    new.signing_ip is distinct from old.signing_ip or
    new.signing_user_agent is distinct from old.signing_user_agent or
    new.signed_consent_text is distinct from old.signed_consent_text or
    new.signed_consent_text_version is distinct from old.signed_consent_text_version or
    new.signed_consent_text_hash is distinct from old.signed_consent_text_hash or
    new.pdf_path is distinct from old.pdf_path or
    new.pdf_sha256 is distinct from old.pdf_sha256
  ) then
    raise exception 'COMPLETED_REPRESENTATION_CONSENT_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger protect_representation_consent_invite_terms
  before update on public.representation_consent_invites
  for each row execute function public.protect_representation_consent_invite_terms();

create or replace function public.resolve_representation_consent_invite(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invite public.representation_consent_invites%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select * into current_invite
  from public.representation_consent_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    return null;
  end if;

  if current_invite.status in ('pending', 'signing') and
     current_invite.expires_at <= now() then
    update public.representation_consent_invites
    set status = 'expired',
        processing_claim_id = null,
        processing_started_at = null,
        processing_expires_at = null,
        pending_signed_at = null,
        pending_digital_signature = null,
        pending_client_phone = null,
        pending_client_date_of_birth = null,
        pending_client_address = null,
        pending_client_city = null,
        pending_client_province = null,
        pending_client_postal_code = null,
        pending_client_drivers_license = null,
        pending_client_reported_signed_at = null,
        pending_signing_ip = null,
        pending_signing_user_agent = null,
        pending_consent_text = null,
        pending_consent_text_version = null,
        pending_consent_text_hash = null
    where id = current_invite.id
    returning * into current_invite;
  elsif current_invite.status = 'signing' and
        current_invite.processing_expires_at <= now() then
    update public.representation_consent_invites
    set status = 'pending',
        processing_claim_id = null,
        processing_started_at = null,
        processing_expires_at = null,
        pending_signed_at = null,
        pending_digital_signature = null,
        pending_client_phone = null,
        pending_client_date_of_birth = null,
        pending_client_address = null,
        pending_client_city = null,
        pending_client_province = null,
        pending_client_postal_code = null,
        pending_client_drivers_license = null,
        pending_client_reported_signed_at = null,
        pending_signing_ip = null,
        pending_signing_user_agent = null,
        pending_consent_text = null,
        pending_consent_text_version = null,
        pending_consent_text_hash = null
    where id = current_invite.id
    returning * into current_invite;
  end if;

  return to_jsonb(current_invite);
end;
$$;

create or replace function public.claim_representation_consent_invite(
  p_token_hash text,
  p_claim_id uuid,
  p_accepted boolean,
  p_digital_signature text,
  p_client_phone text,
  p_client_date_of_birth date,
  p_client_address text,
  p_client_city text,
  p_client_province text,
  p_client_postal_code text,
  p_client_drivers_license text,
  p_client_reported_signed_at timestamptz,
  p_signing_ip text,
  p_signing_user_agent text,
  p_consent_text text,
  p_consent_text_version text,
  p_consent_text_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invite public.representation_consent_invites%rowtype;
  normalized_signature text;
  normalized_legal_name text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or
     p_claim_id is null or p_accepted is distinct from true then
    return jsonb_build_object('result', 'invalid');
  end if;

  select * into current_invite
  from public.representation_consent_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    return null;
  end if;

  if current_invite.status = 'completed' then
    return jsonb_build_object('result', 'completed', 'invite', to_jsonb(current_invite));
  end if;

  if current_invite.status in ('pending', 'signing') and
     current_invite.expires_at <= now() then
    update public.representation_consent_invites
    set status = 'expired',
        processing_claim_id = null,
        processing_started_at = null,
        processing_expires_at = null,
        pending_signed_at = null,
        pending_digital_signature = null,
        pending_client_phone = null,
        pending_client_date_of_birth = null,
        pending_client_address = null,
        pending_client_city = null,
        pending_client_province = null,
        pending_client_postal_code = null,
        pending_client_drivers_license = null,
        pending_client_reported_signed_at = null,
        pending_signing_ip = null,
        pending_signing_user_agent = null,
        pending_consent_text = null,
        pending_consent_text_version = null,
        pending_consent_text_hash = null
    where id = current_invite.id
    returning * into current_invite;
    return jsonb_build_object('result', 'expired', 'invite', to_jsonb(current_invite));
  end if;

  if current_invite.status = 'revoked' then
    return jsonb_build_object('result', 'revoked', 'invite', to_jsonb(current_invite));
  end if;
  if current_invite.status = 'expired' then
    return jsonb_build_object('result', 'expired', 'invite', to_jsonb(current_invite));
  end if;

  if current_invite.status = 'signing' and
     current_invite.processing_expires_at > now() then
    return jsonb_build_object('result', 'processing', 'invite', to_jsonb(current_invite));
  end if;

  if current_invite.status = 'signing' then
    update public.representation_consent_invites
    set status = 'pending',
        processing_claim_id = null,
        processing_started_at = null,
        processing_expires_at = null,
        pending_signed_at = null,
        pending_digital_signature = null,
        pending_client_phone = null,
        pending_client_date_of_birth = null,
        pending_client_address = null,
        pending_client_city = null,
        pending_client_province = null,
        pending_client_postal_code = null,
        pending_client_drivers_license = null,
        pending_client_reported_signed_at = null,
        pending_signing_ip = null,
        pending_signing_user_agent = null,
        pending_consent_text = null,
        pending_consent_text_version = null,
        pending_consent_text_hash = null
    where id = current_invite.id
    returning * into current_invite;
  end if;

  normalized_signature := regexp_replace(trim(coalesce(p_digital_signature, '')), '[[:space:]]+', ' ', 'g');
  normalized_legal_name := regexp_replace(trim(current_invite.client_legal_name), '[[:space:]]+', ' ', 'g');
  if normalized_signature = '' or normalized_signature <> normalized_legal_name then
    return jsonb_build_object('result', 'signature_mismatch');
  end if;

  if p_client_phone is null or length(trim(p_client_phone)) not between 7 and 30 or
     length(regexp_replace(p_client_phone, '[^0-9]', '', 'g')) not between 10 and 15 or
     p_client_date_of_birth is null or p_client_date_of_birth < date '1900-01-01' or
     p_client_date_of_birth > current_date or
     p_client_address is null or length(trim(p_client_address)) not between 1 and 160 or
     p_client_city is null or length(trim(p_client_city)) not between 1 and 80 or
     p_client_province is null or length(trim(p_client_province)) not between 1 and 80 or
     p_client_postal_code is null or length(trim(p_client_postal_code)) not between 3 and 12 or
     p_client_drivers_license is null or length(trim(p_client_drivers_license)) not between 3 and 40 or
     p_client_reported_signed_at is null or
     p_client_reported_signed_at < now() - interval '24 hours' or
     p_client_reported_signed_at > now() + interval '10 minutes' then
    return jsonb_build_object('result', 'invalid_client_details');
  end if;

  if p_consent_text is null or length(p_consent_text) < 100 or length(p_consent_text) > 30000 or
     p_consent_text_version is null or length(trim(p_consent_text_version)) not between 1 and 100 or
     p_consent_text_hash is null or p_consent_text_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;

  update public.representation_consent_invites
  set status = 'signing',
      processing_claim_id = p_claim_id,
      processing_started_at = clock_timestamp(),
      processing_expires_at = clock_timestamp() + interval '10 minutes',
      pending_signed_at = clock_timestamp(),
      pending_digital_signature = normalized_signature,
      pending_client_phone = trim(p_client_phone),
      pending_client_date_of_birth = p_client_date_of_birth,
      pending_client_address = trim(p_client_address),
      pending_client_city = trim(p_client_city),
      pending_client_province = trim(p_client_province),
      pending_client_postal_code = upper(trim(p_client_postal_code)),
      pending_client_drivers_license = trim(p_client_drivers_license),
      pending_client_reported_signed_at = p_client_reported_signed_at,
      pending_signing_ip = nullif(left(trim(coalesce(p_signing_ip, '')), 100), ''),
      pending_signing_user_agent = nullif(left(trim(coalesce(p_signing_user_agent, '')), 500), ''),
      pending_consent_text = p_consent_text,
      pending_consent_text_version = trim(p_consent_text_version),
      pending_consent_text_hash = p_consent_text_hash
  where id = current_invite.id
    and status = 'pending'
  returning * into current_invite;

  if not found then
    return jsonb_build_object('result', 'processing');
  end if;

  return jsonb_build_object('result', 'claimed', 'invite', to_jsonb(current_invite));
end;
$$;

create or replace function public.finalize_representation_consent_invite(
  p_token_hash text,
  p_claim_id uuid,
  p_pdf_path text,
  p_pdf_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invite public.representation_consent_invites%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or
     p_claim_id is null or p_pdf_sha256 is null or p_pdf_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;

  select * into current_invite
  from public.representation_consent_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    return null;
  end if;

  if current_invite.status = 'completed' then
    return jsonb_build_object('result', 'completed', 'invite', to_jsonb(current_invite));
  end if;

  if current_invite.status <> 'signing' or
     current_invite.processing_claim_id <> p_claim_id or
     current_invite.processing_expires_at <= now() then
    return jsonb_build_object('result', 'claim_mismatch');
  end if;

  if p_pdf_path is null or
     p_pdf_path not like ('standalone/' || current_invite.id::text || '/%.pdf') or
     position('..' in p_pdf_path) > 0 or
     length(p_pdf_path) > 500 then
    return jsonb_build_object('result', 'invalid_pdf_path');
  end if;

  update public.representation_consent_invites
  set status = 'completed',
      signed_at = pending_signed_at,
      digital_signature = pending_digital_signature,
      signed_client_phone = pending_client_phone,
      signed_client_date_of_birth = pending_client_date_of_birth,
      signed_client_address = pending_client_address,
      signed_client_city = pending_client_city,
      signed_client_province = pending_client_province,
      signed_client_postal_code = pending_client_postal_code,
      signed_client_drivers_license = pending_client_drivers_license,
      client_reported_signed_at = pending_client_reported_signed_at,
      signing_ip = pending_signing_ip,
      signing_user_agent = pending_signing_user_agent,
      signed_consent_text = pending_consent_text,
      signed_consent_text_version = pending_consent_text_version,
      signed_consent_text_hash = pending_consent_text_hash,
      pdf_path = p_pdf_path,
      pdf_sha256 = p_pdf_sha256,
      processing_claim_id = null,
      processing_started_at = null,
      processing_expires_at = null,
      pending_signed_at = null,
      pending_digital_signature = null,
      pending_client_phone = null,
      pending_client_date_of_birth = null,
      pending_client_address = null,
      pending_client_city = null,
      pending_client_province = null,
      pending_client_postal_code = null,
      pending_client_drivers_license = null,
      pending_client_reported_signed_at = null,
      pending_signing_ip = null,
      pending_signing_user_agent = null,
      pending_consent_text = null,
      pending_consent_text_version = null,
      pending_consent_text_hash = null
  where id = current_invite.id
  returning * into current_invite;

  return jsonb_build_object('result', 'completed', 'invite', to_jsonb(current_invite));
end;
$$;

create or replace function public.release_representation_consent_invite_claim(
  p_token_hash text,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invite public.representation_consent_invites%rowtype;
begin
  select * into current_invite
  from public.representation_consent_invites
  where token_hash = p_token_hash
  for update;

  if not found or current_invite.status <> 'signing' or
     current_invite.processing_claim_id <> p_claim_id then
    return false;
  end if;

  update public.representation_consent_invites
  set status = case when expires_at <= now() then 'expired' else 'pending' end,
      processing_claim_id = null,
      processing_started_at = null,
      processing_expires_at = null,
      pending_signed_at = null,
      pending_digital_signature = null,
      pending_client_phone = null,
      pending_client_date_of_birth = null,
      pending_client_address = null,
      pending_client_city = null,
      pending_client_province = null,
      pending_client_postal_code = null,
      pending_client_drivers_license = null,
      pending_client_reported_signed_at = null,
      pending_signing_ip = null,
      pending_signing_user_agent = null,
      pending_consent_text = null,
      pending_consent_text_version = null,
      pending_consent_text_hash = null
  where id = current_invite.id;

  return true;
end;
$$;

revoke all on function public.protect_representation_consent_invite_terms()
  from public, anon, authenticated;
revoke all on function public.resolve_representation_consent_invite(text)
  from public, anon, authenticated;
revoke all on function public.claim_representation_consent_invite(text, uuid, boolean, text, text, date, text, text, text, text, text, timestamptz, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.finalize_representation_consent_invite(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.release_representation_consent_invite_claim(text, uuid)
  from public, anon, authenticated;

grant execute on function public.resolve_representation_consent_invite(text)
  to service_role;
grant execute on function public.claim_representation_consent_invite(text, uuid, boolean, text, text, date, text, text, text, text, text, timestamptz, text, text, text, text, text)
  to service_role;
grant execute on function public.finalize_representation_consent_invite(text, uuid, text, text)
  to service_role;
grant execute on function public.release_representation_consent_invite_claim(text, uuid)
  to service_role;

-- The service-role Edge Functions bypass Storage RLS. Removing this old broad
-- insert policy prevents anonymous callers from writing arbitrary PDFs into the
-- otherwise-private consent bucket.
drop policy if exists "System can upload consent forms" on storage.objects;
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf']::text[]
where id = 'consent-forms';

comment on table public.representation_consent_invites is
  'Service-role-only single-use capabilities for standalone representation consent; plaintext invite tokens are never stored.';
comment on column public.representation_consent_invites.token_hash is
  'Lowercase SHA-256 digest of a cryptographically random bearer token.';
comment on column public.representation_consent_invites.success_fee_waived is
  'Per-invite waiver flag; the ordinary percentage remains recorded in success_fee_percent for an explicit waiver statement.';
comment on column public.representation_consent_invites.signed_consent_text_hash is
  'SHA-256 of the exact versioned consent text displayed to and signed by the client.';
comment on function public.claim_representation_consent_invite(text, uuid, boolean, text, text, date, text, text, text, text, text, timestamptz, text, text, text, text, text) is
  'Atomically reserves one pending invitation for PDF generation and captures the exact signature audit snapshot.';
comment on function public.finalize_representation_consent_invite(text, uuid, text, text) is
  'Atomically completes only the matching signing claim and seals the consent audit record.';

commit;
