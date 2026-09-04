import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FABSY_PRODUCTION_SUPABASE_PROJECT_REF } from './browser-supabase-config-policy.mjs';

const script = fileURLToPath(new URL('./validate-browser-supabase-config.mjs', import.meta.url));
const expectedUrl = `https://${FABSY_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
const baseEnvironment = {
  PATH: process.env.PATH || '',
  HOME: process.env.HOME || '',
  VALIDATE_BROWSER_SUPABASE_SKIP_DOTENV: '1',
};

function jwt(role, ref = FABSY_PRODUCTION_SUPABASE_PROJECT_REF) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'supabase', ref, role })}.synthetic-signature`;
}

function invoke(extra = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...baseEnvironment, ...extra },
  });
}

let result = invoke();
assert.equal(result.status, 0);
assert.match(result.stdout, /inert non-deployment build permitted/);

result = invoke({ REQUIRE_BROWSER_SUPABASE_CONFIG: '1' });
assert.equal(result.status, 1);
assert.match(result.stderr, /required together/);

result = invoke({ VITE_SUPABASE_URL: expectedUrl });
assert.equal(result.status, 1);

result = invoke({
  VITE_SUPABASE_URL: 'http://gcasbisxfrssonllpqrw.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1234567890abcdef',
});
assert.equal(result.status, 1);

result = invoke({
  VITE_SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1234567890abcdef',
});
assert.equal(result.status, 1);

const secretMarker = 'sb_secret_NEVER_PRINT_THIS_VALUE_123456';
result = invoke({ VITE_SUPABASE_URL: expectedUrl, VITE_SUPABASE_PUBLISHABLE_KEY: secretMarker });
assert.equal(result.status, 1);
assert.doesNotMatch(`${result.stdout}${result.stderr}`, /NEVER_PRINT_THIS_VALUE/);
assert.match(result.stderr, /secret Supabase key/);

result = invoke({ VITE_SUPABASE_URL: expectedUrl, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') });
assert.equal(result.status, 1);

result = invoke({ VITE_SUPABASE_URL: expectedUrl, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon', 'aaaaaaaaaaaaaaaaaaaa') });
assert.equal(result.status, 1);

result = invoke({ VITE_SUPABASE_URL: expectedUrl, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') });
assert.equal(result.status, 0);
assert.match(result.stdout, new RegExp(FABSY_PRODUCTION_SUPABASE_PROJECT_REF));

result = invoke({
  REQUIRE_BROWSER_SUPABASE_CONFIG: '1',
  VITE_SUPABASE_URL: `${expectedUrl}/`,
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1234567890abcdef',
});
assert.equal(result.status, 0);

console.log('Browser Supabase deployment configuration tests passed (10 configured, inert and adversarial cases).');
