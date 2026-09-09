# Ticket upload alerts

Confirmed ticket uploads enqueue an internal email to the configured, verified admin before the customer completes the intake, consent or payment. This fills the gap between upload-first drafts and existing completed-submission notifications.

- Recipient secret: `TICKET_UPLOAD_ALERT_TO`, currently `brett@execom.ca`. The worker verifies this exact address is a confirmed Supabase Auth user with the admin role before claiming work.
- Sender: `Fabsy <hello@fabsy.ca>`, through the existing Resend account.
- Content: available name, email, phone, language, upload time and intake reference, with a sign-in link to `https://fabsy.ca/admin/cases`. No ticket attachments, legal details or customer resume capabilities are included.
- Timing: Supabase job `fabsy-ticket-upload-alerts` calls `process-ticket-upload-alerts` every minute with the existing vaulted IDR cron credential. Normal delivery begins on the next minute tick, subject to provider latency.
- The worker accepts only the private cron secret or exact service-role bearer token. It does not accept browser sessions or arbitrary recipients in request bodies.

## Event and retry behavior

`queue_confirmed_ticket_upload_alert` runs in the same transaction that sets a draft's confirmed upload state. It queues one record per draft and private file fingerprint. Repeated confirmations and form saves do not create another notification. A confirmed replacement file gets its own alert. Selecting a file, preparing a signed upload URL, and unconfirmed/failed uploads do not alert.

A worker claims up to 10 notices using row locks and three-minute leases. Contact details are captured at upload time; exact email bytes are persisted before the first provider call. The Resend idempotency key is `ticket-upload/<notice UUID>`. Provider/network failures retry with the same key and bytes. A crashed worker is reclaimable after its lease expires. The retry deadline is 23 hours from the first claim, inside Resend's documented 24-hour idempotency window. Permanent rejection is recorded as `failed`; ambiguous work older than the replay window becomes `indeterminate` and requires review rather than risking another delivery.

The outbox is service-only and inaccessible to browser users. Its contact snapshot and email payload are deleted when the parent draft is deleted under the existing retention process. No Resend call runs in the customer upload request, so provider failures cannot fail an otherwise confirmed upload.

## Release and checks

Apply migration `20260909230000_ticket_upload_alerts.sql` and register that version in Supabase migration history. Deploy only `process-ticket-upload-alerts`, set its recipient secret, and verify the cron job exists and is active. The migration schedules only when the existing pg_cron, pg_net and vault prerequisites are present; production release verification must fail if the schedule is absent.

Run:

```
node scripts/test-ticket-upload-alerts-db.mjs
deno test --allow-env supabase/functions/_shared/ticket-upload-alert.test.ts supabase/functions/process-ticket-upload-alerts/index.test.ts
```

The database suite runs in a temporary local PostgreSQL cluster and exercises the actual existing confirmation RPC, initial/replacement upload triggers, replay deduplication, private privileges, leased claims, frozen payloads, retry delays, the expiry fence and retention cleanup. Deno tests cover safe email rendering, provider idempotency/errors, verified recipients, immutable retry payloads, send-acknowledgement loss, no-send on payload-save failure, and worker authorization.

For a known missed upload, a privileged operator can call `enqueue_ticket_upload_alert` for that specific draft. It is safe to repeat and returns null if already queued or ineligible. Do not backfill an entire historical test population.

Inspect operational results without recipient or case content:

```sql
select status, count(*) from public.ticket_upload_alerts group by status;
select id, draft_id, uploaded_at, status, attempt_count, provider_email_id, sent_at, failure_code
from public.ticket_upload_alerts order by created_at desc limit 20;
select jobid, jobname, schedule, active from cron.job where jobname='fabsy-ticket-upload-alerts';
```

`sent` means the provider accepted the message and returned its ID. Confirm actual delivery from Resend delivery status or the recipient mailbox; do not equate provider acceptance with inbox arrival. Only Brett's internal alert was authorized; this feature does not enable or send customer resume messages.

### Production release — September 9, 2026

- Deployed `process-ticket-upload-alerts` from commit `dbeb0486` to project `gcasbisxfrssonllpqrw`.
- Applied only migration `20260909230000` and registered it in migration history. Verified the upload trigger is enabled, the minute schedule is active, and the recipient secret is configured.
- The scheduled invocation returned HTTP 200 and sent the one authorized catch-up alert at 23:03 UTC (5:03 p.m. Edmonton). The outbox recorded one attempt, a provider email ID, and no failures. Re-enqueuing that same upload returned null and the outbox remained one sent row.
- An unauthenticated live request returned HTTP 401. The local historical service-role token also returned 401; the configured private cron credential was verified by the successful scheduled send. Operators should use the scheduled invocation or the current worker credential, not assume a local `.env` token matches.
- PostgreSQL integration checks and all 12 Deno tests passed. Independently verified the exact catch-up subject in the browser's authenticated `brett@execom.ca` Gmail account: exactly one matching message, labeled Inbox, received at 5:03 p.m. It was left unread. The separately connected Gmail account and signed-in Resend dashboard were different accounts and were not used as delivery evidence.

To pause delivery while investigating, unschedule only `fabsy-ticket-upload-alerts` or remove the configured recipient secret. Confirmed uploads continue to enqueue for later handling. Do not remove the outbox or its duplicate fences.
