import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { FunnelReportRequestError, parseFunnelReportWindow } from '../_shared/funnel-report.ts';

const allowedOrigins = new Set([
  'https://fabsy.ca',
  'https://www.fabsy.ca',
  'http://localhost:5173',
  'http://localhost:4173',
]);

function responseHeaders(origin: string | null): Record<string, string> {
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
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw new FunnelReportRequestError('authorization_required', 401);
  const token = header.slice(7).trim();
  if (!token || token.length > 4096) throw new FunnelReportRequestError('authorization_invalid', 401);
  return token;
}

serve(async request => {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins.has(origin)) return json(origin, 403, { error: 'origin_not_allowed' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin) });
  if (request.method !== 'POST') return json(origin, 405, { error: 'method_not_allowed' });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json(origin, 503, { error: 'configuration_unavailable' });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = bearerToken(request);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) throw new FunnelReportRequestError('authorization_invalid', 401);
    const { data: staff, error: staffError } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .in('role', ['admin', 'case_manager'])
      .limit(1)
      .maybeSingle();
    if (staffError) return json(origin, 503, { error: 'authorization_unavailable' });
    if (!staff) throw new FunnelReportRequestError('staff_required', 403);

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > 1024) throw new FunnelReportRequestError('body_too_large', 413);
    const text = await request.text();
    if (!text || new TextEncoder().encode(text).length > 1024) {
      throw new FunnelReportRequestError('body_invalid');
    }
    const days = parseFunnelReportWindow(JSON.parse(text));
    const until = new Date();
    const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
    const { data, error } = await admin.rpc('paid_funnel_report', {
      p_since: since.toISOString(),
      p_until: until.toISOString(),
    });
    if (error || !data) return json(origin, 503, { error: 'report_unavailable' });
    return json(origin, 200, data);
  } catch (error) {
    const status = error instanceof FunnelReportRequestError ? error.status : 400;
    const code = error instanceof FunnelReportRequestError ? error.code : 'request_invalid';
    return json(origin, status, { error: code });
  }
});
