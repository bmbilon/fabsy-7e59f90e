# SMS enquiry and call recording follow-up

## Scope and requirements

Connect incoming SMS on Fabsy's existing public number to a staff-only Supabase inbox, an AI text reply, and the existing internal email recipients. Preserve the current voice and WhatsApp routes, ticket/payment records and advertising-consent boundaries. An SMS enquiry must not create an intake draft, authorized case or ad conversion.

Use the existing Vapi text assistant through the ordinary Chat API, because Vapi's native inbound-SMS documentation limits that transport to US numbers. Twilio continues to deliver inbound messages and TwiML replies. The Supabase webhook verifies the Twilio signature, account and receiving number before persisting data or requesting a reply.

The bridge must deduplicate message IDs, serialize conversations, honor STOP/START/HELP, recheck opt-out before returning a reply, bound response cost and duration, and avoid downloading attachments. Internal email uses a durable outbox and a stable provider idempotency key. The admin inbox distinguishes prepared replies, provider statuses and delivery failures.

Retrieve Vapi call recordings through the authenticated canonical API and then its signed storage redirect. Keep the Vapi credential off storage requests. Retain the current call-email routing and separate voice-notification worker.

## Implementation and verification

- Add isolated SMS transport and enquiry migrations, staff RPCs, retention and inactive email schedule.
- Add the signature-validated webhook, Vapi Chat adapter, internal email worker, authenticated read-only readiness, and staff inbox.
- Add contact/retention copy that matches the implemented data flow.
- Test signature failure, duplicate messages, concurrency, opt-out races, bounded costs, private access, queue retries, idempotency expiration, retention and the actual recording handler using inert providers and disposable databases.
- Keep the Google navigation check sensitive to the initial local file chooser even when that control is outside a form.
- Independently review the SMS and recording changes before release.

## Release order

1. Freeze reviewed source and apply only its named migrations atomically with migration-history rows. Preserve independent live migrations absent from this branch.
2. Set the new SMS configuration using existing Twilio/Vapi credentials, a new dedicated sender-hash key, the public number and the existing text-assistant ID. The SMS circuit and email schedule start disabled.
3. Deploy only the two SMS functions and the recording handler, preserving their explicit authentication contracts. Read back live versions and perform authenticated readiness GETs without creating chats or sending messages.
4. Enable the SMS circuit and new email schedule, then update only the main number's SMS URL/method. Read back the exact SMS route and unchanged voice settings. Revert the SMS URL and disable the circuit/schedule if preflight or routing checks fail.
5. Deploy the reviewed frontend through the backend-first gate and inspect the public contact route and staff inbox. Record observed provider acceptance separately from real handset/inbox delivery.

No historical message or call callback is replayed. A natural subsequent SMS/call is required to verify delivery and a new recording copy in production.
