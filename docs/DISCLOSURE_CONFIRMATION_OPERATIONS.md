# Disclosure request status and client notices

The system records a verified disclosure request, advances an eligible early case to **Disclosure requested**, and queues one client notice for the ticket. Brett expressly authorized this automatic client notice on September 20, 2026. A request receipt does not mean the evidence has arrived, a plea was filed, or a deadline changed.

## Verified request receipts

`record_disclosure_request_receipt` records an actual portal success, an independently verified manual receipt, or a matched Crown acknowledgement. Portal/manual entries require the full matching stored ticket, the actual confirmation time, an evidence reference and SHA-256 digest; portal entries also identify the prepared session. Preparing a form, obtaining SMS approval, consuming approval, or clicking Submit without confirmed success is insufficient.

The receipt transaction updates staff status and reuses `disclosure_notification_outbox`. Later stages, closed/deleted cases and existing receipts are preserved. Portal success and a later Crown email converge on one request instead of sending two notices. An existing sent, frozen or attempted notice is retained. Never discard a prior notice merely to obtain the new wording.

New messages use **Ticket FULL_TICKET_NUMBER — Disclosure requested** and say, “We’ve requested disclosure of evidence from the Crown for ticket FULL_TICKET_NUMBER.” They include a case link and Fabsy contact details, with no timeline, plea-filing claim or promotional offer. Missing, invalid or mismatched ticket references hold delivery. The original frozen payload remains available for reconciliation.

## Current transport and schedule

- `process-disclosure-notices` runs every minute through the existing `fabsy-disclosure-notices` Supabase cron, authenticated by private `IDR_CRON_SECRET`. It is independent of Brett’s Mac.
- `_shared/gmail-disclosure-inbox.ts` polls the existing Google Workspace mailbox for Crown request acknowledgements. Each scan fixes a seven-day time window, follows every Gmail page and durably retains its next page token and remaining message IDs. A run starts at most two ten-message pages, handles at most twenty messages and stops starting work after 45 seconds; the next minute resumes. Concurrent workers advance the cursor only by compare-and-swap after ingestion. New arrivals are covered by the next complete scan. The parser requires the expected sender, hello recipient, exact ticket, request-receipt wording, source message identity, acceptable confirmation date and the receiving Google mail server’s authentication result. Missing or ambiguous timeframes remain null.
- `_shared/google-workspace-email.ts` sends from `hello@fabsy.ca` through Gmail using the existing Google OAuth configuration. This release preserves the current main-branch helper, including its Bcc validation, and the existing locale policy.
- `disclosure_confirmations` stores Crown-email evidence. `disclosure_request_receipts` unifies actual request receipts. `disclosure_notification_outbox` stores the client snapshot, frozen message, delivery lease and Gmail acceptance receipt.
- Delivery requires `disclosure_automation_state.delivery_enabled=true`. The worker records `last_worker_at`, `last_inbox_poll_at` and any errors. No second delivery schedule or direct courtesy email is needed.

A stable outbox identifier, exclusive lease and recorded provider acceptance prevent normal repeat sends. Gmail’s deterministic Message-ID is audit metadata, **not an idempotent-send guarantee**. Any failed or expired delivery attempt is held as `needs_review`; it is never automatically resent. Gmail acceptance is not proof of inbox delivery. The [Gmail send API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) documents the send operation and returned message receipt.

## Deployment and verification

1. Run `deno test supabase/functions/_shared/disclosure-confirmation.test.ts supabase/functions/_shared/gmail-disclosure-inbox.test.ts supabase/functions/_shared/google-workspace-email.test.ts` and the isolated SQL disclosure tests. These use synthetic fixtures, not client messages.
2. Apply `20260920233000_disclosure_request_receipts.sql` before deploying the updated worker. It adds request/status convergence and the Gmail hold-on-uncertainty rules. Existing prerequisite migrations include `20260909150000_disclosure_confirmations.sql`, `20260909151000_disclosure_notice_schedule.sql` and `20260915130000_google_workspace_email_events.sql`.
3. Deploy `process-disclosure-notices` with its Gmail inbox/delivery dependencies. Preserve `verify_jwt=false` and its own cron-secret authentication. Reuse the configured OAuth secrets; never print them, replace them with source-code values or introduce a Resend fallback.
4. Verify cron activity, the function’s unauthenticated rejection, current worker/inbox health and the outbox. Use existing genuine receipts for status reconciliation; do not send synthetic client messages as a deployment test.
5. For an existing case, inspect all prior matching notices before recording a receipt. Reuse the prior sent or uncertain record. Only a new verified request without a prior notice should produce an unattempted pending notice.

These instructions describe the release behavior. Source integration and passing tests do not by themselves establish deployment or a client send.

## Recovery

- **Ambiguous ticket or unmatched acknowledgement:** correct the source record and inspect the original message. Never guess a match by name or remove a sender-authentication failure without verified evidence.
- **Case/recipient changed:** review the stored case, full ticket and intended recipient. The first-send guard holds mismatches rather than sending to stale contact information.
- **Failed attempt, expired lease or missing acceptance receipt:** sending is held immediately. Inspect Gmail Sent using the outbox’s deterministic Message-ID and matching recipient/ticket. If accepted, reconcile the existing provider receipt and `sent` status. If delivery is uncertain, keep the hold. Do not reset the attempts or create a fresh outbox row. A verified-not-sent recovery requires a deliberate operator decision and a retained audit record.
- **Worker outage:** inspect Supabase function logs, cron run details and HTTP outcomes. A successful SQL cron job alone does not prove successful function execution. Keep pending work in the durable outbox.
- **Inbox pagination error:** an explicit invalid/expired Gmail page-token response restarts the same fixed window, records a cursor reset and reports it in worker health. Previously ingested source IDs stay deduplicated. Unknown errors retain the cursor and its pending IDs for the next run. Do not clear the cursor to a newer window merely to hide a failure. After an outage beyond the seven-day intake window, recover older original acknowledgements with a deliberate evidence review.
- **Pause:** set `delivery_enabled=false` to stop new notice claims. The separate inbox poll can still record acknowledgements. Resume only after the blocker is resolved; held attempts remain held.

## Source provenance

On September 20, 2026, the deployed worker and shared dependencies were downloaded read-only and compared with the repository before integration. Production was already using Gmail inbox polling and Google Workspace delivery, while the clean release’s disclosure worker still contained the older Resend implementation. The verified live worker, delivery adapter and inbox parser were restored without replacing newer main-branch email/locale helpers. The obsolete Resend-style automatic retry assumption was replaced by the immediate review hold described above.

The original September 9 deployment used ImprovMX/Resend and is recorded in [PR 25](https://github.com/bmbilon/fabsy-7e59f90e/pull/25). That historical route and its former retry assumptions are not the current delivery mechanism. No OAuth secret, approval token or client evidence belongs in this document.
