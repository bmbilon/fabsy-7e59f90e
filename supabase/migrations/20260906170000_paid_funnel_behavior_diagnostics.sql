-- Add bounded, consented behavior checkpoints to the existing PII-free funnel
-- ledger. No free text, URL, form value, identity, device fingerprint or raw
-- click identifier is accepted by this contract.

alter table analytics_private.paid_funnel_events
  drop constraint paid_funnel_event_name_check,
  drop constraint paid_funnel_event_page_check,
  drop constraint paid_funnel_step_check,
  drop constraint paid_funnel_position_check;

alter table analytics_private.paid_funnel_events
  add constraint paid_funnel_event_name_check check (event_name in (
    'landing_view','primary_cta_viewed','primary_cta_click','phone_click',
    'engaged_10s','engaged_30s','engaged_60s',
    'scroll_25','scroll_50','scroll_75','scroll_90',
    'intake_started','intake_step_viewed','intake_validation_blocked',
    'ticket_upload_started','ticket_upload_failed','ticket_uploaded',
    'lead_saved','intake_step_completed','checkout_started','checkout_canceled','purchase'
  )),
  add constraint paid_funnel_event_page_check check (
    (event_name in (
      'landing_view','primary_cta_viewed','primary_cta_click','phone_click',
      'engaged_10s','engaged_30s','engaged_60s',
      'scroll_25','scroll_50','scroll_75','scroll_90'
    ) and page_key = 'rapid_resolution')
    or (event_name in (
      'intake_started','intake_step_viewed','intake_validation_blocked',
      'ticket_upload_started','ticket_upload_failed','ticket_uploaded',
      'lead_saved','intake_step_completed','checkout_started'
    ) and page_key = 'intake')
    or (event_name = 'checkout_canceled' and page_key = 'payment_canceled')
    or (event_name = 'purchase' and page_key = 'thank_you')
  ),
  add constraint paid_funnel_step_check check (
    (event_name in ('intake_step_viewed','intake_validation_blocked','intake_step_completed') and step between 1 and 6)
    or (event_name not in ('intake_step_viewed','intake_validation_blocked','intake_step_completed') and step is null)
  ),
  add constraint paid_funnel_position_check check (
    (event_name in ('primary_cta_viewed','primary_cta_click','phone_click') and
      (position is null or position in ('hero','header','sticky','section','footer')))
    or (event_name not in ('primary_cta_viewed','primary_cta_click','phone_click') and position is null)
  );

drop index analytics_private.paid_funnel_session_singleton_idx;
drop index analytics_private.paid_funnel_session_action_idx;
drop index analytics_private.paid_funnel_session_step_idx;

create unique index paid_funnel_session_singleton_idx
  on analytics_private.paid_funnel_events(session_id, event_name)
  where event_name not in (
    'primary_cta_viewed','primary_cta_click','phone_click',
    'intake_step_viewed','intake_validation_blocked','intake_step_completed'
  );
create unique index paid_funnel_session_action_idx
  on analytics_private.paid_funnel_events(session_id, event_name, coalesce(position, ''))
  where event_name in ('primary_cta_viewed','primary_cta_click','phone_click');
create unique index paid_funnel_session_step_idx
  on analytics_private.paid_funnel_events(session_id, event_name, step)
  where event_name in ('intake_step_viewed','intake_validation_blocked','intake_step_completed');

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
    'landing_view','primary_cta_viewed','primary_cta_click','phone_click',
    'engaged_10s','engaged_30s','engaged_60s',
    'scroll_25','scroll_50','scroll_75','scroll_90',
    'intake_started','intake_step_viewed','intake_validation_blocked',
    'ticket_upload_started','ticket_upload_failed','ticket_uploaded',
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
      or (p_event_name in ('primary_cta_viewed','primary_cta_click','phone_click') and position is not distinct from p_position)
      or (p_event_name in ('intake_step_viewed','intake_validation_blocked','intake_step_completed') and step is not distinct from p_step)
      or p_event_name not in (
        'primary_cta_viewed','primary_cta_click','phone_click',
        'intake_step_viewed','intake_validation_blocked','intake_step_completed'
      )
    )
  );
end;
$$;

revoke all on function public.record_paid_funnel_event(
  uuid,uuid,text,timestamptz,text,smallint,text,text,text,text,text,text,text,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.record_paid_funnel_event(
  uuid,uuid,text,timestamptz,text,smallint,text,text,text,text,text,text,text,text,text,text,timestamptz
) to service_role;

create or replace function public.paid_funnel_behavior_report(
  p_since timestamptz,
  p_until timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  report jsonb;
begin
  if p_since is null or p_until is null or p_since >= p_until or
      p_since < p_until - interval '90 days' or p_until > clock_timestamp() + interval '5 minutes' then
    raise exception 'FUNNEL_REPORT_WINDOW_INVALID';
  end if;

  with source as (
    select * from analytics_private.paid_funnel_events
    where occurred_at >= p_since and occurred_at < p_until
  ), campaign_totals as (
    select
      coalesce(utm_source, '(direct)') as source,
      coalesce(utm_medium, '(none)') as medium,
      coalesce(utm_campaign, '(none)') as campaign,
      coalesce(utm_content, '(none)') as content,
      count(distinct session_id) filter (where event_name = 'primary_cta_viewed')::bigint as cta_viewed_sessions,
      count(distinct session_id) filter (where event_name = 'engaged_10s')::bigint as engaged_10s_sessions,
      count(distinct session_id) filter (where event_name = 'engaged_30s')::bigint as engaged_30s_sessions,
      count(distinct session_id) filter (where event_name = 'engaged_60s')::bigint as engaged_60s_sessions,
      count(distinct session_id) filter (where event_name = 'scroll_25')::bigint as scroll_25_sessions,
      count(distinct session_id) filter (where event_name = 'scroll_50')::bigint as scroll_50_sessions,
      count(distinct session_id) filter (where event_name = 'scroll_75')::bigint as scroll_75_sessions,
      count(distinct session_id) filter (where event_name = 'scroll_90')::bigint as scroll_90_sessions,
      count(distinct session_id) filter (where event_name = 'ticket_upload_started')::bigint as upload_started_sessions,
      count(distinct session_id) filter (where event_name = 'ticket_upload_failed')::bigint as upload_failed_sessions,
      count(distinct session_id) filter (where event_name = 'intake_validation_blocked')::bigint as validation_blocked_sessions
    from source
    group by coalesce(utm_source, '(direct)'), coalesce(utm_medium, '(none)'),
      coalesce(utm_campaign, '(none)'), coalesce(utm_content, '(none)')
  ), step_totals as (
    select step,
      count(distinct session_id) filter (where event_name = 'intake_step_viewed')::bigint as viewed_sessions,
      count(distinct session_id) filter (where event_name = 'intake_validation_blocked')::bigint as blocked_sessions,
      count(distinct session_id) filter (where event_name = 'intake_step_completed')::bigint as completed_sessions
    from source
    where event_name in ('intake_step_viewed','intake_validation_blocked','intake_step_completed')
    group by step
  )
  select jsonb_build_object(
    'campaigns', coalesce((
      select jsonb_agg(to_jsonb(campaign_totals) order by source, campaign, content)
      from campaign_totals
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(to_jsonb(step_totals) order by step)
      from step_totals
    ), '[]'::jsonb)
  ) into report;
  return report;
end;
$$;

revoke all on function public.paid_funnel_behavior_report(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.paid_funnel_behavior_report(timestamptz, timestamptz)
  to service_role;

comment on function public.paid_funnel_behavior_report(timestamptz, timestamptz) is
  'Returns only aggregate consented behavior checkpoints by campaign and intake step. It exposes no row-level identifiers, form values or free text.';
