import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';

// Isolated local PostgreSQL only; never connects to a configured Supabase project.
const bin = process.env.CONSENT_WELCOME_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const dir = mkdtempSync(join(tmpdir(), 'fabsy-consent-welcome-pg-'));
const run = (cmd, args) => {
  const result = spawnSync(join(bin, cmd), args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${cmd} failed`);
  return result.stdout;
};
let started = false;
try {
  run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -h '' -p 55443`, '-w', 'start']);
  started = true;
  const args = ['-h', dir, '-p', '55443', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  for (const file of ['supabase/tests/consent-welcome.fixture.sql', 'supabase/migrations/20260903193000_ticket_submission_notification_idempotency.sql', 'supabase/migrations/20260921020000_consent_welcome_notifications.sql', 'supabase/tests/consent-welcome.test.sql']) {
    run('psql', [...args, '-f', file]);
    console.log(`${file}: passed`);
  }
  const concurrentClaim = () => new Promise((resolve, reject) => {
    const child = spawn(join(bin, 'psql'), [...args, '-qAt', '-c', `begin; set local request.jwt.claim.role='service_role';
      select id from claim_consent_welcome_notifications(1); select pg_sleep(0.3); commit;`]);
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(output.trim().split('\n').filter(Boolean)) : reject(new Error(error)));
  });
  const claims = (await Promise.all([concurrentClaim(), concurrentClaim()])).flat();
  assert.equal(claims.length, 1, 'concurrent workers must claim each consent once');
  console.log('Concurrent consent welcome claims: passed');
} finally {
  if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
