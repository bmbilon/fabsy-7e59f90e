# Universal consent and payment

## Principles and requirements
One permanent public link must serve every customer without staff creating a case, token or page first. Use the existing published service catalog and Stripe account. A customer's email connects their order to a ticket supplied now or later. Do not disclose existing customer records from an email lookup. Preserve older private links.

## Clarifications resolved from the request
Standard products are Photo Radar ($79), Rapid Resolution ($198), Insurance Impact Report ($49), and the bundle ($229), plus 5% GST. Combined, consent-only and payment-only modes use the same page. Consent and plea instructions are distinct affirmative choices. Tickets and ticket numbers are optional at purchase; never fabricate them. Email matches are visible to staff; ambiguous tickets require staff selection. Payment-only never fabricates consent.

## Implementation plan
1. Add service orders independent of ticket availability, with private upload and immutable acceptance evidence.
2. Add a public capability-protected checkout endpoint; validate products and prices on the server; use idempotent Stripe sessions and verified payment status.
3. Add a permanent /checkout page, plus /consent and /payment mode shortcuts. Replace the default staff link generator with reusable links and an orders queue grouped by email.
4. Match orders to existing/subsequent tickets by normalized email; keep ticket-specific consent/payment evidence visible in the case. Ambiguity is explicit, with staff linking.
5. Test consent separation, server pricing, retry/double-click behavior, webhook amount verification, private access and mobile behavior. Release database/backend before frontend and verify live.

## Consistency review
This work removes the requirement for a ticket before checkout without weakening the existing ticket checkout's document checks. One payment purchases one selected service. A pending ticket match does not authorize filing against an unidentified ticket. Customer email is a matching key, never an access credential. No customer messages are sent during development or verification.
