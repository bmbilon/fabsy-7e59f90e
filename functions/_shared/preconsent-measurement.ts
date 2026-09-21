import type { PreconsentMetricPayload } from '../../src/lib/preconsentMeasurementCore';
import type { TrafficRequestMetric } from '../../src/lib/trafficRequest';

export interface PreconsentMeasurementEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  PRECONSENT_MEASUREMENT_ENABLED?: string;
  TRAFFIC_MEASUREMENT_ENABLED?: string;
}

const projectUrl = 'https://gcasbisxfrssonllpqrw.supabase.co';

export async function recordAggregatePreconsentMetric(
  env: PreconsentMeasurementEnv,
  payload: PreconsentMetricPayload,
): Promise<boolean> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || env.PRECONSENT_MEASUREMENT_ENABLED === 'false') return false;
  const response = await fetch(`${env.SUPABASE_URL || projectUrl}/rest/v1/rpc/record_preconsent_metric`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_event_name: payload.eventName,
      p_page_key: payload.pageKey,
      p_locale: payload.locale,
      p_utm_source: payload.utmSource,
      p_utm_medium: payload.utmMedium,
      p_utm_campaign: payload.utmCampaign,
      p_utm_content: payload.utmContent,
      p_click_id_kind: payload.clickIdKind,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  return response.ok;
}

export async function recordAggregateTrafficRequest(
  env: PreconsentMeasurementEnv,
  payload: TrafficRequestMetric,
): Promise<boolean> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || env.TRAFFIC_MEASUREMENT_ENABLED === 'false') return false;
  const response = await fetch(`${env.SUPABASE_URL || projectUrl}/rest/v1/rpc/record_traffic_request`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_page: payload.page,
      p_channel: payload.channel,
      p_source: payload.source,
      p_campaign: payload.campaign,
      p_device: payload.device,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  return response.ok;
}
