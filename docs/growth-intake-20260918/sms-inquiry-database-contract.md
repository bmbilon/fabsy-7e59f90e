# SMS inquiry database contract

Local implementation for the separate SMS bridge release. Apply `20260918220000_sms_vapi_bridge.sql` before `20260918221000_sms_intake_inquiries.sql`. Neither migration backfills inquiries or emails from historical transport records.

`claim_sms_intake_inbound` wraps the transport claim in one transaction. The sender row lock serializes grouping; the provider MessageSid deduplicates capture. Ordinary, non-opted-out messages join the same sender/destination inquiry if its most recent activity is less than 24 hours old. New inquiries queue one notification containing the first message snapshot. STOP, START and HELP do not create inbox content or notifications. Later messages, duplicate deliveries and HMAC-key rotation do not enqueue another notification for that inquiry. Raw attachment URLs are never persisted or downloaded.

`complete_sms_intake_inbound` wraps the transport completion and saves reply text only when `reply_allowed` is true. It retains the underlying STOP/START locking, stale-lease suppression and duplicate-completion behavior. Stored reply text describes the response selected for the webhook; a separate provider delivery status shows what happened after transmission.

## Privacy and staff access

| Record | Database retention |
| --- | --- |
| Inbound text and selected reply text | 30 days per message |
| First-message notification snapshot and frozen email provider payload | 30 days from first message, independently of later inquiry activity |
| Inquiry phone numbers | 30 days after its last inbound message; 24 hours of inactivity opens a separate inquiry |
| HMAC sender identifiers, message IDs, lengths and delivery metadata | 90 days under the base migration |
| Opted-out sender HMAC | Retained to preserve suppression until the sender re-enables replies; no plaintext phone/body in that record |

The staff RPC excludes expired content immediately. A daily 03:07 database cron removes it; cascading foreign keys remove dependent content if the inquiry or base metadata is removed earlier. Content can remain physically present until that scheduled purge after its access deadline. The database retention policy does not purge Twilio/Vapi records or delivered staff mailbox copies, which follow their own policies.

The three raw inquiry tables have RLS and no anonymous or authenticated direct privileges. `admin_sms_intake_inbox()` checks a signed-in user and the existing explicit admin/case-manager role helper. It returns the newest 50 inquiries with their newest 50 messages, oldest first within each inquiry, plus total message count/truncation flags and coarse email/delivery status. No advertising events, customer records, ticket drafts or payments are created.

## Notification delivery

The email worker uses service-only claim/freeze/finish RPCs and a stable `sms-inquiry-<notification-id>` provider key. Claim leases last three minutes; the worker requests five at a time. First-attempt time and frozen email bytes survive retries and lost workers. After 23 hours, retryable or expired sending records become indeterminate and cannot be automatically reclaimed. A stale claim cannot finish a replacement lease. Provider acceptance is distinct from mailbox delivery.

Freeze validates the existing internal delivery route: `hello@fabsy.ca` primary and `brett@execom.ca` Bcc. The worker additionally validates the frozen route before sending. One first-message snapshot per inquiry is intentional; staff can read follow-up messages in the inbox without receiving an email for each message.

`sms_intake_readiness()` is service-only and read-only. It returns `{version:1,contracts_ready:boolean,circuit_enabled:boolean}` after verifying expected tables and exact RPC signatures. It does not create/claim messages, change the circuit or enqueue/send notifications. The authenticated worker dry run combines this with read-only provider checks.

The migration creates the email cron **inactive** when the existing Vault URL/cron secret and provider extensions are available. Root must verify both workers and the exact routing, then explicitly activate `fabsy-sms-intake-emails` as part of the reviewed bridge rollout. The AI circuit starts disabled in the base migration. The retention crons are active; they never contact providers.

## Local verification

Run `node scripts/test-sms-intake-db.mjs`. It uses an isolated PostgreSQL cluster and local scheduler stubs, applies both actual migrations including the base transactional assertions, and exercises actual SQL behavior. It makes no provider calls.

Coverage includes historical non-backfill, private grants and staff roles, duplicate capture/completion, STOP races, HELP/opt-out exclusion, 24-hour grouping, destination separation, HMAC rotation, first-message snapshots, frozen recipient/payload, retry/lease recovery, stale-worker refusal, the 23-hour fence, terminal outcomes, monotonic delivery readback, content expiry, opt-out preservation, response bounds and concurrent first-message/duplicate delivery races.
