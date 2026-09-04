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

The production baseline remains the Fable Five review performed September 3, 2026 against `https://fabsy.ca`. Fable Five's September 4 review of local commit `f2fde2ae` returned **LOCAL CODE QC: FAIL** and **PRODUCTION READINESS: NO-GO**. The findings from that second review are now remediated in this isolated worktree, but none of the replacement code is deployed. Work since the review remains local preparation only.

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
| Rapid Resolution first view | **LOCAL PASS / PRODUCTION OPEN** | The page places the outcome, qualified fee-refund condition, $198 + GST, Upload and Call in the first view. Fresh 360×560, 360×640 and 390×844 in-app-browser captures show all five visible and the 104 px initial consent panel beginning below Upload and Call. Public-offer and visual guardrails pass locally. Real-device and production proof remain required. |
| Homepage promise and actions | **LOCAL PASS / PRODUCTION OPEN** | Source and refreshed English crawler snapshots reject “you don't pay” and “Success guaranteed”, retain the qualified service-fee promise, and label hero/header/sticky/phone actions. The mobile sticky bar is hidden while the initial consent panel is open, so it cannot collide with that panel. This work is not live. |
| Minimum lead and survivable intake | **LOCAL PASS / PRODUCTION OPEN** | Commits `bc6e26e2` and `aa807b9a` use a private capability-addressed draft, ticket plus email or phone, Alberta confirmation and contact permission; autosave/resume, Back/refresh, canceled-checkout recovery, converted-intake recovery, and wrong-ticket replacement in English and localized journeys are covered locally. The mounted ticket suite passes 29 UI cases plus 13 lower-level intake-draft cases. The staff queue now has staff-only, audited open/contacted/dismissed handling with optimistic conflict protection; it deliberately cannot resend or expose a customer capability. The migrations, storage upload and staff queue need live proof. |
| Resume capability and delivery | **LOCAL PASS / PRODUCTION OPEN** | Commits `3f626662` and `3d182b48` add recoverable 256-bit capability rotation, an explicit delivery gate and a safe copy-link fallback. The later abuse-control migration enforces a five-send lifetime limit, ten-attempt hourly throttle, NANP-only SMS and converted-row denial. Provider delivery is disabled by default. Production provider setup, recipient delivery and cross-device resume still need proof. |
| Draft and object retention | **LOCAL PASS / PRODUCTION OPEN** | Bounded expired-draft cleanup and the service-only exact-path object-deletion queue retain queue fairness, stale-claim recovery, Storage retry and fail-closed scheduler validation. Migration `20260903191000` deletes redundant converted draft rows 24 hours after expiry without deleting the canonical case document or creating a folder tombstone, and changes the two blocking foreign keys to cascade. Disposable PostgreSQL erasure and replacement-document regressions pass. Historical orphan enumeration and QA-record deletion remain separately reviewed production cleanup actions. |
| Legacy browser ticket cache | **LOCAL PASS / PRODUCTION OPEN** | Local hook is a deterministic no-op and the old edge endpoint is a `410` tombstone. Historical rows were not deleted. Deployment and live endpoint readback remain open. |
| First-party funnel events | **LOCAL PASS / PRODUCTION OPEN** | Local contract covers landing view, CTA, phone, intake start, upload, lead saved, step completion, checkout start, checkout cancel and purchase. The contract is explicit-consent gated, PII-free and stores only a hash of one click ID. Fifteen focused tests include consent-loss races and stale-attribution retirement. No production rows exist. |
| First-party funnel reporting | **LOCAL PASS / PRODUCTION OPEN** | A staff-gated aggregate report and admin view show event and unique-session totals by campaign/creative and label all figures as consented-session counts. Three focused contract tests pass. Production authorization, rows and reconciliation remain open. |
| Purchase/refund cash ledger | **LOCAL PASS / PRODUCTION OPEN** | A signed-Stripe-webhook-only, PII-free ledger records order-level gross purchases and distinct partial/multiple refund objects using hashed Stripe identifiers. Refund events dated before the ledger's 2026 inception are explicit no-ops rather than poison rows. Aggregate reporting separates all-customer financial totals from consented funnel metrics and reports a purchase-cohort any-refund rate. Refund business reason, net-retained status, production rows and controlled payment/refund proof remain open. |
| Attribution | **LOCAL PARTIAL** | Safe paid UTMs and `fbclid`, `gclid`, `gbraid`, `wbraid` are accepted locally and retained only after first-party consent. End-to-end linkage from session to draft, final case, checkout and provider conversion is not yet proven. |
| Consent | **LOCAL PASS / PRODUCTION OPEN** | The initial mobile choice is compact locally, focusable controls and validation are labelled for assistive technology, and optional Fabsy, Google and Meta measurement remains explicit. Withheld, removed and expired consent clears durable and in-memory attribution before later dispatch. Public-offer guardrails pass. Declined and undecided journeys must be rechecked after deployment. First-party funnel rates represent consented sessions only. |
| Checkout attribution withdrawal | **LOCAL PASS / PRODUCTION OPEN** | Commit `bf250b31` serializes checkout record/withdraw/purchase state behind private service-only RPCs and irreversible withdrawal tombstones. The disposable PostgreSQL fence suite passes; production cross-tab withdrawal, checkout cancellation and signed-webhook reconciliation remain open. |
| Purchase, refund and notifications | **LOCAL PASS / PRODUCTION OPEN** | Pre-ledger refund events are ignored before any RPC. Notification dispatch has a database claim fence; a crashed or timed-out claim becomes `indeterminate` and requires manual review rather than an automatic duplicate send. Converted drafts cannot authorize a new resume email or SMS. No controlled paid Rapid Resolution transaction, webhook, customer/admin notification, provider event readback or refund receipt has passed end to end. |
| Phone/contact channel | **PRODUCTION OPEN** | The phone action is visible locally. Inside-hours, outside-hours, voicemail, missed-call handling and response SLA remain untested. |
| Checkout trust | **PRODUCTION OPEN** | Source sends Fabsy line-item names. Hosted Stripe identity is still evidenced as `execom`; changing and verifying the public business name/descriptor is a provider task. |
| Meta optimisation | **PRODUCTION OPEN** | Events Manager must show the dataset category/restriction state and live event health before selecting Sales, Leads or a documented proxy objective. |
| Google optimisation | **PRODUCTION OPEN** | A controlled conversion must read back with transaction ID before Purchase becomes a primary bidding signal. |
| Mobile performance | **LOCAL PASS / PRODUCTION OPEN** | Fresh local 360×560, 360×640 and 390×844 screenshots and exact DOM geometry show the initial consent panel does not cover the H1, promise, refund line, price, Upload or Call; the competing sticky bar is hidden until the initial choice closes. Real iOS in-app-browser and saved Slow 4G Lighthouse evidence remain open. |
| Governance and evidence | **LOCAL PASS / PRODUCTION OPEN** | Schema-v2 launch control verifies unique typed receipts for all 21 gates, repository-backed supporting artifacts, the exact required migration/function/transitive shared-source inventory bound unchanged to the deployed commit and clean worktree, a canonical same-origin `/assets/*.js` production bundle, and exact reviewed provider-specific Meta or Google UTM contracts. It also requires the canonical `https://fabsy.ca/rapid-resolution` landing path, an immutable deployed tag, captured production bundle bytes, deployment/provider receipts, backend-first ordering, fresh timestamps, distinct stable actor identities, campaign/provider IDs, objective eligibility and dataset restriction. CI accepts the current honest `NO_GO` record but rejects schema/evidence drift or an unsupported `GO`. The record remains `NO_GO` because production, provider, owner, review and spend evidence is absent. |

**Overall: NO-GO until every production-open and owner-input item required for the selected platform is closed.**

## Build and verification runbook

Complete these in order. A failure returns the release to the prior step.

1. **Freeze the isolated local release.** Keep the ads paused. Run typecheck, changed-file lint, Deno checks, all four disposable PostgreSQL suites, the full measurement and upload/intake suites, public-offer guardrails and a production build. Freeze the source revision and artifact hashes.
2. **Apply database migrations in order.** Apply `20260903120000_ticket_intake_drafts.sql`, `20260903170000_paid_funnel_measurement.sql`, `20260903173000_paid_funnel_reporting.sql`, `20260903180000_ticket_intake_resume_delivery.sql`, `20260903181000_ticket_intake_draft_cleanup.sql`, `20260903182000_ticket_intake_rotation_recovery.sql`, `20260903183000_paid_funnel_checkout_withdrawal_fence.sql`, `20260903184000_paid_payment_refund_ledger.sql`, `20260903185000_paid_payment_reporting.sql`, `20260903190000_ticket_intake_object_deletion_queue.sql`, `20260903191000_ticket_intake_converted_retention.sql`, `20260903192000_ticket_intake_delivery_abuse_controls.sql`, `20260903193000_ticket_submission_notification_idempotency.sql`, then `20260903194000_ticket_intake_staff_follow_up.sql`. Stop on any failure; do not deploy code against a partial schema.
3. **Deploy server functions against the completed schema.** Deploy the `cache-ticket-data` tombstone, `ticket-intake-draft`, `submit-ticket`, `cleanup-ticket-intake-drafts`, `withdraw-meta-measurement`, `record-funnel-event`, `paid-funnel-report`, `send-notification` and `idr-payment-webhook` functions. Verify the signed webhook, then deploy `create-payment`; never reverse those two steps. Do not accept a controlled checkout until the webhook is ready.
4. **Install and prove cleanup scheduling.** Configure the existing GitHub `SUPABASE_URL` and service-role secrets. Leave repository variable `TICKET_INTAKE_CLEANUP_SCHEDULE_ENABLED` unset or anything other than `true`, manually dispatch the cleanup workflow, and require a coherent zero-deferred response. Record that proof, then set the variable to exactly `true`; scheduled runs are skipped until this happens. Provider resume delivery remains a separate opt-in and the copy-link fallback stays available while it is off.
5. **Deploy the frontend last without enabling ads.** These repository workflows do not deploy the frontend on merges, ordinary pushes or prerender-refresh runs; any separate provider Git integration remains a production readback requirement. The snapshot writer must start from `main` and abort if `origin/main` moves while it renders; it never rebases older generated output onto newer source. After the backend evidence above passes, set `FABSY_FRONTEND_DEPLOY_COMMIT` to the exact 40-character source commit, manually dispatch `build.yml` on that same `main` commit with `deploy_frontend=true`, the same commit in `backend_release_commit`, and `BACKEND_READY_FRONTEND_LAST` as the confirmation. A source change makes the pin stale and blocks later deployment until backend verification is repeated. Record source commit, immutable annotated `paid-acquisition-*` tag, deployment ID, production bundle capture and SHA-256; confirm the production URL serves those exact bytes.
6. **Verify the offer on production.** Use the canonical `https://fabsy.ca/rapid-resolution` landing path for the release and every provider destination, with only reviewed attribution query parameters on provider URLs and no fragments. At 390×844, 360×640 and 1440×900, capture before/after-consent screenshots. Confirm the outcome, qualified service-fee refund, $198 + GST, primary Upload action and real phone action are visible without obstruction. Crawl one-tap destinations for banned guarantee/payment wording.
7. **Pressure-test the intake and trusted proxy boundary.** Create a designated QA lead; verify private upload, staff visibility, autosave, refresh, Back, app switch, copied cross-device resume link, OCR timeout, upload failure, canceled checkout and retry. In staging and production, prove Supabase Edge supplies the trusted `cf-connecting-ip` header to the draft, funnel and submission functions. Those functions deliberately ignore client-controlled `X-Forwarded-For` and `X-Real-IP`; if the trusted header is absent, all callers share the conservative `unknown` rate-limit bucket and public traffic stays paused. Confirm representation consent is always fresh and no capability token appears in a query string or log.
8. **Verify production measurement.** With explicit consent, prove one row for each funnel event and its position/step. With decline and undecided states, prove optional Fabsy, Google and Meta measurement remains off. Confirm no form value, file, name, email, phone, IP, user agent or raw click ID reaches `paid_funnel_events` or the private payment ledger. Verify that a non-consenting payment has financial facts but no funnel-session link, and that no refund fact is forwarded to Google or Meta.
9. **Prove attribution across systems.** Use designated test UTMs and click IDs. Show the session/draft/case/checkout relationship and the correct campaign/content in the reporting output. Treat first-party metrics as consented-cohort metrics and document measurement coverage rather than interpreting missing non-consenting visitors as abandonment.
10. **Run one controlled paid journey and refund.** This requires separate transaction and refund authorization. Capture Stripe payment and webhook, thank-you state, draft/case conversion, customer email, admin email/SMS, Meta browser/server deduplication, Google conversion, hashed purchase/refund ledger rows and the operator refund with timestamps and IDs. Replay the signed events and verify partial/multiple refund totals. Verify the 30-day policy logic without delaying the immediate QA refund.
11. **Verify channels and providers.** Test the published phone number in and out of hours, contact email receipt/SLA, Stripe Fabsy identity, Meta restriction status/objective, Google conversion status, final destinations, placements, budget controls and one-click pause. Delete the Fable QA records/files only under a separately reviewed cleanup action.
12. **Verify retention and close business inputs.** Prove the converted-draft 24-hour post-expiry deletion and foreign-key erasure behavior after deployment, choose a documented policy for historical orphans, and supply the refund/support/profit/capacity/fee inputs needed to calculate maximum CAC, CPL, CPC and loss.
13. **Independent review and GO.** Each PASS gate uses its own typed `paid-acquisition-gate-evidence` receipt tied to the source commit and captured before review, followed by the exact supporting artifacts named by that receipt. A receipt cannot be reused for another gate. A reviewer who did not build the release checks the evidence folder and manifest, reconciles counts and signs the readiness record. Record stable actor IDs as well as names. Release owner, independent reviewer, GO approver and spend authorizer are four distinct roles; case/spacing aliases do not create distinct identities. The GO approver also signs the economics and maximum loss.
14. **Separate spend authorization.** Only after GO, record platform, campaign IDs, daily cap, total cap, start/end and tax treatment. Until that record exists, campaigns remain paused.

Any code deploy to the landing page, intake, checkout or measurement after the independent review in step 13 invalidates GO and returns to step 2.

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
| Release owner | Name and stable actor ID |
| Independent reviewer | Name and stable actor ID; distinct from all approval roles |
| Source commit / immutable deployed tag / deployment / captured bundle SHA-256 | Matching values and deployment receipt |
| Production evidence folder | Committed repository path and SHA-256 manifest |
| Platform, account, campaign, ad group and ad IDs | Values and provider readback receipt |
| Final URLs and attribution parameters | Values |
| Objective, optimization event, dataset/conversion IDs and restriction eligibility | Values and committed provider evidence |
| Maximum CAC / CPL / break-even CPC | Owner-approved values |
| Daily cap / total cap / start / end / taxes | Separately authorized values |
| One-click pause test | Operator, timestamp and seconds to confirmed pause |
| Supabase trusted proxy header | Staging and production evidence that Edge supplies `cf-connecting-ip` |
| GO decision | Distinct GO approver ID and timestamp after independent review |
| Spend authorization | Distinct authorizer ID and timestamp after GO; separate from readiness |

## Sources and local verification

- Independent baseline: `/Users/brettbilon/.codex/attachments/fb64f75c-1494-4451-badf-2a741014137f/pasted-text.txt` (production review dated September 3, 2026).
- Rapid Resolution first view and consent: commit `693b0119`, `src/pages/RapidResolution.tsx`, `src/components/GoogleConsent.tsx`.
- Homepage conversion correction: commit `377769e8`, `src/components/Hero.tsx`, `src/components/Header.tsx`, `src/components/CallBar.tsx`, `docs/paid-acquisition/2026-09-03-homepage-conversion-readiness.md`.
- Intake draft backend and frontend: commits `bc6e26e2` and `aa807b9a`, `supabase/migrations/20260903120000_ticket_intake_drafts.sql`, `supabase/functions/ticket-intake-draft/`, `supabase/functions/submit-ticket/`, `src/hooks/useTicketIntakeDraft.ts`, `src/components/TicketForm.tsx`.
- Local first-party funnel contract: `src/lib/funnelMeasurement.ts`, `src/lib/fabsyFunnelConsent.ts`, `src/lib/marketingAttribution.ts`, `supabase/functions/record-funnel-event/`, `supabase/migrations/20260903170000_paid_funnel_measurement.sql`.
- Local aggregate reporting: `src/pages/AdminPaidFunnel.tsx`, `supabase/functions/paid-funnel-report/`, `supabase/migrations/20260903173000_paid_funnel_reporting.sql`.
- Checkout withdrawal fence: commit `bf250b31`, `supabase/migrations/20260903183000_paid_funnel_checkout_withdrawal_fence.sql`.
- Purchase/refund cash ledger: commit `a40699a1`, `supabase/migrations/20260903184000_paid_payment_refund_ledger.sql`, `supabase/migrations/20260903185000_paid_payment_reporting.sql`.
- Draft/object retention: commits `0d43a827`, `2b2136e0`, `c7eff24c`, `supabase/migrations/20260903181000_ticket_intake_draft_cleanup.sql`, `supabase/migrations/20260903190000_ticket_intake_object_deletion_queue.sql`, `supabase/migrations/20260903191000_ticket_intake_converted_retention.sql`, `.github/workflows/ticket-intake-draft-cleanup.yml`.
- Resume-delivery abuse control and notification idempotency: `supabase/migrations/20260903192000_ticket_intake_delivery_abuse_controls.sql`, `supabase/migrations/20260903193000_ticket_submission_notification_idempotency.sql`, `supabase/functions/ticket-intake-draft/index.ts`, `supabase/functions/send-notification/index.ts` and `supabase/functions/cleanup-ticket-intake-drafts/index.ts`.
- Fail-closed launch control: schema-v2 `scripts/paid-acquisition-readiness.mjs`, adversarial `scripts/test-paid-acquisition-readiness-control.mjs`, `docs/paid-acquisition/2026-09-03-restart-readiness.json`, and the build/prerender workflow deployment gates.
- Refund terms and operator clock: `docs/paid-acquisition/2026-08-31-fee-refund-offer/refund-policy-operations.md`.
- Hosted checkout blocker: `docs/paid-acquisition/2026-09-03-homepage-conversion-readiness.md` and `docs/photo-radar/stripe-provisioning.json`.
- The remediation is based on local parent `f2fde2aeb1d633f3ae432e9758f3bc823a1cac7f` on `codex/paid-acquisition-readiness`, itself based on `de4ba6137c63e2abe7f8a055b671573e9e84c43a`. The successor evidence folder records the final remediation commit and hashes.
- A browser-configured `npx vite build` passed and emitted `dist/assets/index-C8cSYGwa.js` (`4dfcab4fd488a2f007d21ae1b159a2fe335ecf623082f7a36c51995b8a3e0fdd`), `dist/assets/index-sIGPoD9p.css` (`802cb7f0bcc43331de3328fca16d6d0142453f181c60e2db58e21767af1cf866`) and `dist/index.html` (`41e15a6f70d4c5c1ffecd96f7446ad3910792ce6d74ceca6d918144cc32e3827`). The matching English homepage and Rapid Resolution crawler snapshots hash to `29e3f2352910ee4bc6c0e942393c6d83f1935a617d99f4835b316b6bd882c89f` and `63a7b1852786f4862b25d8d213b89c1f5325eab9104166fd613826e258603238`. These are local artifacts, not production bytes. The release `npm run build` remains deliberately blocked because the Privacy Policy source changed and all seven non-English legal-publication fingerprints require a fresh owner attestation; no translation approval was fabricated.
- Post-review local verification passes: measurement including **15/15** funnel tests; ticket UI **29/29** plus **13** intake-draft tests; Deno draft/resume/cleanup **35/35**; all four disposable PostgreSQL migration/concurrency suites, including staff follow-up lifecycle; cleanup workflow response contract **7/7**; public-offer guardrails **211**; homepage conversion **11/11**; homepage visual **37**; SEO/content/runtime guardrails; both TypeScript configs; changed-file ESLint with **0 errors / 1 existing hook warning**; Actionlint and diff check. Fresh English homepage and Rapid Resolution crawler snapshots are bound to the same local JS/CSS bundle and exclude the retired claims. The replacement readiness suite constructs committed Git/tag/evidence fixtures and rejects missing/unlisted files, hash drift, fake commits/refs, future or stale attestations, role aliases, hostile bundle paths, shared-source drift, invalid provider UTMs and invalid deployment/approval order.
- The repository-wide lint command remains baseline-broken at **36 errors / 22 warnings** in pre-existing unrelated files. The changed-file lint gate has no error. `npm run ads:readiness` deliberately reports **NO-GO** because production, owner, review and spend evidence remains absent; `npm run ci:ads-readiness` treats that honest record as CI-valid while still rejecting structural or evidence-integrity failures.
- The September 4 launch-blocking findings and the remediated P2 items named above are closed locally in source and regression coverage. Staff follow-up disposition is implemented; staff-controlled resend is intentionally absent because the browser and database do not retain the raw customer capability. Adding resend would require a separately reviewed authenticated server action with capability rotation, consent/expiry checks, lifetime and action throttles, provider claims and an audit trail. Fable's lower-priority follow-ups remain tracked. Independent re-review of the final remediation branch is still required, and a local pass still does not close any production/provider gate.

No production deployment, provider change, charge, refund, campaign activation or advertising spend occurred while preparing this document.
