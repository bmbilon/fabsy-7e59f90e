create schema if not exists analytics_private;
revoke all on schema analytics_private from public, anon, authenticated;

create table analytics_private.paid_funnel_events (
  event_id uuid primary key,
  session_id uuid not null,
  event_name text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  page_key text not null,
  step smallint,
  product text,
  position text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  click_id_kind text,
  click_id_hash text,
  consent_version text not null,
  consented_at timestamptz not null,
  constraint paid_funnel_event_name_check check (event_name in (
    'landing_view','primary_cta_click','phone_click','intake_started','ticket_uploaded',
    'lead_saved','intake_step_completed','checkout_started','checkout_canceled','purchase'
  )),
  constraint paid_funnel_page_key_check check (page_key in (
    'rapid_resolution','intake','payment_canceled','thank_you'
  )),
  constraint paid_funnel_event_page_check check (
    (event_name in ('landing_view','primary_cta_click','phone_click') and page_key = 'rapid_resolution')
    or (event_name in ('intake_started','ticket_uploaded','lead_saved','intake_step_completed','checkout_started') and page_key = 'intake')
    or (event_name = 'checkout_canceled' and page_key = 'payment_canceled')
    or (event_name = 'purchase' and page_key = 'thank_you')
  ),
  constraint paid_funnel_step_check check (
    (event_name = 'intake_step_completed' and step between 1 and 6)
    or (event_name <> 'intake_step_completed' and step is null)
  ),
  constraint paid_funnel_product_check check (
    (event_name = 'purchase' and product is not null and product in ('rapid_resolution','rapid_resolution_bundle','photo_radar'))
    or (event_name <> 'purchase' and product is null)
  ),
  constraint paid_funnel_position_check check (
    (event_name in ('primary_cta_click','phone_click') and (position is null or position in ('hero','header','sticky','section','footer')))
    or (event_name not in ('primary_cta_click','phone_click') and position is null)
  ),
  constraint paid_funnel_utm_source_check check (utm_source is null or (octet_length(utm_source) between 1 and 250 and utm_source ~ '^[A-Za-z0-9._~-]+$')),
  constraint paid_funnel_utm_medium_check check (utm_medium is null or (octet_length(utm_medium) between 1 and 250 and utm_medium ~ '^[A-Za-z0-9._~-]+$')),
  constraint paid_funnel_utm_campaign_check check (utm_campaign is null or (octet_length(utm_campaign) between 1 and 250 and utm_campaign ~ '^[A-Za-z0-9._~-]+$')),
  constraint paid_funnel_utm_term_check check (utm_term is null or (octet_length(utm_term) between 1 and 250 and utm_term ~ '^[A-Za-z0-9._~-]+$')),
  constraint paid_funnel_utm_content_check check (utm_content is null or (octet_length(utm_content) between 1 and 250 and utm_content ~ '^[A-Za-z0-9._~-]+$')),
  constraint paid_funnel_click_id_check check (
    (click_id_kind is null and click_id_hash is null)
    or (click_id_kind in ('gclid','gbraid','wbraid','fbclid') and click_id_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint paid_funnel_consent_check check (
    consent_version = 'fabsy-funnel-v1'
    and consented_at >= timestamptz '2026-01-01 00:00:00+00'
  ),
  constraint paid_funnel_time_check check (
    occurred_at >= consented_at - interval '5 minutes'
    and received_at >= occurred_at - interval '5 minutes'
  )
);

create index paid_funnel_session_time_idx
  on analytics_private.paid_funnel_events(session_id, occurred_at, event_id);
create index paid_funnel_campaign_time_idx
  on analytics_private.paid_funnel_events(utm_source, utm_campaign, utm_content, occurred_at);
create index paid_funnel_event_time_idx
  on analytics_private.paid_funnel_events(event_name, occurred_at);
create unique index paid_funnel_session_singleton_idx
  on analytics_private.paid_funnel_events(session_id, event_name)
  where event_name not in ('primary_cta_click','phone_click','intake_step_completed');
create unique index paid_funnel_session_action_idx
  on analytics_private.paid_funnel_events(session_id, event_name, coalesce(position, ''))
  where event_name in ('primary_cta_click','phone_click');
create unique index paid_funnel_session_step_idx
  on analytics_private.paid_funnel_events(session_id, event_name, step)
  where event_name = 'intake_step_completed';

-- A short-lived, PII-free bridge between the browser journey and Stripe. Only
-- a SHA-256 checkout handle is stored; neither the raw Stripe session nor any
-- client, submission, ticket or contact identifier enters this schema.
create table analytics_private.paid_funnel_checkouts (
  checkout_session_hash text primary key,
  session_id uuid not null,
  consent_version text not null,
  consented_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '7 days'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  constraint paid_funnel_checkout_hash_check check (checkout_session_hash ~ '^[0-9a-f]{64}$'),
  constraint paid_funnel_checkout_consent_check check (
    consent_version = 'fabsy-funnel-v1'
    and consented_at >= timestamptz '2026-01-01 00:00:00+00'
  ),
  constraint paid_funnel_checkout_expiry_check check (expires_at > created_at)
);

create index paid_funnel_checkout_expiry_idx
  on analytics_private.paid_funnel_checkouts(expires_at);

alter table analytics_private.paid_funnel_checkouts enable row level security;
revoke all on analytics_private.paid_funnel_checkouts from public, anon, authenticated, service_role;

alter table analytics_private.paid_funnel_events enable row level security;
revoke all on analytics_private.paid_funnel_events from public, anon, authenticated, service_role;

create or replace function public.record_paid_funnel_event(
  p_event_id uuid,
  p_session_id uuid,
  p_event_name text,
  p_occurred_at timestamptz,
  p_page_key text,
  p_step smallint default null,
  p_product text default null,
  p_position text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_term text default null,
  p_utm_content text default null,
  p_click_id_kind text default null,
  p_click_id_hash text default null,
  p_consent_version text default null,
  p_consented_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  inserted_count integer;
begin
  if p_event_id is null or p_session_id is null then raise exception 'FUNNEL_IDENTIFIER_INVALID'; end if;
  if p_event_name not in (
    'landing_view','primary_cta_click','phone_click','intake_started','ticket_uploaded',
    'lead_saved','intake_step_completed','checkout_started','checkout_canceled','purchase'
  ) then raise exception 'FUNNEL_EVENT_INVALID'; end if;
  if p_event_name = 'purchase' then raise exception 'FUNNEL_PURCHASE_REQUIRES_VERIFIED_WEBHOOK'; end if;
  if p_page_key not in ('rapid_resolution','intake','payment_canceled','thank_you') then
    raise exception 'FUNNEL_PAGE_INVALID';
  end if;
  if p_consent_version is distinct from 'fabsy-funnel-v1' or p_consented_at is null or
      p_consented_at < clock_timestamp() - interval '180 days' or
      p_consented_at > p_occurred_at + interval '5 minutes' then
    raise exception 'FUNNEL_CONSENT_INVALID';
  end if;
  if p_occurred_at is null or p_occurred_at < clock_timestamp() - interval '24 hours' or
      p_occurred_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'FUNNEL_TIME_INVALID';
  end if;

  insert into analytics_private.paid_funnel_events (
    event_id,session_id,event_name,occurred_at,page_key,step,product,position,
    utm_source,utm_medium,utm_campaign,utm_term,utm_content,
    click_id_kind,click_id_hash,consent_version,consented_at
  ) values (
    p_event_id,p_session_id,p_event_name,p_occurred_at,p_page_key,p_step,p_product,p_position,
    p_utm_source,p_utm_medium,p_utm_campaign,p_utm_term,p_utm_content,
    p_click_id_kind,p_click_id_hash,p_consent_version,p_consented_at
  ) on conflict do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count = 1 or exists (
    select 1 from analytics_private.paid_funnel_events
    where session_id = p_session_id and event_name = p_event_name and (
      event_id = p_event_id
      or (p_event_name in ('primary_cta_click','phone_click') and position is not distinct from p_position)
      or (p_event_name = 'intake_step_completed' and step is not distinct from p_step)
      or p_event_name not in ('primary_cta_click','phone_click','intake_step_completed')
    )
  );
end;
$$;

revoke all on function public.record_paid_funnel_event(
  uuid,uuid,text,timestamptz,text,smallint,text,text,text,text,text,text,text,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.record_paid_funnel_event(
  uuid,uuid,text,timestamptz,text,smallint,text,text,text,text,text,text,text,text,text,text,text,timestamptz
) to service_role;

create or replace function public.record_paid_funnel_checkout(
  p_checkout_session_hash text,
  p_session_id uuid,
  p_consent_version text,
  p_consented_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_checkout_session_hash is null or p_checkout_session_hash !~ '^[0-9a-f]{64}$' or
      p_session_id is null or p_consent_version is distinct from 'fabsy-funnel-v1' or
      p_consented_at is null or p_consented_at < clock_timestamp() - interval '180 days' or
      p_consented_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'FUNNEL_CHECKOUT_INVALID';
  end if;

  insert into analytics_private.paid_funnel_checkouts (
    checkout_session_hash, session_id, consent_version, consented_at
  ) values (
    p_checkout_session_hash, p_session_id, p_consent_version, p_consented_at
  ) on conflict (checkout_session_hash) do update
    set session_id = excluded.session_id,
        consent_version = excluded.consent_version,
        consented_at = excluded.consented_at,
        updated_at = clock_timestamp(),
        expires_at = clock_timestamp() + interval '7 days',
        revoked_at = null
    where paid_funnel_checkouts.consumed_at is null;
  return found;
end;
$$;

revoke all on function public.record_paid_funnel_checkout(text,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_paid_funnel_checkout(text,uuid,text,timestamptz)
  to service_role;

create or replace function public.withdraw_paid_funnel_checkout(p_checkout_session_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_checkout_session_hash is null or p_checkout_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'FUNNEL_CHECKOUT_HASH_INVALID';
  end if;
  update analytics_private.paid_funnel_checkouts
    set revoked_at = coalesce(revoked_at, clock_timestamp()),
        updated_at = clock_timestamp()
  where checkout_session_hash = p_checkout_session_hash and consumed_at is null;
  -- Non-enumerating: an unknown handle is still safely withdrawn.
  return true;
end;
$$;

revoke all on function public.withdraw_paid_funnel_checkout(text)
  from public, anon, authenticated;
grant execute on function public.withdraw_paid_funnel_checkout(text)
  to service_role;

create or replace function public.record_verified_paid_funnel_purchase(
  p_checkout_session_hash text,
  p_event_id uuid,
  p_occurred_at timestamptz,
  p_product text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  checkout_row analytics_private.paid_funnel_checkouts%rowtype;
  seed analytics_private.paid_funnel_events%rowtype;
  inserted_count integer;
begin
  if p_checkout_session_hash is null or p_checkout_session_hash !~ '^[0-9a-f]{64}$' or
      p_event_id is null or p_occurred_at is null or
      p_product is null or p_product not in ('rapid_resolution','rapid_resolution_bundle','photo_radar') then
    raise exception 'FUNNEL_VERIFIED_PURCHASE_INVALID';
  end if;

  select * into checkout_row
  from analytics_private.paid_funnel_checkouts
  where checkout_session_hash = p_checkout_session_hash
    and revoked_at is null
    and expires_at > clock_timestamp()
  for update;
  if not found then return false; end if;

  select * into seed
  from analytics_private.paid_funnel_events
  where session_id = checkout_row.session_id
  order by occurred_at desc, event_id desc
  limit 1;

  insert into analytics_private.paid_funnel_events (
    event_id,session_id,event_name,occurred_at,page_key,product,
    utm_source,utm_medium,utm_campaign,utm_term,utm_content,
    click_id_kind,click_id_hash,consent_version,consented_at
  ) values (
    p_event_id,checkout_row.session_id,'purchase',p_occurred_at,'thank_you',p_product,
    seed.utm_source,seed.utm_medium,seed.utm_campaign,seed.utm_term,seed.utm_content,
    seed.click_id_kind,seed.click_id_hash,checkout_row.consent_version,checkout_row.consented_at
  ) on conflict do nothing;
  get diagnostics inserted_count = row_count;

  update analytics_private.paid_funnel_checkouts
    set consumed_at = coalesce(consumed_at, clock_timestamp()),
        updated_at = clock_timestamp()
  where checkout_session_hash = p_checkout_session_hash;
  return inserted_count = 1 or exists (
    select 1 from analytics_private.paid_funnel_events
    where session_id = checkout_row.session_id and event_name = 'purchase'
  );
end;
$$;

revoke all on function public.record_verified_paid_funnel_purchase(text,uuid,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.record_verified_paid_funnel_purchase(text,uuid,timestamptz,text)
  to service_role;

create or replace function public.purge_paid_funnel_events(p_before timestamptz default clock_timestamp() - interval '400 days')
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  removed bigint;
begin
  if p_before is null or p_before > clock_timestamp() - interval '180 days' then
    raise exception 'FUNNEL_PURGE_BOUNDARY_INVALID';
  end if;
  delete from analytics_private.paid_funnel_events where received_at < p_before;
  get diagnostics removed = row_count;
  delete from analytics_private.paid_funnel_checkouts
  where expires_at < clock_timestamp()
    or (consumed_at is not null and consumed_at < clock_timestamp() - interval '7 days')
    or (revoked_at is not null and revoked_at < clock_timestamp() - interval '7 days');
  return removed;
end;
$$;

revoke all on function public.purge_paid_funnel_events(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_paid_funnel_events(timestamptz) to service_role;

comment on table analytics_private.paid_funnel_events is
  'Consent-gated, PII-free paid funnel events. Click identifiers are stored only as SHA-256 hashes; raw paths, referrers, IPs, user agents and form values are not stored.';
comment on table analytics_private.paid_funnel_checkouts is
  'Short-lived, PII-free checkout correlation. Stores only a SHA-256 Stripe session handle plus a consented anonymous funnel session.';

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'fabsy-paid-funnel-retention',
  '27 4 * * *',
  $cron$select public.purge_paid_funnel_events();$cron$
);
