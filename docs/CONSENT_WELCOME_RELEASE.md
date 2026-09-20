# Consent copies, welcome and payment next steps

## Principles and specification

The September 20, 2026 request makes the saved consent the trigger for client correspondence. A client must receive their actual consent PDF, a welcome and next steps, with a payment reminder only when representation payment is confirmed outstanding. The existing staff consent event supplies a separate copy to hello@fabsy.ca only. Every ticket-specific subject includes the actual stored ticket number.

Use the existing private storage, Supabase database and email providers. Email delivery must not depend on the client starting checkout or leaving the browser open. A missing attachment, email or readable ticket number holds delivery. Provider acceptance is recorded separately from delivery to an inbox. Never repeat an uncertain send automatically or replay historical consents during rollout.

## Clarifications

- The quick upload contact step requires email; phone is optional. Upload and consent remain saved if contact collection is interrupted. The queue waits until the address and ticket reference are available.
- A completed standalone consent invitation also receives its own consent copy. An unlinked invitation does not establish payment status or prove that the ticket was uploaded, so its welcome makes neither claim.
- A manual signed scan is attached with the consent audit document; pending staff review is not described as approval.
- Staff case labels do not prove payment. Check current representation purchase evidence and Stripe checkout state before including payment instructions. Unknown or processing payment omits a payment demand.
- Include a payment button only for an existing valid checkout link bound to the same ticket. Otherwise tell an unpaid client to finish payment on the upload screen or reply for help. Do not invent a link or direct unpaid clients to a portal page that hides their case.
- Keep historical notification receipts. New queue ownership suppresses the old client welcome and the contradictory abandoned-intake consent reminder, while preserving independent staff and SMS messages.

## Implementation plan and consistency review

1. Queue new saved consent facts transactionally, with canonical document deduplication and an atomic ownership fence against the legacy checkout-triggered welcome.
2. Resolve the authoritative ticket/invitation, current recipient and documents at delivery. Require owned private files and verify recorded hashes where available.
3. Claim preparation separately from sending. Persist a sending reservation before the provider call; reconcile uncertain attempts instead of blindly retrying.
4. Send the localized-policy welcome with attachment and payment-dependent next steps. Preserve the existing staff consent event, refreshing identity before its send.
5. Require email at the quick contact step and keep its saved-receipt retry behavior.
6. Verify with synthetic provider/storage boundaries and isolated PostgreSQL. Publish the backend before the frontend, check active schedule/source parity, and do not send historical or real test emails.

The queue, client email and staff copy share the same saved document identity. The browser only collects contact information; it does not own email delivery. The government filing automation remains gated on its existing payment, document, consent and approval checks.

## Tasks and validation

- [x] Map current upload, consent, checkout and notification behavior; audit live source and historical receipts.
- [x] Implement queue, ownership transitions and reminder suppression.
- [x] Implement client welcome, attachment and payment checks.
- [x] Refresh staff copy identity and actual signed attachments.
- [x] Verify required contact email and interrupted-contact behavior.
- [x] Run focused flow, database, provider and regression checks.
- [x] Deploy backend and verify source, configuration and schedule.
- The frontend is released last through the explicit build workflow; the deployed commit and run are recorded in release evidence after merge.

Baseline audit: all eight portal events were sent, including five representation-consent events. Five legacy submission notification bundles were sent; no pending or uncertain bundle was available to replay. Existing consents without a bundle are not proof of non-delivery and are not backfilled. The live send-notification, process-portal-activity and representation-consent sources matched the reviewed main revision. Generation and photo-intake dependency parity was checked against the existing verified backend release; the CLI cannot fully extract their large/externally bundled assets.

Focused checks can be rerun with `npm run test:consent-welcome`. The PostgreSQL suite creates an isolated temporary database; it never connects to production. Frontend verification covered 86 upload/intake regressions, seven photo intake handler cases and a production Vite build. The required-email empty/phone-only case was also checked directly.

Staff consent events waiting for a valid ticket reference follow the existing bounded retry policy, then move to `needs_review`. Staff must verify the reference and explicitly requeue an unattempted event; a provider-started or uncertain event requires delivery reconciliation first.

Release validation passed: 31 Deno tests across client delivery, worker HTTP boundaries and staff consent mail; seven actual legacy-handler tests; isolated PostgreSQL migration/RLS/ownership/claim/source and payment-race tests, including two concurrent claim transactions. All four changed Edge Function entrypoints type-check. No test touched live client data or sent an email.

## Production backend verification — September 20, 2026

Only migration `20260921020000_consent_welcome_notifications.sql` was applied, and its migration history entry was repaired to applied. The queue activated at 18:41:19.689 UTC; the minute schedule is active, and the 18:42 UTC worker recorded success with no error. No consent completed after activation during the initial verification; the new queue was empty. The five sent legacy bundles and five sent staff consent events were unchanged.

The vault-authenticated no-send readiness request returned HTTP 200 and confirmed database, email and Stripe-read configuration. This checks configuration presence, not a real inbox delivery. An unauthenticated worker request returned 401. A synthetic unauthorized photo-contact request returned 403 without creating or changing a submission.

Deployed notification v214, staff activity v12 and consent welcome v1 are ACTIVE, with all 27 downloaded source-file instances exactly matching reviewed source commit `c4c41d0c3`. Photo intake v3 is ACTIVE and its downloaded entrypoint and consent helper match. The CLI still refuses extraction of the bundled `src/config/feeRefund.json` path, so the photo bundle's extraction verification is explicitly partial; its unchanged dependencies were checked against the prior reviewed release and uploaded with the changed handler. No source mismatch was found.

Detailed backend, function and final frontend evidence is retained in the operator's private `consent-email-release.json` release record. No historical consent email or real outbound test email was sent.
