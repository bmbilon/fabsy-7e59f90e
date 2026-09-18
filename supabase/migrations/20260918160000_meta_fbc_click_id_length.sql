-- Preserve the complete validated fbclid embedded in _fbc through checkout.
-- The browser-ID (_fbp), consent, withdrawal, retention and access rules stay intact.
begin;

alter table meta_private.meta_checkout_attribution
  drop constraint meta_checkout_attribution_fbc_check,
  add constraint meta_checkout_attribution_fbc_check check (
    fbc is null or (
      octet_length(fbc) between 1 and 536
      and fbc ~ '^fb\.[0-9]{1,3}\.[0-9]{10,16}\.[A-Za-z0-9_-]+$'
      and octet_length(split_part(fbc, '.', 4)) <= 512
    )
  );

create or replace function public.record_meta_checkout_attribution(
  p_session_hash text,
  p_consent_version text,
  p_consented_at timestamptz,
  p_client_user_agent text,
  p_fbp text default null,
  p_fbc text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing meta_private.meta_checkout_attribution%rowtype;
  affected integer;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'META_ATTRIBUTION_SESSION_HASH_INVALID';
  end if;
  if p_consent_version is null
    or octet_length(p_consent_version) not between 1 and 64
    or p_consent_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' then
    raise exception 'META_ATTRIBUTION_CONSENT_VERSION_INVALID';
  end if;
  if p_consented_at is null
    or p_consented_at < timestamptz '2024-01-01 00:00:00+00'
    or p_consented_at <= clock_timestamp() - interval '180 days'
    or p_consented_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'META_ATTRIBUTION_CONSENT_TIME_INVALID';
  end if;
  if p_client_user_agent is null
    or length(p_client_user_agent) not between 1 and 512
    or octet_length(p_client_user_agent) > 1024
    or p_client_user_agent ~ '[[:cntrl:]]' then
    raise exception 'META_ATTRIBUTION_USER_AGENT_INVALID';
  end if;
  if p_fbp is not null and (
    octet_length(p_fbp) not between 1 and 255
    or p_fbp !~ '^fb\.[0-9]{1,3}\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,200}$'
  ) then
    raise exception 'META_ATTRIBUTION_FBP_INVALID';
  end if;
  if p_fbc is not null and (
    octet_length(p_fbc) not between 1 and 536
    or p_fbc !~ '^fb\.[0-9]{1,3}\.[0-9]{10,16}\.[A-Za-z0-9_-]+$'
    or octet_length(split_part(p_fbc, '.', 4)) > 512
  ) then
    raise exception 'META_ATTRIBUTION_FBC_INVALID';
  end if;
  if p_fbp is null and p_fbc is null then
    raise exception 'META_ATTRIBUTION_BROWSER_ID_REQUIRED';
  end if;

  select * into existing
  from meta_private.meta_checkout_attribution attribution
  where attribution.session_hash = p_session_hash
  for update;

  if existing.session_hash is not null and exists (
    select 1
    from meta_private.meta_capi_outbox queued
    where queued.event_name = 'Purchase' and queued.session_hash = p_session_hash
  ) then
    -- Successful or terminal delivery cleanup deliberately removes identifiers.
    -- A replay must never put them back after an outbox row exists.
    if existing.client_user_agent is null then
      return false;
    end if;
    if existing.consent_version is distinct from p_consent_version
      or existing.consented_at is distinct from p_consented_at
      or existing.fbp is distinct from p_fbp
      or existing.fbc is distinct from p_fbc
      or existing.client_user_agent is distinct from p_client_user_agent then
      raise exception 'META_ATTRIBUTION_IMMUTABLE_CONFLICT';
    end if;
    return true;
  end if;

  -- Withdrawal is an irreversible fence for this checkout session. Browser
  -- clocks cannot prove that a later-looking consent record was actually made
  -- after withdrawal; a new checkout session is required for new attribution.
  if existing.session_hash is not null
    and existing.withdrawn_at is not null then
    return false;
  end if;

  insert into meta_private.meta_checkout_attribution (
    session_hash,
    consent_version,
    consented_at,
    fbp,
    fbc,
    client_user_agent
  ) values (
    p_session_hash,
    p_consent_version,
    p_consented_at,
    p_fbp,
    p_fbc,
    p_client_user_agent
  ) on conflict (session_hash) do update
  set consent_version = excluded.consent_version,
      consented_at = excluded.consented_at,
      fbp = excluded.fbp,
      fbc = excluded.fbc,
      client_user_agent = excluded.client_user_agent
  -- A concurrent withdrawal can insert or update the row after the initial
  -- SELECT. Never let this conflict path clear its irreversible tombstone.
  where meta_checkout_attribution.withdrawn_at is null;
  get diagnostics affected = row_count;
  if affected <> 1 then
    return false;
  end if;
  return true;
end;
$$;

-- CREATE OR REPLACE preserves the existing ACL; restate the service-role boundary.
revoke all on function public.record_meta_checkout_attribution(text, text, timestamptz, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_meta_checkout_attribution(text, text, timestamptz, text, text, text)
  to service_role;

commit;
