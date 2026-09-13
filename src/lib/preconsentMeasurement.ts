import {
  preconsentMetricPayload,
  type PreconsentMetricEvent,
} from './preconsentMeasurementCore';

interface MeasurementEnvironment {
  PROD?: boolean;
  VITE_PRECONSENT_MEASUREMENT_ENABLED?: string;
}

const productionHosts = new Set(['fabsy.ca', 'www.fabsy.ca']);

function browserAllowsAggregateMeasurement(): boolean {
  if (navigator.doNotTrack === '1') return false;
  return !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
}

/** Sends one identifier-free aggregate action. It never writes browser storage. */
export async function recordPreconsentMetric(
  eventName: Exclude<PreconsentMetricEvent, 'paid_landing'>,
): Promise<boolean> {
  if (typeof window === 'undefined' ||
      !preconsentMeasurementEnabled(import.meta.env, window.location.hostname) ||
      !browserAllowsAggregateMeasurement()) return false;
  const payload = preconsentMetricPayload(new URL(window.location.href), eventName);
  if (!payload) return false;
  try {
    const response = await window.fetch('/api/preconsent-measurement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'omit',
      keepalive: true,
      referrerPolicy: 'no-referrer',
    });
    return response.status === 202;
  } catch {
    return false;
  }
}

export function preconsentMeasurementEnabled(
  env: MeasurementEnvironment,
  hostname: string,
): boolean {
  return env.PROD === true && env.VITE_PRECONSENT_MEASUREMENT_ENABLED !== 'false' &&
    productionHosts.has(hostname);
}
