# Multilingual measurement and attribution repair

The Meta landing policy previously accepted only the unprefixed Rapid Resolution URL. Punjabi and the other translated ads could produce clicks and consented first-party landing records while never loading the Meta Pixel. Translated hero CTAs also lacked funnel action attributes, and the visibility observer mounted before lazy page content appeared.

This repair applies the existing campaign validation to released-language Rapid Resolution paths, instruments the translated hero, and observes dynamically mounted CTA controls. It preserves the consent and private-document boundaries; it does not enable matching on customer information or additional Meta event types.

Campaign labels are passed explicitly to GA4 using its documented `campaign_source`, `campaign_medium`, `campaign_name`, `campaign_content` and `campaign_term` fields, while page URLs remain stripped of query strings. These explicit labels are scoped to GA4; they are not added to Google Ads or Meta payload parameters.

Opaque click IDs retain their validated length. Repeated navigation with the same acquisition parameters keeps the original touch. A different explicit campaign/click starts a new consented funnel session and clears its event markers, so an earlier landing cannot take credit for a later checkout. In-flight requests are scoped to their originating session. Provider page-view deduplication distinguishes campaign changes on the same path.

## Verification

- Existing measurement suite, including consent, paid receipt hashing, CAPI contracts, webhook replay and refund-ledger checks.
- Added regressions for every released-language Meta URL, long click identifiers, repeated/new campaign touches, pending-request races and explicit GA4 campaign fields.
- `scripts/test-attribution-plumbing-browser.mjs` checks the rendered enabled build in Chromium at 390 × 844. All vendor scripts are inert and every backend request is intercepted. It checks consent, lazy hero visibility/clicks, campaign/session continuity into private intake and persisted refusal across reload.
- The browser check runs in the existing build workflow when both Google and Meta measurement flags are enabled.
- TypeScript, scoped ESLint and the Vite production build.

No database migration, checkout API contract or backend deployment is required. Existing signed Stripe purchase and refund recording remains authoritative; neither a successful browser queue nor a CAPI HTTP response establishes advertising attribution. Meta's provider-side classification and event processing status must be assessed separately in Events Manager.

[Google campaign configuration reference](https://developers.google.com/analytics/devguides/collection/ga4/reference/config#campaign_source)
