# Disclosure request confirmation automation

The system records a Crown request acknowledgement. It does not mark complete disclosure as received, start the 48-hour review clock, change ticket deadlines, or alter outcomes.

## Components

- ImprovMX `hello@fabsy.ca` alias: preserve `brett@execom.ca`, append the private Supabase webhook URL as another destination. Webhooks require ImprovMX Premium; the current free account rejected this destination during setup.
- `disclosure-confirmation-webhook`: checks the dedicated capability, limits input to 256 KiB, ignores unrelated mail, parses Crown candidates and commits the confirmation/matching/outbox transaction before HTTP 200.
- `disclosure_confirmations`: private source ledger, confirmation date in Alberta time, exact normalized ticket and source timeframe. Staff can inspect review reasons; clients access only their matched case projection.
- `disclosure_notification_outbox`: frozen recipient, case facts and rendered payload, stable Resend idempotency key, lease, attempts and provider acceptance receipt.
- `process-disclosure-notices`: Supabase cron every minute, authenticated with the existing private `IDR_CRON_SECRET`. Each run processes at most five notices, one claim at a time, with a 20-second provider timeout.
- Admin case management shows routing/worker status and exceptions. Case detail and client portal show recorded acknowledgements.

## Activation and deployment

1. Run `deno test supabase/functions/_shared/disclosure-confirmation.test.ts` and `node scripts/test-disclosure-database.mjs`. The SQL test creates and removes an isolated local Postgres cluster; it never points at production. Set `DISCLOSURE_TEST_PG_BIN` if necessary.
2. Apply `20260909150000_disclosure_confirmations.sql` and `20260909151000_disclosure_notice_schedule.sql`. Delivery defaults off. The schedule is installed when `pg_cron`, `pg_net`, and Vault entries `idr_project_url` / `idr_cron_secret` exist. A fresh environment must provision those secrets and then rerun the schedule SQL.
3. Provision a random 32-byte `DISCLOSURE_WEBHOOK_SECRET` in Supabase via a private environment file. Never commit it, include it in logs, or use a service-role key as the webhook capability.
4. Deploy the two new functions with `--no-verify-jwt --use-api`. Their own secret checks authenticate callers. Existing `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `IDR_CRON_SECRET` remain in Supabase's secret store.
5. Deploy the portal changes from a clean release checkout. Preserve public production build variables, crawler snapshots, Pages configuration, intake queues and existing middleware.
6. Configure the private alias destination: `https://<project>.supabase.co/functions/v1/disclosure-confirmation-webhook?attachments=false&token=<dedicated secret>`. Keep spam checking enabled. Preserve the existing inbox destination and wildcard alias. Press Enter to save; reload and verify both destinations remain.
7. Verify provider routing with ImprovMX's test and check the webhook heartbeat. Verify normal inbox receipt separately. Set `routing_configured=true` only after successful configuration, and `delivery_enabled=true` after the worker/authentication/queue checks pass.

```sql
-- Service-side operator action only; never callable by a client session.
update public.disclosure_automation_state
set routing_configured=true, delivery_enabled=true where id;
```

The feature's client notice is transactional: confirmation date, ticket reference, the Crown's actual timeframe sentence, a case link and Fabsy contact details. It contains no promotional offer. Resend acceptance is displayed as “Notice sent”; it is not proof of inbox placement. Existing emails are not automatically backfilled.

## Recovery and limits

- **No/ambiguous case:** correct the representation case/ticket identity, then select “Retry case matching.” Do not guess by name or force a link to an unrelated ticket. A recorded representation payment and an active case are required. An existing matching case is considered before state checks, so a duplicate database record cannot silently select another client.
- **Unverified sender, changed template or missing estimate:** inspect the original inbox message and authentication. Correct/test the parser before replaying; do not invent a timeframe. Candidates remain in the private ledger for staff review.
- **Transient send/database error:** the next scheduled run retries with the exact saved payload and key. Leases prevent concurrent dispatch. No client action is needed.
- **Uncertain delivery after 23 hours or 15 attempts:** automatic sending stops. Inspect Resend using `disclosure-confirmation/<outbox UUID>` and the recipient. If accepted, reconcile `provider_email_id`, `sent_at`, and `status='sent'` in the outbox. If no send occurred, send a reviewed notice manually and record that receipt. Never reset the attempts/key blindly.
- **Worker outage:** the admin panel flags a heartbeat older than ten minutes. Inspect Supabase function logs, `cron.job_run_details` and `net._http_response`; HTTP failure is separate from successful SQL enqueue. Fix configuration and let leases expire/retry.
- **Ingress outage:** ImprovMX makes only two extra webhook attempts. If Supabase is unavailable across all three, recover the original email from Brett's normal inbox/provider logs and replay through the parser after recovery. The outbox is durable only after ingestion has committed; this version does not poll Gmail or independently archive the mailbox.
- **Pause:** set `delivery_enabled=false`. Incoming confirmations remain recorded; pending sends stay queued. To stop ingress, remove only the webhook destination from the `hello` alias while preserving its existing email forwarding.
- **Credential rotation:** pause delivery, replace only the dedicated webhook capability in Supabase and the ImprovMX alias, verify routing, then resume. Do not alter Gmail credentials or existing Supabase service/Resend keys.

## Verification on 2026-09-09

- Ten deterministic parser/delivery tests pass, including the provided 6–10 week estimate versus the separate five-week follow-up wording, alternate HTML estimates, spoofed/forwarded messages, invalid dates, escaping and retry payload stability.
- Isolated Postgres tests pass for replay, same-case/day deduplication, ambiguous/unpaid/closed cases, atomic matching/outbox, lease exclusion, bounded retries and client/staff/anonymous access.
- Both new live endpoints reject unauthenticated requests. Authenticated unrelated mail is ignored without a notice. A synthetic unverified confirmation was durably captured once across a replay and then removed; no client message was sent.
- The real email was exported locally for parser validation: ticket E23045035A, September 9, 2026 at 07:03:34 MDT, stated estimate between 6 and 10 weeks; ImprovMX recorded passing Crown DKIM/DMARC. Its case was not backfilled by this verification.
- Frontend type checking, component lint, Vite production build and existing snapshot-copy verification pass. Production release uses the current main branch to preserve existing intake functionality absent from the older working-tree copy.
- Supabase migrations, both functions and the minute cron are installed. Worker heartbeat succeeds. Delivery remains paused until routing activation is verified.

Sources: [ImprovMX webhook contract and retries](https://improvmx.com/guides/webhooks/), [Resend 24-hour idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions).
