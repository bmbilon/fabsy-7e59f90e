# Activation checklist

**Current result: draft valid; launch blocked.** No ad import, budget, live conversion action, billing completion or production release has been performed by this pack. The historical [account setup](../2026-08-30/google-ads-account-setup.md) remains the last checked billing record; inspect the actual account rather than assuming it is unchanged.

## Destination and purchase

- [ ] Publish the reviewed product through the authorized release process. A local route or HTTP 200 alone is insufficient.
- [ ] Verify `https://fabsy.ca/photo-radar` in a fresh mobile and desktop browser. Confirm the Photo Radar H1, $79 + 5% GST / $82.95 total, no insurance impact, eligibility scope, client approval and no trial/success fee/outcome promise. Confirm the correct title/canonical and meaningful raw snapshot for crawlers; review all six FAQs and Service price 79 CAD.
- [ ] Check the Search final URL with its real URL suffix in Google's URL test. Confirm the CTA reaches `/submit-ticket?ticket_type=photo_radar` without losing permitted click attribution. Resolve soft-404, redirect, loading, consent or mobile-layout failures before import/activation.
- [ ] Complete a test-environment owner-notice flow: manual and detected ticket type, insurance step skipped, no IIR or bundle upsell, and owner-date Yes/Sold before/Stolen handling. Test a red-light notice too. Confirm sold/stolen cases receive evidence review rather than an automatic defence.
- [ ] Verify checkout has the right Stripe product and exclusive GST: CAD 79 service, CAD 3.95 GST, CAD 82.95 total. No government fine is charged as part of this checkout. Test-mode validation does not authorize a live card charge.
- [ ] Verify server-confirmed paid orders are `order_type=photo_radar` and enter the ATE path, with disclosure matching, client approval before any deal, no trial promise, and complete-disclosure timing. Confirm failed/unpaid/mismatched purchases do not become paid conversions.
- [ ] Verify the paid-purchase conversion and its deduplication, value and attribution as described in the [measurement plan](measurement-plan.md). Include a return-page refresh and a checkout return that never happens. Document any delivery gap; do not pass this gate with a page-view event.

The [destination audit](destination-audit.json) records a read-only public GET on August 31. It returned HTTP 200 with a generic $198 Rapid Resolution title and no Photo Radar H1/total/canonical in raw HTML. This does **not** establish what the JavaScript-rendered page displays or prove a 404; it means this check did not verify the intended destination. No browser checkout or payment was performed.

## Account and settings

- [ ] Obtain approval for the intended billing entity/card, then complete account-only setup if still pending. Record the actual Ads customer ID, CAD currency, account time zone and advertiser-verification state. Do not use the prior promotion as spending authorization. Leave the deferred Business Profile disconnected.
- [ ] Obtain a concrete budget type, amount, start/end dates, zero-conversion stop-loss and activation approval. Campaign CSV Budget is blank and must not be imported as-is; do not replace it with a made-up or zero budget. If account creation offers different budget types, record the chosen controls and how the total exposure is limited.
- [ ] Confirm Google Search only, Search partners off, Display off, English, Alberta presence targeting and Exact/Phrase only. Inspect the map and the account's actual location option.
- [ ] Select only the verified Photo Radar paid Purchase action as this campaign's primary purchase goal. Exclude ordinary RR, IIR/bundle purchases, ticket uploads, calls, form starts, free checks and page views from bidding.
- [ ] Verify the three ad groups, 78 keywords and three RSAs stay paused after import. Keep headline/description pins, +GST and scope intact; preview narrow mobile placements.
- [ ] Import the 44 negative criteria only into this new campaign. Inspect inherited account/shared negatives for photo-radar or red-light conflicts, and check positive/negative conflicts. Do not alter another campaign's exclusions without reviewing the impact.
- [ ] Review attached account assets and auto-apply settings. No IIR, insurance-saving, unrelated pricing or trial pitch; no unreviewed keyword/text/URL expansion. Confirm privacy and consent handling without sharing tickets, plates, owner names, case details or client lists.
- [ ] Record approval and unresolved policy/account warnings in the final review. Only then may the approved campaign be enabled. Meta needs its own account, measurement, budget and activation gates.

## Evaluation after an authorized launch

- [ ] Confirm each platform's reporting delay and attribution window, and reconcile paid Photo Radar transactions before judging recent CAC.
- [ ] Use the approved evaluation window: scale below **$35 new-customer CAC**, pause/cut at **$55 or more**, and hold/review between them. A scaling threshold is not permission to increase a budget.
- [ ] Apply the approved zero-conversion stop-loss if there are no confirmed new customers; never report zero CAC in that case.
- [ ] Review the fixed first 20 paid accepted ATE files. Keep unresolved cases visible; do not fabricate a count or median. If the completed cohort's median Crown reduction is below **$40**, reassess the $79 consumer pitch and test fleet economics before any new spend decision.
