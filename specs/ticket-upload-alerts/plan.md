# Ticket upload email alerts

## Constitution
Use the existing Supabase/Resend setup. Confirmed upload persistence must not depend on email delivery. Restrict customer details to Brett's verified admin account. Keep customer resume messages and completed-submission notifications unchanged.

## Specification and clarification
Brett explicitly requests automatic email notifications whenever a ticket is uploaded, including abandoned/incomplete intakes. The two phone calls in the prior diagnostic were tests. Recipient resolved from the existing verified admin account: brett@execom.ca. Trigger is a server-confirmed ticket upload, not selecting a file or allocating an upload URL. Each distinct confirmed replacement file also alerts once. Replays of the same confirmation do not alert again. Include available name/contact, language, upload time, intake reference and staff queue link; omit ticket attachment, legal details and bearer resume links. Send one catch-up alert for the known unfinished uploaded intake from today after activation.

## Technical plan
1. Add a service-only transactional upload-notice outbox via a trigger on confirmed draft uploads. Freeze contact details at the event and email bytes before the first provider request.
2. Add a private worker using the existing cron credential and Resend API. Verify the configured recipient remains a confirmed admin. Use leased claims, provider idempotency keys, bounded retries and a 23-hour replay cutoff inside Resend's 24-hour idempotency window.
3. Schedule the worker every minute using existing Supabase vault scheduler secrets. No frontend deployment is needed. The next cron tick normally sends the alert within about a minute.
4. Test actual PostgreSQL trigger/claim behavior, provider errors/retries, safe rendering and authentication. Deploy only this migration/function; activate recipient configuration; enqueue today's missed upload; verify one send and duplicate suppression, then provider/mailbox receipt if accessible.

## Tasks and consistency check
- [x] Database queue, leases, immutable payload and role protections
- [x] Email template, private worker, recipient verification
- [x] PostgreSQL and Deno tests
- [ ] Deploy migration, worker and minute schedule
- [ ] Catch-up notification and delivery verification
- [ ] Commit and preserve release evidence

Requirements map directly to the upload trigger (early notification), unique object key and stable provider key (deduplication), minute schedule/retries (delivery), verified admin guard (recipient), and caught worker failures outside intake requests (upload availability). No customer outreach or campaign changes are in scope.
