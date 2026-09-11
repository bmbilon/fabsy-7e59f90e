# Unpaid ticket follow-up

This sends Brett's supplied email once, at the first minute-based scheduler run at or after 30 minutes from the first confirmed ticket upload. It covers active intakes and converted submissions awaiting payment. Creating a contact-only draft does not start the timer. Replacing an uploaded image does not restart it.

Only first uploads confirmed after activation are enrolled. Existing uploads are not backfilled. A usable email, recorded permission for ticket follow-up, Alberta confirmation, and an open staff follow-up disposition are required when sending. Expired/deleted intakes, contacted/dismissed leads, and paid or otherwise active submissions are excluded.

The private outbox rechecks database eligibility and linked Stripe Checkout sessions. Stripe completion, including a pending delayed payment, suppresses the reminder. An unreadable payment state delays delivery. The final database recheck catches payments, recipient changes, and new checkout sessions observed while preparing the message. As with any external payment/email pair, a payment in the small interval after the final checks and before provider acceptance cannot be made atomic.

The HTML and plain text email use the supplied English body, public submission link, and Fabsy signature. Missing first names use `Hi there,`; missing subject fields are omitted. No ticket attachments or private resume capabilities are sent.

Every follow-up BCCs `brett@execom.ca`. The provider adapter refuses any frozen payload missing that BCC; it must not alter a previously attempted payload or reuse its idempotency key with different recipients. No outbox entries existed when BCC was added.

## Deploy and activate

Deploy only `process-abandoned-ticket-emails`, using the existing Supabase project `gcasbisxfrssonllpqrw`. It uses existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, and `IDR_CRON_SECRET` secrets. No new provider or credentials are needed.

Apply only `supabase/migrations/20260911193000_abandoned_ticket_emails.sql`. It installs disabled and adds `fabsy-abandoned-ticket-emails` on the existing one-minute cron with Vault credentials. Record this single migration version in migration history after successful application; do not push unrelated migrations from a different checkout.

After the deployed endpoint passes authentication/configuration checks, activate once:

```sql
update public.abandoned_ticket_email_settings
set enabled = true, activated_at = coalesce(activated_at, clock_timestamp())
where singleton;
```

Pause new processing/enrollment with `update public.abandoned_ticket_email_settings set enabled=false where singleton;`. Re-enabling keeps the original activation timestamp; only new first-upload transitions enqueue work, with no backfill of uploads during the pause.

## Observe

The worker is private: `x-cron-secret` or the service-role bearer is required, and customers cannot claim jobs or read outbox data. Inspect only aggregate operational data unless a particular customer investigation is needed:

```sql
select enabled, activated_at from public.abandoned_ticket_email_settings;
select status, failure_code, count(*) from public.abandoned_ticket_emails
group by status, failure_code order by status, failure_code;
select count(*) as overdue_pending, min(due_at) as earliest_due
from public.abandoned_ticket_emails
where status in ('pending','retry') and next_attempt_at < now() - interval '5 minutes';
select jobid, jobname, schedule, active from cron.job
where jobname = 'fabsy-abandoned-ticket-emails';
select status, return_message, start_time, end_time from cron.job_run_details
where jobid = (select jobid from cron.job where jobname='fabsy-abandoned-ticket-emails')
order by start_time desc limit 5;
```

Cron success proves dispatch, not email delivery: also inspect the worker HTTP response and the outbox `sent`/`provider_email_id` receipt. Provider acceptance is recorded as `sent`; delivery/bounce outcomes remain in Resend. There is no new admin dashboard or automatic incident notification for this feature.

Retries preserve the same frozen payload and Resend idempotency key, and stop after 23 hours from the first attempt. Investigate `failed` and `indeterminate` rows; never reset an indeterminate row or issue a new idempotency key without checking the provider receipt, since the first send may have succeeded. Outbox records are deleted with the existing intake retention process.

## Verification

```sh
deno test --no-config --no-npm --allow-env supabase/functions/_shared/abandoned-ticket-email.test.ts supabase/functions/_shared/abandoned-ticket-delivery.test.ts supabase/functions/process-abandoned-ticket-emails/index.test.ts
node scripts/test-abandoned-ticket-emails-db.mjs
```

The browser preview uses synthetic recipient details and is generated locally. Automated tests do not send customer email or charge Stripe.

Implementation references: [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Stripe Checkout retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve).
