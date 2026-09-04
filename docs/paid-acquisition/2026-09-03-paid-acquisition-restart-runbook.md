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

The production baseline remains the Fable Five review performed September 3, 2026 against `https://fabsy.ca`. Fable Five's September 4 review of local commit `f2fde2ae` returned **LOCAL CODE QC: FAIL** and **PRODUCTION READINESS: NO-GO**. A later adversarial review also found an initial-load consent-expiry gap, a fail-open evidence handoff, environment-dependent local build hashes, and mislabeled screenshot files. The source fixes are prepared in this isolated worktree; the evidence defects must be replaced and pinned in its successor evidence commit before a fresh independent review. None of the replacement code is deployed. Work since the review remains local preparation only.

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
| Rapid Resolution first view | **LOCAL PASS / PRODUCTION OPEN** | The page and DOM geometry at CSS viewports 360×560, 360×640 and 390×844 place the outcome, qualified fee-refund condition, $198 + GST, Upload and Call above the 104 px initial consent panel. The legacy image files are scaled JPEGs under `.png` names and are invalid exact-size evidence; evidence commit `E` must replace them with correctly encoded captures that bind CSS viewport, raster dimensions, DPR/capture scale and SHA-256. Public-offer and visual guardrails pass locally. Real-device and production proof remain required. |
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
| Meta optimisation | **PRODUCTION OPEN** | The reviewed restart contract is objective `SALES` with optimization goal `PURCHASE`. Events Manager must supply the dataset ID, actual `RESTRICTED` or `UNRESTRICTED` state, eligibility and live event health. No Leads or proxy objective satisfies this release record. |
| Google optimisation | **PRODUCTION OPEN** | The reviewed restart contract is objective `SALES` with optimization goal `PURCHASE`, no dataset ID, restriction `NOT_APPLICABLE`, and at least one verified conversion-action ID. A controlled conversion must read back with transaction ID before Purchase becomes a primary bidding signal. |
| Mobile performance | **LOCAL PASS / PRODUCTION OPEN** | DOM geometry at CSS viewports 360×560, 360×640 and 390×844 shows the initial consent panel does not cover the H1, promise, refund line, price, Upload or Call; the competing sticky bar is hidden until the initial choice closes. The legacy mislabeled captures are invalid and `E` must replace and bind them as described above. Real iOS in-app-browser and saved Slow 4G Lighthouse evidence remain open. |
| Governance and evidence | **LOCAL PASS / PRODUCTION OPEN** | Schema-v3 launch control requires a clean three-commit handoff: reviewed source, exact committed evidence manifest, then a readiness-only commit that pins both. The manifest must exactly cover the candidate diff, every referenced artifact must be committed and unchanged, and release-critical source cannot drift after `localReview.sourceCommit` (`S`). Unique typed receipts for all 21 gates reject explicit negative support, pre-deployment PASS claims and invented provider objective/goal pairs. Production GO also requires the exact backend inventory, canonical landing and same-origin bundle, immutable tag, captured bundle bytes, backend-first timestamps, distinct stable actors, provider IDs and restriction eligibility. A record that references repository evidence while `localReview` is null is integrity-invalid; CI accepts a committed honest `NO_GO` only after its evidence chain is intact. Production, provider, owner, review and spend evidence remain absent. |

**Overall: NO-GO until every production-open and owner-input item required for the selected platform is closed.**

The current record has **0 of 21 gates at production PASS**: gates 1, 2 and 20 are `OWNER_INPUT`; gates 3–9, 15–17 and 19 are `LOCAL_PASS_PRODUCTION_OPEN`; and gates 10–14, 18 and 21 are `PRODUCTION_OPEN`. In addition to those gate outcomes, the handoff needs a clean pinned local-review chain; production GO needs owner publication of all seven pending legal-language revisions, a passing normal `npm run build`, deployment and bundle receipts, economics and operations approvals, typed phone/notification/Stripe/trusted-proxy receipts, a paused provider readback, independent review and written GO; spend authorization is a later separate act.

## Build and verification runbook

Complete these in order. A failure returns the release to the prior step.

1. **Freeze the isolated source.** Keep the ads paused. The release owner and independent reviewer must first name the agreed review baseline `B`; schema 3 proves only that `B` is an ancestor of `S`, so the humans must reject a self-selected later baseline that hides candidate changes. For this remediation the initial baseline is `f2fde2aeb1d633f3ae432e9758f3bc823a1cac7f`; a later rollover uses the prior accepted readiness boundary. Run typecheck, changed-file lint, Deno checks, all four disposable PostgreSQL suites, the full measurement and upload/intake suites and public-offer guardrails, then commit source `S`. Check out that exact commit with the recorded Node version and `npm ci`; run `npm run build:evidence` twice and require an identical complete `dist/` hash inventory. This synthetic, provider-disabled build is only for reproducible local rendering; it is not a production build and cannot close a production measurement gate. A pre-deployment `NO_GO` review may use a terminal local chain `S → local-evidence E → readiness R`. A later production attempt on this lineage needs a fresh source commit `S2` descended from `R`. In `S2`, reset the readiness JSON to an evidence-free pre-deployment `NO_GO`: `localReview` is null; all gate evidence arrays and repository evidence-path fields are empty or null; every evidence-dependent `LOCAL_PASS_PRODUCTION_OPEN` gate is reset to `PRODUCTION_OPEN`; release/provider/operations/review receipt fields are null; and deployment timestamps remain null. This exact reset must itself pass both `npm run test:ads-readiness` and `npm run ci:ads-readiness`. It is required because `build.yml` runs both commands before deployment and schema 3 correctly rejects both the old `S → E → R` handoff when checked at `S2` and a local-pass status whose supporting evidence has been cleared. The release-critical application tree may remain byte-identical, but the whole tree is not identical because the readiness record is reset. Then collect fresh production evidence in `E2` and commit the completed readiness record in `R2`; appending production evidence to the terminal local chain invalidates it. The normal `npm run build` remains a separate owner-gated release check.

   **Terminal local re-review path.** After the two deterministic evidence builds and local test suite pass at `S`, commit only the local evidence directory plus its exact candidate manifest as direct child `E`. The independent reviewer reviews `E`. Then commit only the readiness JSON as direct child `R`, set all seven `localReview` fields to the exact `B`, `S`, `E`, readiness path, evidence directory, manifest path and manifest entry count, and keep `decision: NO_GO` with every production, provider, GO and spend field open or null. Require a clean repository and `npm run ci:ads-readiness` with zero schema or integrity failures, then stop. Steps 2–14 are the later production `S2 → E2 → R2` path; they do not need to run merely to close local code QC.

In steps 2–14, `S → E → R` means the active production chain; after a terminal local review it means the fresh `S2 → E2 → R2` chain.
2. **Apply database migrations in order.** Apply `20260903120000_ticket_intake_drafts.sql`, `20260903170000_paid_funnel_measurement.sql`, `20260903173000_paid_funnel_reporting.sql`, `20260903180000_ticket_intake_resume_delivery.sql`, `20260903181000_ticket_intake_draft_cleanup.sql`, `20260903182000_ticket_intake_rotation_recovery.sql`, `20260903183000_paid_funnel_checkout_withdrawal_fence.sql`, `20260903184000_paid_payment_refund_ledger.sql`, `20260903185000_paid_payment_reporting.sql`, `20260903190000_ticket_intake_object_deletion_queue.sql`, `20260903191000_ticket_intake_converted_retention.sql`, `20260903192000_ticket_intake_delivery_abuse_controls.sql`, `20260903193000_ticket_submission_notification_idempotency.sql`, then `20260903194000_ticket_intake_staff_follow_up.sql`. Stop on any failure; do not deploy code against a partial schema.
3. **Deploy server functions against the completed schema.** Deploy the `cache-ticket-data` tombstone, `ticket-intake-draft`, `submit-ticket`, `cleanup-ticket-intake-drafts`, `withdraw-meta-measurement`, `record-funnel-event`, `paid-funnel-report`, `send-notification` and `idr-payment-webhook` functions. Verify the signed webhook, then deploy `create-payment`; never reverse those two steps. Do not accept a controlled checkout until the webhook is ready.
4. **Install and prove cleanup scheduling.** Configure the existing GitHub `SUPABASE_URL` and service-role secrets. Leave repository variable `TICKET_INTAKE_CLEANUP_SCHEDULE_ENABLED` unset or anything other than `true`, manually dispatch the cleanup workflow, and require a coherent zero-deferred response. Record that proof, then set the variable to exactly `true`; scheduled runs are skipped until this happens. Provider resume delivery remains a separate opt-in and the copy-link fallback stays available while it is off.
5. **Deploy the frontend last without enabling ads.** These repository workflows do not deploy the frontend on merges, ordinary pushes or prerender-refresh runs; any separate provider Git integration remains a production readback requirement. The snapshot writer must start from `main` and abort if `origin/main` moves while it renders; it never rebases older generated output onto newer source. After the backend evidence above passes, set `FABSY_FRONTEND_DEPLOY_COMMIT` to the exact 40-character source commit, manually dispatch `build.yml` on that same `main` commit with `deploy_frontend=true`, the same commit in `backend_release_commit`, and `BACKEND_READY_FRONTEND_LAST` as the confirmation. The workflow uses `npm ci`, configured production Supabase/provider values and the normal `npm run build` prebuild/postbuild path. Never deploy `build:evidence` output or record its hashes in `release.bundle*`; capture the canonical post-deploy `/assets/*.js` bytes instead, whose hash is expected to differ. A source change makes the pin stale and blocks later deployment until backend verification is repeated. Record source commit, immutable annotated `paid-acquisition-*` tag, deployment ID, production bundle capture and SHA-256; confirm the production URL serves those exact bytes.
6. **Verify the offer on production.** Use the canonical `https://fabsy.ca/rapid-resolution` landing path for the release and every provider destination, with only reviewed attribution query parameters on provider URLs and no fragments. At 390×844, 360×640 and 1440×900, capture before/after-consent screenshots. Confirm the outcome, qualified service-fee refund, $198 + GST, primary Upload action and real phone action are visible without obstruction. Crawl one-tap destinations for banned guarantee/payment wording.
7. **Pressure-test the intake and trusted proxy boundary.** Create a designated QA lead; verify private upload, staff visibility, autosave, refresh, Back, app switch, copied cross-device resume link, OCR timeout, upload failure, canceled checkout and retry. In staging and production, prove Supabase Edge supplies the trusted `cf-connecting-ip` header to the draft, funnel and submission functions. Those functions deliberately ignore client-controlled `X-Forwarded-For` and `X-Real-IP`; if the trusted header is absent, all callers share the conservative `unknown` rate-limit bucket and public traffic stays paused. Confirm representation consent is always fresh and no capability token appears in a query string or log.
8. **Verify production measurement.** With explicit consent, prove one row for each funnel event and its position/step. With decline and undecided states, prove optional Fabsy, Google and Meta measurement remains off. Confirm no form value, file, name, email, phone, IP, user agent or raw click ID reaches `paid_funnel_events` or the private payment ledger. Verify that a non-consenting payment has financial facts but no funnel-session link, and that no refund fact is forwarded to Google or Meta.
9. **Prove attribution across systems.** Use designated test UTMs and click IDs. Show the session/draft/case/checkout relationship and the correct campaign/content in the reporting output. Treat first-party metrics as consented-cohort metrics and document measurement coverage rather than interpreting missing non-consenting visitors as abandonment.
10. **Run one controlled paid journey and refund.** This requires separate transaction and refund authorization. Capture Stripe payment and webhook, thank-you state, draft/case conversion, customer email, admin email/SMS, Meta browser/server deduplication, Google conversion, hashed purchase/refund ledger rows and the operator refund with timestamps and IDs. Replay the signed events and verify partial/multiple refund totals. Verify the 30-day policy logic without delaying the immediate QA refund.
11. **Verify channels and providers.** Test the published phone number in and out of hours, contact email receipt/SLA, Stripe Fabsy identity, Meta restriction status/objective, Google conversion status, final destinations, placements, budget controls and one-click pause. Delete the Fable QA records/files only under a separately reviewed cleanup action.
12. **Verify retention and close business inputs.** Prove the converted-draft 24-hour post-expiry deletion and foreign-key erasure behavior after deployment, choose a documented policy for historical orphans, and supply the refund/support/profit/capacity/fee inputs needed to calculate maximum CAC, CPL, CPC and loss.
13. **Commit evidence, review and GO.** After steps 2–12 complete without changing source `S`, commit the candidate manifest and files under `localReview.evidenceDirectory` only as direct successor `E`; no other path may change from `S` through `E`. Keep `localReview.manifestPath` outside the production evidence directory: it exactly inventories the candidate diff from the named base through `E`, excluding itself and the readiness path, and is committed in `E` unchanged through `R`. Separately, `release.evidenceManifestPath` lives inside `release.evidenceDirectory` and exactly inventories every other file in that production evidence directory. Each PASS gate uses its own typed `paid-acquisition-gate-evidence` receipt tied to `S`, captured after frontend deployment and before review, followed by the exact supporting artifacts named by that receipt. A receipt cannot be reused for another gate, contain an explicit failed verdict, or rely on an artifact outside the production-evidence manifest. A reviewer who did not build the release reviews `E`, reconciles both manifests, deployment and provider readbacks, and records their decision. Record stable actor IDs as well as names. Release owner, independent reviewer, GO approver and spend authorizer are four distinct roles; case/spacing aliases do not create distinct identities. The GO approver also signs the economics and maximum loss.
14. **Commit readiness and separate spend authorization.** Only after written GO, record platform, campaign IDs, daily cap, total cap, start/end and tax treatment, then commit only the readiness record as direct successor `R` of `E`. `R` sets all seven handoff fields: `localReview.baseCommit`, `sourceCommit=S`, `evidenceCommit=E`, `readinessPath` for the evaluated JSON, `evidenceDirectory`, `manifestPath` and `manifestEntryCount`. All three commits use full SHAs; the base is an ancestor of `S`, `E` is the direct child of `S`, and `R` is the readiness-only direct child of `E`. For GO, `release.sourceCommit` equals `S`. `git status --porcelain=v1 --untracked-files=all` must be empty. Until this chain validates, campaigns remain paused. Any later source or evidence change requires a new chain.

Any code deploy to the landing page, intake, checkout or measurement after the independent review in step 13 invalidates GO and returns to step 1 with a new source commit.

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
| Source commit / immutable deployed tag / deployment / captured bundle SHA-256 | Release source equals `localReview.sourceCommit`; annotated tag resolves to that commit; deployment and captured canonical bundle values match the receipt |
| Local review handoff | Full base/source/evidence SHAs, evaluated readiness path, evidence directory, candidate-manifest path outside production evidence, and exact entry count |
| Production evidence folder | Committed repository path and a separate SHA-256 manifest covering every other file in that directory |
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
- Fail-closed launch control: schema-v3 `scripts/paid-acquisition-readiness.mjs`, adversarial `scripts/test-paid-acquisition-readiness-control.mjs`, `docs/paid-acquisition/2026-09-03-restart-readiness.json`, and the build/prerender workflow deployment gates.
- Refund terms and operator clock: `docs/paid-acquisition/2026-08-31-fee-refund-offer/refund-policy-operations.md`.
- Hosted checkout blocker: `docs/paid-acquisition/2026-09-03-homepage-conversion-readiness.md` and `docs/photo-radar/stripe-provisioning.json`.
- Historical lineage `f2fde2aeb1d633f3ae432e9758f3bc823a1cac7f → eb299d7a7d61ff29283cd482393dbe997dd124cf → 6941246af26a757cd23e9278b8a844c2c7b9fcbb` predates schema 3 and is not a complete pinned handoff. The next record names the actual base, new source, new evidence and readiness commits.
- `npm run build:evidence` invokes Vite with `--mode paid-acquisition-evidence` in an allowlisted child environment: inherited `PATH`; fixed `LANG=C`, `LC_ALL=C`, `TZ=UTC`, `NODE_ENV=production` and `SOURCE_DATE_EPOCH`; all three measurement flags false; and fixed synthetic Supabase URL/key. It refuses project evidence-directory `.env*` files and skips npm prebuild/postbuild, so it does not close the owner legal-publication gate. The final evidence pack must record the Node/npm/Vite/platform versions, exact `dist/` inventory and normal-versus-hostile-ambient-environment comparison; portability beyond that recorded toolchain is not asserted. These synthetic bytes are not production bytes and cannot prove any provider path. The release `npm run build` remains deliberately blocked because the Privacy Policy source changed and all seven non-English legal-publication fingerprints require a fresh owner attestation; no translation approval was fabricated.
- Post-review local verification includes measurement tests for live expiry, stale expiry or malformed consent discovered at initial mount, and a missed-removal recovery on `pageshow`. The final evidence pack records the complete test inventory and exact results. The readiness suite constructs committed source/evidence/readiness fixtures and rejects missing or unlisted files, dirty evidence, fake commit chains, hash drift, explicit failed support, pre-deployment receipts, hostile bundle paths, fake Supabase origins, release-critical source drift, unreviewed provider objective/goal pairs, provider UTM drift and invalid deployment/approval order.
- The repository-wide lint command remains baseline-broken at **36 errors / 22 warnings** in pre-existing unrelated files. The changed-file lint gate has no error. Non-CI readiness exits nonzero for every `NO_GO`. `npm run ci:ads-readiness` may exit zero for an honest refusal only after the final readiness commit has no schema or integrity failure; that validates the refusal record, not readiness to deploy or spend.
- The September 4 source findings are closed locally in code and regression coverage; the invalid screenshot/build/handoff evidence must be replaced in the successor evidence commit before that closure claim is reviewable. Staff follow-up disposition is implemented; staff-controlled resend is intentionally absent because the browser and database do not retain the raw customer capability. Adding resend would require a separately reviewed authenticated server action with capability rotation, consent/expiry checks, lifetime and action throttles, provider claims and an audit trail. Fable's lower-priority follow-ups remain tracked. Independent re-review of the final remediation branch is still required, and a local pass still does not close any production/provider gate.

No production deployment, provider change, charge, refund, campaign activation or advertising spend occurred while preparing this document.
