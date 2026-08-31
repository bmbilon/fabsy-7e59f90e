# Measurement contract and decision rules

**Google measurement activation is verified; actual paid-purchase receipt and attribution remain unverified.** This plan separates the current activation summary from the earlier provider configuration receipt. The account owner saved **Fabsy paid Photo Radar** directly as **Secondary**. The source `google-ads-account-setup.md` is **private/local evidence excluded from this repository**; its archived metadata records Fabsy account **938-501-7797**, CAD, accepted billing/tax information, **EXECOM INC., CA** advertiser verification, two Secondary purchases, zero Primary actions and zero campaigns. The later activation changed no paid-action optimization, campaign or spend. This docs correction queried no live orders or outcomes and performed no browser, provider or deployment action; the first-20 ATE count and median still need actual records.

## Current Google measurement activation

The included [activation receipt](measurement-activation-receipt.json) summarizes the release-owner records and independent live verification. Its private/local source records are identified by filename and hash only; they are not included or replayed by this docs correction.

| Publication evidence | Recorded value |
| --- | --- |
| Source commit | `3a187b2d6f5fa72e9bb28a4fab55d45279bfce0e` |
| Generated main commit | `cd5eef208e4ade776e4a947278dbad29edae77f0` |
| Production deployment | `fa1d2d1a-e7d2-47ef-98c5-3a3fdd6af739`, [deployment URL](https://fa1d2d1a.fabsy-9qa.pages.dev), published August 31 at 13:39:03 UTC |
| Successful CI | [Build and Deploy 33397537321](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/33397537321), [Prerender refresh 33397537324](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/33397537324), [FAQ parity 33397537305](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/33397537305) |
| Google destinations | GA4 `G-26G8CMWTKY` and Ads `AW-18419256057`, production gate enabled with explicit consent required |

The **isolated pre-release harness** passed **11/11** real-Google request checks and recorded 15 anonymous GA4 page views in the configured properties. This was not production-browser request capture. **Independent live production Tag Assistant/DOM verification** observed the Google destinations and a **GA4 Page View**, confirmed consent states, and observed zero Google scripts and an empty referrer in private intake. Public destinations returned after leaving intake. No Purchase was observed or submitted by these checks.

All four Google consent defaults—`analytics_storage`, `ad_storage`, `ad_user_data` and `ad_personalization`—were denied. After explicit opt-in, the first three were granted and personalization remained denied. Cleanup withdrew measurement permission, stopped Tag Assistant, reloaded the home page and closed its tab; zero Google script elements and an empty referrer were observed afterward. The existing Cloudflare beacon is unchanged, so these checks do not describe every analytics service. Native browser back-forward cache restoration was not observed under request interception; the receipt separately records coverage of its consent-event branch.

This activation supersedes the earlier no-tag/deployment-pending status below. It does **not** verify actual paid-purchase ingestion, matching, value/deduplication or attribution, and does not authorize advertising. The fee-refund website publication remains pending; the release owner reports capture-guard validation has passed. The advertising budget and total test cap are unapproved.

## Historical Google Ads provider receipt

| Setting | Earlier account setup observation on August 31, 2026 |
| --- | --- |
| Conversion name / source | **Fabsy paid Photo Radar** / Website Purchase, manually with code |
| Conversion type ID | `7740881425` |
| Action optimization | **Secondary**, created directly in that state; not used for bidding |
| Google Ads destination | `AW-18419256057` |
| Photo Radar label | `TEo-CJH0kescEPmV_s5E` |
| Exact `send_to` | `AW-18419256057/TEo-CJH0kescEPmV_s5E` |
| Saved value setting | Dynamic CAD; fallback **CA$0** if a value is omitted |
| Count | Every conversion |
| Click / engaged-view / view windows | 90 days / 3 days / 1 day |
| Attribution | Data-driven, Google paid channels |
| Enhanced conversions | Not configured |
| Historical observed status | Awaiting conversions; Google reported **No tag found for this account** during the earlier setup |

The existing Rapid Resolution label remains `MyAbCPiLj-scEPmV_s5E`; camera purchases must not use it. These inputs are retained in the current activation receipt; actual paid delivery to the Photo Radar action is still unverified:

```dotenv
VITE_GADS_ID=AW-18419256057
VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL=TEo-CJH0kescEPmV_s5E
```

The earlier release-owner report recorded these identifiers in GitHub secrets and the Photo label in both CI build environments, with build/deployment and paid receipt still pending at that time. Those historical values remain unchanged in `launch-settings.json` and the validation report. The separate activation receipt now establishes publication and Google measurement activation; it leaves actual paid receipt and attribution unresolved. No configuration change or repeated setup approval is requested here.

Do not recreate the saved action, add a duplicate GA4 purchase import, or promote either action now. Production Google tag/consent verification is complete in the recorded evidence; paid-receipt validation, attribution, ad-policy review and campaign approval remain separate gates. Enhanced conversions were not changed and remain unconfigured; no customer data was supplied by this pack.

## One paid Photo Radar purchase goal

Use the saved direct Google Ads **Fabsy paid Photo Radar** Purchase action. Keep it Secondary and excluded from bidding until production receipt and attribution are verified and its campaign goal is approved. There must be only **one** paid purchase goal for this product; do not add a GA4 import of the same purchase as another bidding goal. Other Fabsy offers must not enter this campaign's goal.

The purchase condition is a server-confirmed paid `order_type=photo_radar` order, not a visit to `/thank-you`, a free check, a form submit, a checkout session being created, or a client-controlled query parameter. Send `currency=CAD` and verified service revenue **79**, excluding **3.95 GST**. The checkout total remains **82.95**. The provider's fallback **0** is not the correct value for a paid Photo Radar order: a missing value, GST-inclusive 82.95, ticket fine or unrelated SKU fails validation. Test unpaid sessions, wrong SKUs, repeated webhook deliveries and return-page refreshes as well as a valid purchase.

The historical receipt contract used the server-confirmed Stripe Checkout session ID directly. The activated source now derives a deterministic **64-character SHA-256 transaction reference** from that verified session ID; raw `cs_live_` receipt tokens are not the Google transaction ID or browser deduplication key. It preserves the separate Photo Radar label and service revenue excluding GST. These implementation facts and the completed public-tag activation do not establish actual paid-purchase receipt. The saved **Every** setting counts purchases; the stable identifier deduplicates repeated delivery of the same purchase. It must not contain a ticket number, plate, client name or case details, and must remain consistent across any supported browser/server paths. Google's transaction-ID deduplication is different from counting only one conversion per click. [Google purchase deduplication and counting](https://support.google.com/google-ads/answer/6386790?hl=en)

Confirm permitted attribution survives landing page, intake, Stripe, webhook and confirmation. A paid buyer who closes checkout before returning must not be assumed to have a tracked conversion; test the actual delivery path and document any gap. Retain reconciliation evidence for the paid order, value, currency and duplicate handling. The activation receipt records the deployed Google configuration; actual Photo Radar purchase delivery and attribution still require evidence before campaign-goal approval. Reconcile cancellations/refunds and use supported conversion adjustments if required.

The revised offer charges **$79 + GST ($82.95 total) upfront**, with **no hidden fees**. If Fabsy receives a Crown offer that does not reduce the original fine, Fabsy refunds the actual Photo Radar service fee paid. The refund is issued within 30 days of Fabsy receiving that offer. This is not a guaranteed legal outcome. The refund trigger is that Crown offer, without a final-offer requirement, minimum reduction, claim deadline or guilty-plea acceptance condition. It is separate from the final approved outcome used in the cohort analysis below. Include these service-fee refunds in revenue/contribution reconciliation; they do not change the original paid-purchase value of CAD 79 excluding GST or the government fine. This copy revision is not evidence that a refund or conversion adjustment has been processed.

Authorized Stripe test-mode sessions, signed synthetic receipt checks and supported tag/debug tooling can proceed without an extra spending permission gate. Record which environment and delivery path each check actually proves. Synthetic evidence is not a real paid customer and does not by itself prove production paid-purchase receipt or attribution; never add it to the CAC denominator. No live card charge is authorized or required by this plan. The unanswered test cap is **total advertising spend**, stored as `total_budget_cad`, alongside the daily advertising budget.

The Search suffix uses static campaign/city labels plus supported `{adgroupid}`, `{creative}` and `{keyword}` parameters. Do not substitute invented `{campaign}` or `{adgroup}` macros. Keep ticket/client data out of URLs and tracking events. Confirm auto-tagging and URL tests in the account; this pack does not change them. [Google ValueTrack parameters](https://support.google.com/google-ads/answer/6305348?hl=en)

Meta, if separately authorized, should measure the same paid product with CAD 79 value and its own verified Purchase setup. Deduplicate supported browser/server events within Meta and reconcile platform overlap against internal paid orders. Summing Google-attributed and Meta-attributed customers is not a deduplicated blended customer count. No Meta integration is presumed by this pack.

## Economics

| Measure | Definition / decision |
| --- | --- |
| Paid ticket CPA | Channel spend divided by paid Photo Radar orders in the same mature attribution cohort. Useful, but repeat/fleet tickets are not all new customers. |
| New-customer CAC | Channel spend divided by distinct newly acquired paying Photo Radar clients in the same mature cohort. Use this for the thresholds below. |
| Contribution | Approximately **$72 per ticket** is the user's planning assumption, not a measured margin. Reconcile payment fees, variable delivery cost and refund/rework effects before treating it as fact. |
| Scale | Consider an approved increase only when mature new-customer CAC is **below $35**, tracking is reliable and service outcomes/capacity support it. |
| Hold | **$35 to below $55**: review intent, creative, eligibility rejection and checkout. Do not automatically increase spend. |
| Cut | At **$55 CAC or more** in the agreed mature evaluation window, pause/cut the affected acquisition scope and review. |
| No customers | CAC is undefined, not $0. Apply the separately approved spend stop-loss rather than letting an empty denominator justify continued spend. |

Set the evaluation window, observed conversion lag, minimum evidence needed for a decision and zero-conversion stop-loss **before activation**. None is invented here. The $35/$55 thresholds are not CPC forecasts, bid caps, target-CPA settings or authority to spend. No competition, click cost, conversion rate or reduction outcome has been measured.

## First 20 ATE files

Maintain a fixed cohort of the first 20 paid, accepted Photo Radar ATE files by paid timestamp, with a stable tie-breaker. Use deployed operational reporting and confirm its cohort definition before interpreting the number; do not create a competing dashboard from assumptions.

For each file, retain the original payable fine and the final approved Crown outcome, using comparable surcharge treatment. A reduction is the original fine minus the final fine; a withdrawal reduces the original fine to zero. A completed file with no reduction contributes **$0**. The Fabsy fee and its GST are separate and must not be hidden inside the Crown-reduction number. Track whether the client approved the deal and whether the outcome is final.

Report `cohort files / completed / pending` together. Pending files are neither zero reductions nor invisible exclusions. An interim median among completed files must be labelled incomplete; the final first-20 median requires the fixed cohort to resolve. If that median is **under $40**, flag the consumer value proposition for review and separately examine fleet retention, account pricing and cost to serve. Do not claim fleet succeeds or quietly discard unsuccessful cases to improve the median.

The [legal-source notes](../../photo-radar/legal-sources.md) distinguish legitimate review questions from automatic-invalidity claims. Keep site exceptions, red-light/speed distinctions, disclosure gaps, service history and the unresolved Calgary five-minute policy question visible in case review. Ad reporting is not a place to export that case evidence.
