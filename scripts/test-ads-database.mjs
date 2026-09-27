import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Dedicated temporary Postgres cluster; never points at Supabase or production.
const bin = process.env.ADS_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const dir = mkdtempSync(join(tmpdir(), 'fabsy-ads-pg-'));
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
  for (const file of ['supabase/tests/ads-engine.fixture.sql', 'supabase/migrations/20260927160000_ads_launch_engine.sql', 'supabase/migrations/20260927183000_ads_intake_draft_measurement.sql', 'supabase/migrations/20260927184500_ads_qualification_source.sql', 'supabase/tests/ads-engine.test.sql']) {
    const output = run('psql', [...args, '-f', file]);
    console.log(`${file}: passed`);
    if (file.endsWith('.test.sql')) console.log(output.split('\n').filter(line => line.includes('tests passed')).join('\n'));
  }
} finally {
  if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
