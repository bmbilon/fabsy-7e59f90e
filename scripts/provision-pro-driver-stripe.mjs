#!/usr/bin/env node
// Default is a no-network plan. Never replaces/deletes coupons, creates public
// promotion codes, touches customers, charges cards or deploys configuration.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COUPON_ID = 'PRO20';
const IDEMPOTENCY_KEY = 'fabsy-pro-driver-coupon-pro20-v1';
const API_VERSION = '2025-08-27.basil';

class ProvisioningError extends Error {}
class StripeRequestError extends ProvisioningError {
  constructor(status, code) {
    super(`Stripe provisioning did not complete (HTTP ${status}). No existing coupon was replaced. Rerun this script to inspect the current coupon before attempting anything else.`);
    this.status = status;
    // Used only to distinguish a missing resource; never printed.
    this.code = code;
  }
}

export function validateProDriverCoupon(coupon, mode) {
  const appliesTo = coupon?.applies_to;
  const unrestricted = appliesTo == null || (
    typeof appliesTo === 'object' && !Array.isArray(appliesTo) &&
    Object.keys(appliesTo).every(key => key === 'products') &&
    (appliesTo.products == null || (Array.isArray(appliesTo.products) && appliesTo.products.length === 0))
  );
  if (!coupon || coupon.id !== COUPON_ID || coupon.deleted === true || coupon.valid !== true ||
    coupon.percent_off !== 20 || coupon.amount_off != null || coupon.duration !== 'once' ||
    coupon.duration_in_months != null || !unrestricted || coupon.max_redemptions != null ||
    coupon.redeem_by != null || coupon.livemode !== (mode === 'live')) {
    throw new ProvisioningError('Existing PRO20 differs from the approved 20% once-only coupon, has restrictions, is invalid, or belongs to the wrong mode. Stop for billing review; this script will not replace it.');
  }
  return coupon;
}

function parseOptions(args) {
  const options = { apply: false, dryRun: false, mode: null, expectedAccount: null };
  const seen = new Set();
  for (const arg of args) {
    const key = arg.split('=', 1)[0];
    if (seen.has(key)) throw new ProvisioningError('Duplicate command options are not allowed.');
    seen.add(key);
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--mode=')) options.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--expected-account=')) options.expectedAccount = arg.slice('--expected-account='.length);
    else throw new ProvisioningError('Unknown option. Use --dry-run, --mode=test|live, --expected-account=acct_… and, only when authorized, --apply.');
  }
  if (options.apply && options.dryRun) throw new ProvisioningError('Choose --dry-run or --apply, never both.');
  if (options.mode !== null && !['test', 'live'].includes(options.mode)) throw new ProvisioningError('Mode must be test or live.');
  if (options.expectedAccount !== null && !/^acct_[A-Za-z0-9]+$/.test(options.expectedAccount)) throw new ProvisioningError('The expected Stripe account must be an acct_ identifier copied from the intended account.');
  return options;
}

async function run() {
  const options = parseOptions(process.argv.slice(2));
  if (!options.apply) {
    console.log(JSON.stringify({
      mode: 'plan-only; no network requests',
      stripe_mode: options.mode || 'not selected',
      coupon: { id: COUPON_ID, percent_off: 20, duration: 'once', amount_off: null, applies_to: null, max_redemptions: null, redeem_by: null },
      eligibility: 'Server-verified Alberta Class 1, 2 or 4; officer Rapid Resolution and bundle only. No photo radar, public promotion code or stacking.',
      account_verification: 'Apply requires --expected-account=acct_… and verifies GET /v1/account before reading or creating a coupon.',
      existing_coupon: 'Validate and reuse only an exact match; never delete, replace or update it.',
      idempotency_key: IDEMPOTENCY_KEY,
      required_secret: 'STRIPE_SECRET_KEY in the environment, with a key matching the selected account and test/live mode.',
      apply: 'node scripts/provision-pro-driver-stripe.mjs --apply --mode=test --expected-account=acct_REPLACE_WITH_VERIFIED_ID',
      live: 'Use --mode=live only after approval and after checking the live Stripe account and matching Supabase environment.',
    }, null, 2));
    return;
  }
  if (!options.mode || !options.expectedAccount) throw new ProvisioningError('Apply requires explicit --mode=test|live and --expected-account=acct_… .');
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !new RegExp(`^(sk|rk)_${options.mode}_`).test(secret)) {
    throw new ProvisioningError('Provide STRIPE_SECRET_KEY through the environment with a secret/restricted key matching the selected mode. Never put a key in command arguments.');
  }

  async function stripe(resource, fields) {
    let result;
    try {
      result = await fetch(`https://api.stripe.com/v1/${resource}`, {
        method: fields ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${secret}`,
          'Stripe-Version': API_VERSION,
          ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': IDEMPOTENCY_KEY } : {}),
        },
        ...(fields ? { body: new URLSearchParams(fields) } : {}),
      });
    } catch {
      throw new ProvisioningError('The Stripe request did not complete. No credentials were printed. Rerun to inspect the existing coupon before attempting anything else.');
    }
    let data;
    try { data = await result.json(); }
    catch { throw new ProvisioningError('Stripe returned an unreadable response. Stop and verify the account and coupon; no credentials were printed.'); }
    if (!result.ok) throw new StripeRequestError(result.status, data?.error?.code);
    return data;
  }

  const account = await stripe('account');
  if (account?.id !== options.expectedAccount) throw new ProvisioningError('The key belongs to a different Stripe account than --expected-account. No coupon was read or changed.');
  let coupon;
  try { coupon = await stripe(`coupons/${COUPON_ID}`); }
  catch (error) {
    if (!(error instanceof StripeRequestError) || error.status !== 404 || error.code !== 'resource_missing') throw error;
  }
  const existed = Boolean(coupon);
  if (existed) validateProDriverCoupon(coupon, options.mode);
  else coupon = await stripe('coupons', {
    id: COUPON_ID,
    name: 'Fabsy pro driver 20%',
    percent_off: '20',
    duration: 'once',
    'metadata[fabsy_program]': 'pro_drivers',
    'metadata[fabsy_pricing_version]': 'pro_drivers_2026_08',
  });
  validateProDriverCoupon(coupon, options.mode);
  console.log(JSON.stringify({
    provisioned: true, result: existed ? 'existing coupon verified' : 'coupon created and verified',
    mode: options.mode, account_id: options.expectedAccount, coupon_id: COUPON_ID, percent_off: 20, duration: 'once',
    next: 'Deploy the pro/referral migrations and Edge Functions in the matching environment, then verify a test checkout and signed webhook. No public promotion code, payment, customer, refund or deployment was created by this script.',
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => {
    console.error(error instanceof ProvisioningError ? error.message : 'Pro driver coupon provisioning did not complete. No credentials were printed.');
    process.exitCode = 1;
  });
}
