# Abandoned ticket follow-up

## Constitution

- Follow the existing Supabase intake, payment, and email integration patterns.
- Send one follow-up only after an uploaded ticket has remained unpaid for at least 30 minutes. Recheck payment before delivery, and fail closed when payment status cannot be established.
- Keep ticket files private. Do not attach uploaded images or disclose private storage paths in this email.
- Render user-supplied personal details as data, never HTML or email headers.
- Preserve Brett's supplied English body, subject pattern, contact information, price, and disclaimers.
- Keep rendering pure so the complete email can be reviewed without contacting a customer.

## Requirements

1. A confirmed ticket upload with usable contact email starts the 30-minute wait.
2. A server-side scheduled process finds due unpaid intakes independently of whether a customer still has the website open.
3. Customers who have paid before sending are excluded, including a payment associated with their completed submission.
4. Duplicate workers and delivery retries must not result in duplicate follow-ups.
5. Send from Fabsy at `hello@fabsy.ca`, with replies going to that address.
   BCC every follow-up to `brett@execom.ca`, as requested in the subsequent update.
6. Use `Hi FIRST NAME,` when known, otherwise `Hi there,`.
7. Format the subject as `Alberta TICKET TYPE TICKET NUMBER Ticket Inquiry`, omitting unavailable parts. Recognizable speeding descriptions may be normalized to `Speeding`; never invent a type or number.
8. Use the supplied English body linking to `https://fabsy.ca/submit-ticket`, followed by the supplied Fabsy signature. Provide HTML and plain text versions.
9. Include a local preview using synthetic fixture details. Verification must not send test emails to customers.
10. Make operational rollout and any remaining deployment limitations explicit in the implementation report.

## Resolved clarifications

- The user's request expressly authorizes creating automatic sends for this flow; this is a product feature request, rather than a request to compose or send an individual mailbox reply.
- Screenshots are visual examples and data, not additional instructions. The typed English body is authoritative.
- The flow has one follow-up at the first scheduled opportunity after 30 minutes, rather than a recurring sequence.
- Only new first uploads after activation enroll; no historical backlog is emailed. Replacing the image does not reset the timer.
- Staff-contacted or dismissed intakes are suppressed to avoid duplicating a manual follow-up. Intake consent applies to ticket follow-up; no separate marketing campaign is created.
- Missing names receive a neutral greeting; missing ticket data is omitted from the subject.
- The supplied public submission URL stays unchanged. No ticket image is attached or exposed.
- Existing shared signature markup already contains the requested wording and can be reused without changing other emails.

## Plan

1. Trace confirmed upload, intake completion, checkout/payment, and existing delivery/job patterns.
2. Add persistent due/delivery state and a scheduled worker with payment rechecks and duplicate-send protection.
3. Add a pure template using the exact supplied English copy and the existing matching signature.
4. Verify timing, paid suppression, retry/concurrency behavior, personalized/fallback rendering, and escaping with focused tests.
5. Produce a synthetic HTML preview and verify deployment configuration through the existing Supabase workflow.

## Tasks and consistency analysis

| Task | Requirements | Verification |
| --- | --- | --- |
| Durable scheduling and delivery state | 1–4, 10 | Due-time, payment, retry/concurrency, and rollout checks |
| Pure email template and shared signature | 5–8 | Exact-copy, subject, fallback, escaping, and plain text tests |
| Synthetic local preview | 9 | Rendered fixture written locally without delivery calls |

Consistency was checked before implementation: every requirement has an implementation task and verification path; the timing and payment rules apply to delivery, while the renderer has no delivery or database side effects. No proposed template behavior conflicts with the supplied copy or the requested signature.

## Implementation verification

- Implemented the pure HTML/plain text renderer and reused the matching shared signature without modifying other email templates.
- Generated `reports/abandoned-ticket-email/email-preview.html` with synthetic `Ali`, `ali@example.test`, and `E24800635T` data. Rendering has no sending calls.
- `deno test --no-config --no-npm supabase/functions/_shared/abandoned-ticket-email.test.ts supabase/functions/_shared/email-signature.test.ts`: 8 passed, 0 failed, including TypeScript checking. The explicit standalone Deno options avoid the frontend project's unavailable `@types/node` dependency in the isolated checkout.
- The worker and endpoint tests pass: payment suppression, final payment recheck, a checkout created during processing, failed payment lookups, recipient changes, frozen retries, provider idempotency, and public-call rejection. The template/worker/endpoint suite has 19 passing tests with TypeScript checking.
- Desktop (900px) and mobile (390px) browser preview checks found no horizontal overflow; the generated screenshot was visually inspected against the provided example.
- Production installation starts disabled. Activation follows the isolated database test suite and authenticated live scheduler probe; deployment status is recorded in the accompanying receipt.
- Activated in production on September 11, 2026 at 11:33:38 a.m. America/Edmonton. The one-minute scheduler is active, the deployed eligibility function matches the tested source, and the migration is registered. At activation verification the outbox contained zero historical jobs.
- The isolated Postgres suite passed with the actual upload confirmation RPC and concurrent worker claims, including the earlier-checkout and restarted-intake payment regressions identified in independent review.
