-- Admit only the current $79 Photo Radar purchase into the existing consented
-- outbox. Consent, withdrawal fencing, retention and deduplication are unchanged.
begin;

alter table meta_private.meta_capi_outbox
  drop constraint meta_capi_outbox_value_check,
  drop constraint meta_capi_outbox_content_id_check,
  add constraint meta_capi_outbox_value_check check (
    (content_id = 'rapid_resolution' and value_cents in (19800, 15840))
    or (content_id = 'rapid_resolution_bundle' and value_cents in (22900, 18320))
    or (content_id = 'photo_radar' and value_cents = 7900)
  ),
  add constraint meta_capi_outbox_content_id_check
    check (content_id in ('rapid_resolution', 'rapid_resolution_bundle', 'photo_radar'));

create or replace function public.enqueue_meta_capi_purchase(
  p_session_hash text,
  p_value_cents integer,
  p_event_time timestamptz,
  p_content_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attribution meta_private.meta_checkout_attribution%rowtype;
  existing meta_private.meta_capi_outbox%rowtype;
  outbox_id uuid;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'META_CAPI_SESSION_HASH_INVALID';
  end if;
  if p_value_cents is null or not (
    (p_content_id = 'rapid_resolution' and p_value_cents in (19800, 15840))
    or (p_content_id = 'rapid_resolution_bundle' and p_value_cents in (22900, 18320))
    or (p_content_id = 'photo_radar' and p_value_cents = 7900)
  ) then
    raise exception 'META_CAPI_VALUE_INVALID';
  end if;
  if p_event_time is null
    or p_event_time < timestamptz '2024-01-01 00:00:00+00'
    or p_event_time > clock_timestamp() + interval '5 minutes' then
    raise exception 'META_CAPI_EVENT_TIME_INVALID';
  end if;
  if p_content_id is null or p_content_id not in ('rapid_resolution', 'rapid_resolution_bundle', 'photo_radar') then
    raise exception 'META_CAPI_CONTENT_ID_INVALID';
  end if;

  select * into attribution
  from meta_private.meta_checkout_attribution stored
  where stored.session_hash = p_session_hash
  for update;
  if attribution.session_hash is null then
    return null;
  end if;
  if attribution.withdrawn_at is not null
    or attribution.client_user_agent is null
    or (attribution.fbp is null and attribution.fbc is null) then
    -- Terminal cleanup can leave a minimal audit row. A webhook replay should
    -- resolve an existing outbox id but must never create a new send from it.
    select * into existing
    from meta_private.meta_capi_outbox queued
    where queued.event_name = 'Purchase' and queued.session_hash = p_session_hash;
    if existing.id is not null then
      if existing.value_cents is distinct from p_value_cents
        or existing.currency <> 'CAD'
        or existing.content_id is distinct from p_content_id then
        raise exception 'META_CAPI_PURCHASE_IMMUTABLE_CONFLICT';
      end if;
      return existing.id;
    end if;
    return null;
  end if;
  if attribution.consented_at > p_event_time + interval '5 minutes' then
    raise exception 'META_CAPI_CONSENT_AFTER_PURCHASE';
  end if;
  if attribution.consented_at + interval '180 days' <= p_event_time then
    -- Consent expiry is a clean measurement no-op. Remove the unqueued
    -- browser identifiers immediately rather than waiting for retention purge.
    delete from meta_private.meta_checkout_attribution stored
    where stored.session_hash = p_session_hash
      and not exists (
        select 1 from meta_private.meta_capi_outbox queued
        where queued.session_hash = stored.session_hash
      );
    return null;
  end if;

  insert into meta_private.meta_capi_outbox (
    event_name,
    session_hash,
    event_time,
    value_cents,
    currency,
    content_id
  ) values (
    'Purchase',
    p_session_hash,
    p_event_time,
    p_value_cents,
    'CAD',
    p_content_id
  )
  on conflict (event_name, session_hash) do nothing
  returning id into outbox_id;

  if outbox_id is not null then
    return outbox_id;
  end if;

  select * into existing
  from meta_private.meta_capi_outbox queued
  where queued.event_name = 'Purchase' and queued.session_hash = p_session_hash;
  if existing.id is null then
    raise exception 'META_CAPI_PURCHASE_ENQUEUE_FAILED';
  end if;
  if existing.value_cents is distinct from p_value_cents
    or existing.currency <> 'CAD'
    or existing.content_id is distinct from p_content_id then
    raise exception 'META_CAPI_PURCHASE_IMMUTABLE_CONFLICT';
  end if;
  return existing.id;
end;
$$;

revoke all on function public.enqueue_meta_capi_purchase(text, integer, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_meta_capi_purchase(text, integer, timestamptz, text)
  to service_role;
comment on function public.enqueue_meta_capi_purchase(text, integer, timestamptz, text) is
  'Service-role-only idempotent Purchase enqueue for current Rapid Resolution, bundle or Photo Radar. Requires sendable consented attribution.';

commit;
