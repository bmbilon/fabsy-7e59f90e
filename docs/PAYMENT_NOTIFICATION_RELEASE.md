# Staff notifications and paid-client SMS

## Feature principles

Use verified payment facts, full stored ticket references, and the existing email and SMS providers. Preserve independent client messages and all previously accepted delivery receipts. Staff alerts must not delay fulfillment or repeat after an uncertain send. Follow the project constitution's typed implementation, source checks, focused validation and private-data requirements; this backend-only change adds no public page.

## Specification

Brett's September20,2026 instruction replaces staff notification routing to brett@execom.ca with hello@fabsy.ca only. This includes backup staff copies and SMS/call/portal/internal intake alerts. Client-addressed notices keep their actual client recipient.

Every newly verified live paid checkout should enqueue an SMS to +14036695353. It begins and ends with 💵 and includes the actual total collected, currency, stored client name and complete stored ticket number. Example format: `💵 Payment received: $207.90 CAD — Client Name — Ticket E12345678A 💵`.

## Clarifications resolved from the request and existing project instructions

- “Notifications” means the internal notification route and backup staff copies currently directed to Brett's Execom address.
- “Whenever someone pays” means verified successful live payments across supported checkout products; the actual charged total includes applicable tax.
- A checkout page view, an unpaid checkout, a staff status label or a repeated Stripe webhook is not a new payment.
- Missing or ambiguous ticket/name/payment identity is held for review, as required by AGENTS.md; never invent a reference or substitute an intake UUID.
- Apply prospectively. Do not text historical purchases or resend old emails.
- Existing providers and the specified phone number are authorized. No new provider purchase or contact clarification is needed.

## Plan

1. Remove the backup recipient through the shared internal routing helper, all affected function bundles and the legacy forwarding handler/defaults.
2. Add a durable payment SMS outbox with service-only enqueue and claims, staff-visible review state, checkout/payment deduplication and a deployment cutoff.
3. Enqueue after the existing signed live Stripe paid-fulfillment checks, independently of customer-email delivery, using the actual amount collected and validated stored case identity.
4. Process the outbox through a small authenticated scheduled worker using existing Twilio configuration. Reserve before sending; freeze the message and hold uncertain attempts without automatic resend.
5. Compare every affected function with deployed source before publishing, preserve unrelated live changes, apply only the new migration, and verify source parity and health afterward.

## Tasks and consistency review

- [x] Recipient routing and focused regression tests.
- [x] Payment producer, outbox, worker and focused identity/deduplication tests.
- [x] Review live source differences; SMS configuration readiness is part of deployment verification.
- [x] Validate exact amount, full ticket, fixed recipient, replay handling and uncertain-send behavior.
- [ ] Deploy affected backend components and confirm active schedule/source parity.
- [ ] Record deployment evidence and any review holds.

The recipient work and new SMS worker are independent. Existing client recipients are preserved. New payment events produce one outbox record; worker retries cannot create a second possibly accepted message. There is no reason to replay historical payments to demonstrate this feature.

## Validation and rollout evidence

The nine internal-email functions were deployed and then downloaded again: all are ACTIVE, and all 63 downloaded TypeScript file instances match the reviewed hello-only routing commit. The live voice-notification function was already hello-only. The active inbound Twilio route uses the reviewed SMS intake webhook, so no phone-number routing was changed. No outstanding queued email payload required rewriting or replaying.

Email checks passed: 43 focused Deno tests, 20 contact/locale/branding tests, five legacy Twilio override tests, the Vapi recording handler integration, and type checks for all nine affected entrypoints. Existing signed-payment measurement, 23 funnel, eight payment/refund ledger, and 16 checkout branding regressions also passed.

Payment SMS deployment verification remains pending until the exact new migration, worker, and signed-payment webhook are published and their live readiness and schedule are confirmed. No historical payment or real outbound test message has been sent.

Payment validation passed: 16 focused Deno tests (nine SMS helpers, three worker HTTP tests, four signed Stripe webhook tests), the actual migration against isolated PostgreSQL with ownership/RLS/replay/claim assertions, and simultaneous claim transactions. Independent review also caught and fixed report purchases on an already-paid ticket: only combined ticket/report checkouts enforce representation-session and included-assessment claims. Separate add-on and linked standalone report payments retain the original representation payment and now enqueue their own payment alert. A conflicting combined checkout remains rejected.

The deployed worker's authenticated readiness check returned HTTP200 through the exact vault-backed cron authentication path and confirmed ownership/SMS capability of the configured Twilio sender without sending a message. An unauthenticated request returned401. The CLI-retrieved service-role credential did not match this function's service credential; scheduled processing uses the separately verified cron secret.
