# Rapid Resolution site readiness

**Fee-refund follow-up, August 31 — copy only:** the new ticket-service promise keeps upfront payment. If a Crown offer improves neither the original fine nor the original demerits, Fabsy refunds the full service fee actually paid, with the refund issued within 30 days of Fabsy receiving that offer. This includes the full bundled fee after any Pro discount; standalone report purchases and government fines are excluded. No legal outcome is guaranteed. Publish matching offer, terms, consent and checkout copy before these ads run. No final-offer requirement, minimum reduction, customer claim deadline or plea-acceptance condition is added. See [messaging direction](messaging-direction.md).

The fee-refund copy pass did not process a refund or payment, change a provider account, or publish the new offer. This follow-up records the separate completed measurement release from the owner’s evidence; it adds no new browser or purchase test. The original August 30 source/deployment findings below remain historical.

**Current measurement follow-up — August 31, 2026:** the separately authorized Google activation is deployed, with GA4 `G-26G8CMWTKY` and Ads `AW-18419256057` loaded only after explicit consent. The [dated activation receipt](../2026-08-31-photo-radar/measurement-activation-receipt.json) records successful CI, the isolated real-Google 11/11 request matrix, independent live Tag Assistant Page View/consent/private-intake checks, and completed withdrawal/debug cleanup. This supersedes the earlier disabled/no-tag/deployment-pending status; it does not prove paid-purchase receipt or attribution. Both actions remain Secondary and no campaign spend occurred. The new fee-refund website publication is still pending; the release owner reports its capture-guard validation has passed. Advertising budget/test-cap approval is also outstanding.

Audit date: 2026-08-30. This report separates the local working tree from production. The audit read application code and existing snapshots and ran read-only validation; it did not build, sync database content, submit customer data, create a checkout, make a payment, or deploy. Existing application files were not changed.

**Do not send paid traffic yet:** the new fee-refund offer still needs publication and post-release destination/checkout checks, paid-purchase attribution and approved budget/test cap. The release owner reports the prepublication capture-guard validation has passed. The following August 30 observations are historical: that audit found a missing Rapid Resolution page, old offer content and missing permanent redirects. They are not a fresh statement about the deployed site.

## Historical production observations — August 30

These August 30 observations are preserved in `live-http-audit.json`; current measurement publication is recorded above. The old source checks below do not establish today’s deployment status.

| Production surface | Observed behavior | Launch requirement |
| --- | --- | --- |
| `/rapid-resolution` | React not-found page inside an HTTP 200 application shell | A real, working destination showing the $198 offer on desktop/mobile and to crawlers |
| Homepage, `/services`, `/terms-of-purchase` | Crawler responses still show the retired $149/$488 offer | Current pricing and scope consistently served across browser and crawler routes |
| `/traffic-ticket-assessment` and its `/start` path | HTTP 200 responses instead of the planned permanent redirects | Verified 301s to the approved replacement destinations |

## What was ready locally on August 30

| Area | Evidence in `/Users/brettbilon/fabsy` | Result |
| --- | --- | --- |
| Offer configuration | `src/config/offers.json:7`, `:40`, `:50`, `:52` | RR $198, standalone report $49, bundle $229, report add-on $31; CAD plus applicable GST |
| Offer scope | `src/config/offers.json:13`, `:32`, `:33` | The 48-hour commitment begins after complete disclosure is received and matched; it is Fabsy action, not Crown/outcome timing. No outcome is promised. |
| Active offer pages | `src/pages/RapidResolution.tsx:109`, `src/pages/Services.tsx:42`, `src/pages/Index.tsx:13` | Current RR landing page, services pricing, and homepage use the central offer configuration |
| Homepage journey/navigation | `src/components/AssessmentHomepageJourney.tsx:95`, `src/components/Header.tsx:17`, `src/components/Footer.tsx:25` | RR replaces the old assessment journey and current navigation labels; “Priority Review” is not the active nav/footer offer |
| Checkout | `src/components/form-steps/PaymentStep.tsx:51`, `supabase/functions/create-payment/index.ts:5`, `:594`, `:614`, `:667` | Browser subtotal and server prices agree: 19,800 cents plus optional 3,100 cents; Stripe automatic tax enabled, prices exclusive of tax |
| Signed authorization | `src/components/form-steps/ConsentStep.tsx:90`, `:102`, `:117`; `supabase/functions/generate-consent-form/index.ts:155`, `:164`, `:171` | RR pre-trial scope, client-specific instruction before accepting a resolution, trial exclusion, $198 plus GST, and timing caveat are present in browser consent and generated PDF text |
| Checkout prerequisites | `supabase/functions/create-payment/index.ts:477` | Server checks that the current signed consent document is stored before checkout |
| Current service terms | `src/pages/TermsOfService.tsx:64`, `:86` | Current pricing, accepted-matter start conditions, separate trial work, deadline responsibility, and client approval appear in Terms of Service |

Price and scope agreement in source does **not** verify deployed functions, Stripe tax settings, migration state, checkout completion, payment activation, or actual service capacity.

## Historical snapshot check — August 30

Existing local HTML was inspected directly, including head metadata and JSON-LD strings. No `$149`, `$339`, `$488`, `Ticket Triage`, or `Priority Review` offer strings were found in the four present snapshots below.

| Route | Local snapshot | Price strings found |
| --- | --- | --- |
| `/` | `public/prerendered/index.html` | $198, $229, $49 |
| `/rapid-resolution` | `public/prerendered/rapid-resolution/index.html` | $198, $229, $49 |
| `/services` | `public/prerendered/services/index.html` | $198, $229, $49 |
| `/ai-info` | `public/prerendered/ai-info/index.html` | $198, $229, $49 |
| `/terms-of-purchase` | **Absent** | Not testable locally |
| `/terms-of-service` | **Absent** | Current React page exists; no existing snapshot to compare |

The two local content JSON trees, `src/content/pages` and `ssg-pages`, had zero files matching `$149`, `Ticket Triage`, or `Priority Review`. `public/llms.txt:10` onward describes the current offers. These bounded checks are not a production crawl.

## Unfinished local release work at the August 30 audit

1. **Resolve the terms route.** `src/App.tsx:83` exposes `/terms-of-service`; there is no `/terms-of-purchase` route or redirect, and no snapshot for either terms route. The ads sheet's terms URL therefore cannot be verified against this checkout. Deliberately migrate or redirect the old purchase-terms URL to the approved current terms, ensure checkout links use the intended document, and verify the production response. Do not silently treat a missing terms URL as a completed scrub.

2. **Choose the legacy start redirect consistently.** `public/_redirects:4`, `functions/_middleware.ts:70`, and `src/App.tsx:95` all send `/traffic-ticket-assessment/start` to `/submit-ticket`. The build sheet asks for `/rapid-resolution`. The base assessment URL already targets `/rapid-resolution` in all three places. Decide whether old start links should go directly to intake or first explain the replacement offer, then deploy and verify that single decision. The middleware uses a URL copy, retaining query parameters.

3. **Clear full-tree snapshot QA before release.** Normal content-snapshot checks pass, but the broader check fails. Reconcile the actual HTML and guardrail requirements, regenerate only through the approved release process, and rerun full-tree validation. Do not assume every failure is a real legacy-price leak or relax guardrails merely to obtain a pass.

4. **Retire new $149 enrollment without breaking historical orders.** The public React assessment pages are no longer routed, but `supabase/functions/submit-assessment-intake/index.ts:355` still creates `ticket_insurance_assessment` rows with `assessment_price_cad: 149` at line 361. `supabase/functions/create-assessment-payment/index.ts:146` still validates those rows and creates a Ticket Triage checkout with the product at line 281. Those handlers have no visible cutover guard restricting enrollment to pre-existing orders. Confirm deployed status and restrict new legacy enrollment if retirement is intended; retaining receipts and payment reconciliation is a separate requirement.

5. **Prove the purchase journey before claiming speed or turning on spend.** The local funnel is six steps (`src/components/TicketForm.tsx:132`): ticket details, personal info, the client's account of events, consent, review, payment. The initial server submission and document upload occur in the payment handler (`src/components/form-steps/PaymentStep.tsx:82` and `:130`). “Upload in 60 seconds” and “quote in minutes” were not demonstrated by this audit. Validate realistic mobile completion, error recovery, bundle selection, tax, payment confirmation, and signed-scope delivery in an isolated test environment. Do not test against real customer records or send test notifications to customers.

## Historical validation results — August 30

| Read-only command | Result |
| --- | --- |
| `node scripts/test-rapid-resolution-content-normalizer.cjs` | **PASS** |
| `node scripts/validate-snapshot-guardrails.cjs` | **PASS**: 38 curated inputs and 1,122 generated content snapshots; this default invocation checks zero full-tree snapshots |
| `VALIDATE_ALL_PRERENDERED=1 node scripts/validate-snapshot-guardrails.cjs` | **FAIL**: 138 reported issues across general pages and blogs |

The full-tree failures include the homepage, RR, and services snapshots. Categories include pricing-copy rules, monetary/timing guardrails, unapproved Offer schema, an em dash, and homepage description length. A focused inspection found an unnamed global Service Offer inherited from `index.html:115` with the short RR-only description at line 138. The validator requires an approved service name or the exact full canonical pricing description (`scripts/validate-snapshot-guardrails.cjs:182`–`:202`). This explains a repeated schema failure even though its price is $198. The homepage description is 162 characters against the validator's 155-character limit (`src/pages/Index.tsx:14`). The 138 diagnostics should be triaged, not presented as 138 proven false advertising claims.

No `npm run build` or `prebuild` was run. `package.json:9` chains remote content synchronization, normalization, generated routes/sitemaps, and snapshot writes into prebuild, which would be inappropriate for this read-only audit.

## Historical $149 data that should remain

Do not globally delete every `149` string or remove historical payment support.

- `src/pages/TicketAssessmentConfirmation.tsx:39` is explicitly a **legacy receipt**, marked `noindex, nofollow`. It verifies the paid legacy line item and exact amount before showing the receipt. At line 156 it distinguishes the old assessment from the new $198 RR service and says no credit is automatically applied there.
- `src/pages/AdminAssessmentReview.tsx:141` and `src/pages/AdminSubmissionDetail.tsx:607` label historical assessment records. Keeping the actual old purchase identity is needed for support and reconciliation.
- `supabase/functions/idr-payment-webhook/index.ts:40`–`:48` accepts both historical and current prices and valid product combinations; it retains the 14,900-cent assessment case. This is not itself an active marketing offer.
- `supabase/migrations/20260827120000_rapid_resolution_pricing.sql:1` explicitly describes retaining historical orders. Its constraints allow both old and new valid amounts. Do not rewrite historical prices to make a text search clean.

The August 30 audit recommended reconciling the frontend, middleware, snapshots, backend pricing/consent, retirement redirects and purchase/bundle measurement. Preserve that historical checklist; use the dated follow-up above for current measurement status and the remaining fee-refund-publication, paid-attribution and spending gates. Local green checks alone do not authorize a paid launch.
