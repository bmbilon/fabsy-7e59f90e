import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const configuredPublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const EXPECTED_SUPABASE_PROJECT_REF = 'gcasbisxfrssonllpqrw';
const EXPECTED_SUPABASE_HOST = `${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;

function expectedBrowserUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === EXPECTED_SUPABASE_HOST &&
      !url.username && !url.password && (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function legacyAnonJwt(value: string): boolean {
  const segments = value.split('.');
  if (segments.length !== 3 || typeof atob !== 'function') return false;
  try {
    const decode = (segment: string) => {
      const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as Record<string, unknown>;
    };
    const header = decode(segments[0]);
    const payload = decode(segments[1]);
    return header.alg === 'HS256' && payload.role === 'anon' &&
      (payload.ref === undefined || payload.ref === EXPECTED_SUPABASE_PROJECT_REF);
  } catch {
    return false;
  }
}

function browserPublishableKey(value: string | undefined): boolean {
  if (!value || /\s/.test(value) || /^sb_secret_/i.test(value)) return false;
  return /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(value) || legacyAnonJwt(value);
}

const hasExplicitBrowserConfiguration = expectedBrowserUrl(configuredUrl) && browserPublishableKey(configuredPublishableKey);

export const supabaseBrowserConfigurationError = hasExplicitBrowserConfiguration
  ? null
  : 'Fabsy data services are unavailable because the browser Supabase configuration is missing.';

if (supabaseBrowserConfigurationError) console.error(supabaseBrowserConfigurationError);

// createClient is retained at import time for existing app/test imports, but a
// missing build configuration resolves only to the reserved .invalid domain.
// It can never silently send browser data to the production project.
const SUPABASE_URL = hasExplicitBrowserConfiguration
  ? configuredUrl!.replace(/\/$/, '')
  : 'https://supabase-configuration-missing.invalid';
const SUPABASE_PUBLISHABLE_KEY = hasExplicitBrowserConfiguration
  ? configuredPublishableKey!
  : 'configuration-missing';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
});
