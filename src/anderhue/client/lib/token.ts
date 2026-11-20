import { readItem, removeItem, writeItem } from './storage';

/**
 * Portal token handling (ARCHITECTURE.md 5.2). Links arrive as /files#t=TOKEN.
 * The token moves into sessionStorage, and into localStorage only when the
 * client ticks "Remember this device". The hash is stripped right away so the
 * token does not linger in the address bar or browser history.
 */
export const PORTAL_TOKEN_KEY = 'anderhue.portal.v1';

const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{16,2048}$/;

export function isPlausibleToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/** The client id segment of `ahp1.{clientId}.{iat}.{exp}.{sig}`; empty when the token has another shape. */
export function tokenClientId(token: string | null | undefined): string {
  if (typeof token !== 'string') return '';
  const [prefix, clientId] = token.split('.');
  return prefix === 'ahp1' && clientId ? clientId : '';
}

/**
 * Stores a newly opened link. It always goes to sessionStorage. A link
 * remembered on this device is replaced only when both belong to the same
 * client; a link for someone else removes the remembered one (never
 * overwrites it), so "Remember this device" starts unchecked for them.
 */
export function storeIncomingToken(token: string): void {
  const remembered = readItem('local', PORTAL_TOKEN_KEY);
  if (remembered) {
    const sameClient = tokenClientId(remembered) !== '' && tokenClientId(remembered) === tokenClientId(token);
    if (sameClient) writeItem('local', PORTAL_TOKEN_KEY, token);
    else removeItem('local', PORTAL_TOKEN_KEY);
  }
  writeItem('session', PORTAL_TOKEN_KEY, token);
}

/** Reads #t=... once at startup, stores it and removes it from the URL. */
export function captureTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const { hash, pathname, search } = window.location;
  if (!hash || hash.length < 3) return null;
  const params = new URLSearchParams(hash.slice(1));
  const raw = params.get('t');
  if (raw === null) return null;
  params.delete('t');
  const rest = params.toString();
  try {
    window.history.replaceState(window.history.state, '', `${pathname}${search}${rest ? `#${rest}` : ''}`);
  } catch {
    /* history unavailable; the token still works */
  }
  const token = raw.trim();
  if (!isPlausibleToken(token)) return null;
  storeIncomingToken(token);
  return token;
}

export function loadStoredToken(): { token: string | null; remembered: boolean } {
  const session = readItem('session', PORTAL_TOKEN_KEY);
  const local = readItem('local', PORTAL_TOKEN_KEY);
  if (isPlausibleToken(session)) return { token: session, remembered: local === session };
  if (isPlausibleToken(local)) {
    writeItem('session', PORTAL_TOKEN_KEY, local);
    return { token: local, remembered: true };
  }
  return { token: null, remembered: false };
}

export function rememberToken(token: string, remember: boolean): void {
  if (remember) writeItem('local', PORTAL_TOKEN_KEY, token);
  else removeItem('local', PORTAL_TOKEN_KEY);
}

export function clearStoredToken(): void {
  removeItem('session', PORTAL_TOKEN_KEY);
  removeItem('local', PORTAL_TOKEN_KEY);
}
