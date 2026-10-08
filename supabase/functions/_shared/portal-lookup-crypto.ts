export const initialHash = async (value: string | Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value as BufferSource))).map(b => b.toString(16).padStart(2, '0')).join('');
const base64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
const fromBase64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function cipherKey() {
  const secret = Deno.env.get('PORTAL_RUNNER_SECRET');
  if (!secret) throw new Error('RUNNER_SECRET_REQUIRED');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode('initial-disclosure-verification/v1/' + secret)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function encryptLookup(value: unknown, id: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) }, await cipherKey(), new TextEncoder().encode(JSON.stringify(value)));
  return { version: 2, iv: base64(iv), value: base64(new Uint8Array(encrypted)) };
}
export async function decryptLookup(value: { version?: number; iv: string; value: string }, id: string) {
  const plain = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(value.iv), additionalData: new TextEncoder().encode(id) }, await cipherKey(), fromBase64(value.value)));
  return value.version === 2 ? JSON.parse(plain) : [{ kind: 'plate', value: plain, provenance: 'source_ticket' }];
}
