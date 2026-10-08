import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { serviceOrderLookup, importServiceOrderLookup } from './service-order-lookup.ts';
import { initialHash, encryptLookup, decryptLookup } from './portal-lookup-crypto.ts';
const assert = (ok: boolean) => { if (!ok) throw new Error('Assertion failed'); };
const rejects = async (run: () => Promise<unknown>, code?: string) => {
  try { await run(); } catch (error) { if (code) assert(error instanceof Error && error.message === code); return; }
  throw new Error('Expected rejection');
};
const id = '20000000-0000-4000-8000-000000000001', token = 'a'.repeat(64);
function database(order: unknown = null, claim: unknown = null) {
  const writes: { name: string; args: Record<string, unknown> }[] = [];
  return { writes, db: {
    from(name: string) {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: name === 'service_orders' ? order : claim, error: null }) };
      return query;
    },
    rpc(name: string, args: Record<string, unknown>) { writes.push({ name, args }); return Promise.resolve({ data: null, error: null }); },
  } as unknown as SupabaseClient };
}
Deno.env.set('PORTAL_RUNNER_SECRET', 'isolated-synthetic-lookup-test-secret');

Deno.test('all three order identifiers are validated and encrypted before a checkout order exists', async () => {
  for (const [kind, raw, value] of [['plate', 'abc-1234', 'ABC1234'], ['drivers_license', '123456-789', '123456789'], ['date_of_birth', '1990-02-28', '1990-02-28']]) {
    const { db, writes } = database();
    assert((await serviceOrderLookup(db, { action: 'order-lookup-save', orderId: id, accessToken: token, product: 'rapid_resolution', kind, value: raw, verified: true })).saved);
    assert(writes.length === 1 && writes[0].name === 'record_service_order_portal_lookup');
    assert(writes[0].args.p_access_hash === await initialHash(token));
    assert(writes[0].args.p_hash === await initialHash(id + '/' + kind + '/' + value));
    const cipher = writes[0].args.p_cipher as { version: number; iv: string; value: string };
    assert(!JSON.stringify(cipher).includes(value));
    assert((await decryptLookup(cipher, 'service-order/' + id)).value === value);
    await rejects(() => decryptLookup(cipher, 'another-order'));
  }
});
Deno.test('missing, placeholder, future and unconfirmed values cannot create lookup evidence', async () => {
  const { db, writes } = database();
  const base = { action: 'order-lookup-save', orderId: id, accessToken: token, product: 'rapid_resolution', verified: true };
  for (const [kind, value] of [['plate', ''], ['plate', 'N/A'], ['drivers_license', 'PHOTO-INTAKE-123456'], ['drivers_license', 'Not supplied'], ['date_of_birth', '1990-02-30'], ['date_of_birth', '2099-01-01']]) await rejects(() => serviceOrderLookup(db, { ...base, kind, value }), 'VERIFICATION_DETAIL_INVALID');
  await rejects(() => serviceOrderLookup(db, { ...base, kind: 'plate', value: 'ABC1234', verified: false }), 'LOOKUP_CONFIRMATION_REQUIRED');
  assert(writes.length === 0);
});
Deno.test('a private order status reveals only whether a lookup has been saved', async () => {
  const hash = await initialHash(token);
  const { db, writes } = database({ id, product: 'rapid_resolution', access_token_hash: hash }, { access_token_hash: hash });
  const result = await serviceOrderLookup(db, { action: 'order-lookup-status', orderId: id, accessToken: token });
  assert(JSON.stringify(result) === '{"saved":true}'); assert(writes.length === 0);
  await rejects(() => serviceOrderLookup(db, { action: 'order-lookup-status', orderId: id, accessToken: 'b'.repeat(64) }), 'PRIVATE_ORDER_ACCESS_REQUIRED');
  await rejects(() => serviceOrderLookup(db, { action: 'order-lookup-save', orderId: id, accessToken: 'bad' }), 'PRIVATE_ORDER_ACCESS_REQUIRED');
});
Deno.test('existing immutable order facts determine product and ticket rather than caller fields', async () => {
  const { db, writes } = database({ id, product: 'rapid_resolution', ticket_number: 'T12345678Z', access_token_hash: await initialHash(token) });
  await serviceOrderLookup(db, { action: 'order-lookup-save', orderId: id, accessToken: token, product: 'photo_radar', ticketNumber: 'T99999999Z', kind: 'plate', value: 'ABC1234', verified: true });
  assert(writes[0].args.p_product === 'rapid_resolution' && writes[0].args.p_ticket === 'T12345678Z');
});
Deno.test('the agent verifies the frozen order hash and re-encrypts for the exact source case', async () => {
  const detail = { kind: 'plate', value: 'ABC1234' }, hash = await initialHash(id + '/plate/ABC1234');
  const claim = { order_id: id, kind: 'plate', ciphertext: await encryptLookup(detail, 'service-order/' + id), value_sha256: hash };
  const ticket = { id: '10000000-0000-4000-8000-000000000001', ticket_number: 'T12345678Z', ticket_document_path: 'synthetic/source.jpg' };
  let rows = [claim]; let attached: Record<string, unknown> | undefined;
  const db = { rpc(name: string, args: Record<string, unknown>) { if (name === 'service_order_lookup_for_case') return Promise.resolve({ data: rows, error: null }); attached = args; return Promise.resolve({ data: 'synthetic-record', error: null }); } } as unknown as SupabaseClient;
  await importServiceOrderLookup(db, ticket, 'c'.repeat(64));
  assert(attached?.p_order === id && attached?.p_id === ticket.id && attached?.p_claim_hash === hash);
  assert(attached?.p_source === ticket.ticket_document_path && attached?.p_source_hash === 'c'.repeat(64));
  assert((await decryptLookup(attached?.p_cipher as { version: number; iv: string; value: string }, ticket.id)).value === 'ABC1234');
  rows = [{ ...claim, value_sha256: 'b'.repeat(64) }]; await rejects(() => importServiceOrderLookup(db, ticket, 'c'.repeat(64)), 'VERIFICATION_EVIDENCE_MISMATCH');
  rows = [claim, claim]; await importServiceOrderLookup(db, ticket, 'c'.repeat(64));
});

Deno.test('separate consent and payment orders may supply consistent details for one exact case', async () => {
  const second = '20000000-0000-4000-8000-000000000002';
  async function claim(order: string, kind: string, value: string) {
    return { order_id: order, kind, ciphertext: await encryptLookup({ kind, value }, 'service-order/' + order), value_sha256: await initialHash(order + '/' + kind + '/' + value) };
  }
  let rows = [await claim(second, 'plate', 'ABC1234'), await claim(id, 'plate', 'ABC1234')];
  let selected: unknown;
  const db = { rpc(name: string, args: Record<string, unknown>) { if (name === 'service_order_lookup_for_case') return Promise.resolve({ data: rows, error: null }); selected = args.p_order; return Promise.resolve({ data: 'synthetic-record', error: null }); } } as unknown as SupabaseClient;
  const ticket = { id: '10000000-0000-4000-8000-000000000001', ticket_number: 'T12345678Z', ticket_document_path: 'synthetic/source.jpg' };
  await importServiceOrderLookup(db, ticket, 'c'.repeat(64));assert(selected === id);
  rows = [await claim(second, 'date_of_birth', '1990-02-28'), await claim(id, 'plate', 'ABC1234')];
  await importServiceOrderLookup(db, ticket, 'c'.repeat(64));assert(selected === id);
  rows = [await claim(second, 'plate', 'XYZ5678'), await claim(id, 'plate', 'ABC1234')];
  await rejects(() => importServiceOrderLookup(db, ticket, 'c'.repeat(64)), 'VERIFICATION_DETAILS_CONFLICT');
});
