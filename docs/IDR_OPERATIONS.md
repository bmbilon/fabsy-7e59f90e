# Insurance Damage Report operations

This runbook covers the production setup and manual controls for the Fabsy Insurance Damage Report (IDR). The public product page and application code are safe to deploy only after the database migration, private storage policies, Stripe webhook, email secrets, and reminder schedule are active.

## Product and payment rules

- The core traffic ticket service remains the primary checkout at $488.
- A 30% success fee applies to any fine reduction achieved and is additional to the $488 base fee. No success fee is charged when the fine is not reduced.
- The IDR add-on is $99 in the core checkout and on eligible client case pages.
- The standalone IDR is $129.
- Prices come from `src/config/idr.ts` in the web app and fixed server-side amount checks in the payment functions.
- Promotion codes are disabled when the $99 add-on is in a combined checkout so a discount cannot change the required IDR amount.
- Refunds and duplicate-payment conflicts require manual review in Stripe and the matching `idr_orders` record in Supabase.

## Deployment order

1. Apply `supabase/migrations/20260801120000_insurance_damage_report.sql` and the later IDR migrations in timestamp order.
2. Deploy these functions:
   - `submit-ticket`
   - `create-payment`
   - `get-checkout-session`
   - `create-idr-payment`
   - `idr-payment-webhook`
   - `generate-idr-report`
   - `send-idr-case-update`
   - `send-idr-reminders`
3. Configure the Stripe webhook endpoint at `<SUPABASE_URL>/functions/v1/idr-payment-webhook` for `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`.
4. In Supabase Auth URL Configuration, set the Site URL to `https://fabsy.ca`. Allow `https://fabsy.ca/portal/**` and `https://fabsy.ca/insurance-damage-report/intake`, plus the matching `fabsy-execom.vercel.app` staging paths. Confirm the passwordless email template uses `{{ .RedirectTo }}` so deep links return to the requested private route.
5. Set the function secrets listed below.
6. Import verified insurer rules.
7. Install and test the reminder schedule in `supabase/idr-reminder-cron.sql`.
8. Run a live-mode smoke purchase with a low-risk test account before announcing availability.

## Required secrets

Set secrets in the Supabase dashboard or with `supabase secrets set`. Never commit their values.

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_TICKET_PRICE_ID`
- `RESEND_API_KEY`
- `SITE_URL`, normally `https://fabsy.ca`
- `IDR_CRON_SECRET`, a long random value used only by the reminder job
- `IDR_ALLOWED_ORIGINS`, a comma-separated list of allowed browser origins when non-default origins are required
- `IDR_CHECKOUT_RATE_SALT`, a long random value used to hash standalone-checkout request fingerprints. The service role key is a fallback, but a dedicated salt is recommended.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Confirm they are present in the target project.

## Insurer rule maintenance

Start with `scripts/insurer-rules-template.csv`. Validate the file before importing it:

```sh
node scripts/import-insurer-rules.mjs --file scripts/insurer-rules-template.csv --dry-run
```

The production import needs the Supabase URL and service role key in the operator environment. Every active row must have a public HTTPS source, publisher, title, and verification date. Estimate ranges require their own source metadata. Do not enter scraped, inferred, or model-generated insurer rules.

Review active rules at least annually and whenever a cited carrier page changes. Deactivate stale rows instead of silently changing their historical source. Report delivery is blocked unless the generated call list contains 3 to 5 carriers backed by current source records.

## Alberta Grid data

Versioned Grid data lives under `src/data/alberta-grid/`. Each update must retain the source URL, effective dates, dataset version, coverage scope, and limitations. Estimates are unavailable when the selected Grid dataset is missing, out of date, or lacks the required premium values. Never fill missing values with an assumed premium.

The estimate is research, not a quote. DCPD, optional physical damage coverage, discounts, underwriting eligibility, occasional drivers, and other policy-specific inputs can change a real premium.

## Abstract intake and review

- Clients order and upload their own Alberta commercial driver abstract.
- Before upload, clients save a validated private intake containing the current ticket, policy renewal date, and Alberta Grid inputs. The intake locks when abstract review begins.
- Uploads are limited to PDF and supported image types and are stored in the private `idr-abstracts` bucket.
- Client uploads are registered through a serialized database function. Each order folder is capped at five temporary objects, the portal reconciles files left by interrupted attempts before a new upload, superseded objects are removed, and clients cannot delete the file currently attached to the review record.
- Phase 1 uses human transcription. OCR and automated parsing are intentionally not enabled.
- Creating a staff download link assigns an exclusive review claim and freezes the abstract source path before the signed URL is issued. The transcription, report JSON, and order state are saved together with an optimistic review version.
- Delivery acquires a separate 30-minute database claim for the saved review version. Review saves are blocked while files render, and the PDF URL, HTML URL, captured source version, and delivered order state finalize in one transaction. Failed function runs release the claim; interrupted claims can be replaced after expiry.
- Staff must confirm the ticket match, conviction class, offence, section when present, conviction date, and all discrepancy flags. A current ticket that is not yet on the abstract must be classified and rendered as a separately labelled projection.
- Client RLS cannot set parsed fields or staff review fields.
- Standalone orders create an IDR-only client record after verified payment. Staff should treat the `IDR-<order-id>` licence value as an internal placeholder, not as a verified driver licence number.

## Report delivery checklist

Before clicking deliver, confirm:

- The abstract review is claimed, the source file is verified, and ticket matching is recorded.
- Each conviction date and class is verified or carries a visible discrepancy flag.
- The three-year date arithmetic is correct.
- Grid data is current for the report date.
- Every premium range has current provenance and is labelled estimated.
- The carrier call list contains 3 to 5 entries, with a reason and at least one contact or quote-page link for each entry.
- Source links and verification dates are present.
- The HTML and PDF both include the exact compliance disclaimer.

If delivery reports that another delivery is in progress, wait for the active run to finish. A process that terminates before releasing its claim becomes recoverable after 30 minutes; do not manually mark the order delivered or attach file paths outside the finalization function.

The generated PDF and HTML are stored in private buckets under a delivery-claim-specific path. This prevents an expired worker from overwriting the artifacts from a newer delivery attempt. Reminder events and the delivered order state finalize together under that claim. Failed workers attempt to remove their own artifacts, and storage policies expose only the PDF and HTML paths on the current delivered report. Delivery emails contain a portal link rather than a public file URL.

## Reminder operations

The reminder function sends renewal reminders 45 days before every renewal in the generated multi-year schedule and conviction-aging reminders on their scheduled dates. It also includes the outcome survey link.

IDR email calls include stable Resend idempotency keys. This prevents duplicate sends when a function retries after the provider accepted an email but before Supabase recorded completion. Resend retains an idempotency key for 24 hours, so investigate older unresolved email claims before retrying them manually. An access email claim is not expired automatically after a provider attempt. Reconcile a stale `access_email_claimed_at` value before clearing it.

Run `supabase/idr-reminder-cron.sql` in the production SQL editor after replacing the first-run cron secret placeholder. The script preserves existing named Vault secrets on reruns. The example runs daily at 15:00 UTC. Monitor `cron.job_run_details`, Edge Function logs, `idr_reminder_events`, and `idr_email_events` for failures. Reconcile any row whose error says the email provider accepted a message but the database could not save the sent status before retrying it.

Supabase documents the supported Vault plus `pg_cron` pattern at https://supabase.com/docs/guides/functions/schedule-functions.

## Privacy and retention

- Keep the abstract and report buckets private.
- Do not put signed URLs in logs, analytics, or support tickets.
- Limit staff access to active admins and case managers.
- Remove access promptly when staff responsibilities change.
- Establish a documented retention period for driver abstracts before production launch. Until that policy is approved, do not run automated deletion.
- Treat driver abstracts, ticket particulars, and premium data as sensitive personal information.

## Release coordination

The IDR page is intentionally not added to `scripts/generate-static-snapshots.cjs`, sitemaps, `public/prerendered/*`, or `middleware.ts` in this branch. The AEO workstream must add `/insurance-damage-report` to its pipeline after this feature lands.
