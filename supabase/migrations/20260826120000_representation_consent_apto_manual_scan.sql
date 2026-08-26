-- Add the APTO13348 field mapping and a private, auditable manual-signature
-- upload path to standalone representation consent. Existing completed audits
-- remain valid and immutable; new writes use the v2 claim/finalize RPCs below.

begin;

alter table public.representation_consent_invites
  add column client_first_name text,
  add column client_last_name text,
  add column ticket_numbers text[],
  add column representative_first_name text not null default 'Brett',
  add column representative_last_name text not null default 'Bilon',
  add column representative_firm text not null default 'Fabsy Traffic Ticket Services',
  add column representative_phone text not null default '(825) 793-2279',
  add column representative_mailing_address text,
  add column representative_city text,
  add column representative_province text not null default 'AB',
  add column representative_postal_code text,
  add column government_form_code text not null default 'APTO13348',
  add column government_form_revision text not null default '2023-08',
  add column government_form_sha256 text not null default '537a0895445c238782e63e3f7b14ac9de4b68a0847fe0a12880eb7e2e8eb99ad',
  add column government_form_url text not null default 'https://cfr.forms.gov.ab.ca/Form/APTO13348.pdf',
  add column pending_signature_method text,
  add column pending_manual_signed_name text,
  add column pending_manual_signed_date date,
  add column pending_manual_scan_source_path text,
  add column pending_manual_scan_source_sha256 text,
  add column pending_manual_scan_source_content_type text,
  add column pending_manual_scan_source_size bigint,
  add column pending_manual_scan_pdf_path text,
  add column pending_manual_scan_pdf_sha256 text,
  add column pending_manual_scan_uploaded_at timestamptz,
  add column pending_manual_scan_review_status text,
  add column signature_method text,
  add column manual_signed_name text,
  add column manual_signed_date date,
  add column manual_scan_source_path text,
  add column manual_scan_source_sha256 text,
  add column manual_scan_source_content_type text,
  add column manual_scan_source_size bigint,
  add column manual_scan_pdf_path text,
  add column manual_scan_pdf_sha256 text,
  add column manual_scan_uploaded_at timestamptz,
  add column manual_scan_review_status text;

update public.representation_consent_invites
set ticket_numbers = array[ticket_number]
where ticket_numbers is null;

-- Generic compatibility backfill for legacy invites whose combined legal name
-- contains at least two words. Staff should supply explicit split names on all
-- future invitations. A legacy compound-name split that is not exact must be
-- revoked and reissued because invitation identity terms are immutable.
update public.representation_consent_invites
set client_first_name = split_part(regexp_replace(trim(client_legal_name), '[[:space:]]+', ' ', 'g'), ' ', 1),
    client_last_name = regexp_replace(
      regexp_replace(trim(client_legal_name), '[[:space:]]+', ' ', 'g'),
      '^[^ ]+[ ]+',
      ''
    )
where client_first_name is null
  and client_last_name is null
  and regexp_replace(trim(client_legal_name), '[[:space:]]+', ' ', 'g') like '% %';

update public.representation_consent_invites
set pending_signature_method = 'typed'
where status = 'signing' and pending_digital_signature is not null;

update public.representation_consent_invites
set signature_method = 'typed'
where status = 'completed' and digital_signature is not null;

alter table public.representation_consent_invites
  alter column ticket_numbers set not null,
  add constraint representation_consent_client_split_names_check
    check (
      (client_first_name is null and client_last_name is null) or
      (length(trim(client_first_name)) between 1 and 100 and
       length(trim(client_last_name)) between 1 and 100)
    ),
  add constraint representation_consent_ticket_numbers_check
    check (cardinality(ticket_numbers) between 1 and 25 and array_position(ticket_numbers, null) is null),
  add constraint representation_consent_apto_metadata_check
    check (
      government_form_code = 'APTO13348' and
      government_form_revision = '2023-08' and
      government_form_sha256 = '537a0895445c238782e63e3f7b14ac9de4b68a0847fe0a12880eb7e2e8eb99ad' and
      government_form_url = 'https://cfr.forms.gov.ab.ca/Form/APTO13348.pdf'
    ),
  add constraint representation_consent_signature_method_check
    check (signature_method is null or signature_method in ('typed', 'manual_scan')),
  add constraint representation_consent_pending_signature_method_check
    check (pending_signature_method is null or pending_signature_method in ('typed', 'manual_scan')),
  add constraint representation_consent_manual_review_status_check
    check (manual_scan_review_status is null or manual_scan_review_status in ('pending', 'approved', 'rejected')),
  add constraint representation_consent_pending_manual_review_status_check
    check (pending_manual_scan_review_status is null or pending_manual_scan_review_status = 'pending');

create table public.representation_consent_manual_uploads (
  id uuid primary key,
  invite_id uuid not null references public.representation_consent_invites(id) on delete cascade,
  temp_path text not null unique,
  expected_content_type text not null,
  expected_size_bytes bigint not null,
  status text not null default 'issued',
  expires_at timestamptz not null,
  claim_id uuid,
  claimed_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint representation_consent_manual_upload_type_check
    check (expected_content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  constraint representation_consent_manual_upload_size_check
    check (expected_size_bytes between 1 and 10485760),
  constraint representation_consent_manual_upload_status_check
    check (status in ('issued', 'claimed', 'consumed', 'expired')),
  constraint representation_consent_manual_upload_path_check
    check (
      temp_path like ('temporary/' || invite_id::text || '/' || id::text || '/%') and
      position('..' in temp_path) = 0 and length(temp_path) <= 500
    ),
  constraint representation_consent_manual_upload_claim_check
    check (
      (status = 'issued' and claim_id is null and claimed_at is null and consumed_at is null) or
      (status = 'claimed' and claim_id is not null and claimed_at is not null and consumed_at is null) or
      (status = 'consumed' and claim_id is not null and claimed_at is not null and consumed_at is not null) or
      (status = 'expired' and consumed_at is null)
    )
);

create index representation_consent_manual_uploads_invite_idx
  on public.representation_consent_manual_uploads(invite_id, status, expires_at);
create unique index representation_consent_manual_uploads_one_active_idx
  on public.representation_consent_manual_uploads(invite_id)
  where status in ('issued', 'claimed');

alter table public.representation_consent_manual_uploads enable row level security;
alter table public.representation_consent_manual_uploads force row level security;
revoke all on table public.representation_consent_manual_uploads from public, anon, authenticated;
revoke all on table public.representation_consent_manual_uploads from service_role;
grant select on table public.representation_consent_manual_uploads to service_role;

create table public.representation_consent_manual_reviews (
  invite_id uuid primary key references public.representation_consent_invites(id) on delete cascade,
  status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint representation_consent_manual_reviews_status_check
    check (status in ('pending', 'approved', 'rejected', 'requires_reupload')),
  constraint representation_consent_manual_reviews_audit_check
    check (
      (status = 'pending' and reviewed_at is null and reviewed_by is null and review_note is null) or
      (status in ('approved', 'rejected', 'requires_reupload') and reviewed_at is not null and
       reviewed_by is not null and length(trim(reviewed_by)) between 1 and 200 and
       (
         (status = 'approved' and (review_note is null or length(trim(review_note)) between 1 and 1000)) or
         (status in ('rejected', 'requires_reupload') and
          review_note is not null and length(trim(review_note)) between 1 and 1000)
       ))
    )
);

alter table public.representation_consent_manual_reviews enable row level security;
alter table public.representation_consent_manual_reviews force row level security;
revoke all on table public.representation_consent_manual_reviews from public, anon, authenticated;
revoke all on table public.representation_consent_manual_reviews from service_role;
grant select on table public.representation_consent_manual_reviews to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'representation-consent-scans',
  'representation-consent-scans',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- There are deliberately no anon/authenticated storage policies. The Edge
-- function issues one-object signed upload capabilities and otherwise uses the
-- service role for validation, immutable copies, and short-lived downloads.

create or replace function public.issue_representation_consent_manual_upload(
  p_token_hash text,
  p_upload_id uuid,
  p_temp_path text,
  p_content_type text,
  p_size_bytes bigint,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invite public.representation_consent_invites%rowtype;
  replaced_paths jsonb;
  lifetime_issuances integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_upload_id is null or
     p_content_type not in ('application/pdf', 'image/jpeg', 'image/png') or
     p_size_bytes not between 1 and 10485760 then
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
    return jsonb_build_object('result', 'completed');
  end if;
  if current_invite.status = 'signing' then
    return jsonb_build_object('result', 'processing');
  end if;
  if current_invite.status <> 'pending' or p_expires_at is null or p_expires_at <= now() or
     p_expires_at > least(current_invite.expires_at, now() + interval '15 minutes 5 seconds') or
     p_temp_path <> ('temporary/' || current_invite.id::text || '/' || p_upload_id::text || '/upload.' ||
       case p_content_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' else 'png' end) or
     position('..' in p_temp_path) > 0 then
    return jsonb_build_object('result', 'invalid');
  end if;

  -- A fixed lifetime cap bounds residual storage even though a signed Storage
  -- upload capability cannot be revoked after it has been returned to a client.
  select count(*) into lifetime_issuances
  from public.representation_consent_manual_uploads
  where invite_id = current_invite.id;
  if lifetime_issuances >= 5 then
    return jsonb_build_object('result', 'upload_limit');
  end if;

  select coalesce(jsonb_agg(temp_path), '[]'::jsonb) into replaced_paths
  from public.representation_consent_manual_uploads
  where invite_id = current_invite.id and status = 'issued';

  update public.representation_consent_manual_uploads
  set status = 'expired'
  where invite_id = current_invite.id and status = 'issued';

  if exists (
    select 1 from public.representation_consent_manual_uploads
    where invite_id = current_invite.id and status = 'claimed'
  ) then
    return jsonb_build_object('result', 'processing');
  end if;

  insert into public.representation_consent_manual_uploads (
    id, invite_id, temp_path, expected_content_type, expected_size_bytes, expires_at
  ) values (
    p_upload_id, current_invite.id, p_temp_path, p_content_type, p_size_bytes, p_expires_at
  );

  return jsonb_build_object(
    'result', 'issued',
    'upload_id', p_upload_id,
    'temp_path', p_temp_path,
    'expires_at', p_expires_at,
    'replaced_temp_paths', replaced_paths
  );
end;
$$;

create or replace function public.expire_representation_consent_manual_uploads(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invite_id uuid;
  expired_paths jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('paths', '[]'::jsonb);
  end if;
  select id into current_invite_id from public.representation_consent_invites
  where token_hash = p_token_hash for update;
  if not found then return null; end if;

  update public.representation_consent_manual_uploads
  set status = 'expired'
  where invite_id = current_invite_id and status = 'issued' and expires_at <= now();

  select coalesce(jsonb_agg(temp_path), '[]'::jsonb) into expired_paths
  from public.representation_consent_manual_uploads
  where invite_id = current_invite_id and status = 'expired';
  return jsonb_build_object('paths', expired_paths);
end;
$$;

create or replace function public.abandon_representation_consent_manual_upload(
  p_token_hash text,
  p_temp_path text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare current_invite_id uuid;
begin
  select id into current_invite_id from public.representation_consent_invites
  where token_hash = p_token_hash for update;
  if not found then return false; end if;
  update public.representation_consent_manual_uploads
  set status = 'expired'
  where invite_id = current_invite_id and temp_path = p_temp_path and status = 'issued';
  return found;
end;
$$;

create or replace function public.transition_representation_consent_manual_review(
  p_invite_id uuid,
  p_status text,
  p_reviewed_by text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invite public.representation_consent_invites%rowtype;
  current_review public.representation_consent_manual_reviews%rowtype;
begin
  if p_invite_id is null or p_status not in ('approved', 'rejected', 'requires_reupload') or
     p_reviewed_by is null or length(trim(p_reviewed_by)) not between 1 and 200 or
     (p_review_note is not null and length(trim(p_review_note)) not between 1 and 1000) or
     (p_status in ('rejected', 'requires_reupload') and
      (p_review_note is null or length(trim(p_review_note)) not between 1 and 1000)) then
    return jsonb_build_object('result', 'invalid');
  end if;
  select * into current_invite from public.representation_consent_invites
  where id = p_invite_id for update;
  if not found or current_invite.status <> 'completed' or current_invite.signature_method <> 'manual_scan' then
    return jsonb_build_object('result', 'not_manual_consent');
  end if;
  select * into current_review from public.representation_consent_manual_reviews
  where invite_id = p_invite_id for update;
  if not found then return jsonb_build_object('result', 'review_not_found'); end if;
  if current_review.status <> 'pending' then
    return jsonb_build_object('result', 'already_reviewed', 'status', current_review.status);
  end if;
  update public.representation_consent_manual_reviews
  set status = p_status,
      reviewed_at = clock_timestamp(),
      reviewed_by = trim(p_reviewed_by),
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      updated_at = clock_timestamp()
  where invite_id = p_invite_id
  returning * into current_review;
  return jsonb_build_object(
    'result', 'updated',
    'status', current_review.status,
    'reviewed_at', current_review.reviewed_at
  );
end;
$$;

alter table public.representation_consent_invites
  drop constraint representation_consent_invites_processing_check,
  drop constraint representation_consent_invites_completion_check;

alter table public.representation_consent_invites
  add constraint representation_consent_invites_processing_check check (
    (
      status = 'signing' and processing_claim_id is not null and
      processing_started_at is not null and processing_expires_at is not null and
      pending_signed_at is not null and pending_signature_method in ('typed', 'manual_scan') and
      pending_client_phone is not null and pending_client_date_of_birth is not null and
      pending_client_address is not null and pending_client_city is not null and
      pending_client_province is not null and pending_client_postal_code is not null and
      pending_client_drivers_license is not null and pending_client_reported_signed_at is not null and
      pending_consent_text is not null and pending_consent_text_version is not null and
      pending_consent_text_hash ~ '^[0-9a-f]{64}$' and
      (
        (pending_signature_method = 'typed' and pending_digital_signature is not null and
         pending_manual_signed_name is null and pending_manual_scan_source_path is null) or
        (pending_signature_method = 'manual_scan' and pending_digital_signature is null and
         pending_manual_signed_name is not null and pending_manual_signed_date is not null and
         pending_manual_scan_source_path is not null and pending_manual_scan_source_sha256 ~ '^[0-9a-f]{64}$' and
         pending_manual_scan_source_content_type in ('application/pdf', 'image/jpeg', 'image/png') and
         pending_manual_scan_source_size between 1 and 10485760 and
         pending_manual_scan_pdf_path is not null and pending_manual_scan_pdf_sha256 ~ '^[0-9a-f]{64}$' and
         pending_manual_scan_uploaded_at is not null and pending_manual_scan_review_status = 'pending')
      )
    ) or (
      status <> 'signing' and processing_claim_id is null and processing_started_at is null and
      processing_expires_at is null and pending_signed_at is null and pending_signature_method is null and
      pending_digital_signature is null and pending_client_phone is null and pending_client_date_of_birth is null and
      pending_client_address is null and pending_client_city is null and pending_client_province is null and
      pending_client_postal_code is null and pending_client_drivers_license is null and
      pending_client_reported_signed_at is null and pending_signing_ip is null and pending_signing_user_agent is null and
      pending_consent_text is null and pending_consent_text_version is null and pending_consent_text_hash is null and
      pending_manual_signed_name is null and pending_manual_signed_date is null and
      pending_manual_scan_source_path is null and pending_manual_scan_source_sha256 is null and
      pending_manual_scan_source_content_type is null and pending_manual_scan_source_size is null and
      pending_manual_scan_pdf_path is null and pending_manual_scan_pdf_sha256 is null and
      pending_manual_scan_uploaded_at is null and pending_manual_scan_review_status is null
    )
  ),
  add constraint representation_consent_invites_completion_check check (
    (
      status = 'completed' and signed_at is not null and signature_method in ('typed', 'manual_scan') and
      signed_client_phone is not null and signed_client_date_of_birth is not null and
      signed_client_address is not null and signed_client_city is not null and signed_client_province is not null and
      signed_client_postal_code is not null and signed_client_drivers_license is not null and
      client_reported_signed_at is not null and signed_consent_text is not null and
      signed_consent_text_version is not null and signed_consent_text_hash ~ '^[0-9a-f]{64}$' and
      pdf_path is not null and pdf_sha256 ~ '^[0-9a-f]{64}$' and
      (
        (signature_method = 'typed' and digital_signature is not null and manual_signed_name is null and
         manual_scan_source_path is null) or
        (signature_method = 'manual_scan' and digital_signature is null and manual_signed_name is not null and
         manual_signed_date is not null and manual_scan_source_path is not null and
         manual_scan_source_sha256 ~ '^[0-9a-f]{64}$' and
         manual_scan_source_content_type in ('application/pdf', 'image/jpeg', 'image/png') and
         manual_scan_source_size between 1 and 10485760 and manual_scan_pdf_path is not null and
         manual_scan_pdf_sha256 ~ '^[0-9a-f]{64}$' and manual_scan_uploaded_at is not null and
         manual_scan_review_status = 'pending')
      )
    ) or (
      status <> 'completed' and signed_at is null and signature_method is null and digital_signature is null and
      signed_client_phone is null and signed_client_date_of_birth is null and signed_client_address is null and
      signed_client_city is null and signed_client_province is null and signed_client_postal_code is null and
      signed_client_drivers_license is null and client_reported_signed_at is null and signing_ip is null and
      signing_user_agent is null and signed_consent_text is null and signed_consent_text_version is null and
      signed_consent_text_hash is null and pdf_path is null and pdf_sha256 is null and manual_signed_name is null and
      manual_signed_date is null and manual_scan_source_path is null and manual_scan_source_sha256 is null and
      manual_scan_source_content_type is null and manual_scan_source_size is null and manual_scan_pdf_path is null and
      manual_scan_pdf_sha256 is null and manual_scan_uploaded_at is null and manual_scan_review_status is null
    )
  );

create or replace function public.protect_representation_consent_invite_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Compatibility for an in-flight v1 Edge deployment while the function and
  -- migration roll out: infer typed method on the old claim/finalize writes.
  if new.status = 'signing' and new.pending_signature_method is null and new.pending_digital_signature is not null then
    new.pending_signature_method := 'typed';
  end if;
  if old.status = 'signing' and new.status = 'completed' and new.signature_method is null then
    new.signature_method := coalesce(old.pending_signature_method, 'typed');
  end if;
  if new.status <> 'signing' then
    new.pending_signature_method := null;
    new.pending_manual_signed_name := null;
    new.pending_manual_signed_date := null;
    new.pending_manual_scan_source_path := null;
    new.pending_manual_scan_source_sha256 := null;
    new.pending_manual_scan_source_content_type := null;
    new.pending_manual_scan_source_size := null;
    new.pending_manual_scan_pdf_path := null;
    new.pending_manual_scan_pdf_sha256 := null;
    new.pending_manual_scan_uploaded_at := null;
    new.pending_manual_scan_review_status := null;
  end if;
  if old.status = 'signing' and new.status in ('pending', 'expired') then
    update public.representation_consent_manual_uploads
    set status = case when expires_at <= now() then 'expired' else 'issued' end,
        claim_id = null,
        claimed_at = null
    where invite_id = old.id and claim_id = old.processing_claim_id and status = 'claimed';
  end if;

  if new.token_hash is distinct from old.token_hash or
     new.ticket_submission_id is distinct from old.ticket_submission_id or
     new.client_legal_name is distinct from old.client_legal_name or
     new.client_first_name is distinct from old.client_first_name or
     new.client_last_name is distinct from old.client_last_name or
     new.client_email is distinct from old.client_email or
     new.client_phone is distinct from old.client_phone or
     new.client_date_of_birth is distinct from old.client_date_of_birth or
     new.client_address is distinct from old.client_address or new.client_city is distinct from old.client_city or
     new.client_province is distinct from old.client_province or new.client_postal_code is distinct from old.client_postal_code or
     new.client_drivers_license is distinct from old.client_drivers_license or
     new.ticket_number is distinct from old.ticket_number or new.ticket_numbers is distinct from old.ticket_numbers or
     new.charge_description is distinct from old.charge_description or new.offence_date_text is distinct from old.offence_date_text or
     new.court_location is distinct from old.court_location or new.court_date_text is distinct from old.court_date_text or
     new.matter_details is distinct from old.matter_details or
     new.representative_first_name is distinct from old.representative_first_name or
     new.representative_last_name is distinct from old.representative_last_name or
     new.representative_firm is distinct from old.representative_firm or
     new.representative_phone is distinct from old.representative_phone or
     new.representative_mailing_address is distinct from old.representative_mailing_address or
     new.representative_city is distinct from old.representative_city or
     new.representative_province is distinct from old.representative_province or
     new.representative_postal_code is distinct from old.representative_postal_code or
     new.government_form_code is distinct from old.government_form_code or
     new.government_form_revision is distinct from old.government_form_revision or
     new.government_form_sha256 is distinct from old.government_form_sha256 or
     new.government_form_url is distinct from old.government_form_url or
     new.base_fee_cents is distinct from old.base_fee_cents or new.fee_currency is distinct from old.fee_currency or
     new.tax_terms is distinct from old.tax_terms or new.success_fee_percent is distinct from old.success_fee_percent or
     new.success_fee_waived is distinct from old.success_fee_waived or
     new.additional_fee_terms is distinct from old.additional_fee_terms or
     new.additional_authorization_terms is distinct from old.additional_authorization_terms or
     new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at then
    raise exception 'REPRESENTATION_CONSENT_INVITE_TERMS_IMMUTABLE';
  end if;

  if old.status = 'completed' and (
    new.status is distinct from old.status or new.signed_at is distinct from old.signed_at or
    new.signature_method is distinct from old.signature_method or new.digital_signature is distinct from old.digital_signature or
    new.signed_client_phone is distinct from old.signed_client_phone or
    new.signed_client_date_of_birth is distinct from old.signed_client_date_of_birth or
    new.signed_client_address is distinct from old.signed_client_address or new.signed_client_city is distinct from old.signed_client_city or
    new.signed_client_province is distinct from old.signed_client_province or
    new.signed_client_postal_code is distinct from old.signed_client_postal_code or
    new.signed_client_drivers_license is distinct from old.signed_client_drivers_license or
    new.client_reported_signed_at is distinct from old.client_reported_signed_at or
    new.signing_ip is distinct from old.signing_ip or new.signing_user_agent is distinct from old.signing_user_agent or
    new.signed_consent_text is distinct from old.signed_consent_text or
    new.signed_consent_text_version is distinct from old.signed_consent_text_version or
    new.signed_consent_text_hash is distinct from old.signed_consent_text_hash or
    new.pdf_path is distinct from old.pdf_path or new.pdf_sha256 is distinct from old.pdf_sha256 or
    new.manual_signed_name is distinct from old.manual_signed_name or new.manual_signed_date is distinct from old.manual_signed_date or
    new.manual_scan_source_path is distinct from old.manual_scan_source_path or
    new.manual_scan_source_sha256 is distinct from old.manual_scan_source_sha256 or
    new.manual_scan_source_content_type is distinct from old.manual_scan_source_content_type or
    new.manual_scan_source_size is distinct from old.manual_scan_source_size or
    new.manual_scan_pdf_path is distinct from old.manual_scan_pdf_path or
    new.manual_scan_pdf_sha256 is distinct from old.manual_scan_pdf_sha256 or
    new.manual_scan_uploaded_at is distinct from old.manual_scan_uploaded_at or
    new.manual_scan_review_status is distinct from old.manual_scan_review_status
  ) then
    raise exception 'COMPLETED_REPRESENTATION_CONSENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

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
     p_client_drivers_license is null or length(trim(p_client_drivers_license)) not between 3 and 40 or
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

create or replace function public.finalize_representation_consent_invite_v2(
  p_token_hash text, p_claim_id uuid, p_pdf_path text, p_pdf_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare current_invite public.representation_consent_invites%rowtype;
begin
  select * into current_invite from public.representation_consent_invites
  where token_hash = p_token_hash for update;
  if not found then return null; end if;
  if current_invite.access_revoked_at is not null or current_invite.status = 'revoked' then
    return jsonb_build_object('result', 'revoked');
  end if;
  if current_invite.expires_at <= now() then return jsonb_build_object('result', 'expired'); end if;
  if current_invite.status = 'completed' then
    return jsonb_build_object('result', 'completed', 'invite', to_jsonb(current_invite));
  end if;
  if current_invite.status <> 'signing' or current_invite.processing_claim_id <> p_claim_id or
     current_invite.processing_expires_at <= now() then return jsonb_build_object('result', 'claim_mismatch'); end if;
  if p_pdf_path not like ('standalone/' || current_invite.id::text || '/' || p_claim_id::text || '/signed-consent.pdf') or
     position('..' in p_pdf_path) > 0 or p_pdf_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid_pdf');
  end if;

  update public.representation_consent_invites set
    status = 'completed', signed_at = pending_signed_at, signature_method = pending_signature_method,
    digital_signature = pending_digital_signature, manual_signed_name = pending_manual_signed_name,
    manual_signed_date = pending_manual_signed_date, manual_scan_source_path = pending_manual_scan_source_path,
    manual_scan_source_sha256 = pending_manual_scan_source_sha256,
    manual_scan_source_content_type = pending_manual_scan_source_content_type,
    manual_scan_source_size = pending_manual_scan_source_size, manual_scan_pdf_path = pending_manual_scan_pdf_path,
    manual_scan_pdf_sha256 = pending_manual_scan_pdf_sha256, manual_scan_uploaded_at = pending_manual_scan_uploaded_at,
    manual_scan_review_status = pending_manual_scan_review_status,
    signed_client_phone = pending_client_phone, signed_client_date_of_birth = pending_client_date_of_birth,
    signed_client_address = pending_client_address, signed_client_city = pending_client_city,
    signed_client_province = pending_client_province, signed_client_postal_code = pending_client_postal_code,
    signed_client_drivers_license = pending_client_drivers_license, client_reported_signed_at = pending_client_reported_signed_at,
    signing_ip = pending_signing_ip, signing_user_agent = pending_signing_user_agent,
    signed_consent_text = pending_consent_text, signed_consent_text_version = pending_consent_text_version,
    signed_consent_text_hash = pending_consent_text_hash, pdf_path = p_pdf_path, pdf_sha256 = p_pdf_sha256,
    processing_claim_id = null, processing_started_at = null, processing_expires_at = null,
    pending_signed_at = null, pending_signature_method = null, pending_digital_signature = null,
    pending_manual_signed_name = null, pending_manual_signed_date = null, pending_manual_scan_source_path = null,
    pending_manual_scan_source_sha256 = null, pending_manual_scan_source_content_type = null,
    pending_manual_scan_source_size = null, pending_manual_scan_pdf_path = null,
    pending_manual_scan_pdf_sha256 = null, pending_manual_scan_uploaded_at = null,
    pending_manual_scan_review_status = null, pending_client_phone = null, pending_client_date_of_birth = null,
    pending_client_address = null, pending_client_city = null, pending_client_province = null,
    pending_client_postal_code = null, pending_client_drivers_license = null,
    pending_client_reported_signed_at = null, pending_signing_ip = null, pending_signing_user_agent = null,
    pending_consent_text = null, pending_consent_text_version = null, pending_consent_text_hash = null
  where id = current_invite.id returning * into current_invite;

  if current_invite.signature_method = 'manual_scan' then
    insert into public.representation_consent_manual_reviews (invite_id)
    values (current_invite.id)
    on conflict (invite_id) do nothing;
    update public.representation_consent_manual_uploads set status = 'consumed', consumed_at = clock_timestamp()
    where invite_id = current_invite.id and claim_id = p_claim_id and status = 'claimed';
  end if;
  -- A client may prepare a manual upload and then choose typed signing. Once
  -- any method completes, all unused upload capabilities become cleanup work.
  update public.representation_consent_manual_uploads
  set status = 'expired'
  where invite_id = current_invite.id and status = 'issued';
  return jsonb_build_object('result', 'completed', 'invite', to_jsonb(current_invite));
end;
$$;

create or replace function public.release_representation_consent_invite_claim(
  p_token_hash text, p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare current_invite public.representation_consent_invites%rowtype;
begin
  select * into current_invite from public.representation_consent_invites
  where token_hash = p_token_hash for update;
  if not found or current_invite.status <> 'signing' or current_invite.processing_claim_id <> p_claim_id then
    return false;
  end if;
  update public.representation_consent_manual_uploads
  set status = case when expires_at <= now() then 'expired' else 'issued' end,
      claim_id = null, claimed_at = null
  where invite_id = current_invite.id and claim_id = p_claim_id and status = 'claimed';
  update public.representation_consent_invites set
    status = case when expires_at <= now() then 'expired' else 'pending' end,
    processing_claim_id = null, processing_started_at = null, processing_expires_at = null,
    pending_signed_at = null, pending_signature_method = null, pending_digital_signature = null,
    pending_manual_signed_name = null, pending_manual_signed_date = null, pending_manual_scan_source_path = null,
    pending_manual_scan_source_sha256 = null, pending_manual_scan_source_content_type = null,
    pending_manual_scan_source_size = null, pending_manual_scan_pdf_path = null,
    pending_manual_scan_pdf_sha256 = null, pending_manual_scan_uploaded_at = null,
    pending_manual_scan_review_status = null, pending_client_phone = null, pending_client_date_of_birth = null,
    pending_client_address = null, pending_client_city = null, pending_client_province = null,
    pending_client_postal_code = null, pending_client_drivers_license = null,
    pending_client_reported_signed_at = null, pending_signing_ip = null, pending_signing_user_agent = null,
    pending_consent_text = null, pending_consent_text_version = null, pending_consent_text_hash = null
  where id = current_invite.id;
  return true;
end;
$$;

revoke all on function public.claim_representation_consent_invite_v2(text, uuid, boolean, text, text, text, date, text, text, text, text, bigint, text, text, timestamptz, text, date, text, text, text, text, text, timestamptz, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.finalize_representation_consent_invite_v2(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.issue_representation_consent_manual_upload(text, uuid, text, text, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.expire_representation_consent_manual_uploads(text) from public, anon, authenticated;
revoke all on function public.abandon_representation_consent_manual_upload(text, text) from public, anon, authenticated;
revoke all on function public.transition_representation_consent_manual_review(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_representation_consent_invite_v2(text, uuid, boolean, text, text, text, date, text, text, text, text, bigint, text, text, timestamptz, text, date, text, text, text, text, text, timestamptz, text, text, text, text, text) to service_role;
grant execute on function public.finalize_representation_consent_invite_v2(text, uuid, text, text) to service_role;
grant execute on function public.issue_representation_consent_manual_upload(text, uuid, text, text, bigint, timestamptz) to service_role;
grant execute on function public.expire_representation_consent_manual_uploads(text) to service_role;
grant execute on function public.abandon_representation_consent_manual_upload(text, text) to service_role;
grant execute on function public.transition_representation_consent_manual_review(uuid, text, text, text) to service_role;

comment on column public.representation_consent_invites.signature_method is
  'Sealed signature route: exact-name typed consent or an uploaded manual scan.';
comment on column public.representation_consent_invites.manual_scan_review_status is
  'Immutable initial manual-scan review state captured at signing; current staff review state is stored separately.';
comment on table public.representation_consent_manual_uploads is
  'Service-role-only bounded one-object upload grants; plaintext bearer invite tokens are never stored.';
comment on table public.representation_consent_manual_reviews is
  'Current one-way staff review state for an immutable completed manual-scan consent audit.';

commit;
