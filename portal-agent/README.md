# Fabsy cloud portal runner

Production phone entry: https://fabsy.ca/admin/portal

## Client offer replies (September 26)

The existing Supabase Gmail worker now scans incoming client replies independently of Crown notices. It records a conservative acceptance candidate only from the new reply text, with a unique normalized ticket, an explicit offer amount and Gmail-aligned sender authentication. Quoted text, conditions, questions, forwarding, mismatched senders/amounts and missing verified terms require review. The reported amount paid to Fabsy never changes the government fine or payment records.

`client_offer_decisions` preserves staff-only source/decision evidence. A matched reply creates at most one `prepare_offer_acceptance` job per authenticated Crown offer. Verified matches can queue a read-only portal check; missing/stale terms create a needs-review handoff and use the existing mobile-push path. The phone shows the reply and hold reason. Later ambiguous replies hold queued preparation; duplicates never reset an existing job. The scanner is enabled from September 25 at 00:00 Edmonton time to include the requested example. Pause with `client_offer_decision_state.enabled=false`.

**This is not autonomous acceptance.** For offer acceptance, the runner only opens/captures pages. Staff must verify the exact sent terms, guilty-plea disclosure, actual signed consent, signer authority, latest client instructions and unchanged live offer before accepting in the portal. No acceptance adapter or automatic acceptance-result ingestion is implemented. The pure `formatAcceptanceConfirmation` helper requires a saved acceptance receipt, ticket match, fine/balance, payment deadline and explicit no-attendance disposition; it is tested but deliberately not connected to Gmail. The subsequent mobile-approval release authorizes delivery only after Brett approves each frozen draft; the acceptance-confirmation producer is still unconnected. No client email or Gmail draft is created by this extension.

Migration: `20260926150000_client_offer_decisions.sql`. The scanner and broker were deployed using freshly downloaded production shared dependencies, with only the feature entry points and two new modules replaced. Deno parsing/scanner tests, cloud policy tests, TypeScript checks and transaction-rolled-back database privilege/deduplication/hold tests passed. Anonymous broker and phone access must remain denied.

Live verification: the scanner recognized Srini's September 25, 19:31 reply as an authenticated $261 acceptance candidate for B44694930C. It correctly held the record because the earlier imported `already_notified` Crown offer has `authenticated=false` and no verified terms; its import marker is not proof of authenticated Crown notice provenance. Staff UI showed the actual reply and hold reason. The linked prosecutor notice was retrieved read-only, but that alone did not promote the imported record or verify current portal terms. Browser navigation to the offer redirected to the portal root and subsequent browser inspection timed out; no acceptance was attempted. Anonymous phone API access returned 403 and the broker returned 401. Worker version: `822197af-51e1-4b5e-aa04-8f13f030f7c0`.

Cloudflare Worker `fabsy-portal-agent` serves only `/admin/portal*`; it does not replace the existing Pages deployment. This avoids deploying unrelated workspace edits. The UI uses the same Supabase sign-in and staff role as Fabsy Admin, with `display: standalone` and the existing Fabsy home-screen icons. Install it on the phone Home Screen, sign in, then explicitly enable notifications. This supersedes the earlier browser-only shortcut preference to satisfy mobile push.

## Deployed flow

Existing Gmail offer scan → authenticated `prosecutor_offer_events` insert → database trigger creates one `portal_agent_jobs` row → Cloudflare schedule wakes a queue consumer every five minutes → exclusive database claim → exact active paid case check → hosted browser reads the observed official offer link → saved evidence or a needs-review result.

The staff Run pending checks button triggers the same queue. Check Crown mail invokes the offer scanner and the bounded Crown notice router. Disclosure-available notices create exact-ticket read-only jobs; request/review/trial acknowledgements record events without submitting anything. Unknown or unauthenticated notices are held. Empty queue checks do not launch a browser or model. Dispatch is deterministic; a bounded document-analysis call runs only when a complete disclosure package is queued. No Astra or recurring Codex task runs in the background.

The phone page has a Stripe payment feed sourced from webhook-verified checkout records. It shows the stored amount, payment time, Stripe reference, case match, and payment status when available. Staff-confirmed or externally receipted payments appear in a separate section; they are never presented as Stripe transactions. The portal-job badge shows the job status, while the case stage and known payment source appear on a separate line. The feed updates through the staff-only workspace signal and periodic refresh. Source: `20260926002000_portal_stripe_feed_provenance.sql`.

Email and checkout reconciliation now runs in the existing server Gmail worker and database arrival triggers. The normalized ticket number is the case identifier; email only locates explicit ticket evidence. Staff-only thread/party/order evidence records preserve payer and defendant roles, replay safely, and hold conflicting matches. The phone shows scan health, match provenance, and review holds. See `docs/CASE_RECONCILIATION.md` and migration `20260926130000_case_email_checkout_reconciliation.sql`. Gordon Hicks's CAD $82.95 Stripe order is now linked to Dome ticket B21052916C following Brett's specific confirmation; the legal defendant and existing consent remain intact.

The server broker is Supabase function `portal-agent`. The Worker has a random runner credential allowing claim/result operations only, not the Supabase service-role key or Gmail OAuth credentials. The phone uses staff JWTs; it cannot claim jobs as the runner. Official links and captured text are stored under staff-only RLS. The runner never invokes Gmail send/reply or portal accept/reject/payment/plea actions.

## Real portal access result and current limits

A real hosted-browser probe of B44694930C reached the Alberta site (HTTP 200), but the private offer link redirected to the public ticket-search page. A fresh browser session therefore did not show the actual offer. This is distinct from an earlier plain HTTP 403.

For a job needing verification, Start cloud verification launches a ten-minute browser session. The staff-only result contains a short-lived Cloudflare Live View link. The Browser Run Live View API was verified against a real hosted browser and returned a valid hosted-view capability. The staff member can complete verification in that browser from their phone, return, and choose Read verified page. The runner reads the current page without replaying the human's action. Session expiry requires a new session. Do not copy session URLs to logs, chat, client messages, or public links.

**Not yet operational:** autonomous initial disclosure preparation/submission, automatic extraction/verification of all offer terms and deadlines, and Gmail mailbox draft creation. Disclosure downloads and review-request preparation are described below. The phone now has a staff term-verification form connected to the existing draft queue. Gmail scopes were checked live: readonly + send only; compose is absent. The browser supports offer inspection, disclosure retrieval and exact approved prosecutor-review requests; unsupported actions fail closed. Gmail mailbox draft creation is unused. The mobile-approval release stores app drafts and uses the existing send scope only after a per-message approval. Offer evidence remains for staff review. This runner does not accept/reject offers, enter pleas, submit initial disclosure requests or send client emails. Confirmed review submissions queue client status drafts for the existing separate send approval.

Sri’s payment was reconciled from Brett’s explicit September 25 confirmation, using a separate audited payment-confirmation record. The actual historical payment date/amount and Stripe receipt remain unknown; none were fabricated. The submission is active and its existing Admin stage is `crown_offer_received`. His offer remains `already_notified`. The read-only setup probe is closed so it will not generate an unnecessary phone alert or duplicate draft.

## Operations

- Source: `portal-agent/src`; dependencies isolated from the main Vite app.
- Build/check: `npm run build && npm run check && npm test` in this folder.
- Deploy: `wrangler deploy` in this folder; keep the production `PORTAL_RUNNER_SECRET` secret.
- Worker config: `wrangler.jsonc`; queue `fabsy-portal-runs`, one consumer at a time, no automatic delivery retry after uncertainty.
- Pause: set `portal_agent_state.enabled=false`. No new database job is then claimed.
- Read-only leases last four minutes; review-submission leases last eight minutes. Expired leases become uncertain. Staff may retry read-only inspections; a review job that reached its final-submit phase can only reconcile its receipt.
- UI job list is limited to the most recent 100 jobs, not a lifetime total.
- Broker deployment must use current production shared dependencies. This release was staged in `/tmp/fabsy-portal-agent-deploy` using the saved production Gmail worker source, because several shared modules in the checkout are older than production.
- SQL migration: `20260925210000_portal_agent.sql`. Applied and registered independently; unrelated migrations were not pushed.

## Verification

TypeScript checks (Worker and phone separate), Deno broker type check, five browser-policy tests, sixteen Crown/draft/push tests, transaction-rolled-back SQL permission/claim/lease/result tests. Live anonymous requests to both phone API and broker return 401. Phone login page was visually checked at 390×844. Signed-in controls were verified using the existing Firefox staff session. Sri’s stage and already-notified state are visible. Cloud Live View was opened and its ticket-search/Terms screen was inspected, without accepting terms. Physical-phone push delivery remains unverified until Brett enrolls his phone and receives a test ping.

The Cloudflare Puppeteer dependency audit reports its unused browser-download ZIP extraction dependency. This Worker never downloads or extracts browser archives; Browser Run supplies the remote browser. Do not downgrade the Cloudflare package to an obsolete version merely to silence the audit.

## Mobile notifications

New `needs_review` portal jobs enqueue one alert per enrolled device/job. The existing minute worker sends encrypted Web Push with VAPID keys stored only in Supabase secrets. Push endpoints/keys are server-only, delivery rechecks staff access, expired device subscriptions are disabled, and bounded retries collapse using the same notification tag. The alert contains no client name, ticket number, offer terms, or private government/browser link. It opens `/admin/portal?job=<id>` and requires staff login.

No acceptance button is placed on the notification. Open the job, start/open its cloud browser, read the actual terms and complete the required step there, then return and choose Read verified page. A ten-minute browser session can expire while the durable job remains available; start another verification session in that case. Captchas and changed/additional legal declarations require attention. The separately approved prosecutor-review adapter submits only its frozen request and recorded current terms.

- iPhone: Safari → Share → Add to Home Screen, keep Open as Web App enabled. Open the icon, sign in, Enable notifications on this device, Allow, Send test notification.
- Android: install from the browser menu, open Fabsy Admin, enable notifications and send a test.
- Turn off this device revokes the server enrollment and browser subscription. No notification permission is requested on page load.
- `portal_push_outbox` records provider acceptance/failure, not proof the person saw a notification. Provider acceptance and physical-device display are different checks.
- Provision once with `scripts/portal-agent-notification-keys.ts`; it refuses to rotate an existing key. Rotation invalidates enrolled subscriptions and must be planned.
- Migrations: `20260925233000_crown_notice_routing.sql`, `20260925234000_portal_mobile_notifications.sql`. Both applied after rolled-back privilege/deduplication tests.

Crown notice routing begins at its recorded activation timestamp. It does not replay historical Crown messages or enqueue initial filings for all existing cases. Existing disclosure acknowledgement ingestion remains independent.


### Mobile client-email approval (2026-09-26)

`/admin/portal?draft=<uuid>` opens the exact client draft after administrator sign-in. Offer, disclosure acknowledgement and case-update producers now queue immutable app drafts. The **Approved to send** button records human approval through an authenticated-only database RPC; the Supabase worker sends the frozen payload and records the Gmail receipt. The minute worker completes durable approvals if the phone disconnects. Draft creation and notification clicks never approve sending. `gmail.compose` is not needed by this app-draft path.

Push uses the existing VAPID enrollment and encrypted outbox, with no client facts on the lock screen. Install Fabsy Admin as a Home Screen web app and enable notifications inside it. New enrollment also queues alerts for existing pending drafts. The notification has no send action. Portal acceptance remains separate and is not enabled by email approval.

Database delivery states: pending_approval → approved → sending → sent, with rejection, changed-source review and uncertain-send holds. Do not reset an uncertain draft to approved: reconcile Gmail Sent using the saved deterministic Message-ID and receipt first. Other transactional emails and internal alerts are outside this case-correspondence gate.

## Disclosure review and request creation (September 26)

Verified disclosure pages now save every listed document and an immutable private package. The existing minute worker reads one full document at a time, validates exact case facts, maps the attached workbook, and prepares a request for staff approval on this phone page. Verified prior resolutions are internal references; no other client, ticket or offer appears in Crown-facing text. One unchecked checkbox now saves approval of the exact draft, the evidence/authority confirmations, authorization for the specific displayed government terms and permission to submit that request. There is no separate approve button. The terms snapshot/hash and authenticated staff identity are audited. A scoped cloud adapter now queues and submits the exact approved prosecutor-review request, verifies its receipt and prepares one client status draft for send approval. Changed/additional terms and CAPTCHAs require attention. See [disclosure workflow](../docs/DISCLOSURE_REVIEW_WORKFLOW.md) for provenance, retry holds and actual live verification. The old read-only runner limitation on evidence downloads is superseded; autonomous disclosure filing and offer acceptance remain unimplemented.

## Approved prosecutor-review submission

Migration `20260926200000_approved_review_submission.sql` adds `submit_review_request`. The authenticated combined checkbox freezes the exact request, consent bytes and current terms and creates one durable job per normalized ticket. The broker wakes the existing cloud queue immediately; its five-minute schedule also recovers pending work. Disable new writes with `portal_agent_state.review_submissions_enabled=false`; the general enabled flag pauses all claims. Existing approvals are not fabricated or reset during deployment.

The adapter checks current terms against the approved full-text hash, verifies the legal defendant/ticket/fine in the live portal, checks for a prior review, uses the source plate only for ticket verification, selects Agent and No defendant email, uploads that case's signed consent and copies the frozen request. Source and consent hashes are rechecked before committing. The plate is fingerprint-validated, encrypted with AES-GCM and held in service-only `portal_review_material`; staff responses/logs do not expose it. Changed evidence, terms or declarations stop the job. Visible human-verification challenges require Live View assistance.

The broker records a committing phase before the Submit and Confirm review controls. Failures after that point become uncertain and cannot start a new automatic submission. The same surviving browser may be resumed to read a confirmation only. A confirmed official receipt must identify the exact ticket and submission success before the case is marked submitted. A client update is then deduplicated through `idr_email_events` and `outbound_email_drafts`; it gives only the generic reduction/withdrawal-requested status, without amounts requested from the Crown. It uses a once-approved factual template; staff-written emails retain individual send approval. This extension does not implement offer acceptance, plea entry, payment or autonomous initial disclosure filing.

Validation includes the current full-text terms hash, live-identity/fine and receipt checks, simulated government-form execution and interrupted-final-click behavior, private database privileges, exact human approval, queue replay, changed consent/terms, paused writes and receipt reconciliation. Deploy the broker/minute worker from fresh live shared dependencies and only the `/admin/portal*` Cloudflare route.

Browser acquisition failures before committing use bounded five-minute queue retries (migration `20260926203000_review_submission_browser_retry.sql`); the fourth failure requires attention. Migration `20260926204000_review_submission_completed_evidence.sql` closes the completed evidence-retrieval task after a verified review receipt. A service-only health probe can reproduce provider errors without filing any request, and the phone shows runner errors separately from its heartbeat.

Live result: Dome B21052916C was submitted using its actual staff approval and the local-browser fallback because Cloudflare returned persistent HTTP 429. The government confirmed Review received and changed its due date to December 21, 2026. The receipt records `mac_verified_review`, never cloud provenance; its original unsent status email was cancelled at Brett’s request because it disclosed the amounts requested. The audit record is retained. Cloud submission code and checks are deployed, but successful cloud end-to-end filing has not yet been verified. Billing access was unavailable to the existing CLI token; no plan or access changes were made.

### Queue display by ticket

The three queue counters and their lists count normalized ticket numbers, not workflow rows. Each ticket appears in one category: attention takes precedence over waiting, then completed. The primary entry opens the current action; expandable related tasks retain every job, evidence review and client message. A saved disclosure package supersedes its retrieval review hold, and a linked submission job supplies progress after request approval. Uncertain filings remain attention items. Missing ticket identifiers stay separate, and contact/email equality never merges different tickets. Email approval counts still count individual messages. The queue display does not change approval, filing or delivery state.


## Versioned client email templates

The phone page lists five immutable template revisions for one-time administrator approval: disclosure requested, disclosure received, reduction/withdrawal requested, verified Crown offer, and accepted-offer fine payment details. Preview the exact copy and permitted fact substitutions under **Automatic email templates**. Changes require a new revision; revocation stops future eligible use. Routine template messages need no per-message tap. The Gmail sender retains the frozen payload, hash, actual template approver and receipt, and adds `X-Fabsy-Template` with key/version. Gmail Sent remains the delivery monitor.

Migration `20260927010000_email_template_registry.sql` and the minute worker render from source records. Newly completed disclosure packages trigger evidence-received updates prospectively. Client emails never disclose requested amounts or negotiation strategy. The final payment email requires a completed acceptance job and exact saved government receipt with the fine/balance/new due date. The acceptance adapter/event producer remains future work; preparation jobs cannot trigger that email. No template or message is approved by deployment. The cancelled Dome message is not recreated.

See [registry implementation and checks](../docs/specs/email-template-registry.md). Government session and legal-action authorization remain separate from email-template authorization.
