import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {
  FunnelRequestError,
  parseFunnelEventRequest,
} from '../_shared/funnel-measurement.ts';
import { requestAddress } from '../_shared/ticket-intake-draft.ts';

const allowedOrigins = new Set(['https://fabsy.ca', 'https://www.fabsy.ca']);
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 1000;
const MAX_EVENTS_PER_WINDOW = 120;
const MAX_BODY_BYTES = 8192;

function headers(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://fabsy.ca',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function json(origin: string | null, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function rateLimitKey(request: Request): string {
  return requestAddress(request);
}

function withinRateLimit(request: Request, now = Date.now()): boolean {
  const key = rateLimitKey(request);
  const current = requestCounts.get(key);
  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_EVENTS_PER_WINDOW;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), part => part.toString(16).padStart(2, '0')).join('');
}

serve(async request => {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins.has(origin)) return json(origin, 403, { error: 'origin_not_allowed' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
  if (request.method !== 'POST') return json(origin, 405, { error: 'method_not_allowed' });
  if (!withinRateLimit(request)) return json(origin, 429, { error: 'rate_limited' });
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return json(origin, 413, { error: 'body_too_large' });

  try {
    const text = await request.text();
    if (!text || new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
      return json(origin, 413, { error: 'body_too_large' });
    }
    const event = parseFunnelEventRequest(JSON.parse(text));
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json(origin, 503, { error: 'configuration_unavailable' });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const clickIdHash = event.clickIdValue ? await sha256(`${event.clickIdKind}:${event.clickIdValue}`) : null;
    const { data, error } = await admin.rpc('record_paid_funnel_event', {
      p_event_id: event.eventId,
      p_session_id: event.sessionId,
      p_event_name: event.eventName,
      p_occurred_at: event.occurredAt,
      p_page_key: event.pageKey,
      p_step: event.step,
      p_product: event.product,
      p_position: event.position,
      p_utm_source: event.utmSource,
      p_utm_medium: event.utmMedium,
      p_utm_campaign: event.utmCampaign,
      p_utm_term: event.utmTerm,
      p_utm_content: event.utmContent,
      p_click_id_kind: event.clickIdKind,
      p_click_id_hash: clickIdHash,
      p_consent_version: event.consentVersion,
      p_consented_at: event.consentedAt,
    });
    if (error || data !== true) return json(origin, 503, { error: 'event_not_recorded' });
    return json(origin, 202, { accepted: true });
  } catch (error) {
    const code = error instanceof FunnelRequestError ? error.code : 'request_invalid';
    console.warn(`[record-funnel-event] ${code}`);
    return json(origin, 400, { error: code });
  }
});
