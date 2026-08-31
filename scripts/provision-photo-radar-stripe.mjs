#!/usr/bin/env node
// Default is a no-network plan. Mutation requires an explicit mode and --apply.
// Never writes secrets, creates customers, charges cards, or changes old prices.
import fs from 'node:fs';

const offer = JSON.parse(fs.readFileSync(new URL('../src/config/offers.json', import.meta.url), 'utf8')).photoRadar;
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1];
const lookupKey = 'fabsy_photo_radar_cad_79_v1';
const taxKey = 'fabsy_alberta_gst_5_v1';
if (!apply) {
  console.log(JSON.stringify({ mode: 'plan-only; no network requests', product: offer.name, lookup_key: lookupKey,
    currency: 'cad', unit_amount: offer.priceCents, tax_behavior: 'exclusive', gst_percentage: 5,
    gst_cents: offer.gstCents, total_cents: offer.totalCents,
    required_secrets: ['STRIPE_SECRET_KEY', 'STRIPE_PHOTO_RADAR_PRICE_ID', 'STRIPE_GST_TAX_RATE_ID'],
    apply: 'node scripts/provision-photo-radar-stripe.mjs --apply --mode=test (or explicitly --mode=live after approval)' }, null, 2));
  process.exit(0);
}
if (!['test', 'live'].includes(mode)) throw new Error('Explicit --mode=test or --mode=live is required.');
const secret = process.env.STRIPE_SECRET_KEY;
if (!secret || !new RegExp(`^(sk|rk)_${mode}_`).test(secret)) throw new Error('Provide a Stripe secret/restricted key matching the selected mode through the environment.');

async function stripe(path, fields, idempotencyKey) {
  const result = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: fields ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${secret}`, 'Stripe-Version': '2025-08-27.basil',
      ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey } : {}) },
    ...(fields ? { body: new URLSearchParams(fields) } : {}),
  });
  const json = await result.json();
  if (!result.ok) throw new Error(`Stripe provisioning failed (${result.status}; ${json.error?.code || 'request_error'}). No secret was logged.`);
  return json;
}
async function find(path, predicate) {
  let cursor;
  do {
    const list = await stripe(`${path}?limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`);
    const found = list.data.find(predicate);
    if (found) return found;
    if (!list.has_more) return null;
    cursor = list.data.at(-1)?.id;
  } while (cursor);
  return null;
}

let product = await find('products', item => item.metadata?.fabsy_product === 'photo_radar');
if (product && (!product.active || product.name !== offer.name)) throw new Error('Existing Photo Radar product differs from the approved configuration. Review it instead of replacing it.');
product ||= await stripe('products', { name: offer.name, description: 'Alberta registered-owner automated enforcement notice review. No trial, no success fee, no insurance report. Client approves any deal.', 'metadata[fabsy_product]': 'photo_radar', 'metadata[review_path]': 'ate' }, 'fabsy-photo-radar-product-v1');
let price = (await stripe(`prices?lookup_keys[]=${lookupKey}&limit=10`)).data[0];
if (price && (price.product !== product.id || price.unit_amount !== offer.priceCents || price.currency !== 'cad' || price.tax_behavior !== 'exclusive' || !price.active || price.type !== 'one_time')) throw new Error('Existing Photo Radar price differs from the approved configuration. No existing price was changed.');
price ||= await stripe('prices', { product: product.id, currency: 'cad', unit_amount: String(offer.priceCents), tax_behavior: 'exclusive', lookup_key: lookupKey, 'metadata[fabsy_product]': 'photo_radar' }, 'fabsy-photo-radar-price-v1');
// Stripe's Dashboard creates a manual GST rate with display_name=GST but may
// leave tax_type unset. Reuse that reviewed rate only with our exact marker;
// do not mistake a generic untyped tax rate for this product's Alberta GST.
let tax = await find('tax_rates', item => item.active && item.country === 'CA' && item.state === 'AB' && item.percentage === 5 && item.inclusive === false &&
  (item.tax_type === 'gst' || (item.tax_type == null && item.display_name === 'GST' && item.metadata?.fabsy_tax === taxKey)));
tax ||= await stripe('tax_rates', { display_name: 'GST', percentage: '5', inclusive: 'false', country: 'CA', state: 'AB', jurisdiction: 'Alberta, Canada', tax_type: 'gst', 'metadata[fabsy_tax]': taxKey }, taxKey);
console.log(JSON.stringify({ provisioned: true, mode, product_id: product.id, STRIPE_PHOTO_RADAR_PRICE_ID: price.id, STRIPE_GST_TAX_RATE_ID: tax.id,
  next: 'Set these IDs in the matching Supabase environment, deploy the additive migration/functions, then verify a Stripe test checkout and signed webhook. No payment, customer or deployment was created by this script.' }, null, 2));
