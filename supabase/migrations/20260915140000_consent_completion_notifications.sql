-- Complete the standalone APTO consent workflow with the lookup identifier
-- required by TTDS and a durable operator email event. Existing signed
-- records remain valid; the one historical completion is backfilled once.
begin;

alter table public.representation_consent_invites
  add column if not exists disclosure_lookup_type text,
  add column if not exists disclosure_lookup_value text,
  add column if not exists reissued_from_invite_id uuid
    references public.representation_consent_invites(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'representation_consent_disclosure_lookup_check'
      and conrelid = 'public.representation_consent_invites'::regclass
  ) then
    alter table public.representation_consent_invites
      add constraint representation_consent_disclosure_lookup_check check (
        (disclosure_lookup_type is null and disclosure_lookup_value is null) or
        (
          disclosure_lookup_type in ('drivers_licence', 'licence_plate') and
          length(trim(disclosure_lookup_value)) between 2 and 40
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'representation_consent_reissue_not_self_check'
      and conrelid = 'public.representation_consent_invites'::regclass
  ) then
    alter table public.representation_consent_invites
      add constraint representation_consent_reissue_not_self_check check (
        reissued_from_invite_id is null or reissued_from_invite_id <> id
      );
  end if;
end $$;

create unique index if not exists representation_consent_one_reissue_per_invite_idx
  on public.representation_consent_invites(reissued_from_invite_id)
  where reissued_from_invite_id is not null;

create unique index if not exists representation_consent_one_active_client_ticket_idx
  on public.representation_consent_invites(
    lower(trim(client_email)),
    upper(trim(ticket_number))
  )
  where status in ('pending', 'signing');

create or replace function public.protect_completed_consent_lookup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reissued_from_invite_id is distinct from old.reissued_from_invite_id then
    raise exception 'REPRESENTATION_CONSENT_REISSUE_LINK_IMMUTABLE';
  end if;
  if old.status = 'completed' and (
    new.disclosure_lookup_type is distinct from old.disclosure_lookup_type or
    new.disclosure_lookup_value is distinct from old.disclosure_lookup_value
  ) then
    raise exception 'COMPLETED_CONSENT_LOOKUP_IMMUTABLE';
  end if;
  return new;
end;
$$;

-- Extend the mature claim/finalize protocol instead of moving identity fields
-- through the Edge function in separate writes. The v2 claim obtains the row
-- lock; this wrapper records the disclosure lookup before that transaction is
-- committed and returns the same claimed row shape to the caller.
create or replace function public.claim_representation_consent_invite_v3(
  p_token_hash text, p_claim_id uuid, p_accepted boolean, p_signature_method text,
  p_digital_signature text, p_manual_signed_name text, p_manual_signed_date date,
  p_manual_scan_temp_path text, p_manual_scan_source_path text, p_manual_scan_source_sha256 text,
  p_manual_scan_source_content_type text, p_manual_scan_source_size bigint,
  p_manual_scan_pdf_path text, p_manual_scan_pdf_sha256 text, p_manual_scan_uploaded_at timestamptz,
  p_client_phone text, p_client_date_of_birth date, p_client_address text, p_client_city text,
  p_client_province text, p_client_postal_code text,
  p_disclosure_lookup_type text, p_disclosure_lookup_value text,
  p_client_reported_signed_at timestamptz, p_signing_ip text, p_signing_user_agent text,
  p_consent_text text, p_consent_text_version text, p_consent_text_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_result jsonb;
  claimed_invite public.representation_consent_invites%rowtype;
  normalized_lookup_value text;
begin
  normalized_lookup_value := upper(trim(coalesce(p_disclosure_lookup_value, '')));
  if p_disclosure_lookup_type not in ('drivers_licence', 'licence_plate') or
     length(normalized_lookup_value) > 40 or
     (p_disclosure_lookup_type = 'drivers_licence' and length(normalized_lookup_value) < 3) or
     (p_disclosure_lookup_type = 'licence_plate' and length(normalized_lookup_value) < 2) or
     normalized_lookup_value !~ '^[A-Z0-9 .-]{2,40}$' then
    return jsonb_build_object('result', 'invalid_client_details');
  end if;

  claim_result := public.claim_representation_consent_invite_v2(
    p_token_hash => p_token_hash,
    p_claim_id => p_claim_id,
    p_accepted => p_accepted,
    p_signature_method => p_signature_method,
    p_digital_signature => p_digital_signature,
    p_manual_signed_name => p_manual_signed_name,
    p_manual_signed_date => p_manual_signed_date,
    p_manual_scan_temp_path => p_manual_scan_temp_path,
    p_manual_scan_source_path => p_manual_scan_source_path,
    p_manual_scan_source_sha256 => p_manual_scan_source_sha256,
    p_manual_scan_source_content_type => p_manual_scan_source_content_type,
    p_manual_scan_source_size => p_manual_scan_source_size,
    p_manual_scan_pdf_path => p_manual_scan_pdf_path,
    p_manual_scan_pdf_sha256 => p_manual_scan_pdf_sha256,
    p_manual_scan_uploaded_at => p_manual_scan_uploaded_at,
    p_client_phone => p_client_phone,
    p_client_date_of_birth => p_client_date_of_birth,
    p_client_address => p_client_address,
    p_client_city => p_client_city,
    p_client_province => p_client_province,
    p_client_postal_code => p_client_postal_code,
    p_client_drivers_license => case
      when p_disclosure_lookup_type = 'drivers_licence' then normalized_lookup_value
      else ''
    end,
    p_client_reported_signed_at => p_client_reported_signed_at,
    p_signing_ip => p_signing_ip,
    p_signing_user_agent => p_signing_user_agent,
    p_consent_text => p_consent_text,
    p_consent_text_version => p_consent_text_version,
    p_consent_text_hash => p_consent_text_hash
  );

  if coalesce(claim_result->>'result', '') <> 'claimed' then
    return claim_result;
  end if;

  update public.representation_consent_invites
  set disclosure_lookup_type = p_disclosure_lookup_type,
      disclosure_lookup_value = normalized_lookup_value
  where id = (claim_result->'invite'->>'id')::uuid
    and status = 'signing'
    and processing_claim_id = p_claim_id
  returning * into claimed_invite;

  if not found then
    raise exception 'REPRESENTATION_CONSENT_LOOKUP_CLAIM_LOST';
  end if;
  return jsonb_build_object('result', 'claimed', 'invite', to_jsonb(claimed_invite));
end;
$$;

revoke all on function public.claim_representation_consent_invite_v3(
  text, uuid, boolean, text, text, text, date, text, text, text, text, bigint,
  text, text, timestamptz, text, date, text, text, text, text, text, text,
  timestamptz, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.claim_representation_consent_invite_v3(
  text, uuid, boolean, text, text, text, date, text, text, text, text, bigint,
  text, text, timestamptz, text, date, text, text, text, text, text, text,
  timestamptz, text, text, text, text, text
) to service_role;

-- Token hashes are immutable, so rotation creates a fresh invitation and
-- revokes the old pending capability in the same transaction. A unique chain
-- edge prevents two concurrent staff retries from creating two live bearers.
create or replace function public.reissue_representation_consent_invite(
  p_invite_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_invite public.representation_consent_invites%rowtype;
  replacement public.representation_consent_invites%rowtype;
begin
  if p_invite_id is null or p_token_hash is null or
     p_token_hash !~ '^[0-9a-f]{64}$' or
     p_expires_at is null or p_expires_at <= now() or
     p_expires_at > now() + interval '31 days' then
    return jsonb_build_object('result', 'invalid');
  end if;

  select * into source_invite
  from public.representation_consent_invites
  where id = p_invite_id
  for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if source_invite.status not in ('pending', 'expired', 'revoked') then
    return jsonb_build_object('result', 'not_reissuable', 'status', source_invite.status);
  end if;
  if exists (
    select 1 from public.representation_consent_invites
    where reissued_from_invite_id = source_invite.id
  ) then
    return jsonb_build_object('result', 'already_reissued');
  end if;

  if source_invite.status = 'pending' then
    update public.representation_consent_invites
    set status = 'revoked',
        revoked_at = clock_timestamp(),
        revocation_reason = 'Reissued by authorized Fabsy staff.'
    where id = source_invite.id;
  end if;

  insert into public.representation_consent_invites(
    token_hash, status, expires_at, reissued_from_invite_id,
    ticket_submission_id, client_legal_name, client_first_name, client_last_name,
    client_email, client_phone, client_date_of_birth, client_address, client_city,
    client_province, client_postal_code, client_drivers_license,
    ticket_number, ticket_numbers, charge_description, offence_date_text,
    court_location, court_date_text, matter_details,
    base_fee_cents, fee_currency, tax_terms, success_fee_percent,
    success_fee_waived, additional_fee_terms, additional_authorization_terms,
    representative_first_name, representative_last_name, representative_firm,
    representative_phone, representative_mailing_address, representative_city,
    representative_province, representative_postal_code,
    government_form_code, government_form_revision, government_form_sha256,
    government_form_url
  ) values (
    p_token_hash, 'pending', p_expires_at, source_invite.id,
    source_invite.ticket_submission_id, source_invite.client_legal_name,
    source_invite.client_first_name, source_invite.client_last_name,
    source_invite.client_email, source_invite.client_phone,
    source_invite.client_date_of_birth, source_invite.client_address,
    source_invite.client_city, source_invite.client_province,
    source_invite.client_postal_code, source_invite.client_drivers_license,
    source_invite.ticket_number, source_invite.ticket_numbers,
    source_invite.charge_description, source_invite.offence_date_text,
    source_invite.court_location, source_invite.court_date_text,
    source_invite.matter_details, source_invite.base_fee_cents,
    source_invite.fee_currency, source_invite.tax_terms,
    source_invite.success_fee_percent, source_invite.success_fee_waived,
    source_invite.additional_fee_terms, source_invite.additional_authorization_terms,
    source_invite.representative_first_name, source_invite.representative_last_name,
    source_invite.representative_firm, source_invite.representative_phone,
    source_invite.representative_mailing_address, source_invite.representative_city,
    source_invite.representative_province, source_invite.representative_postal_code,
    source_invite.government_form_code, source_invite.government_form_revision,
    source_invite.government_form_sha256, source_invite.government_form_url
  ) returning * into replacement;

  return jsonb_build_object('result', 'created', 'invite', to_jsonb(replacement));
exception
  when unique_violation then
    return jsonb_build_object('result', 'already_reissued');
end;
$$;

revoke all on function public.reissue_representation_consent_invite(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reissue_representation_consent_invite(uuid, text, timestamptz)
  to service_role;

drop trigger if exists protect_completed_consent_lookup
  on public.representation_consent_invites;
create trigger protect_completed_consent_lookup
  before update on public.representation_consent_invites
  for each row execute function public.protect_completed_consent_lookup();

create or replace function public.emit_representation_consent_invite_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from 'completed' and new.status = 'completed' then
    perform public.enqueue_portal_activity(
      'legacy-representation-consent:' || new.id::text,
      'representation_consent_signed',
      'representation_consent_invite',
      new.id,
      jsonb_strip_nulls(jsonb_build_object(
        'legacy_invite_id', new.id,
        'submission_id', new.ticket_submission_id,
        'client_name', new.client_legal_name,
        'client_email', new.client_email,
        'ticket_number', new.ticket_number,
        'ticket_numbers', to_jsonb(new.ticket_numbers),
        'product', 'representation_consent',
        'status', new.status,
        'signature_method', new.signature_method,
        'consent_form_path', new.pdf_path,
        'consent_pdf_sha256', new.pdf_sha256,
        'client_date_of_birth', new.signed_client_date_of_birth,
        'disclosure_lookup_type', new.disclosure_lookup_type,
        'disclosure_lookup_value', new.disclosure_lookup_value
      ))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists emit_representation_consent_invite_activity
  on public.representation_consent_invites;
create trigger emit_representation_consent_invite_activity
  after update of status on public.representation_consent_invites
  for each row execute function public.emit_representation_consent_invite_activity();

-- Recover the completed consent that pre-dates notification wiring. The
-- unique event key prevents duplicate mail if this migration is replayed.
insert into public.portal_activity_events(
  event_key, event_type, entity_type, entity_id, payload, occurred_at
)
select
  'legacy-representation-consent:' || invite.id::text,
  'representation_consent_signed',
  'representation_consent_invite',
  invite.id,
  jsonb_strip_nulls(jsonb_build_object(
    'legacy_invite_id', invite.id,
    'submission_id', invite.ticket_submission_id,
    'client_name', invite.client_legal_name,
    'client_email', invite.client_email,
    'ticket_number', invite.ticket_number,
    'ticket_numbers', to_jsonb(invite.ticket_numbers),
    'product', 'representation_consent',
    'status', invite.status,
    'signature_method', invite.signature_method,
    'consent_form_path', invite.pdf_path,
    'consent_pdf_sha256', invite.pdf_sha256,
    'client_date_of_birth', invite.signed_client_date_of_birth,
    'disclosure_lookup_type', invite.disclosure_lookup_type,
    'disclosure_lookup_value', invite.disclosure_lookup_value
  )),
  coalesce(invite.signed_at, invite.updated_at, now())
from public.representation_consent_invites invite
where invite.status = 'completed'
  and invite.pdf_path is not null
on conflict(event_key) do nothing;

comment on column public.representation_consent_invites.disclosure_lookup_type is
  'Client-selected TTDS lookup identifier: driver licence or licence plate.';
comment on column public.representation_consent_invites.disclosure_lookup_value is
  'Identifier supplied with the signed consent for the represented ticket.';
comment on column public.representation_consent_invites.reissued_from_invite_id is
  'Immutable audit link to the expired or revoked invitation replaced by this bearer capability.';

commit;

notify pgrst, 'reload schema';
