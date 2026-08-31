# Verified Pro Driver program

This is the operating and release contract for the 20% program. Local checks use
synthetic data. No deployment, customer payment, refund, email, ad launch or
Interac transfer was performed by this task. The separate release coordinator
must report its own production changes and evidence.

## Prices and eligibility

| Purchase | Service before GST | Alberta GST at 5% | Total |
| --- | ---: | ---: | ---: |
| Verified officer Rapid Resolution | $158.40 | $7.92 | $166.32 |
| Verified officer RR + Insurance Planning bundle | $183.20 | $9.16 | $192.36 |
| Unverified officer Rapid Resolution | $198.00 | $9.90 | $207.90 |
| Unverified officer bundle | $229.00 | $11.45 | $240.45 |
| Photo radar, always excluded from PRO20 | $79.00 | $3.95 | $82.95 |

The server must read an Alberta Class **1, 2 or 4** from a readable, unexpired
licence photo, matching the declared class and stored licence number, first name
and last name. Class 5 work/gig delivery, a job title, an unchecked declaration,
non-Alberta licences, camera tickets, standalone reports and legacy $149 Ticket
Triage do not qualify. A photograph is documentary evidence, not a government
licence-database authentication or a guarantee that altered documents can be
detected. Escalate suspected alteration or inconsistent identity to staff.

The actual Rapid Resolution checkout endpoint is **create-payment**.
**create-assessment-payment is the separate $149 Ticket Triage endpoint** and was
not changed to grant this program. Existing $49 reports and legacy paid orders
keep their existing product validation.

## Verification and payment sequence

1. Step one records the declared licence class on an officer intake. The existing
   licence upload stays in memory; it is not copied into session/local storage.
   A draft and a displayed quote never establish verified eligibility.
2. `submit-ticket` records the stored identity and class. The browser passes its
   existing submission capability to `verify-pro-licence`; the server also accepts
   the verified owner through the private portal. Other users cannot verify or
   refund this order.
3. The verification RPC locks the order and compares the exact identity and
   capability snapshot authorized by the endpoint. It stores a private evidence
   record and accepts only bounded JPEG, PNG or WebP uploads. The AI receives
   transcription instructions, not authority to change products or prices.
4. The result must still match the locked current intake. An edit, a mismatched
   class/name/number, expiry, unsupported jurisdiction, unreadable image, AI error
   or upload failure cannot yield `pro_verified=true`. A maximum of five attempts
   per order per day and a processing lock limit retries. Missing/unverified
   evidence continues at the regular service price with a clear explanation.
5. `create-payment` independently reads the stored verified evidence. It validates
   the private Stripe coupon **PRO20**, reserves an immutable pre-discount subtotal
   and proof ID, and applies the coupon only to the officer service/bundle. It does
   not accept a browser coupon, verified flag or amount. A missing/misconfigured
   coupon blocks verified checkout instead of silently charging the wrong price.
6. The signed webhook checks the stored reservation, session identity, product,
   subtotal, discount and charged total before recording payment. The bundle's
   discounted report allocation is **$24.80**, with a required PRO20 marker.
   Camera paid validation and its ATE activation remain separate.

New program officer sessions cannot stack general promotion codes with PRO20.
Already-issued legacy sessions retain their existing validation without acquiring
the new discount. Do not migrate historical $488 purchases into the new refund
program by changing an amount or product field.

## Post-payment verification and refunds

The verified paid officer receipt offers `/portal/pro-discount` when PRO20 was not
used. It contains no private submission ID in a public query. The authenticated
portal lists the owner's orders and accepts a photo for an eligible paid file.

The server retrieves the actual Stripe session, PaymentIntent and charge before
calculating a refund. It must be a paid, undisputed, full-price $198/$229 officer
purchase without another discount or refund. The adjustment returns 20% of the
service and its corresponding paid tax: **$41.58** or **$48.09** at 5% GST. Tax
comes from the paid Stripe receipt; those examples are not hardcoded refund totals.
Review Stripe Tax/refund accounting and any required tax reversal for the account's
chosen tax integration before enabling production adjustments.

One database reservation per order/PaymentIntent and a stable Stripe idempotency
key prevent duplicate adjustments. A timed-out request is reconciled with Stripe
before any retry. After 20 hours an uncertain creation needs staff review rather
than risking expiry of a provider idempotency key. Pending is not success. An
actual failed/canceled bound refund stays `needs_review`; a late worker cannot
restore PRO20 or overwrite a completed result. Evidence may be verified while the
financial adjustment is still pending or requires review.

Never send another refund to resolve an uncertain result without inspecting the
original PaymentIntent, refund ID, metadata, amount and database reservation. Do
not clear a bound review hold through the client portal. Record reconciliation in
the approved finance audit process. A partial PRO20 refund also holds any referral
under the program's conservative refund rule; it does not delete a prior payout.

## Release order and configuration

The shared candidate integrates the photo and referral work. Do **not** deploy only
the new `create-payment` file against an older schema. Apply, in order:

1. Existing IDR, Rapid Resolution pricing and multilingual prerequisite migrations.
2. `20260831115000_photo_radar_product.sql` (coordinated photo owner).
3. `20260831120000_pro_driver_discount.sql`.
4. `20260831121000_referral_program.sql`.
5. `20260831122000_resolution_referral_email.sql` before the updated email endpoint.

The combined disposable database test checks migrations 2–5 against the necessary
existing schema fixture. It is not evidence that a production migration has run.

Deploy `submit-ticket`, `verify-pro-licence`, `create-payment`,
`idr-payment-webhook`, `referral-program`, and `send-idr-case-update` together with
their shared helpers. Include the photo owner's compatible `get-checkout-session`,
OCR/date/ATE/consent changes and its operations checklist in the combined release.
Preserve `verify_jwt=false` for `verify-pro-licence` and `referral-program`: their
handlers enforce submission capabilities/verified portal ownership or staff roles;
referral capture is intentionally public. This does not make protected actions
anonymous. Use the existing signed Stripe webhook configuration.

Required server configuration:

- Existing Supabase service/anon configuration; never expose the service-role key.
- Existing `LOVABLE_API_KEY` for the licence reader, `STRIPE_SECRET_KEY` and webhook
  signing secret. Keep test/live keys, prices, tax rates and webhook destinations
  in the same verified account/mode.
- An exact active private coupon PRO20. See
  [the safe provisioner](../docs/pro-drivers-referrals/stripe-provisioning.md).
- Photo price/GST settings belong to the photo owner; do not provision duplicate
  camera SKUs while enabling this program.
- Optional `REFERRAL_ATTRIBUTION_SECRET` (at least 24 characters); otherwise the
  service key supplies the domain-separated HMAC. Rotation invalidates draft
  attribution tokens, not already stored order attribution.
- Existing Resend/SITE_URL settings only when using staff-reviewed email. Keep
  `REFERRAL_EMAIL_ENABLED` unset/false until the invitation requirements below are
  satisfied. Checkout does not depend on invitation emails being enabled.

Stripe webhook subscriptions must include the handled checkout events plus
`charge.refunded`, `charge.dispute.created`, `refund.created`, `refund.updated` and
`refund.failed`. Verify signatures and that replayed provider events are
idempotent. Inspect the private `pro-licences` bucket and populated evidence/refund
tables under anonymous, client and staff roles; no public image URLs are issued.
Apply the established evidence retention policy and least-privilege staff access.

Publish the client code only after schema, functions and billing configuration
are ready. `/pro-drivers`, `/refer`, terms, pricing ladder and their deterministic
snapshots must describe the same release. The separately handed-off Allstate and
eight-homepage promotion commit needs a conscious merge of shared offers/guards,
then exact locale publication fingerprints refreshed for the final legal source.
Machine publication is not native review: preserve null reviewer metadata and
the language purchase-readiness gates.

For this combined release, Pro licence verification, adjustments and discounted
checkout require the **saved order's English locale**, not a language override in
the verification or payment request. New intake declaring Class 1, 2 or 4 also
requires the English product terms. Unsupported product locales return HTTP 409
with `error_code=product_locale_not_released` before evidence storage or payment
work. Returning to English must reset consent and signature in the frontend and
store a newly signed English intake; changing only a request's locale is not a
valid handoff. A saved language change invalidates Pro evidence, and SQL rejects
verification/discount reservations for non-English orders under the order lock.

This is a product boundary, not a rollback of the seven ordinary language flows.
Keep `FABSY_LIVE_SERVICE_LOCALES=pa,tl,zh-hans,zh-hant,ar,hi,es` and the legacy flag
unchanged. Full-price officer Rapid Resolution, its ordinary report bundle, and
existing assessment/report flows retain their released languages. The additive
intake queue still retains original text and awaits a connected English review
worker; no translator worker or staffed language service is created here. Client
notifications remain transparently in English. Never mark a machine translation
as human reviewed or silently convert a pending review into a completed one.

## Resolution email invitation

`ResolutionEmailAction` is an explicit staff action beside a **saved** final
outcome. Reviewing a preview sends no email and creates no referral code. The
server requires a confirmed representation payment; camera results come only
from a resolved ATE review. It never adds an insurance offer to a camera result.

The preview binds the saved outcome, recipient, ticket details, language, copy and
configuration with a fingerprint. A changed result or recipient requires another
review. Send requests are idempotent per order and saved outcome; the exact payload
is preserved for retries, and an older uncertain attempt is held for reconciliation.
“Provider accepted” does not assert inbox delivery. No development test sends mail.

The optional line is: “Know a driver with a ticket? $50 when they sign up with your
link.” It links to the actual client's code and is followed by the officer/camera
reward, settlement/acceptance/waiting-period qualification and terms. Before
enabling it, set the real `FABSY_BUSINESS_MAILING_ADDRESS`, confirm the sender's
identification, consent records and unsubscribe handling, then set
`REFERRAL_EMAIL_ENABLED=true`. No mailing address was invented or configured here.
The staff checkbox requires a consent/unsubscribe check for each send. The handler
also requires a confirmed purchase within its conservative two-year window.

The unsubscribe method is a reply or mailto to the existing hello@fabsy.ca inbox.
Assign an operator to record requests, suppress subsequent invitations and action
them within the applicable deadline; do not enable the feature without that
process. Transactional case results can still be sent without the invitation.
See [CRTC consent guidance](https://crtc.gc.ca/eng/com500/guide.htm) and
[CRTC identification/unsubscribe guidance](https://crtc.gc.ca/eng/com500/faq500.htm).

## Verification and remaining operational gates

Local commands:

```sh
deno test supabase/functions/_shared/pro-pricing.test.ts supabase/functions/_shared/referrals.test.ts
node supabase/tests/test-product-locales.mjs
python3 supabase/tests/test_pro_referral_migrations.py
python3 supabase/tests/test_referral_program.py
node src/lib/pro-drivers/checkout.test.mjs
node src/lib/referrals/attribution.test.mjs
node src/lib/ticket/intake-date-handoff.test.mjs
node scripts/test-provision-pro-driver-stripe.mjs
npx tsc -p tsconfig.app.json --noEmit
npx vite build --outDir /tmp/fabsy-pro-referral-build
```

Use direct Vite compilation for safe local validation: this repository's standard
prebuild performs broader content/database work. Public/private route evidence is
in [the browser QA receipt](../reports/pro-referral-qa-2026-08-31/README.md).
New email tests and exact snapshot checks are listed in the final release receipt.

Before live traffic, the release owner must verify authenticated test-mode checkout,
the real AI gateway/evidence upload, correct GST/coupon application, signed webhook
activation, postpay refund reconciliation, and all live environment IDs. The local
suites test those contracts with synthetic state; they do not claim a completed
live transaction or functioning external email/Interac delivery.

Referral tax/privacy and queue operation are in
[REFERRAL_OPERATIONS.md](REFERRAL_OPERATIONS.md). Track paid officer pro share,
service ARPU, and camera referral fleet/identity holds. The user's >30% pro-share
and roughly $190 blended ARPU / $150 CAC limits are operating assumptions to review
against the measured mix, not automatic ad-budget instructions. Referral tokens
are separate from paid-media attribution; this release does not establish missing
server-side UTM/gclid persistence or authorize any paid campaign launch.
