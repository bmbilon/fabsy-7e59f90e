import assert from 'node:assert/strict';
import { copyFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = new URL('../ontario/anderhue-paralegal-site/', import.meta.url);
// Reuse the public browser credential already shipped with the intake form.
const key = readFileSync(new URL('index.html', site), 'utf8').match(/data-key="([^"]+)"/)?.[1];
assert.ok(key, 'The published intake form must provide its public anon key');
const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
assert.equal(payload.role, 'anon');
assert.equal(payload.ref, 'gcasbisxfrssonllpqrw');
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.anderhue.config.ts'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: 'https://gcasbisxfrssonllpqrw.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
for (const file of ['index.html', 'vercel.json']) {
  copyFileSync(new URL(file, site), new URL(`../dist-anderhue/${file}`, import.meta.url));
}
