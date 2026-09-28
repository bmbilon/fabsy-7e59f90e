import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { getWorkspaceMessage } from './google-workspace-email.ts';
import { gmailMessageToIncomingEmail } from './gmail-disclosure-inbox.ts';
import { listOfferMessages, verifyOfferMailbox } from './gmail-offer-api.ts';
import { parseCrownNotice } from './crown-notice.ts';

export async function processCrownNotices(db: SupabaseClient, now = new Date()) {
  const {data: state, error} = await db.from('crown_notice_state').select('*').eq('id', true).single();
  if (error) throw new Error('CROWN_STATE_UNAVAILABLE');
  if (!state.enabled) return {enabled: false};
  let inspected = 0;
  try {
    await verifyOfferMailbox();
    const start = Math.max(Date.parse(state.scan_start), state.last_scan_at ? Date.parse(state.last_scan_at) - 86400000 : 0);
    const candidates = await listOfferMessages(`from:noreply@gov.ab.ca to:hello@fabsy.ca after:${Math.floor(start / 1000)} before:${Math.ceil(now.getTime() / 1000)}`);
    let complete = true;
    for (const item of candidates) {
      const {data: prior, error: lookup} = await db.from('crown_notice_sources').select('message_id').eq('message_id', item.id).maybeSingle();
      if (lookup) throw new Error('CROWN_SOURCE_LOOKUP_FAILED');
      if (prior) continue;
      if (inspected >= 10) {complete = false; break;}
      const notice = parseCrownNotice(gmailMessageToIncomingEmail(await getWorkspaceMessage(item.id)));
      inspected++;
      if (notice) {
        const {error: ingest} = await db.rpc('ingest_crown_notice', {p_source: item.id, p_notice: notice});
        if (ingest) throw new Error('CROWN_NOTICE_SAVE_FAILED');
      }
      const {error: source} = await db.from('crown_notice_sources').upsert({message_id: item.id}, {onConflict: 'message_id', ignoreDuplicates: true});
      if (source) throw new Error('CROWN_SOURCE_SAVE_FAILED');
    }
    const {error: saved} = await db.from('crown_notice_state').update({last_worker_at: now.toISOString(), ...(complete ? {last_scan_at: now.toISOString()} : {}), last_error: null}).eq('id', true);
    if (saved) throw new Error('CROWN_HEALTH_SAVE_FAILED');
    return {enabled: true, inspected, complete};
  } catch (error) {
    await db.from('crown_notice_state').update({last_worker_at: now.toISOString(), last_error: 'Crown notice scan needs review.'}).eq('id', true);
    throw error;
  }
}
