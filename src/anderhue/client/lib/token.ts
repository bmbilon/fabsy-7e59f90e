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
  const remembered = Boolean(readItem('local', PORTAL_TOKEN_KEY));
  writeItem('session', PORTAL_TOKEN_KEY, token);
  if (remembered) writeItem('local', PORTAL_TOKEN_KEY, token);
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
