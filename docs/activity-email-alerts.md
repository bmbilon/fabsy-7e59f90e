# Internal activity email alerts

All actionable customer activity is reported to **hello@fabsy.ca**, including
activity without a client, submission, traffic ticket number, or contact email.
When a verified traffic ticket number is available, it leads the email subject.
Missing numbers never get replaced by an intake UUID or a Tawk support ID.
Passive visits, widget opens and automated greetings do not generate email.

## Delivery paths

- **Payments:** the signed Stripe webhook queues an internal email before case
  fulfillment. Standalone Payment Links are recognized using the configured
  Photo Radar price or Fabsy product metadata. The shared Stripe account's
  unrelated products are excluded. Duplicate events and the existing checkout
  database trigger share one session key, including previously sent alerts.
- **Ticket uploads:** confirmed writes to the private `assessment-tickets`
  bucket generate an alert even with no case, draft, contact details, or completed
  intake. The existing draft path enriches the same event before delivery.
  Legacy alert rows remain as parents for upload SMS; their email status is
  read from the new outbox so the two workers cannot send duplicate emails.
  Private files are linked through authenticated admin, never attached publicly.
- **Consent:** existing portal and standalone invitation events send an operator
  alert even when OCR, ticket matching or PDF verification is incomplete. Only
  verified documents are attached; otherwise the email directs staff to review.
  This fallback does not authorize representation or change customer notices.
- **Website questions:** contact and fleet forms persist the internal alert
  before attempting the customer's confirmation. Identical form retries share
  a ten-minute event key.
- **Tawk:** signed `chat:start`, `chat:transcript_created`, and `ticket:create`
  webhooks capture visitor questions, completed transcripts and support requests.
  Anonymous visitors do not need a Fabsy identity. Agent-only conversations and
  automatic greetings are excluded. Transcript alerts include subsequent questions.
- Existing events continue to cover completed insurance-report intakes, driver
  abstracts, refunds/disputes, surveys, client instructions, referral profiles
  and professional licence verification.

The durable `portal_activity_events` outbox is serviced every minute by
`process-portal-activity`, using Google Workspace. Provider failures remain
visible in the queue; ambiguous consent delivery is held for review to avoid
resending a possibly accepted message. `sent` means provider acceptance, not
proof of inbox placement. Inspect hello@fabsy.ca if delivery is disputed.

## Tawk connection

In the Fabsy property's Administration → Settings → Webhooks, connect:

`https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/tawk-webhook`

Select **Chat Starts**, **New Chat Transcript**, and **New Ticket**. Store the
webhook's secret as the Supabase secret `TAWK_WEBHOOK_SECRET`; do not use the
unrelated JavaScript API key. The allowed property is
`6aa1fe19a9c2983442420e67` (`TAWK_PROPERTY_ID` can override it).
Tawk's raw-body HMAC-SHA1 signature is required and event IDs deduplicate retries.
Until the secret and provider connection exist, the endpoint returns 503 and
must not be considered active.

Verify with a clearly labelled anonymous visitor question, then end the chat
and inspect the transcript alert at hello@fabsy.ca. Verify an offline support
request separately. Tawk has no per-message webhook; the start alert and final
transcript cover each conversation.

Sources: [Tawk webhook payloads and signatures](https://developer.tawk.to/webhooks/),
[Tawk webhook configuration](https://help.tawk.to/article/creating-and-managing-webhooks).

## Verification

Tests cover missing identifiers, safe attachment fallback, signed standalone
payments, unrelated Stripe products, queue failure retries, existing payment
fulfillment, Tawk signature tampering, anonymous chat and transcripts.
`supabase/tests/all-activity-alerts.test.sql` checks payment deduplication, legacy
replays, queue permissions and a storage upload with no case. It always rolls back.
`supabase/tests/activity-upload-sms.test.sql` verifies that a confirmed draft upload
still creates and claims its SMS, while only the new queue handles its email.

Do not blanket replay historical activity or reset attempted emails. Recover an
individual missed event only after verifying its source and checking the
canonical event key. Do not alter payment status or create a case just to send an
internal alert.

## Release status — September 22, 2026

Migrations `20260922190000` and `20260922191000`, plus the payment webhook, portal worker, contact form
handler and Tawk receiver were deployed to the Fabsy Supabase project. The queue
health check reports hello@fabsy.ca as recipient, no pending or held events, and
no worker error. A verified missed Photo Radar payment alert was recovered and
accepted by Google Workspace on the first attempt. This verifies email-provider
acceptance; inbox placement has not been independently confirmed.

Tawk provider activation remains pending an authenticated dashboard session and
its webhook secret. The receiver rejects traffic until configured.
Local HMAC, anonymous-question, transcript, and queue-failure tests pass; an actual
Tawk conversation must still be verified after connection.
