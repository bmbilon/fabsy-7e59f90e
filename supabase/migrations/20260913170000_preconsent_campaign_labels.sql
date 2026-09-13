-- Preserve reviewed campaign/content labels for the September Google relaunch
-- and the existing multilingual ads in the privacy-safe aggregate counters.

alter table analytics_private.preconsent_metrics_hourly
  drop constraint if exists preconsent_metric_campaign_check;

alter table analytics_private.preconsent_metrics_hourly
  add constraint preconsent_metric_campaign_check
  check (utm_campaign in (
    '',
    'rr_ab_en_creative_20260831',
    'rr_ab_multilingual_20260906',
    'rr_google_profit_20260913',
    'rr-pilot-calgary-202608',
    'rr-pilot-edmonton-202608',
    'rr-pilot-alberta-202608'
  ));

alter table analytics_private.preconsent_metrics_hourly
  drop constraint if exists preconsent_metric_content_check;

alter table analytics_private.preconsent_metrics_hourly
  add constraint preconsent_metric_content_check
  check (utm_content in (
    '',
    'rr_relief_v1',
    'rr_flat_fee_v1',
    'rr_client_control_v1',
    'en_rsa_v1',
    'pa_rsa_v1',
    'tl_rsa_v1',
    'zh_hans_rsa_v1',
    'zh_hant_rsa_v1',
    'ar_rsa_v1',
    'es_rsa_v1',
    'hi_rsa_v1',
    'pa_rr_v1',
    'tl_rr_v1',
    'zh_hans_rr_v1',
    'zh_hant_rr_v1',
    'ar_rr_v1',
    'es_rr_v1',
    'hi_rr_v1'
  ));

create or replace function public.record_preconsent_metric(
  p_event_name text,
  p_page_key text,
  p_locale text,
  p_utm_source text default '',
  p_utm_medium text default '',
  p_utm_campaign text default '',
  p_utm_content text default '',
  p_click_id_kind text default ''
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  source_value text := lower(coalesce(btrim(p_utm_source), ''));
  medium_value text := lower(coalesce(btrim(p_utm_medium), ''));
  campaign_value text := coalesce(btrim(p_utm_campaign), '');
  content_value text := coalesce(btrim(p_utm_content), '');
  click_kind text := lower(coalesce(btrim(p_click_id_kind), ''));
begin
  if p_event_name not in ('paid_landing','consent_accepted','consent_declined','consent_dismissed') or
      p_page_key not in ('home','rapid_resolution','photo_radar','pro_drivers') or
      p_locale not in ('en','pa','tl','zh-hans','zh-hant','ar','hi','es') then
    raise exception 'PRECONSENT_METRIC_INVALID';
  end if;
  if source_value not in ('meta','facebook','instagram','google','openai','other_paid') or
      medium_value not in ('cpc','ppc','paid','paid_social','paid-social') or
      campaign_value not in (
        '',
        'rr_ab_en_creative_20260831',
        'rr_ab_multilingual_20260906',
        'rr_google_profit_20260913',
        'rr-pilot-calgary-202608',
        'rr-pilot-edmonton-202608',
        'rr-pilot-alberta-202608'
      ) or
      content_value not in (
        '',
        'rr_relief_v1',
        'rr_flat_fee_v1',
        'rr_client_control_v1',
        'en_rsa_v1',
        'pa_rsa_v1',
        'tl_rsa_v1',
        'zh_hans_rsa_v1',
        'zh_hant_rsa_v1',
        'ar_rsa_v1',
        'es_rsa_v1',
        'hi_rsa_v1',
        'pa_rr_v1',
        'tl_rr_v1',
        'zh_hans_rr_v1',
        'zh_hant_rr_v1',
        'ar_rr_v1',
        'es_rr_v1',
        'hi_rr_v1'
      ) or
      click_kind not in ('','gclid','gbraid','wbraid','fbclid') then
    raise exception 'PRECONSENT_CAMPAIGN_INVALID';
  end if;

  insert into analytics_private.preconsent_metrics_hourly (
    bucket_start, event_name, page_key, locale, utm_source, utm_medium,
    utm_campaign, utm_content, click_id_kind, event_count
  ) values (
    date_trunc('hour', clock_timestamp()), p_event_name, p_page_key, p_locale,
    source_value, medium_value, campaign_value, content_value, click_kind, 1
  )
  on conflict (
    bucket_start, event_name, page_key, locale, utm_source,
    utm_medium, utm_campaign, utm_content, click_id_kind
  ) do update set event_count = analytics_private.preconsent_metrics_hourly.event_count + 1;
  return true;
end;
$$;

revoke all on function public.record_preconsent_metric(text,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.record_preconsent_metric(text,text,text,text,text,text,text,text)
  to service_role;

