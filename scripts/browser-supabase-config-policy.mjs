export const FABSY_PRODUCTION_SUPABASE_PROJECT_REF = 'gcasbisxfrssonllpqrw';

function decodeJsonSegment(segment) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function validateBrowserSupabaseConfig(environment = process.env) {
  const required = environment.REQUIRE_BROWSER_SUPABASE_CONFIG === '1';
  const rawUrl = environment.VITE_SUPABASE_URL?.trim() || '';
  const key = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';

  if (!rawUrl && !key && !required) return { mode: 'inert' };
  if (!rawUrl || !key) throw new Error('both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required together');

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('VITE_SUPABASE_URL is not a valid URL');
  }
  const expectedHost = `${FABSY_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
  if (url.protocol !== 'https:' || url.hostname !== expectedHost || url.username || url.password ||
      (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error(`VITE_SUPABASE_URL must be the expected Fabsy production project (${expectedHost})`);
  }
  if (/\s/.test(key)) throw new Error('browser Supabase key contains whitespace');
  if (/^sb_secret_/i.test(key)) throw new Error('a secret Supabase key cannot be embedded in a browser build');
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) return { mode: 'configured', projectRef: FABSY_PRODUCTION_SUPABASE_PROJECT_REF };

  const segments = key.split('.');
  const header = segments.length === 3 ? decodeJsonSegment(segments[0]) : null;
  const payload = segments.length === 3 ? decodeJsonSegment(segments[1]) : null;
  if (!header || !payload || header.alg !== 'HS256' || payload.role !== 'anon' ||
      (payload.ref !== undefined && payload.ref !== FABSY_PRODUCTION_SUPABASE_PROJECT_REF)) {
    throw new Error('browser Supabase key must be a publishable key or a legacy anon JWT for the expected project');
  }
  return { mode: 'configured', projectRef: FABSY_PRODUCTION_SUPABASE_PROJECT_REF };
}
