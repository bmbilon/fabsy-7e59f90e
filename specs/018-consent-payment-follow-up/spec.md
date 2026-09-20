# Existing-ticket consent and payment

## Principles and requirements

Retain the uploaded document, saved contact details, original intake identity,
consent PDF generator, server pricing and existing payment/webhook workflow.
Follow-up emails must confirm receipt, explain that Fabsy can help, and offer
one private link to complete consent and payment. Never request another ticket
upload or create a second intake. Keep these private pages out of measurement,
chat, search indexes and referrers. Preserve unrelated workspace work.

## Clarifications

The screenshot identifies the automatic abandoned-ticket email, not a request
to send Amber an individual email. The existing 30-minute schedule, payment
suppression, owner copies and delivery idempotency remain. The user expressly
requests changing this automatic product flow. This supersedes the old spec's
public submit-ticket URL and repeat-upload wording. Missing contact/identity
details are collected as part of consent; saved details are prefilled. Consent
is affirmative and payment remains gated on its stored PDF. Paid cases show a
receipt state instead of requesting another payment.

## Plan

1. Sign a time-limited alias for the current intake capability without rotating
   the current token or changing the saved ticket. Verify its signature, expiry,
   record identity and current database hash at every authorization boundary.
2. Generate the private completion URL from the eligible reminder's saved draft;
   preserve frozen retries and suppress obsolete or revoked frozen links.
3. Add a distinct private completion page: ticket received, consent details and
   authorization, then existing Stripe checkout using the same saved intake.
4. Verify tampering, expiration, revocation, payment suppression/retries,
   no-upload behavior, consent and checkout recovery, and mobile rendering.

## Tasks / coverage analysis

- [x] Signed capability and endpoint compatibility (same record, expiry/revocation).
- [x] Follow-up copy, URL generation and final eligibility recheck.
- [x] Private completion page and existing-case checkout recovery.
- [x] Focused automated checks, build and responsive browser verification.
- [ ] Release through existing production processes and record actual status.

Each requirement maps to a task above. No new payment/email provider is needed.
No historical reminder backfill or individual customer email is included.
