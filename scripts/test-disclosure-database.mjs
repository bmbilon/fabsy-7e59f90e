import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';

// Dedicated temporary Postgres cluster; never points at Supabase or production.
const bin = process.env.DISCLOSURE_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const dir = mkdtempSync(join(tmpdir(), 'fabsy-disclosure-pg-'));
const run = (cmd, args) => {
  const result = spawnSync(join(bin, cmd), args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${cmd} failed`);
  return result.stdout;
};
let started = false;
try {
  run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -h '' -p 55439`, '-w', 'start']);
  started = true;
  const args = ['-h', dir, '-p', '55439', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  for (const file of [
    'supabase/tests/disclosure-confirmations.fixture.sql',
    'supabase/migrations/20260909150000_disclosure_confirmations.sql',
    'supabase/tests/disclosure-confirmations.test.sql',
    'supabase/tests/disclosure-request-receipts.fixture.sql',
    'supabase/migrations/20260920150000_disclosure_remote_approval.sql',
    'supabase/migrations/20260920210000_admin_ticket_case_status.sql',
    'supabase/migrations/20260920213000_disclosure_case_status_guard.sql',
    'supabase/migrations/20260920220000_admin_ticket_lapsed_status.sql',
    'supabase/migrations/20260920233000_disclosure_request_receipts.sql',
    'supabase/tests/disclosure-request-receipts.test.sql',
  ]) {
    const output = run('psql', [...args, '-f', file]);
    console.log(`${file}: passed`);
    if (file.endsWith('.test.sql')) console.log(output.split('\n').filter(line => line.includes('tests passed')).join('\n'));
  }
  const concurrentClaim = () => new Promise((resolve, reject) => {
    const sql = `begin; set local request.jwt.claim.role='service_role';
      select id::text from public.claim_disclosure_notices(5)
        where submission_id='70000000-0000-4000-8000-000000000034';
      select pg_sleep(0.3); commit;`;
    const child = spawn(join(bin, 'psql'), [...args, '-qAt', '-c', sql]);
    let output = ''; let error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim().split('\n').filter(Boolean)) : reject(new Error(error)));
  });
  const claims = (await Promise.all([concurrentClaim(), concurrentClaim()])).flat();
  assert.equal(claims.length, 1, 'concurrent workers must claim exactly one legacy case notice');
  const remaining = run('psql', [...args, '-qAt', '-c', `select count(*) from public.disclosure_notification_outbox
    where submission_id='70000000-0000-4000-8000-000000000034' and status='needs_review' and attempts=0;`]).trim();
  assert.equal(remaining, '1', 'the concurrent duplicate must remain unattempted and held');
  console.log('Concurrent disclosure notice claims: passed');
} finally {
  if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
