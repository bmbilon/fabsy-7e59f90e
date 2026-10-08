import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { initialHash, encryptLookup, decryptLookup } from './portal-lookup-crypto.ts';
import { normalizePortalLookup } from './portal-lookup-values.ts';

const normalizeTicket = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export async function serviceOrderLookup(db: SupabaseClient, input: Record<string, unknown>) {
  if (typeof input.orderId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.orderId)
    || typeof input.accessToken !== 'string' || !/^[a-f0-9]{64}$/.test(input.accessToken)) throw new Error('PRIVATE_ORDER_ACCESS_REQUIRED');
  const accessHash = await initialHash(input.accessToken);
  const order = await db.from('service_orders').select('id,access_token_hash,product,ticket_number').eq('id', input.orderId).maybeSingle();
  if (order.error) throw new Error('LOOKUP_DETAILS_UNAVAILABLE');
  if (order.data && order.data.access_token_hash !== accessHash) throw new Error('PRIVATE_ORDER_ACCESS_REQUIRED');
  const claim = await db.from('service_order_portal_lookups').select('access_token_hash').eq('order_id', input.orderId).maybeSingle();
  if (claim.error) throw new Error('LOOKUP_DETAILS_UNAVAILABLE');
  if (claim.data && claim.data.access_token_hash !== accessHash) throw new Error('PRIVATE_ORDER_ACCESS_REQUIRED');
  if (input.action === 'order-lookup-status') return { saved: Boolean(claim.data) };
  const product = order.data?.product || input.product;
  if (!['photo_radar', 'rapid_resolution', 'bundle'].includes(String(product))) throw new Error('REPRESENTATION_ORDER_REQUIRED');
  if (input.verified !== true) throw new Error('LOOKUP_CONFIRMATION_REQUIRED');
  const kind = String(input.kind), value = normalizePortalLookup(kind, input.value);
  const ticket = normalizeTicket(order.data ? order.data.ticket_number : input.ticketNumber);
  if (ticket && !/^[A-Z][0-9]{8}[A-Z]$/.test(ticket)) throw new Error('EXACT_TICKET_NUMBER_REQUIRED');
  const result = await db.rpc('record_service_order_portal_lookup', {
    p_id: input.orderId, p_access_hash: accessHash, p_product: product, p_ticket: ticket || null,
    p_kind: kind, p_cipher: await encryptLookup({ kind, value }, 'service-order/' + input.orderId),
    p_hash: await initialHash(input.orderId + '/' + kind + '/' + value),
  });
  if (result.error) throw new Error('ORDER_LOOKUP_SAVE_REJECTED');
  return { saved: true };
}

/** Import only an explicitly identified ticket or this order's own verified upload. */
export async function importServiceOrderLookup(db: SupabaseClient, ticket: Record<string, unknown>, sourceHash: string) {
  const result = await db.rpc('service_order_lookup_for_case', { p_id: ticket.id });
  if (result.error) throw new Error('ORDER_LOOKUP_UNAVAILABLE');
  const claims = result.data || [];
  if (!claims.length) return;
  if (claims.length !== 1) throw new Error('EXACT_ORDER_LOOKUP_REQUIRED');
  const claim = claims[0];
  const detail = await decryptLookup(claim.ciphertext, 'service-order/' + claim.order_id);
  if (!detail || detail.kind !== claim.kind || normalizePortalLookup(detail.kind, detail.value) !== detail.value
    || await initialHash(claim.order_id + '/' + detail.kind + '/' + detail.value) !== claim.value_sha256) throw new Error('VERIFICATION_EVIDENCE_MISMATCH');
  const saved = await db.rpc('attach_service_order_portal_lookup', {
    p_order: claim.order_id, p_id: ticket.id, p_claim_hash: claim.value_sha256,
    p_cipher: await encryptLookup(detail, String(ticket.id)),
    p_hash: await initialHash(normalizeTicket(ticket.ticket_number) + '/' + detail.kind + '/' + detail.value),
    p_source: ticket.ticket_document_path, p_source_hash: sourceHash,
  });
  if (saved.error) throw new Error('ORDER_LOOKUP_CASE_BINDING_REJECTED');
}
