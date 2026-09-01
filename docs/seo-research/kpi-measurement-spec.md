# Fabsy SEO KPI measurement spec

Status: provisional operating contract, reviewed from repository evidence plus a read-only GA4 Admin spot-check on 2026-09-01. No live Google Ads, Stripe, Supabase order/revenue, or Search Console account was queried for KPI baselines in this audit.

## Decision frame

Use three primary KPIs: one business outcome, one first-party search outcome, and one controlled citation outcome. They must remain separate. A Search Console click is not a lead, a Google Ads conversion is not an additional purchase, and a Generative AI Features impression is not an observed citation.

The targets below are planning thresholds, not forecasts. Confidence is low until two complete comparable monthly extracts exist. Do not backfill missing measurements with estimates.

## Primary KPI contract

| KPI | Exact definition and source | Current baseline | Provisional target |
| --- | --- | --- | --- |
| 1. Verified paid purchases and net service-fee revenue | Business truth: count distinct eligible server-confirmed paid checkout sessions; sum CAD total less separately reported GST. Eligible `order_type` values are `rapid_resolution`, `rapid_resolution_bundle`, and `photo_radar`. GA4 `purchase` is the consented, public-document measurement subset and uses an opaque SHA-256 transaction ID; it is not proof of all orders. | Not available in the repository. Do not invent a purchase or revenue baseline. | First two monthly reviews: establish two comparable server extracts and report GA4 coverage separately. After owner approval, use `+10%` trailing-90-day verified purchases versus the preceding comparable 90 days, with net service-fee revenue at least non-declining. Low confidence until baseline exists. |
| 2. `/content/` organic Search clicks | Search Console Web report chart total with Page URL containing `/content/`; count clicks for a complete, explicitly dated window. Keep clicks, impressions, CTR, and average position from the same filter and time window. | Manually verified 2025-10-01–2026-08-29 snapshot: 497 clicks, 62,780 impressions, 0.8% CTR, average position 18.1. The report contained 623 page rows; 108 had at least one click. The filtered table may be partial. | After two comparable monthly captures, increase trailing-90-day clicks by `10%` versus the preceding comparable 90 days while keeping CTR at or above `0.8%`. Until then, the target is non-regression and complete capture. Low-confidence planning threshold. |
| 3. Controlled Fabsy citation coverage | For one named platform/interface and repetition: completed eligible prompts with `fabsy_cited=yes` divided by all completed eligible fixed prompts. A citation requires a clickable `fabsy.ca` URL or an in-scope classic organic result. Always report numerator, denominator, platform, interface, date, and repetition count. | Perplexity anonymous/incognito Search, 2026-08-31: 2/30 (6.7%) in one directional run. This is not a stable ranking claim. | Run three repetitions within 48 hours each month. By the third monthly review, planning threshold is a median of at least 4/30 (13.3%) with the factual-safety guardrail met. Low confidence; revise after three monthly panels. |

## Drivers and diagnostic metrics

| Primary KPI | Drivers to inspect | Interpretation limit |
| --- | --- | --- |
| Verified purchases/revenue | Eligible order-type mix; net service value per purchase; GA4 receipt-dispatch coverage for the reconstructable consent-eligible subset. | The current approved Google event surface has no reliable lead, form-submit, or checkout-start event. Do not publish a funnel conversion rate from legacy helpers. |
| `/content/` clicks | Search impressions, CTR, average position, number of clicked pages, and concentration in the top 25/top 100 pages. | Page-row sums can differ from chart totals. Use chart totals for KPI reporting and rows only for diagnosis. |
| Citation coverage | Commercial-intent citation coverage; canonical citation share; first commercial domain; primary-authority share. | GSC Generative AI Features impressions are a separate visibility signal, not proof of query-level citation. |

## Event and source dictionary

### Read-only GA4 spot-check

The authenticated `fabsy.ca` property showed 1 active user, 4 total events, and 0 key events for the displayed last-seven-day card on 2026-09-01. Its Recent events table listed 15 event names, including `intake_completed`, but not `purchase`; the Key events tab had `purchase` configured with no stream data detected. The property had only recently been activated, so these values are an instrumentation observation, not a demand or conversion baseline. No event setting was changed.

### Active, approved measurement

- **Server-confirmed paid checkout:** source of truth for total verified purchases. The receipt must be paid, one-time payment mode, CAD, arithmetically valid, and a recognized order type.
- **GA4 `purchase`:** dispatched only from a validated live paid receipt on an approved public document after explicit consent. `transaction_id` is a SHA-256 digest of the checkout session ID; `value` excludes GST; `tax` is separate; `order_type` and one item identify the service. Deduplicate on `transaction_id`.
- **Google Ads `conversion`:** the same verified purchase sent to a product-specific Ads destination. Officer-ticket and photo-radar labels are separate. Use this for campaign delivery/bidding diagnosis, not as a second purchase count and not as the authoritative revenue total.
- **GA4 `page_view`:** limited to reviewed public routes, explicit consent, exact production origins, and sanitized page context.
- **Search Console Web `/content/`:** primary SEO search-outcome source. Store the exact property, search type, filter, start/end date, extraction date, chart totals, and any partial-table warning with every snapshot.
- **Controlled citation CSV:** primary citation source. Only rows whose `observation_status` records a completed run enter the denominator.

### Not approved as KPI sources

- `generate_lead` and `form_submit` are explicitly rejected by the current scoped Google dispatcher. The contact form has no persistent measurement event after successful delivery.
- Do **not** mark GA4 `intake_completed` as a key event yet. Its repository emitter belongs to the retired ticket-assessment intake, fires before a service choice or payment, and calls the legacy raw `gtag` path. That route now redirects and the approved dispatcher does not allow this event type. Account arrivals therefore need source/version validation before they can represent the current funnel; marking it now would elevate a legacy, non-authoritative signal.
- Legacy helpers that call raw `window.gtag`, including `begin_checkout`, do not create an approved event because the current loader replaces raw `gtag` with a no-op.
- The `micro_lead` and `conversion_paid` Supabase helper definitions have no production call sites found in this audit. Dashboard labels alone are not event evidence.
- Google source/medium attribution is not guaranteed by the repository contract: approved events deliberately receive a sanitized URL, blank referrer, and no arbitrary acquisition fields. Do not label GA4 purchases “organic” until an exported account report and its privacy assumptions are separately validated.

## Guardrails

1. **Privacy and coverage:** consent-gated GA4 counts are a subset, not a substitute for server order totals. Never treat a lower consent rate as falling demand. If the consent-eligible denominator cannot be reconstructed, report GA4 coverage as unknown.
2. **No double counting:** one server-paid session is one purchase. Ads delivery and GA4 delivery are two destinations for the same outcome.
3. **Legal/factual safety:** controlled answer factual-safety rate must be 100% among reviewed cited answers, with zero critical legal-error flags. If safety falls, pause citation-growth optimization and correct the source content.
4. **Search quality:** protect URLs with observed clicks or Generative AI visibility. The URL consolidation scorer remains advisory and cannot authorize redirects, deletion, noindex, or canonical changes.
5. **Evidence state:** unknown, not recorded, filtered out, and zero are different states. Preserve them.

## Cadence and reporting

- **Monthly:** after the reporting window is complete, capture the Search Console chart totals with the identical `/content/` filter; extract server-confirmed paid purchases/revenue; export the consented GA4 purchase subset; run each selected citation platform three times within 48 hours. Save immutable dated evidence receipts.
- **Monthly readout:** show the three KPI values, baselines/comparison windows, driver changes, guardrail status, data gaps, and decisions. Include numerator and denominator for every rate.
- **Quarterly:** reconsider thresholds only after at least three complete monthly panels. Record the reason, owner, and effective date for any definition or target change; do not rewrite prior artifacts.
- **Release/measurement QA:** run `npm run test:measurement` when the Google event contract changes. Run the citation generator test with the SEO evidence suite.

Suggested ownership: growth/SEO owns Search Console and citation runs; finance/operations owns server-paid revenue reconciliation; engineering owns event-contract QA; the qualified legal/editorial reviewer owns factual-safety adjudication. Named people remain to be assigned.

## Baseline and implementation evidence

- Aggregate search and AI evidence: `first-party-evidence-baseline.md` and `gsc-aggregate-baseline.csv`.
- Citation protocol and observed single run: `citation-benchmark-procedure.md` and `citation-benchmark-observed-perplexity-2026-08-31.csv`.
- Purchase validation and payload: `src/lib/checkoutReceipt.ts` and `src/lib/paidPurchaseMeasurement.ts`.
- Google allowlist, consent, public-document, and sanitized-context controls: `src/lib/googleMeasurement.ts`.
- Contract tests: `scripts/test-paid-purchase-measurement.mjs`, `scripts/test-google-measurement-privacy.mjs`, and `scripts/test-measurement-navigation.mjs`.
