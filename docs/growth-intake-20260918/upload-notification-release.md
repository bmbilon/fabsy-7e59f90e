# Confirmed-upload owner alerts

The upload-first screen still keeps the selected file local until the customer provides contact details and permission. The existing `createContact` → signed upload → verified `confirmUpload` contract is unchanged. Contact-only leads remain in the staff queue; owner SMS begins only after the upload is confirmed.

Confirmed uploads retain the existing email outbox, sent to h***@fabsy.ca with b***@execom.ca copied. This release adds an independent owner SMS outbox to the established phone ending 5353. Its generic message links to the authenticated staff queue and explicitly says upload does not confirm payment or authorization. No customer identity, ticket contents, attachment URL, or resume capability is included.

Each upload has one SMS row, deduplicated by the existing email outbox's draft/object fingerprint. Reconfirming the same file creates no new message. Replacing the file creates a distinct upload. There is no historical backfill. Pending SMS is cancelled when the intake is deleted, expired, closed, or contact permission is revoked. Hard deletion cascades through both outboxes.

Twilio response loss is not assumed safe to retry. A lost response, malformed response, server error, or expired send lease leaves the message `indeterminate`; staff must reconcile it before any manual resend. A successful Message SID is recorded as `accepted`, which is separate from delivery. The worker claims at most five SMS rows so sequential 10-second provider and 15-second database timeouts fit inside the three-minute lease. Email keeps its existing frozen-payload/idempotency behavior and processes independently of SMS configuration or failure.

The admin queue shows the latest upload's email and SMS status without exposing raw outboxes, provider IDs or payloads. Staff-only status reads use `is_idr_staff()`. Missing status RPC data never hides the intake queue. Existing customer resume delivery and human email/phone follow-up records remain separate.

## Backend-first release

1. Set `TICKET_UPLOAD_ALERT_SMS_FROM` to the verified account-owned main sender ending 2279. The previous global `TWILIO_PHONE_NUMBER` value matched neither owned SMS-capable number at the time of audit. The dedicated override lets this worker be configured without changing other consumers.
2. Apply exactly `20260918210000_ticket_upload_sms_alerts.sql` after reconciling live migration history; production has a separate voice migration absent from this checkout.
3. Deploy only `process-ticket-upload-alerts`. Its prior live entrypoint and all five shared dependencies were downloaded read-only and matched checkout bytes before this change. Do not redeploy voice/Vapi/SMS webhooks from this checkout as part of this release.
4. Invoke authenticated `POST {"dryRun":true}` using the existing cron-secret or service-role authentication. The read-only check validates runtime Twilio credentials and ownership/SMS capability of the effective sender. It does not claim work, query customer data, send messages, or return credentials, phone numbers or provider payloads. `emailConfigured` confirms key presence only; it is not a new email-delivery test.
5. Existing minute cron remains unchanged. Gateway `verify_jwt=false` is required because that cron authenticates using `x-cron-secret`; a regression locks this configuration in place.

The readiness result confirms configuration and sender ownership, not handset delivery. Any change to the shared global SMS sender must be reviewed against its other consumers. No customer or owner test messages were sent during implementation.

## Verification

- 22 Deno tests, without network permission: existing email behavior; fixed SMS recipient/content; rejection versus uncertainty; no automatic resend; independent channel configuration; authenticated, side-effect-free readiness; dedicated sender precedence; cron gateway setting.
- Native PostgreSQL suites apply the actual upload confirmation RPC and migrations: replay/replacement dedupe, historical cutoff, independent channel states, lease uncertainty, cancellation, RLS/RPC access, latest staff status and retention cleanup.
- Mounted admin page tests verify accepted/indeterminate/earlier-upload labels, unavailable status fallback, persistent human follow-up records, ticket opening and delete/restore behavior.
- Frozen Deno typecheck passed. Frontend typecheck passed with the ES2021 library; the unmodified ES2020 configuration reports an existing `replaceAll` use in `AdminManualRepresentationLinks.tsx`. Scoped lint has no errors and two existing hook-dependency warnings in the staff page.
- CI: `.github/workflows/ticket-upload-alerts.yml` runs the Deno and isolated PostgreSQL suites without provider credentials or sending permission. Existing build checks exercise the updated admin fixtures.

Provider semantics checked against official documentation: [Twilio Message resource](https://www.twilio.com/docs/messaging/api/message-resource), [message status callbacks](https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks), and [IncomingPhoneNumber read API](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource).
