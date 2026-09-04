#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const evidenceEnvDir = path.join(root, 'scripts', 'paid-acquisition-evidence-env');
const unexpectedEnvFiles = fs.readdirSync(evidenceEnvDir)
  .filter(name => name.startsWith('.env'));
if (unexpectedEnvFiles.length > 0) {
  throw new Error(`Evidence build refuses environment files in ${evidenceEnvDir}: ${unexpectedEnvFiles.join(', ')}`);
}
// These values are deliberately synthetic and committed as part of the build
// contract. They let the landing page render without inheriting local or
// production credentials, while every provider and first-party emitter stays
// disabled. The child receives no ambient build switches (for example
// BROWSERSLIST, NODE_OPTIONS or CI); PATH is retained only so build subprocesses
// can resolve normal system tools. No request made by this evidence build is
// production evidence.
const evidenceEnvironment = {
  PATH: process.env.PATH || '/usr/bin:/bin',
  LANG: 'C',
  LC_ALL: 'C',
  NODE_ENV: 'production',
  SOURCE_DATE_EPOCH: '1788530400',
  TZ: 'UTC',
  VITE_FABSY_FUNNEL_MEASUREMENT_ENABLED: 'false',
  VITE_GOOGLE_MEASUREMENT_ENABLED: 'false',
  VITE_META_MEASUREMENT_ENABLED: 'false',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_paid_acquisition_evidence_only',
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
};

execFileSync(process.execPath, [
  viteCli,
  'build',
  '--mode',
  'paid-acquisition-evidence',
], {
  cwd: root,
  env: evidenceEnvironment,
  stdio: 'inherit',
});
