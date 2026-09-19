# SMS bridge release

This change replaces only the main number's inbound SMS webhook after verification. Twilio receives and sends Canadian SMS; the ordinary Vapi Chat API supplies text responses using the reviewed existing text assistant. Vapi native SMS transport is not used. Voice URL, voice status callback, phone-number ownership, messaging-service membership, and WhatsApp routing must remain as recorded before release.

## Configuration

Both new functions have `verify_jwt = false`: `sms-vapi-webhook` validates Twilio signatures, AccountSid and the configured destination; `process-sms-intake-emails` requires the existing internal cron secret or service-role bearer before any operation.

Required shared settings are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `VAPI_PRIVATE_API_KEY`, `RESEND_API_KEY` and `IDR_CRON_SECRET`. New settings:

- `TWILIO_SMS_NUMBER`: the verified owned SMS number, E.164.
- `SMS_WEBHOOK_URL`: exact public HTTPS URL ending `/functions/v1/sms-vapi-webhook`, with no query or fragment.
- `SMS_VAPI_ASSISTANT_ID`: the reviewed existing text assistant UUID. Readiness returns its actual name and rejects action-enabled assistants. Do not configure the voice-menu assistant.
- `SMS_SENDER_HASH_KEY`: separate HMAC secret of at least 32 bytes. Optional `SMS_SENDER_HASH_KEY_PREVIOUS` supports rotation; it must differ and meet the same minimum.
- Optional `SMS_RATE_LIMIT_PER_10_MINUTES` (default 10; range 1–100), `SMS_GLOBAL_RATE_LIMIT_PER_10_MINUTES` (default 60; range 1–1000), `SMS_GLOBAL_RATE_LIMIT_PER_DAY` (default 500; range 1–10000).

Apply migrations 220000 then 221000. The new SMS AI circuit starts disabled and the new email cron job is created inactive. Deploy both functions before running the authenticated `process-sms-intake-emails` POST with `{"dryRun":true}`. This checks configuration, Twilio owned-number access, Vapi assistant access and exact database contracts without creating chats, SMS, inquiries or emails. A disabled circuit is expected before activation and is explicitly reported.

Complete source review and readiness before enabling the circuit/email cron or changing the main number's SMS URL. Verify the `/admin/sms` route and its dashboard link after the frontend deployment. Changing only the SMS URL leaves provider-level opt-outs and voice routing intact. A real controlled SMS exchange is still required to verify delivery callbacks and actual model behavior; fixture tests and GET readiness do not establish handset delivery.

## Processing boundaries

An ordinary signed inbound SMS is saved to a staff-only inquiry before response generation. The original MessageSid is the dedupe key. STOP, START, HELP, duplicates and opted-out messages do not create new inquiries or staff email. Twilio OptOutType is authoritative, and its built-in control acknowledgement is not duplicated. Media URLs are never fetched or stored; the reply directs the sender to secure intake. The assistant receives SMS-specific instructions, a 24-hour inactivity context window and a 600-character reply cap.

Each sender RPC is bounded to 1.5seconds; the Vapi request to 9 seconds. The claim, authorization and completion RPCs plus the model call have a 13.5-second I/O budget. Response delivery is not guaranteed: provider timeouts, a lost response, or an opt-out arriving during generation can suppress it. Replayed MessageSids do not repeat AI calls or replies. Staff can distinguish a prepared reply from provider-confirmed delivery.

One email is queued per inquiry (a new inquiry begins after 24 hours of inactivity). The first-message snapshot and rendered payload are frozen before sending under a stable Resend idempotency key. Retries stop before its 24-hour dedupe window expires. Provider acceptance is shown as delivery unconfirmed. Worker failures return 503; the inbox exposes the persisted queue state. Database content is retained 30 days; provider systems and sent mailbox copies have their own retention. SMS inquiries do not create tickets, purchases, clients, or advertising conversion events.

## Verification

The dedicated `SMS intake bridge checks` workflow runs Deno handler, client, readiness and email tests; compiles both Edge Function entrypoints; mounts the inbox/admin gate in offline JSDOM; and runs both migrations against an isolated native PostgreSQL instance, including concurrent sender/MessageSid claims. Tests mock provider calls and cannot send messages.

For rollback, restore the recorded prior SMS URL before disabling the new circuit or functions. Keep inquiry records and their staff view for operational follow-up; review queued notifications before changing cron state. Do not delete existing data or change voice/WhatsApp settings as part of SMS rollback.
