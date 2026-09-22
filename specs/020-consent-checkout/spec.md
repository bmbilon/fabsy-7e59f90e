# Consent at checkout for emailed tickets

## Principles and scope

Provide one private client link for a ticket Fabsy already received by email. Use the existing Stripe account, service prices, Supabase case and PDF consent infrastructure. A checked box records electronic acceptance; it must never be labelled a handwritten or typed signature. Preserve the independent not-guilty instruction. Never infer acceptance from payment, possession of a link, or staff entry.

## Requirements

- Staff create a case-bound checkout link with verified name, email, ticket and service type, without sending a message.
- The client sees the ticket, service price, exact authorization wording, unchecked consent checkbox and independent unchecked plea checkbox on one page.
- One continue button saves versioned consent with server time, creates the consent PDF, then opens the existing secure checkout. No second consent link or ticket re-upload.
- Failed consent or PDF storage blocks checkout. Retries preserve the original acceptance and cannot silently change the plea choice. Existing signed cases can resume checkout without signing again.
- A paid case cannot open another checkout. Payment confirmation is based on the verified checkout record, not a return URL or arbitrary case status.
- Bearer credentials use a URL fragment, private session storage, no-referrer, no-store, noindex and no public measurement on the client route.
- Existing standalone government-form invitations remain available for already-paid clients, including the current client. No new charge or changed invitation for him.

## Clarification

The user requested checkbox consent alongside checkout, matching the upload flow. A private prefilled link is the working default communicated in chat while an optional reusable-link preference remains unanswered. Existing payment integration is reused; no new provider or provisioning is needed. Stripe's terms checkbox is available, but a checkbox alone would not persist Fabsy's case-bound consent PDF or independent plea instruction. Acceptance therefore occurs on the single Fabsy checkout link immediately before Stripe payment details.

## Plan and tasks

- [x] Add a staff checkout-link page alongside consent-only invitations.
- [x] Add a versioned server-owned checkout consent parser and capability-protected, idempotent acceptance action.
- [x] Activate the private payment page with consent, PDF save and checkout sequencing.
- [x] Preserve existing server pricing, paid-case protection, webhook fulfillment and private-route behavior.
- [x] Test refusal, consent/PDF failure, retry, plea choices, invalid links, already-paid records and staff authorization.
- [x] Compile and prepare a local desktop/mobile preview; document deployment requirements.

## Consistency analysis

The existing emailed-ticket receipt marker remains an explicit record of staff receipt, not a ticket scan. Existing PDF generation and payment gates continue to validate stored objects. Server-owned consent wording is shared between display and persistence. The new route does not submit a government filing or promise a prescribed form will never be required. Consent and verified payment remain separate case facts.

## Validation and release — 2026-09-22

- 12 mounted React tests pass in `scripts/test-consent-checkout.mjs`: unchecked consent, both plea choices, consent/PDF/payment ordering, retries, paid/closed states, invalid links, double-click protection, staff access and staff receipt/ownership confirmation.
- 10 Deno tests pass across `manual-representation-link/index.test.ts` and `_shared/manual-representation.test.ts`: protected acceptance, exact original consent retry, rejected changed instructions, server-owned identity/time/wording, verified payment state, changed-case rejection, staff-only creation, fragment links and actual generated PDF contents.
- Existing upload regression: 23 passing tests. Existing private-route/locale regression: 20 passing offline integration groups.
- Frontend TypeScript with the repository's existing ES2021 library override, focused ESLint, both edge function checks and Vite production compilation pass. Existing Sass deprecations and bundle-size warnings remain.
- An isolated preview with synthetic data is at `http://127.0.0.1:4178/`; the server binds localhost only. No production API calls or real payments are possible in this preview. Firefox fetched and executed the preview, but Computer Use returned stale screenshots and then `cgWindowNotFound`; visual layout is not claimed as verified.
- No production records, payments, client messages, git commits or deployments were made for this feature.

Deploy `manual-representation-link` and `create-payment` with their shared dependencies, then the frontend containing `/admin/checkout-links` and `/representation-payment`. The existing emailed-ticket and intake-consent schema migrations and current `generate-consent-form` deployment are prerequisites; this feature adds no migration. Keep the existing `/admin/consent-links` and `/representation-consent` routes for already-paid clients and government-form invitations.

Deployment smoke check: sign in as staff, inspect the link generator without creating a real client, confirm private-route response headers and blank-link denial, and use Stripe test mode for an end-to-end payment. Do not charge a real customer as a test. A focused patch against the pre-task working tree is saved at `/tmp/fabsy-consent-checkout.patch`; the shared working tree also contains unrelated pre-existing changes, so a full-site release must account for those changes.

## Current-release integration

Ported the standalone preview to main after the September 22 landing-page release. Preserves current Stripe metadata, stored payment links, completion tokens, purchase notifications and cancelled-checkout behavior for existing clients. The combined route is private and the admin workspace links to its generator. The checkbox confirmation allows an authorized organization representative and the exact confirmation is checked before reuse. Existing live emailed-ticket columns were verified before release. No client acceptance or payment is performed by staff link creation.
