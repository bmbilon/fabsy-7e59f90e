import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

export function validPushSubscription(value: unknown): value is {endpoint: string; keys: {p256dh: string; auth: string}} {
  const s = value as {endpoint?: string; keys?: {p256dh?: string; auth?: string}};
  try {
    const u = new URL(s.endpoint || '');
    const host = u.hostname;
    return u.protocol === 'https:' && !u.port && !u.username && !u.password && !u.hash && u.href.length <= 4096
      && (host === 'fcm.googleapis.com' || host.endsWith('.push.apple.com') || host === 'updates.push.services.mozilla.com')
      && /^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh || '') && /^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth || '');
  } catch { return false; }
}
export function pushPayload(jobId: string | null, draftId: string | null = null, adsBatchId: string | null = null) {
  if(adsBatchId){
    if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(adsBatchId))throw new Error('INVALID_ADS_BATCH');
    return {title:'Fabsy ad launch ready for review',body:'Review the frozen ads, destinations and budget in Fabsy Admin. Opening this notification grants no approval.',url:`/admin/portal?ads=${adsBatchId}`,tag:`fabsy-ads-${adsBatchId}`};
  }
  if(draftId){
    if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(draftId))throw new Error('INVALID_PUSH_DRAFT');
    return {title: 'Fabsy email ready for review', body: 'An outbound client draft is waiting. Review it in Fabsy Admin and choose Approved to send.', url: `/admin/portal?draft=${draftId}`, tag: `fabsy-email-${draftId}`};
  }
  if (jobId && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(jobId)) throw new Error('INVALID_PUSH_JOB');
  return {title: jobId ? 'Fabsy needs your attention' : 'Fabsy notifications are connected',
    body: jobId ? 'A portal step needs your review. Tap to open Fabsy Admin.' : 'You can receive portal approval alerts on this device.',
    url: jobId ? `/admin/portal?job=${jobId}` : '/admin/portal', tag: jobId ? `fabsy-portal-${jobId}` : 'fabsy-push-test'};
}

export async function processPortalPush(db: SupabaseClient, fetcher: typeof fetch = fetch) {
  const publicKey = Deno.env.get('PORTAL_PUSH_PUBLIC_KEY');
  const privateKey = Deno.env.get('PORTAL_PUSH_PRIVATE_KEY');
  if (!publicKey || !privateKey) return {enabled: false};
  const {data: rows, error} = await db.rpc('claim_portal_push');
  if (error) throw new Error('PUSH_CLAIM_FAILED');
  let sent = 0;
  for (const row of rows || []) {
    const {data: sub, error: readError} = await db.from('portal_push_subscriptions').select('*').eq('id', row.subscription_id).single();
    let result: Record<string, unknown>;
    try {
      if (readError || !sub?.active) throw new Error('DEVICE_UNAVAILABLE');
      // Staff access may be revoked after enrollment. Validate it again before delivery.
      const admin = await db.rpc('has_role', {_user_id: sub.user_id, _role: 'admin'});
      const manager = admin.data === true ? null : await db.rpc('has_role', {_user_id: sub.user_id, _role: 'case_manager'});
      if (admin.error || manager?.error || (admin.data !== true && manager?.data !== true)) throw new Error('STAFF_ACCESS_UNAVAILABLE');
      if (row.ads_batch_id) {
        const batch=await db.from('ads_batches').select('status').eq('id',row.ads_batch_id).single();
        if(admin.data!==true||batch.error||batch.data?.status!=='pending')throw new Error('BATCH_NO_LONGER_WAITING');
      }
      if (row.email_draft_id) {
        const draft=await db.from('outbound_email_drafts').select('status').eq('id',row.email_draft_id).single();
        if(admin.data!==true || draft.error || draft.data?.status!=='pending_approval')throw new Error('DRAFT_NO_LONGER_WAITING');
      }
      if (row.job_id) {
        const {data: job, error: jobError} = await db.from('portal_agent_jobs').select('status').eq('id', row.job_id).single();
        if (jobError || !job || !['needs_review','uncertain'].includes(job.status)) throw new Error('JOB_NO_LONGER_WAITING');
      }
      const subscription = {endpoint: sub.endpoint, keys: {p256dh: sub.p256dh, auth: sub.auth_secret}};
      if (!validPushSubscription(subscription)) throw new Error('DEVICE_UNAVAILABLE');
      const details = webpush.generateRequestDetails(subscription, JSON.stringify(pushPayload(row.job_id, row.email_draft_id, row.ads_batch_id)), {
        TTL: 86400, urgency: 'high', topic: (row.ads_batch_id || row.email_draft_id || row.job_id || 'fabsy-test').replaceAll('-', '').slice(0, 32),
        vapidDetails: {subject: 'mailto:hello@fabsy.ca', publicKey, privateKey},
      });
      const response = await fetcher(details.endpoint, {method: 'POST', headers: details.headers,
        body: new Uint8Array(details.body), redirect: 'error', signal: AbortSignal.timeout(10000)});
      if (response.status === 404 || response.status === 410) {
        await db.from('portal_push_subscriptions').update({active: false}).eq('id', sub.id);
        throw new Error('DEVICE_EXPIRED');
      }
      if (!response.ok) throw new Error('PUSH_PROVIDER_UNAVAILABLE');
      result = {status: 'sent', sent_at: new Date().toISOString(), last_error: null}; sent++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'PUSH_PROVIDER_UNAVAILABLE';
      const retry = reason === 'PUSH_PROVIDER_UNAVAILABLE' || !['DEVICE_UNAVAILABLE','DEVICE_EXPIRED','STAFF_ACCESS_UNAVAILABLE','JOB_NO_LONGER_WAITING','DRAFT_NO_LONGER_WAITING','BATCH_NO_LONGER_WAITING'].includes(reason);
      result = {status: retry && row.attempts < 3 ? 'pending' : 'failed', available_at: new Date(Date.now() + 60000).toISOString(), last_error: retry ? 'Notification delivery needs retry.' : reason};
    }
    const {error: saved} = await db.from('portal_push_outbox').update({...result, lease_until: null}).eq('id', row.id).eq('status', 'sending').eq('attempts', row.attempts);
    if (saved) throw new Error('PUSH_RECEIPT_SAVE_FAILED');
  }
  return {enabled: true, sent};
}
