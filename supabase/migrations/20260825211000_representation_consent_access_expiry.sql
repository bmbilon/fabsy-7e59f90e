-- Keep the signed consent audit immutable while making bearer access expire and
-- allowing a completed invitation's read/download capability to be revoked.

begin;

alter table public.representation_consent_invites
  add column access_revoked_at timestamptz,
  add column access_revocation_reason text;

alter table public.representation_consent_invites
  add constraint representation_consent_invites_access_revocation_check
  check (
    (
      access_revoked_at is null and
      access_revocation_reason is null
    ) or
    (
      status = 'completed' and
      access_revoked_at is not null and
      access_revoked_at >= signed_at and
      access_revocation_reason is not null and
      length(trim(access_revocation_reason)) between 1 and 500
    )
  );

create or replace function public.protect_representation_consent_access_revocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Revocation is one-way audit metadata. It deliberately does not change the
  -- completed status or any signed consent/PDF fields.
  if old.access_revoked_at is not null and (
    new.access_revoked_at is distinct from old.access_revoked_at or
    new.access_revocation_reason is distinct from old.access_revocation_reason
  ) then
    raise exception 'REPRESENTATION_CONSENT_ACCESS_REVOCATION_IMMUTABLE';
  end if;

  if new.access_revoked_at is distinct from old.access_revoked_at then
    if old.status <> 'completed' or new.status <> 'completed' then
      raise exception 'ONLY_COMPLETED_REPRESENTATION_CONSENT_ACCESS_CAN_BE_REVOKED';
    end if;
    if new.access_revoked_at is null or
       new.access_revocation_reason is null or
       length(trim(new.access_revocation_reason)) not between 1 and 500 then
      raise exception 'REPRESENTATION_CONSENT_ACCESS_REVOCATION_REASON_REQUIRED';
    end if;
  elsif new.access_revocation_reason is distinct from old.access_revocation_reason then
    raise exception 'REPRESENTATION_CONSENT_ACCESS_REVOCATION_TIMESTAMP_REQUIRED';
  end if;

  return new;
end;
$$;

create trigger protect_representation_consent_access_revocation
  before update on public.representation_consent_invites
  for each row execute function public.protect_representation_consent_access_revocation();

-- Preserve the original RPC contract for active links, but return only a
-- synthetic status for inaccessible links. Existing signed audit fields remain
-- untouched when a completed link expires or its bearer access is revoked.
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

  if current_invite.access_revoked_at is not null then
    return jsonb_build_object('status', 'revoked');
  end if;

  if current_invite.expires_at <= now() then
    if current_invite.status in ('pending', 'signing') then
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
      where id = current_invite.id;
    end if;
    return jsonb_build_object('status', 'expired');
  end if;

  if current_invite.status = 'revoked' then
    return jsonb_build_object('status', 'revoked');
  end if;
  if current_invite.status = 'expired' then
    return jsonb_build_object('status', 'expired');
  end if;

  if current_invite.status = 'signing' and
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

revoke all on table public.representation_consent_invites
  from public, anon, authenticated;
grant select, insert, update, delete on table public.representation_consent_invites
  to service_role;

revoke all on function public.protect_representation_consent_access_revocation()
  from public, anon, authenticated;
revoke all on function public.resolve_representation_consent_invite(text)
  from public, anon, authenticated;
grant execute on function public.resolve_representation_consent_invite(text)
  to service_role;

comment on column public.representation_consent_invites.access_revoked_at is
  'One-way service-role access revocation for a completed bearer invitation; does not alter the completed consent audit.';
comment on column public.representation_consent_invites.access_revocation_reason is
  'Internal service-role reason for revoking post-completion bearer access; never returned to the bearer.';
comment on function public.resolve_representation_consent_invite(text) is
  'Resolves active bearer invitations; returns only an inaccessible status after expiry/revocation and preserves completed audit state.';

commit;
