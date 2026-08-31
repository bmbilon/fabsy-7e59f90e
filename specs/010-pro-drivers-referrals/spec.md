# Pro driver discount and referrals

## Constitution

Preserve the existing Rapid Resolution, camera, insurance, multilingual, consent and checkout work. Use the stored intake and server verification for pricing; never let browser flags establish eligibility. Preserve private licence evidence, client identity, checkout idempotency and webhook validation. Referral status and payouts are financial records with restricted writes and auditable transitions. Do not send emails, transfer money, launch ads or change production while verifying this build.

## Specification

Alberta Class 1, 2 and 4 licence holders receive 20% off eligible officer Rapid Resolution purchases: CAD 158.40 for the service and CAD 183.20 for the bundle, plus applicable GST. Camera notices, Class 5 couriers, standalone reports and legacy Ticket Triage are excluded. Capture the declared class at the first officer intake step and independently read the licence photo on the server. The declaration, Alberta jurisdiction and licence identity must match. Unreadable, missing, mismatched or unverifiable evidence means full price, followed by a private verification path and an idempotent partial refund after verification. Persist verified status and the applied discount on the existing ticket order.

Referrals pay the referrer CAD 50 for an officer ticket or CAD 20 for a camera notice, with no referee discount or cap. A verified portal account can register a code; former clients can sign in through the existing email ownership flow. Capture `?ref=CODE` and `/r/CODE` using a 30-day, last-touch session draft and a step-three manual fallback. Persist attribution once checkout is reserved. Exclude referred fleet accounts; block matching email, phone, normalized address, plate or Stripe customer. Payment settlement and explicit Alberta/in-scope acceptance must both be confirmed. The payout becomes due seven days after the later event. Interac transfers are performed by an operator and recorded with a reference; this application must not falsely claim that recording sends money. Hold/void rewards when the referred payment refunds or disputes; already paid records retain history for recovery review. Collect legal name and address before the second payout, aggregate annual payments and flag reporting review above CAD 500 without claiming the threshold is a complete tax rule.

Public surfaces: `/pro-drivers`, `/refer`, ladder price line, Terms 5D/5E, commercial Meta draft. Private surfaces: Refer a driver with code, copyable link, user-triggered WhatsApp/SMS sharing, status, history and payout profile; staff acceptance/review/payout controls; private post-checkout pro verification. Add the referral invitation to the existing resolution email template without sending it during development. No referral ads.

## Clarifications before plan

The build sheet resolves product choices; apply the pro discount only to officer tickets. The repository's Rapid Resolution entrypoint is `create-payment`; `create-assessment-payment` is a separate legacy CAD 149 Ticket Triage flow and must not receive this discount. There is no generic orders table: `ticket_submissions` is the canonical ticket order and `idr_checkout_intents` holds its payment reservation; referral `order_id` references the ticket submission. Step one is the current Ticket Details screen and step three is Your Account. Reuse the existing AI gateway, Stripe and Supabase integrations rather than adding providers. Actual Stripe settlement is distinct from a completed checkout. A pro-price refund also holds a referral under the user's blanket refund rule, pending staff review. English-only new public/legal copy follows the current release policy; do not invent reviewed translations.

## Plan

1. Add private licence verification evidence, immutable pricing snapshots and refund tracking; apply the validated Stripe PRO20 coupon only in the live officer checkout and verify it again in paid webhook handling.
2. Add referral code, attribution, identity, acceptance, settlement and payout ledgers with RLS and atomic state changes. Reconcile settlement/refunds from Stripe before recording any payout.
3. Extend the current intake with class declaration, memory-only licence image reuse, bounded session attribution and step-three manual referral entry.
4. Add public pages, authenticated referral and verification tools, staff operations, terms, pricing line, resolution-template invitation and commercial ad draft.
5. Run meaningful financial/routing/RLS tests, TypeScript and production compilation plus synthetic browser checks; provide a precise release checklist without treating local code as a live deployment.

## Tasks

- [ ] Protected pro schema, AI verification, checkout coupon and webhook validation.
- [ ] Private post-payment verification and retry-safe partial refund handling.
- [ ] Referral schema, identity checks, eligibility/settlement/refund lifecycle and payout operations.
- [ ] Intake declaration, last-touch attribution, fallback and accurate checkout display.
- [ ] Public pages, portal sharing/profile/history and staff tools.
- [ ] Terms, pricing line, commercial Meta draft, resolution invitation and SEO integration.
- [ ] Security/money tests, migrations, build and browser verification; launch handoff.

## Analysis before implementation

Every requested surface has a task. Highest risks are self-asserted pro eligibility, reused or unrelated licence photos, unapproved coupon stacking, discounts not reflected in webhook/accounting, duplicate refunds or referral payouts, fake settlement/acceptance, fleet/self-referral identity evasion and leakage of licence/tax/client details through portal queries. Replays must not reset a hold or paid record. Public users cannot choose reward amounts, mark a payment settled, accept a file or mark a payout paid. Browser sharing links require a user click and do not send messages themselves. Watch metrics use real order cohorts: pro share over 30%, officer ARPU, camera referral/fleet share and annual referrer totals.
