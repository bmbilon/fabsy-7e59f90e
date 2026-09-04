# Homepage conversion-readiness correction

This local revision removes the homepage claims “or you don’t pay” and “Success guaranteed or your money back.” The first screen now uses the same qualified service-fee-refund contract as the public terms:

- **Headline:** “Fine or demerits reduced—or your fee refunded”
- **Support:** “Fabsy negotiates for a lower fine, fewer demerits or withdrawal. No legal outcome is guaranteed.”
- **Price:** “$198 CAD + GST · Paid upfront; refunded if the policy applies”

The existing hero image, section order, layout and full below-page refund policy remain in place. The main hero action still enters `/submit-ticket`; the mobile sticky action now says “Start online · $198 CAD + GST.” Both actions carry `data-funnel-action="primary_cta"` and a bounded `data-funnel-position` placement label for the consent-gated first-party funnel measurement work in this release.

The mobile phone fallback and header phone buttons continue to use the existing published Fabsy number, `(825) 793-2279` / `tel:+18257932279`, and carry `data-funnel-action="phone"`. This number is already present in the public contact, privacy, terms and consent sources and in `public/llms.txt`; no number was inferred or invented.

## Hosted checkout branding blocker

The application already sends Fabsy product names and descriptions when it creates Stripe Checkout sessions. Those line-item fields do not control the hosted Checkout account identity shown to the customer. Existing production evidence identifies the live Stripe account `acct_1PG64qAt6NWmIwaS` with account label `execom` (`docs/photo-radar/stripe-provisioning.json`). There is no application UI source field that can rename that hosted account identity.

Changing the customer-facing `execom` identity therefore requires a reviewed Stripe-account public-business-name/branding amendment and a fresh hosted Checkout readback. No Stripe setting, payment object, checkout session or provider account was changed in this local revision.

## Local verification

- `node scripts/test-homepage-conversion-readiness.mjs`
- `node scripts/test-homepage-visual-snapshot-guardrails.mjs`
- `node scripts/test-public-offer-snapshot-guardrails.mjs`
- focused ESLint on the changed homepage, header, sticky bar and guardrail files

Deployment and advertising-provider changes are outside this revision.
