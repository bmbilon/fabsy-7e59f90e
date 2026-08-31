# Referral program operations

This implementation records rewards and completed manual Interac transfers. It
does **not** send an Interac transfer, email a customer, run a payout schedule, or
file a tax slip. Deploying the function does not pay anyone.

## Data and eligibility

`referrals.order_id` references `ticket_submissions.id`, the existing durable
representation order. There is no new parallel customer-order system. Each order
can earn one reward: **$50 CAD for an officer ticket; $20 CAD for a camera ticket**.
An insurance report or assessment alone earns no referral reward. PRO20 changes
the purchaser's service price, not the referrer's reward.

`referral_codes` belongs to a verified portal user or an existing paying client.
A past client can receive a code in the resolution template before registering;
signing in with the matching verified purchase email claims that code. Registered
users who are not past clients receive truthful share copy in the portal.

A valid signed attribution is attached before payment. The server, not a browser
timestamp, enforces the 30-day window and last valid touch. Once payment is
recorded, another code cannot replace it. A draft stores the signed token alongside
the code. An invalid or expired token is not silently converted into an entitlement.

Eligibility requires all of:

- A trusted, confirmed representation checkout linked to the order.
- Stripe funds available, confirmed by a fresh read of the PaymentIntent, Charge
  and its balance transaction. `checkout.session.completed` alone is insufficient.
- An explicit staff acceptance confirming Alberta scope, non-fleet account
  pricing, and a review of the relevant identity documents.
- No overlap with known referrer email, phone, address, plate, or Stripe customer.
- Seven days since the **later** of settlement and file acceptance.

`eligible_at` is the earliest payout date after that seven-day period. Settlement
uses Stripe's `balance_transaction.available_on` only when its status is
`available`. See [Stripe balance transaction fields](https://docs.stripe.com/api/balance_transactions/object)
and [PaymentIntent retrieval](https://docs.stripe.com/api/payment_intents/retrieve).

Identity comparisons use private normalized hashes. Client OLD and NEW contact
details are retained for comparison, so editing an email, phone, or address cannot
erase earlier matches. Verified portal identities, staff-observed plates and
trusted Stripe customer IDs also contribute. A declared intake plate only adds a
possible denial: it never counts as staff verification. Missing or differently
formatted identity data can require human review; a checkbox is an attestation
that staff actually checked the documents, not permission to skip that review.

## Daily staff workflow

1. Open **Admin → Referrals**. Review the case documents, jurisdiction, service
   scope, and any fleet/account pricing. Record the plate as printed when known.
   Accept or reject the file with the explicit scope/identity confirmations.
2. Refresh Stripe on a referral that has reached its payout date. Refresh also
   checks pending/completed refunds and disputes. A Stripe outage blocks payout
   recording rather than treating an old check as current.
3. Confirm the payee email. Before a second payout, the portal must contain the
   referrer's legal name and postal address. The database serializes payments for
   each referrer, so two simultaneous first-payout requests cannot bypass this rule.
4. Send the Interac transfer outside Fabsy using the approved finance process.
   Then record its actual transfer reference in the admin page. **Record paid**
   does not send money. Only admins can record payouts; case managers may review
   files and refresh the queue. The marking endpoint rechecks Stripe immediately.
5. Reconcile payout references with the bank. Replaying the same reference for the
   same referral is idempotent; a different reference cannot overwrite a paid row.

Opening a dashboard recalculates the displayed referrals as waiting periods
expire. There is no implicit cron job. Staff must operate the queue; pagination
does not cap the number of rewards a referrer can earn.

## Refunds and disputes

Any refund request, including a partial PRO20 adjustment, conservatively holds the
referral. Unpaid rewards become void; previously paid rewards retain their amount,
date, and transfer reference and gain `refund_review_required` for human recovery
review. A failed or canceled refund request does **not** automatically release an
existing hold. Staff must reconcile it with Stripe and finance before an approved
database operator changes a hold; there is deliberately no client or routine
payout endpoint that clears refund history.

Refund/dispute holds are retained by PaymentIntent even if their webhook arrives
before the checkout webhook. Linking the eventual order applies that hold. The
pre-transfer refresh protects against a missed webhook. See [Stripe Charge fields](https://docs.stripe.com/api/charges/object).

## Tax information

The portal requires legal name and address before a second payout. Payout snapshots
retain the details used for that transfer. Annual totals use the calendar year in
America/Edmonton; totals **over $500** are flagged for accounting review. Confirm
payment classification and applicable T4A reporting with the accountant. This
implementation does not collect a SIN, transmit a tax slip, or treat the threshold
as a blanket tax exemption.

Profiles, payout snapshots, identity hashes and audit events have RLS enabled and
no browser table grants. Owners see only their own profile and redacted referral
statuses through the authenticated endpoint. Referee names, emails, ticket details
and payment identifiers are not returned to referrers. Staff access is verified
against server-held roles. Even the edge service role has read-only table grants
on the new referral tables; all writes use the constrained security-definer RPCs.

## Deployment and API contract

Apply `20260831121000_referral_program.sql` after the photo-radar and pro migrations.
Deploy `referral-program` with gateway `verify_jwt = false` because its `capture`
action is public. Every other action verifies a real, non-anonymous, confirmed
Supabase user; staff actions verify staff roles again. Do not expose the service
role key in browser code.

`REFERRAL_ATTRIBUTION_SECRET` can provide a dedicated secret of at least 24
characters. Otherwise, a domain-separated HMAC uses the server service-role key.
Rotating that secret invalidates old draft tokens; revisiting a share link captures
a fresh token. Existing database attribution is unaffected. Stripe refresh uses the
existing server `STRIPE_SECRET_KEY` for read-only provider requests.

POST actions:

| Action | Access | Purpose |
| --- | --- | --- |
| `capture` | Public | `{code}` → `{code,attributedAt,expiresAt,attributionToken}`; no referrer identity disclosure. |
| `dashboard` | Verified portal user | Own code, share URL, profile, statuses, paginated payout history and annual total. |
| `save_profile` | Verified portal user | Save own legal name/address/payout email; returns refreshed dashboard. |
| `admin_list` | Staff | Paginated review/transfer queue with payee details and tax watch. |
| `admin_review` | Staff | Explicit Alberta/scope/fleet/document review; cannot fabricate a payment. |
| `admin_refresh` | Staff | Read Stripe settlement/refund status and recalculate the order. |
| `admin_mark_paid` | Admin | Recheck Stripe and record a completed manual transfer reference. |

Both list actions accept a returned `cursor` and return `next_cursor`. Pages contain
50 referrals. The client portal's `payout_history` contains paid rows from that
page; its annual totals and payout count include the entire ledger.

Submission/webhook integration exports are in
`supabase/functions/_shared/referrals.ts`:

- `attachReferralAttribution(db, orderId, {refCode, refAttributionToken})`
- `recordReferralDeclaredPlate(db, orderId, plate)`
- `recordReferralCheckoutPayment(db, {orderId, paymentIntentId, stripeCustomerId?})`
- `refreshReferralPayment(db, orderId)`
- `recordReferralRefund(db, {paymentIntentId, refundedAt?, disputedAt?, eventId?})`
- `clientReferralCode(db, clientId)` for the resolution template only

Record all validated representation payments, including orders without a referral,
so later identity checks have the available Stripe customer history. Do not call a
payment helper from a browser-supplied payment status or amount.

## Business watch report

`supabase/reports/pro-referral-metrics.sql` is an aggregate-only, read-only report
for an authorised database operator. It covers currently paid checkouts with
complete current-price snapshots, counts officer pro verification and camera
fleet exclusions, and flags legacy/missing quotes separately. It does not expose
client or payee identifiers or change advertising spend.

Service receipts exclude GST and count each representation order once. A bundle
already includes its report allocation. Upfront PRO20 is deducted from the saved
quote; a later succeeded PRO adjustment deducts only its service component once.
The parent order's discount flag is not a second discount. Standalone reports,
assessments and later standalone add-ons are outside this checkout cohort.

The database does not store the amounts of every general refund or dispute. The
report therefore labels its available amount as **before other refunds**, flags
orders needing reconciliation, and withholds complete net service ARPU whenever
refund/dispute history exists. Finance must reconcile Stripe totals before using
that number as final net revenue; a known PRO refund does not prove there were no
additional refunds. Legacy or conflicting payment quotes are never price-imputed.

The proposed **over 30% officer pro-verified share → review a roughly $150 CAC
limit** is the user's business assumption. It is a review watch, not an automatic
spend change or a profitability result derived from these records. Camera-heavy
mix also needs a separate acquisition calculation.

## Local verification

These commands use synthetic data and never contact Stripe or a Supabase project:

```sh
deno test --no-lock supabase/functions/_shared/referrals.test.ts
PYTHONDONTWRITEBYTECODE=1 python3 supabase/tests/test_referral_program.py
PYTHONDONTWRITEBYTECODE=1 python3 supabase/tests/test_pro_referral_migrations.py
```

The PostgreSQL runners create disposable clusters with private Unix sockets and
no TCP listener. The referral suite includes concurrent payout attempts, all five
identity overlap types, delayed settlement, source attribution, private access,
refunds arriving before checkout, second-payout profile enforcement and annual
totals above the reporting watch threshold. The combined runner applies all four
new migrations, checks private resolution email snapshots and preserved event
types, and verifies the actual aggregate report inside a read-only transaction.
