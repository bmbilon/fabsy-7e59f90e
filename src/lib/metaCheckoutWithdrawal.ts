const META_CHECKOUT_WITHDRAWAL_STORAGE_KEY = 'fabsy:meta-checkout-withdrawal:v1';
const MAX_HANDLES = 16;
const HANDLE_PATTERN = /^[0-9a-f]{64}$/;
let flushInFlight: Promise<boolean> | null = null;

interface StoredHandle {
  handle: string;
  savedAt: number;
}

interface StoredWithdrawalHandles {
  version: 1;
  entries: StoredHandle[];
}

interface PublicSupabaseEnvironment {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

function browserWindow(candidate?: Window): Window | undefined {
  return candidate || (typeof window === 'undefined' ? undefined : window);
}

function readHandles(win: Window): StoredHandle[] {
  try {
    const raw = win.localStorage.getItem(META_CHECKOUT_WITHDRAWAL_STORAGE_KEY);
    if (!raw || raw.length > 4096) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const record = parsed as Partial<StoredWithdrawalHandles>;
    if (record.version !== 1 || !Array.isArray(record.entries) || record.entries.length > MAX_HANDLES) return [];
    const unique = new Map<string, StoredHandle>();
    for (const entry of record.entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const value = entry as Partial<StoredHandle>;
      if (typeof value.handle !== 'string' || !HANDLE_PATTERN.test(value.handle) ||
          typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)) continue;
      unique.set(value.handle, { handle: value.handle, savedAt: value.savedAt });
    }
    return Array.from(unique.values());
  } catch {
    return [];
  }
}

function writeHandles(win: Window, entries: StoredHandle[]): boolean {
  try {
    if (!entries.length) {
      win.localStorage.removeItem(META_CHECKOUT_WITHDRAWAL_STORAGE_KEY);
      return win.localStorage.getItem(META_CHECKOUT_WITHDRAWAL_STORAGE_KEY) === null;
    }
    const value = JSON.stringify({ version: 1, entries } satisfies StoredWithdrawalHandles);
    win.localStorage.setItem(META_CHECKOUT_WITHDRAWAL_STORAGE_KEY, value);
    return win.localStorage.getItem(META_CHECKOUT_WITHDRAWAL_STORAGE_KEY) === value;
  } catch {
    return false;
  }
}

/** Retain only the opaque revocation capability, never the raw Stripe session. */
export function rememberMetaCheckoutAttributionHandle(handle: unknown, candidate?: Window): boolean {
  const win = browserWindow(candidate);
  if (!win || typeof handle !== 'string' || !HANDLE_PATTERN.test(handle)) return false;
  const stored = readHandles(win);
  const existing = stored.find(entry => entry.handle === handle);
  if (existing) return true;
  // Never evict an unacknowledged revocation capability. PaymentStep treats a
  // full store as a failure to retain the new handle and withdraws it directly.
  if (stored.length >= MAX_HANDLES) return false;
  const entries = stored.slice();
  entries.push({ handle, savedAt: Date.now() });
  return writeHandles(win, entries);
}

function endpointConfiguration(): { url: string; publishableKey: string } | null {
  const env = import.meta.env as PublicSupabaseEnvironment;
  const base = (env.VITE_SUPABASE_URL || 'https://gcasbisxfrssonllpqrw.supabase.co').replace(/\/$/, '');
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_KEo-G1wij9RC_IDDzblisw_VISRvwrX';
  try {
    const url = new URL(`${base}/functions/v1/withdraw-meta-measurement`);
    if (url.protocol !== 'https:' || url.username || url.password || !publishableKey || /\s/.test(publishableKey)) return null;
    return { url: url.href, publishableKey };
  } catch {
    return null;
  }
}

async function sendWithdrawal(handles: string[], win: Window): Promise<boolean> {
  const config = endpointConfiguration();
  if (!config || handles.length < 1 || handles.length > MAX_HANDLES ||
      handles.some(handle => !HANDLE_PATTERN.test(handle))) return false;
  try {
    const response = await win.fetch(config.url, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ handles }),
      cache: 'no-store',
      credentials: 'omit',
      keepalive: true,
      referrerPolicy: 'no-referrer',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function withdrawMetaCheckoutAttributionHandles(
  handles: unknown,
  candidate?: Window,
): Promise<boolean> {
  const win = browserWindow(candidate);
  if (!win || !Array.isArray(handles) || handles.some(handle => typeof handle !== 'string')) return false;
  return sendWithdrawal(handles as string[], win);
}

async function performFlush(candidate?: Window): Promise<boolean> {
  const win = browserWindow(candidate);
  if (!win) return true;
  const entries = readHandles(win);
  if (!entries.length) {
    writeHandles(win, []);
    return true;
  }
  const handles = entries.map(entry => entry.handle);
  if (!await withdrawMetaCheckoutAttributionHandles(handles, win)) return false;
  const sent = new Set(handles);
  return writeHandles(win, readHandles(win).filter(entry => !sent.has(entry.handle)));
}

/** Retry-safe withdrawal used on explicit refusal, expiry, and cross-tab changes. */
export function flushMetaCheckoutAttributionWithdrawals(candidate?: Window): Promise<boolean> {
  if (flushInFlight) return flushInFlight;
  const operation = performFlush(candidate).finally(() => {
    if (flushInFlight === operation) flushInFlight = null;
  });
  flushInFlight = operation;
  return operation;
}

export function requestMetaCheckoutAttributionWithdrawal(candidate?: Window): void {
  void flushMetaCheckoutAttributionWithdrawals(candidate);
}

export const META_CHECKOUT_WITHDRAWAL_MAX_HANDLES = MAX_HANDLES;
