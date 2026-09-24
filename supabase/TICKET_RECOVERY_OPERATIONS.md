# Uploaded-ticket recovery

The `process-ticket-recovery` Edge Function and the `fabsy-ticket-recovery` database schedule implement the customer follow-up flow. This runs in Supabase, independent of Codex or a laptop being open.

## Activation and cadence

Installation is disabled and sends nothing. Set a real business mailing address before activation. The staff/service-role-only `configure_ticket_recovery(true, <mailing address>, array[24,72,168])` RPC activates the flow and atomically disables the previous one-time draft reminder. It refuses activation while a legacy delivery is in flight. Other supported cadences are `[24]` and `[24,72]`. Enrollment begins with the preceding 14 days of uploads and continues for new uploads. Cadence changes after enrollment do not reschedule existing events; change the cadence before first activation.

New uploads are due after 24 hours, 72 hours, and 168 hours. A scheduler runs every 15 minutes, but sends only 09:00–18:00 America/Edmonton. Overdue enrollments are spaced from activation rather than sending a burst. Earlier confirmed legacy emails consume the first email stage; subsequent stages preserve at least 48 hours after a previous send. Each source gets at most three attempts per channel. Unfinished reminders expire after 30 days.

Pause with `update public.ticket_recovery_settings set enabled=false where singleton`. Pausing does not reactivate the legacy worker. Re-enabling keeps the original enrollment boundary and preserves receipts.

## Eligibility and links

Sources include stored submitted ticket documents and incomplete draft uploads. Converted drafts resolve to the case, and restarting a ticket resolves consent/payment by the same email and ticket number. New universal service orders are checked alongside the case and payment ledger. Ambiguous unmatched paid orders are held. Checkouts in Stripe are rechecked before unpaid reminders, including standalone Payment Links and delayed payments. Provider lookup failures fail closed.

- `/payment` when consent is complete and payment is missing.
- `/consent` when payment is complete and consent is missing.
- `/checkout` when both are missing.

Emails use `Ticket <actual ticket number> — Complete your <missing requirement>`. SMS includes the same stored number. Missing or unreviewed ticket numbers, unavailable uploads, incomplete contact permission, missing email/phone, SMS without opt-in, staff-followed-up drafts, internal contacts, and uncertain payments are held or suppressed. A case status alone never proves consent or payment. No consent is fabricated, reset, or preselected.

Representation consent is separate from SMS opt-in. The current quick upload form collects email but does not collect SMS opt-in; existing records must not be retroactively opted in. SMS eligibility comes from the existing optional SMS permission in the longer intake or an explicitly recorded permission. Future changes to collect phone/SMS permission in the quick form should record a separate affirmative choice.

## Preview, receipts, and review

A service-role/cron authenticated POST with `{"dry_run":true,"check_payments":true}` returns current candidate states without enrolling, sending, or changing customer data. Public callers cannot use this endpoint. A regular authenticated POST drives the queue. The settings row reports the last worker time/error. Staff can read settings and event statuses with existing staff RLS; only service-role can mutate.

Inspect `ticket_recovery_events` for pending/sent/held/suppressed/uncertain outcomes and provider receipts. `sent` means provider acceptance, not confirmed inbox/handset delivery. Safe preflight holds automatically reevaluate when records improve; an `uncertain` provider attempt is never retried automatically and blocks later reminders on that source/channel. Investigate Gmail/Twilio before any manual change. Gmail's deterministic Message-ID is not assumed to provide API idempotency.

A successful unsubscribe POST writes a channel/address suppression. GET redirects to the first-party static confirmation page so link scanners do not unsubscribe customers. The signed URL exposes no customer details. SMS respects existing STOP state and Twilio 21610 suppressions; messages identify Fabsy and say STOP. Do not change existing opted-out records to bypass delivery rejection.

## Validation

```
deno test --no-config --no-npm --allow-env supabase/functions/_shared/ticket-recovery.test.ts supabase/functions/process-ticket-recovery/index.test.ts
node scripts/test-ticket-recovery-db.mjs
deno check --no-config supabase/functions/process-ticket-recovery/index.ts
```

Tests use synthetic records and mocked providers, never real customer messages or charges. Deploy only this function and `20260924120000_ticket_recovery.sql`; publish the static `reminder-preferences` assets before enabling sending. Do not push all pending migrations from the older primary checkout.

Reference: [CRTC CASL questions](https://crtc.gc.ca/eng/com500/faq500.htm), [Twilio messaging policy](https://www.twilio.com/en-us/legal/messaging-policy).
