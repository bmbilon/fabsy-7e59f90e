import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Isolated temporary PostgreSQL. Never connects to Supabase or production.
const bin = process.env.DISCLOSURE_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const dir = mkdtempSync(join(tmpdir(), 'fabsy-approval-pg-'));
const run = (cmd, args) => {
  const result = spawnSync(join(bin, cmd), args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${cmd} failed`);
  return result.stdout;
};
let started = false;
try {
  run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -h '' -p 55446`, '-w', 'start']);
  started = true;
  const args = ['-h', dir, '-p', '55446', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  for (const file of ['supabase/tests/disclosure-approval.fixture.sql', 'supabase/migrations/20260920150000_disclosure_remote_approval.sql', 'supabase/tests/disclosure-approval.test.sql']) {
    run('psql', [...args, '-f', file]);
    console.log(`${file}: passed`);
  }
} finally {
  if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
