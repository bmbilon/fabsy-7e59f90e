import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const bin = process.env.SMS_INTAKE_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const dir = mkdtempSync(join(tmpdir(), 'fabsy-sms-intake-test-'));
const run = (cmd, args) => {
  const result = spawnSync(join(bin, cmd), args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${cmd} failed`);
  return result.stdout;
};
const runConcurrent = (args) => new Promise((resolve, reject) => {
  const child = spawn(join(bin, 'psql'), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve() : reject(new Error(output)));
});
let started = false;
try {
  run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'),
    '-o', `-k ${dir} -h '' -p 55449`, '-w', 'start']);
  started = true;
  const source = readFileSync('supabase/migrations/20260918220000_sms_vapi_bridge.sql', 'utf8');
  const extension = 'create extension if not exists pg_cron with schema pg_catalog;';
  if (source.split(extension).length !== 2) throw new Error('Expected exact pg_cron declaration');
  writeFileSync(join(dir, 'base.sql'), source.replace(extension, '-- pg_cron local fixture'));
  const args = ['-h', dir, '-p', '55449', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  for (const file of ['supabase/tests/sms-intake.fixture.sql', join(dir, 'base.sql'),
    'supabase/tests/sms-intake-existing.fixture.sql',
    'supabase/migrations/20260918221000_sms_intake_inquiries.sql',
    'supabase/tests/sms-intake.test.sql']) {
    run('psql', [...args, '-f', file]);
    console.log(`${file === join(dir, 'base.sql') ? 'SMS base migration and transactional assertions' : file}: passed`);
  }
  // Independent connections race the same sender. The sender row lock must
  // keep grouping/outbox insertion atomic even before the first inquiry exists.
  const inbound = (number, hash) => `select public.claim_sms_intake_inbound(
    'SM'||lpad(to_hex(${number}),32,'0'),repeat('${hash}',64),8,0,
    '00000000-0000-4000-8000-000000000010',null,'+14035550101','+14035550102','Question');`;
  await Promise.all([
    runConcurrent([...args, '-c', `begin; ${inbound(901, 'd')} select pg_sleep(0.2); commit;`]),
    runConcurrent([...args, '-c', `begin; ${inbound(902, 'd')} select pg_sleep(0.2); commit;`]),
  ]);
  await Promise.all([
    runConcurrent([...args, '-c', `begin; ${inbound(903, 'e')} select pg_sleep(0.2); commit;`]),
    runConcurrent([...args, '-c', `begin; ${inbound(903, 'e')} select pg_sleep(0.2); commit;`]),
  ]);
  run('psql', [...args, '-c', `do $$ begin
    if (select count(*) from public.sms_intake_inquiries)<>2
      or (select count(*) from public.sms_intake_email_notifications)<>2
      or (select count(*) from public.sms_intake_messages)<>3 then
      raise exception 'Concurrent claims duplicated inquiry, message or notification';
    end if;
  end $$;`]);
  console.log('Concurrent first-sender claims and duplicate provider deliveries: passed');
} finally {
  if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
