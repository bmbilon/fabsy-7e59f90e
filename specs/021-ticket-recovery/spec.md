# Ticket recovery automation

## Constitution
Preserve recorded authorization; never infer consent from a status or silently precheck it. Use existing public /checkout, /consent and /payment. Require the stored ticket number in every message. Keep customer data private, honor opt-outs, stop completed cases and avoid duplicate sends.

## Specification and clarification
Brett requested email and SMS follow-ups for uploaded tickets awaiting payment and/or representation consent, and an audit of recent consent records. Proposed cadence: 24 hours, 3 days, 7 days; preference requested. Send only 09:00–18:00 America/Edmonton. Existing one-time draft reminder receipts count toward the limit. Include uploads from the last 14 days on activation, spacing catch-up reminders rather than sending three at once. Separate SMS opt-in remains required. Missing identity, ticket number, upload, contact, mailing address, or ambiguous payment is held for review. Do not treat missing authorization evidence as evidence of unchecking a box.

## Plan
Use a new Supabase outbox with source snapshots from submitted cases and incomplete drafts. Resolve converted/duplicate sources, service-order consent/payment and payment ledger evidence. Check Stripe before payment reminders. Select the required universal link immediately before sending. Email through the existing Google Workspace adapter, SMS through existing Twilio credentials. Add a public signed unsubscribe endpoint without exposing case data. Persist an attempt before provider calls; never automatically retry uncertain delivery. Replace the older one-time reminder only when this flow is activated. A small static reminder-preferences page ships through the existing website release process.

## Tasks and consistency check
- [x] Snapshot eligibility, payment/consent audit and staff holds.
- [x] Durable staged outbox, suppression and activation controls.
- [x] Templates, provider adapters, unsubscribe and read-only preview.
- [x] SQL concurrency/lifecycle tests and worker/provider tests.
- [ ] Deploy only the new migration/functions, preview actual candidates, verify scheduler.
All message paths require an actual ticket number and choose the public links; no new client-specific checkout or case is created.

## Live verification
The new function and migration are installed with sending disabled. The live dry-run found six eligible email contacts and one SMS contact after Stripe checks, and held missing ticket/contact details. No recovery messages have been sent. Activation is pending the business mailing address; cadence defaults to 24/72/168 hours.
