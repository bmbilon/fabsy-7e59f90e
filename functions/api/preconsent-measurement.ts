import { isBot } from '../../src/lib/live-view/core';
import { validPreconsentMetricPayload } from '../../src/lib/preconsentMeasurementCore';
import {
  recordAggregatePreconsentMetric,
  type PreconsentMeasurementEnv,
} from '../_shared/preconsent-measurement';

const productionHosts = new Set(['fabsy.ca', 'www.fabsy.ca']);
const responseHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

function reply(status: number): Response {
  return new Response(null, { status, headers: responseHeaders });
}

async function smallJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (!request.body || declared > 2_048) return null;
  const text = await request.text();
  if (!text || new TextEncoder().encode(text).length > 2_048) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export const onRequest: PagesFunction<PreconsentMeasurementEnv> = async context => {
  const { request, env } = context;
  if (request.method !== 'POST') return reply(405);
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin) return reply(403);
  if (!productionHosts.has(url.hostname)) return reply(204);
  if (env.PRECONSENT_MEASUREMENT_ENABLED === 'false') return reply(204);
  if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1' ||
      isBot(request.headers.get('User-Agent') || '')) return reply(204);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply(415);
  const payload = await smallJson(request);
  if (!validPreconsentMetricPayload(payload) || payload.eventName === 'paid_landing') return reply(400);
  try {
    return reply(await recordAggregatePreconsentMetric(env, payload) ? 202 : 503);
  } catch {
    return reply(503);
  }
};
