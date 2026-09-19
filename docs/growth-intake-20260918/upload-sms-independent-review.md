# Independent upload SMS review

Reviewed the prospective upload SMS migration, sender/processor helper, upload
worker, staff status RPC, admin display, and database/types changes. No production
writes or messages were performed by this review.

## Outcome

No code blocker found in the reviewed implementation. The release has a
configuration dependency: the existing runtime `TWILIO_PHONE_NUMBER` fingerprint
does not match either current Twilio-owned number. Configure a verified sender
for the new channel before release. The runtime account SID matches the account;
the fixed staff destination matches the existing forwarding route (`***5353`).

- SMS and email use independent queues, so an outage in one channel does not
  suppress the other. Missing configuration does not claim unsendable work.
- Each new confirmed upload gets one SMS attempt. There is no migration backfill.
  Claim expiry, network/5xx/malformed responses, and lost completion writes remain
  indeterminate and are not automatically resent.
- Claims use locking and unique alert IDs. Closed/deleted/expired or
  permission-withdrawn intakes are ineligible. Retention cascades remove the
  notification rows with the parent intake.
- The SMS contains a generic event notice and an authenticated admin URL. It
  carries no customer details, ticket content, document links, or bearer tokens.
- The worker retains cron/service authentication and JWT configuration. Queue
  mutation is service-only; the status RPC requires an authenticated staff user
  and returns only draft ID plus channel statuses.
- Admin labels accurately distinguish provider acceptance from confirmed
  delivery, and an alert-status lookup failure does not hide operational leads.
- The worker's SMS batch was reduced from ten to five after review, keeping five
  worst-case send/completion timeouts within its three-minute claim lease.

## Independently executed checks

- `deno test --no-config --no-npm --allow-env supabase/functions/_shared/ticket-upload-sms.test.ts`: 6 passed.
- `node scripts/test-ticket-upload-alerts-db.mjs`: existing email suite, historical
  fixture/no-backfill check, and new SMS database suite all passed.
- `git diff --check`: passed.
- Live configuration checks compared only secret fingerprints with verified
  account/number values; no credentials or full recipients were printed.

These checks establish local behavior and live configuration facts. A controlled
provider-acceptance check after the release is separate; this review did not send
one and does not claim handset delivery.

## Read-only deployment readiness addition

Reviewed the added authenticated `POST {"dryRun":true}` contract. It checks the
effective dedicated `TICKET_UPLOAD_ALERT_SMS_FROM` sender (falling back to the
existing global only when absent) through Twilio's read-only owned-number lookup.
It requires exact account, phone number, and SMS capability; results contain only
coarse readiness/error codes. It exits before constructing the database client,
claiming work, or invoking a send. Invalid dry-run values fail with HTTP 400 and
unauthorized requests fail before the lookup.

Independently reran the SMS helper and worker tests after this addition: all 11
tests passed. The earlier live v7 worker did not parse request bodies, so invoke
this dry run only after verifying the newly reviewed worker version is deployed.
Its success proves account access and sender ownership/capability, not recipient
delivery or Vapi inbound-message handling.
