#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateProDriverCoupon } from './provision-pro-driver-stripe.mjs';

const good = { id: 'PRO20', percent_off: 20, amount_off: null, duration: 'once', valid: true, livemode: false };
assert.equal(validateProDriverCoupon(good, 'test'), good);
validateProDriverCoupon({ ...good, applies_to: { products: [] } }, 'test');
validateProDriverCoupon({ ...good, livemode: true }, 'live');
for (const changed of [
  { id: 'OTHER' }, { percent_off: 25 }, { percent_off: '20' }, { amount_off: 2000 },
  { duration: 'repeating' }, { duration: 'forever' }, { duration_in_months: 2 },
  { applies_to: { products: ['prod_fixture'] } }, { applies_to: { products: 'invalid' } },
  { applies_to: ['prod_fixture'] }, { applies_to: { unknown_restriction: true } },
  { max_redemptions: 10 }, { redeem_by: 1 }, { valid: false }, { deleted: true }, { livemode: true },
]) assert.throws(() => validateProDriverCoupon({ ...good, ...changed }, 'test'), /Stop for billing review/);

// Only dry-run CLI paths are exercised. A preload makes accidental networking
// fatal even if a future change tries to fetch before the dry-run return.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-pro-provision-tests-'));
try {
  const noNetwork = path.join(temporary, 'no-network.cjs');
  await fs.writeFile(noNetwork, "globalThis.fetch = () => { throw new Error('NETWORK_FORBIDDEN_IN_DRY_RUN'); };\n");
  const script = fileURLToPath(new URL('./provision-pro-driver-stripe.mjs', import.meta.url));
  const secretFixture = 'sk_live_DO_NOT_PRINT_LOCAL_FIXTURE';
  for (const args of [[], ['--dry-run'], ['--dry-run', '--mode=test'], ['--mode=live', '--expected-account=acct_TestFixture']]) {
    const result = spawnSync(process.execPath, ['--require', noNetwork, script, ...args], {
      env: { PATH: process.env.PATH, STRIPE_SECRET_KEY: secretFixture }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes(secretFixture), 'Dry-run output must never contain environment secrets');
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.mode, 'plan-only; no network requests');
    assert.deepEqual(plan.coupon, { id: 'PRO20', percent_off: 20, duration: 'once', amount_off: null, applies_to: null, max_redemptions: null, redeem_by: null });
    assert.ok(plan.account_verification.includes('--expected-account'));
  }
  console.log('PRO20 provisioning dry runs and coupon constraints passed. Apply mode was not invoked; no network or live account was used.');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
