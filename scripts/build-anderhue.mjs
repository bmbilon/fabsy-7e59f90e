import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Builds the parent homepage at / and the public/client/staff paralegal site
// at /paralegal. Historic private URLs remain aliases in vercel.json.
const root = fileURLToPath(new URL('../', import.meta.url));
const site = new URL('../ontario/anderhue-paralegal-site/', import.meta.url);
const outDir = path.resolve(root, process.env.ANDERHUE_OUT_DIR || 'dist-anderhue');
const legalOutDir = path.join(outDir, 'paralegal');
const group = path.resolve(root, 'ontario/anderhue-group');
assert.ok(readFileSync(path.join(group, 'index.html'), 'utf8').includes('<html'), 'parent homepage must exist');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const config = JSON.parse(readFileSync(new URL('site-config.json', site), 'utf8'));
const key = config.supabaseAnonKey;
assert.ok(key, 'site-config.json must provide the public anon key');
const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
assert.equal(payload.role, 'anon');
assert.equal(payload.ref, 'gcasbisxfrssonllpqrw');
assert.equal(config.supabaseUrl, `https://${payload.ref}.supabase.co`);

const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.anderhue.config.ts'], {
  cwd: root, stdio: 'inherit',
  env: {
    ...process.env,
    VITE_SUPABASE_URL: config.supabaseUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: key,
    VITE_ANDERHUE_PRACTICE_ID: config.practiceId,
  },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

// App entries are emitted by Vite; documentation and config stay out of the deploy.
const skip = new Set(['client.html', 'portal.html', 'README.md', 'ARCHITECTURE.md', 'site-config.json', 'vercel.json', 'robots.txt', 'sitemap.xml']);
for (const file of readdirSync(site)) {
  const source = new URL(file, site);
  if (skip.has(file) || !statSync(source).isFile()) continue;
  copyFileSync(source, pathToFileURL(path.join(legalOutDir, file)));
}

// Parent files are independent of the paralegal styling and assets.
cpSync(group, outDir, { recursive: true });
for (const file of ['robots.txt', 'sitemap.xml']) copyFileSync(new URL(file, site), path.join(outDir, file));
// Existing emails reference these root URLs. Keep them stable while new pages
// use /paralegal assets, avoiding any need to reissue signed client emails.
for (const file of readdirSync(site).filter(file => /\.(png|webp|ico)$/.test(file))) {
  copyFileSync(new URL(file, site), path.join(outDir, file));
}

// This folder is already built. Override inherited Vercel build/install
// detection so deployment does not try to run npm without package.json.
const deploymentConfig = JSON.parse(readFileSync(new URL('vercel.json', site), 'utf8'));
writeFileSync(path.join(outDir, 'vercel.json'), JSON.stringify({
  ...deploymentConfig, framework: null, buildCommand: '', installCommand: '', outputDirectory: '.',
}, null, 2) + '\n');
