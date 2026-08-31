# PRO20 billing prerequisites

The pro discount needs an active Stripe coupon with ID **PRO20**, **20% off**, duration **once**, no product restrictions, no expiry and no redemption cap. The server applies it only to verified Alberta Class 1, 2 or 4 officer matters: **$158.40** for Rapid Resolution or **$183.20** for the bundle, before GST. Do not create a public promotion code. Photo radar stays at its separate price.

Preview the configuration without credentials or network access:

```sh
node scripts/provision-pro-driver-stripe.mjs
node scripts/test-provision-pro-driver-stripe.mjs
```

An authorized operator must select the intended Stripe account in the Dashboard, copy its `acct_…` account ID, and confirm that the matching Supabase environment uses that same account and test/live mode. Supply `STRIPE_SECRET_KEY` through the environment or an approved secret manager; never paste it into command arguments, logs or this document. The key needs account read and coupon read/write permissions. The script checks `/v1/account` against the required account ID before touching coupons.

After that verification, the explicit creation command is:

```sh
node scripts/provision-pro-driver-stripe.mjs --apply --mode=test --expected-account=acct_REPLACE_WITH_VERIFIED_ID
```

Use `--mode=live` only after approval and a separate live account check. The script reuses a correct existing coupon, rejects incompatible terms, and uses a stable idempotency key when creating a missing coupon. It never deletes or replaces a coupon. If a request times out, rerun to inspect the current state; do not manually create another coupon.

Before release, apply the photo-radar prerequisite migration and the additive pro/referral migrations, deploy `submit-ticket`, `verify-pro-licence`, `create-payment`, `idr-payment-webhook` and `referral-program`, and verify the private `pro-licences` bucket and service-only policies. Configure the licence reader and the Stripe webhook secret in the matching environment. Enable the checkout, refund and dispute webhook events handled by `idr-payment-webhook`. Verify test-mode officer and bundle totals, full-price verification failures, camera exclusion, signed payment activation and the post-payment adjustment before enabling production traffic. This script performs none of those deployments or payments.
