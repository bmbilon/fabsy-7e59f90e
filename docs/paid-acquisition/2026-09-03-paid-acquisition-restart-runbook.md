# Fabsy paid-acquisition restart control

Prepared September 3, 2026 from the independent launch-control review, the isolated `codex/paid-acquisition-readiness` worktree, and Brett's correction that Rapid Resolution fulfilment cost is exactly **CA$0 per accepted case**.

## Decision

**Keep Meta and Google paused.** The local rebuild closes several source and browser-test failures, but it has not been deployed or proven against production services. A local pass is not a production pass, a readiness decision is not spend authorization, and this document changes no provider setting or budget.

Evidence labels in this document:

- **OWNER FIXED** — Brett supplied the value.
- **LOCAL PASS** — source and a local automated or browser test exist in the isolated worktree.
- **LOCAL PARTIAL** — some local contract exists, but an end-to-end requirement remains open.
- **PRODUCTION OPEN** — production or provider evidence is still required.
- **OWNER INPUT** — a business value or decision has not been supplied.

The production baseline remains the Fable Five review performed September 3, 2026 against `https://fabsy.ca`. That review found 18 of 21 launch gates failing. Work since that review is local preparation only.

## Corrected economics

The earlier negative maximum-CAC scenario must not be used. It included an assumed CA$95 fulfilment cost; Brett has fixed that input at CA$0.

Use amounts excluding GST for revenue and refunds:

| Symbol | Input | Current value |
|---|---|---:|
| `P` | Rapid Resolution service revenue before GST | CA$198.00 |
| `F` | Payment and tax-calculation fees per paid checkout | CA$7.37 working value; provider readback still required |
| `C_f` | Fulfilment cost per accepted case | **CA$0.00 — OWNER FIXED** |
| `R` | Effective share of the CA$198 fee returned, including guarantee and eligibility refunds without double-counting | OWNER INPUT |
| `S` | Average support cost per paid customer | OWNER INPUT |
| `M` | Required contribution/profit after advertising | OWNER INPUT |
| `Q` | Qualified-lead-to-paid conversion rate | OWNER INPUT |
| `V` | Landing-page-view-to-purchase rate | Measured only after production instrumentation passes |

Core formulas:

```text
Maximum CAC = P - F - C_f - (P × R) - S - M
            = 190.63 - (198 × R) - S - M

Maximum CPL = Maximum CAC × Q

Required LPV-to-purchase rate = cost per LPV ÷ Maximum CAC

Break-even CPC = click-to-LPV rate × LPV-to-purchase rate × Maximum CAC

Refund-adjusted ROAS = [198 × paid purchases × (1 - R)] ÷ ad spend
```

Every percentage point of effective refunds lowers maximum CAC by CA$1.98. The theoretical maximum CAC is CA$190.63 before support, required profit, or refunds; it is not an approved acquisition target.

This table is a mechanical sensitivity check, not a forecast. `S + M` is shown as one combined owner-controlled deduction.

| Effective fee-refund rate `R` | `S + M` = $0 | `S + M` = $25 | `S + M` = $50 | `S + M` = $75 |
|---:|---:|---:|---:|---:|
| 0% | $190.63 | $165.63 | $140.63 | $115.63 |
| 10% | $170.83 | $145.83 | $120.83 | $95.83 |
| 20% | $151.03 | $126.03 | $101.03 | $76.03 |
| 35% | $121.33 | $96.33 | $71.33 | $46.33 |
| 50% | $91.63 | $66.63 | $41.63 | $16.63 |

Before setting a budget, Brett must supply or explicitly set:

1. Actual or planning refund rate, including ineligible/out-of-scope refunds.
2. Average support cost per paid customer.
3. Required profit/contribution per paid customer.
4. Qualified-lead-to-paid rate, or confirmation that no historical rate exists.
5. Weekly case capacity and the threshold that constrains growth.
6. Stripe processing, Stripe Tax, dispute and refund-fee readback from the live account.

Those inputs produce the written maximum CAC, maximum CPL, break-even CPC and maximum test loss. No scenario row above substitutes for that decision.

## Current readiness snapshot

| Gate | State | Evidence and remaining proof |
|---|---|---|
| Unit economics | **OWNER INPUT** | Fulfilment is fixed at $0. Refund rate, support, required profit, capacity, processor costs and lead-to-paid remain open. |
| Rapid Resolution first view | **LOCAL PASS / PRODUCTION OPEN** | Commit `693b0119` places outcome, qualified fee-refund condition, $198 + GST, Upload and Call in the first view and compacts the initial consent choice. Public-offer guardrails pass locally. Production screenshots and rect measurements remain required. |
| Homepage promise and actions | **LOCAL PASS / PRODUCTION OPEN** | Commit `377769e8` rejects “you don't pay” and “Success guaranteed”, retains the qualified service-fee promise, and labels hero/header/sticky/phone actions. At 360×640 the compact consent choice covers the in-page CTA, but the 56 px sticky action remains fully available with no overlap. This work is not live. |
| Minimum lead and survivable intake | **LOCAL PASS / PRODUCTION OPEN** | Commits `bc6e26e2` and `aa807b9a` use a private capability-addressed draft, ticket plus email or phone, Alberta confirmation and contact permission; autosave/resume, Back/refresh and canceled-checkout recovery are covered locally. The migration, storage upload and staff queue need live proof. |
| Legacy browser ticket cache | **LOCAL PASS / PRODUCTION OPEN** | Local hook is a deterministic no-op and the old edge endpoint is a `410` tombstone. Historical rows were not deleted. Deployment and live endpoint readback remain open. |
| First-party funnel events | **LOCAL PASS / PRODUCTION OPEN** | Local contract covers landing view, CTA, phone, intake start, upload, lead saved, step completion, checkout start, checkout cancel and purchase. The contract is explicit-consent gated, PII-free and stores only a hash of one click ID. Seven focused tests pass. No production rows exist. |
| First-party funnel reporting | **LOCAL PASS / PRODUCTION OPEN** | A staff-gated aggregate report and admin view show event and unique-session totals by campaign/creative and label all figures as consented-session counts. Three focused contract tests pass. Production authorization, rows and reconciliation remain open. |
| Purchase/refund cash ledger | **LOCAL PASS / PRODUCTION OPEN** | A signed-Stripe-webhook-only, PII-free ledger records order-level gross purchases and distinct partial/multiple refund objects using hashed Stripe identifiers. Aggregate reporting separates all-customer financial totals from consented funnel metrics and reports a purchase-cohort any-refund rate. Refund business reason, net-retained status, production rows and controlled payment/refund proof remain open. |
| Attribution | **LOCAL PARTIAL** | Safe paid UTMs and `fbclid`, `gclid`, `gbraid`, `wbraid` are accepted locally and retained only after first-party consent. End-to-end linkage from session to draft, final case, checkout and provider conversion is not yet proven. |
| Consent | **LOCAL PASS / PRODUCTION OPEN** | The initial mobile choice is compact locally and optional Fabsy, Google and Meta measurement remains explicit. Public-offer guardrails pass. Declined and undecided journeys must be rechecked after deployment. First-party funnel rates represent consented sessions only. |
| Purchase, refund and notifications | **PRODUCTION OPEN** | No controlled paid Rapid Resolution transaction, webhook, customer/admin notifications, provider event readback or refund receipt has passed end to end. |
| Phone/contact channel | **PRODUCTION OPEN** | The phone action is visible locally. Inside-hours, outside-hours, voicemail, missed-call handling and response SLA remain untested. |
| Checkout trust | **PRODUCTION OPEN** | Source sends Fabsy line-item names. Hosted Stripe identity is still evidenced as `execom`; changing and verifying the public business name/descriptor is a provider task. |
| Meta optimisation | **PRODUCTION OPEN** | Events Manager must show the dataset category/restriction state and live event health before selecting Sales, Leads or a documented proxy objective. |
| Google optimisation | **PRODUCTION OPEN** | A controlled conversion must read back with transaction ID before Purchase becomes a primary bidding signal. |
| Mobile performance | **PRODUCTION OPEN** | Local 360×640 and 390×844 layout checks exist. Real iOS in-app-browser and saved Slow 4G Lighthouse evidence remain open. |
| Governance and evidence | **PRODUCTION OPEN** | Release owner, independent reviewer, production bundle hash, provider screenshots, one-click pause test, final IDs/URLs and separate GO/spend records are absent. |

**Overall: NO-GO until every production-open and owner-input item required for the selected platform is closed.**

## Build and verification runbook

Complete these in order. A failure returns the release to the prior step.

1. **Finish the isolated local release.** Run typecheck, lint on changed files, the full measurement suite, upload/intake tests, public-offer guardrails and a production build. Freeze the source revision and artifact hashes.
2. **Deploy without enabling ads.** Record source commit, deployment ID, production bundle name and SHA-256. Confirm the exact production URL serves that bundle.
3. **Verify the offer on production.** At 390×844, 360×640 and 1440×900, capture before/after-consent screenshots. Confirm the outcome, qualified service-fee refund, $198 + GST, primary Upload action and real phone action are visible without obstruction. Crawl one-tap destinations for banned guarantee/payment wording.
4. **Pressure-test the intake.** Create a designated QA lead; verify private upload, staff visibility, autosave, refresh, Back, app switch, copied cross-device resume link, OCR timeout, upload failure, canceled checkout and retry. Confirm representation consent is always fresh and no capability token appears in a query string or log.
5. **Verify production measurement.** With explicit consent, prove one row for each funnel event and its position/step. With decline and undecided states, prove optional Fabsy, Google and Meta measurement remains off. Confirm no form value, file, name, email, phone, IP, user agent or raw click ID reaches `paid_funnel_events` or the private payment ledger. Verify that a non-consenting payment has financial facts but no funnel-session link, and that no refund fact is forwarded to Google or Meta.
6. **Prove attribution across systems.** Use designated test UTMs and click IDs. Show the session/draft/case/checkout relationship and the correct campaign/content in the reporting output. Treat first-party metrics as consented-cohort metrics and document measurement coverage rather than interpreting missing non-consenting visitors as abandonment.
7. **Run one controlled paid journey and refund.** This requires separate transaction authorization. Capture Stripe payment and webhook, thank-you state, draft/case conversion, customer email, admin email/SMS, Meta browser/server deduplication, Google conversion, hashed purchase/refund ledger rows and the operator refund with timestamps and IDs. Replay the signed events and verify partial/multiple refund totals. Verify the 30-day policy logic without delaying the immediate QA refund.
8. **Verify channels and providers.** Test the published phone number in and out of hours, contact email receipt/SLA, Stripe Fabsy identity, Meta restriction status/objective, Google conversion status, final destinations, placements, budget controls and one-click pause. Delete the Fable QA records/files only under a separately reviewed cleanup action.
9. **Independent review and GO.** A reviewer who did not build the release checks the evidence folder, reconciles counts and signs the readiness record. Brett supplies the economics inputs and signs maximum CAC/CPL/CPC and maximum loss.
10. **Separate spend authorization.** Only after GO, record platform, campaign IDs, daily cap, total cap, start/end and tax treatment. Until that record exists, campaigns remain paused.

Any code deploy to the landing page, intake, checkout or measurement after step 9 invalidates GO and returns to step 2.

## Controlled paid-test rules

These rules define a bounded experiment; they do not authorize one. Let `C` be the approved maximum CAC, `L` the approved maximum CPL and `A` the separately approved maximum media loss.

- **Stage 1 total cap:** no more than `min(A, 3 × C)`.
- **Daily cap:** a separate amount recorded in the spend authorization and never inferred from `A`.
- **One variable at a time:** freeze the landing page and audience while testing creative. Pause an old ad and create a traceable replacement; do not rewrite a live ad in place.
- **First formal funnel review:** after at least 300 consented first-party landing sessions and enough time for delayed conversions. Do not call a creative winner before 300 consented landing sessions per creative.
- **Immediate technical pause:** any checkout failure, claim/policy notice, wrong destination, unexpected provider setting, broken phone route, event regression, missing production receipt, or loss of the one-click pause control.
- **Zero-lead pause:** stop no later than `min(A, 3 × L)` of spend with zero qualified leads.
- **Zero-purchase pause:** stop no later than `min(A, 3 × C)` of spend with zero purchases.
- **Cost pause:** after at least 20 qualified leads, pause if CPL exceeds `2 × L`; after at least 5 purchases, pause if CAC exceeds `2 × C`.
- **Measurement pause:** pause if a controlled opted-in journey loses an expected event, attribution link or deduplication key, or if reconciled counts differ by more than 30% without a documented consent/provider explanation.
- **Scale gate:** at least 8 purchases, observed CAC at or below `C`, the 90% upper confidence bound below `1.5 × C`, refund rate no higher than the approved model input, and at least 2× capacity headroom. Each later budget increase requires a new written cap and ten additional purchases at or below `C`.
- **No cross-platform overlap at first:** run one platform long enough to reach a decision before opening the other, unless the approved design explicitly budgets and identifies both cohorts.

Daily reporting must show spend, impressions, CPM, unique clicks, platform landing views, consented first-party landing sessions, CTA and phone actions by position, intake starts, uploads, saved leads, qualified leads, step drop-off, checkout starts/cancels, purchases, refunds, CPL, CAC, refund-adjusted ROAS, provider warnings and any pause action with its timestamp. “No data” and “not measurable” must never be reported as zero.

## Restart record

| Field | Required entry |
|---|---|
| Release owner | Name |
| Independent reviewer | Name; cannot be the implementer |
| Source commit / deployment / bundle SHA-256 | Values |
| Production evidence folder | Repository path |
| Platform and campaign/ad group/ad IDs | Values |
| Final URLs and attribution parameters | Values |
| Objective, conversion event and provider restriction readback | Values and screenshots |
| Maximum CAC / CPL / break-even CPC | Owner-approved values |
| Daily cap / total cap / start / end / taxes | Separately authorized values |
| One-click pause test | Operator, timestamp and seconds to confirmed pause |
| GO decision | Reviewer and timestamp |
| Spend authorization | Brett and timestamp; separate from GO |

## Sources and local verification

- Independent baseline: `/Users/brettbilon/.codex/attachments/fb64f75c-1494-4451-badf-2a741014137f/pasted-text.txt` (production review dated September 3, 2026).
- Rapid Resolution first view and consent: commit `693b0119`, `src/pages/RapidResolution.tsx`, `src/components/GoogleConsent.tsx`.
- Homepage conversion correction: commit `377769e8`, `src/components/Hero.tsx`, `src/components/Header.tsx`, `src/components/CallBar.tsx`, `docs/paid-acquisition/2026-09-03-homepage-conversion-readiness.md`.
- Intake draft backend and frontend: commits `bc6e26e2` and `aa807b9a`, `supabase/migrations/20260903120000_ticket_intake_drafts.sql`, `supabase/functions/ticket-intake-draft/`, `supabase/functions/submit-ticket/`, `src/hooks/useTicketIntakeDraft.ts`, `src/components/TicketForm.tsx`.
- Local first-party funnel contract: `src/lib/funnelMeasurement.ts`, `src/lib/fabsyFunnelConsent.ts`, `src/lib/marketingAttribution.ts`, `supabase/functions/record-funnel-event/`, `supabase/migrations/20260903170000_paid_funnel_measurement.sql`.
- Local aggregate reporting: `src/pages/AdminPaidFunnel.tsx`, `supabase/functions/paid-funnel-report/`, `supabase/migrations/20260903173000_paid_funnel_reporting.sql`.
- Refund terms and operator clock: `docs/paid-acquisition/2026-08-31-fee-refund-offer/refund-policy-operations.md`.
- Hosted checkout blocker: `docs/paid-acquisition/2026-09-03-homepage-conversion-readiness.md` and `docs/photo-radar/stripe-provisioning.json`.
- Independently rerun while preparing this document: funnel contract **7/7 pass**; aggregate-report contract **3/3 pass**; public-offer guardrails **211 pass**; homepage conversion checks **11/11 pass**; intake serialization/resume **5/5 pass**; retired-cache contract **3/3 pass**; intake date-handoff suite **pass**.

No production deployment, provider change, charge, refund, campaign activation or advertising spend occurred while preparing this document.
