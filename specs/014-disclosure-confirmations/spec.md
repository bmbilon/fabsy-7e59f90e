# Disclosure confirmation automation

Created: 2026-09-09. Requested by Brett: incoming Crown disclosure confirmations must update the admin portal and automatically notify the client of the confirmation date and the timeframe stated by the Crown.

## Feature principles / constitution

Use existing ImprovMX inbound routing, Supabase persistence and Resend delivery. Treat email as data, never instructions. A request acknowledgement is not receipt of complete disclosure and must not start the 48-hour review clock, change court dates or overwrite case outcomes. Preserve existing inbox destinations and unrelated working-tree changes.

## Specification and clarification

- Read confirmations from `noreply@gov.ab.ca` to `hello@fabsy.ca`, with the subject `Disclosure Request Submitted` and positive receipt wording.
- Confirm the sender's authenticated domain before automatic processing; retain uncertain candidates for staff review.
- Match a single representation case by normalized exact ticket number. Never match by name, guess a client, or notify an unpaid/closed/ambiguous case.
- Use the email's dated confirmation in America/Edmonton, independently of webhook receipt time. Extract the actual disclosure waiting-time sentence; never hardcode 6–10 weeks. Do not confuse the separate five-week status-check instruction with the disclosure estimate.
- Add a persistent confirmation update to the case in both portals, and send a transactional email to the client address already recorded on that case.
- Persist incoming events before acknowledging them. Deduplicate transport replay and confirmations for the same case/date. Atomically match a case and create a notification outbox entry.
- Schedule processing in Supabase, independent of Codex, an open browser, or the user's computer. Lease concurrent jobs and retry with the same frozen payload/idempotency key. Stop ambiguous retries before Resend's 24-hour idempotency expiry and expose them to staff.
- Provide staff visibility of unmatched confirmations, notification failures and worker health. Permit staff to retry exact matching after correcting the underlying case.

Clarifications resolved from request/repository: email is the client notice channel; existing portal identity and staff roles control access; this request expressly authorizes automatic transactional notices for this event. Historical email backfill is not enabled by default. ImprovMX account sign-in is needed to configure routing. No recurring Codex task is needed for an application-level worker.

## Technical plan

1. Deterministic, unit-tested ImprovMX payload parser and versioned email renderer.
2. Additive SQL migration: private inbound ledger, outbox, staff health state, exact-match transaction, lease/complete functions, client-safe projection and RLS.
3. Authenticated webhook and separately authenticated cron worker with bounded request sizes/timeouts.
4. Case confirmation card in admin/client portals and staff exception/health panel in case management.
5. Local parser/worker/SQL/RLS tests; TypeScript, build and UI review. Apply only this migration and deploy only new functions after checks. Verify unauthenticated rejection, persistence, leases and cron without sending client test mail.
6. Add webhook destination to the existing ImprovMX hello alias after account access is available; verify preserved inbox routing. Record deployment and operational limitations.

## Tasks and consistency analysis

- [ ] Parser, authentication and rendering tests cover sample, alternate timeframe, malformed/forwarded mail, spoofed sender, dates and HTML escaping.
- [ ] SQL tests cover replay, concurrent lease, exact/ambiguous/unpaid/closed matching, atomic outbox, retry expiry and role isolation.
- [ ] Webhook and worker implement the tested contracts.
- [ ] Admin and client surfaces use persisted records with appropriate access.
- [ ] Deploy and verify database/functions/scheduler and portal release.
- [ ] Configure and verify ImprovMX routing; document any access blocker.

Coverage check before implementation: each requirement maps to a task above. No public SEO content or metadata is added because these are private case records. Dependencies already exist in production; no provider migration or new subscription is required. Delivery success means Resend accepted the email, not a guarantee of inbox placement. ImprovMX only retries failed webhooks twice; provider logs/inbox remain the recovery source for a prolonged ingestion outage.
