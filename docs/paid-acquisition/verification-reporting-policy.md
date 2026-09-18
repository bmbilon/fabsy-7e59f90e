# Verification traffic in acquisition reports

The consented funnel and behavior reports exclude events with any of these
explicit verification tags, matched case-insensitively:

- `utm_source=qa`
- `utm_medium=qa`
- `utm_campaign` beginning with the reserved prefix `qa_`
- `utm_campaign` beginning with the historical verification prefix `fabsy_aeo_verification_`

Use `utm_campaign=qa_<purpose>_<date>` for future QA journeys, including journeys
that retain a real provider source and paid medium. Do not use these reserved
prefixes for customer campaigns. Production ad clicks used for acceptance
verification are still real traffic unless deliberately tagged with this policy.

The rule applies to each stored event's tags, without inferring customer identity
or hiding untagged traffic from the same browser. It is shared by event, campaign,
daily, engagement, upload, and intake-step aggregates. Both report RPCs return
`verification_traffic_excluded: true` to disclose this scope. Raw events remain
in the private ledger under the existing retention and consent-withdrawal rules.

Campaigns containing `test` or a QA marker elsewhere in their name, QA-like
content labels, and the source `readiness` alone are not excluded. For example,
`readiness / qa / paid_acquisition_final` is excluded by its medium, whereas
`readiness / paid / paid_acquisition_final` remains visible. No customer names,
contact details, IP addresses, or operational records participate in this rule.

## Recovering source labels from stored click evidence

When a stored event has no explicit UTM source, a stored click-ID hash and kind
can supply a report label: `gclid`, `gbraid`, and `wbraid` map to `google`;
`fbclid` maps to `meta`. For Google only, an absent original source **and** absent
medium also permit the report medium `cpc`. A Meta click alone leaves the medium
unknown because Facebook links can also be organic.

Explicit sources and media remain authoritative, and campaign/content labels are
never invented. This is a presentation fallback over existing consented evidence;
it does not rewrite the ledger, recover missing events, or recover a missing raw
click ID. The historical ledger stores one selected click kind per event, so it
cannot retrospectively identify ambiguous URLs containing multiple providers'
click IDs. The browser handles that ambiguity when collecting future events.

## Financial scope

The signed Stripe purchase/refund ledger and the report's `financials` object
retain their all-customer scope. Verification tags do not change cash facts,
refunds, purchase counts, or the existing consent-based attribution linkage.
Consequently, financial purchase counts may differ from filtered consented
funnel purchase sessions. A tagged journey is not grounds for deleting a real
signed payment.

## Local verification

Run `python3 supabase/tests/test_paid_funnel_verification_filter_migration.py`.
It starts a disposable local PostgreSQL instance without a network listener,
applies the migration chain, runs the existing purchase/refund suite, and checks
that tagged journeys are excluded consistently while real traffic, explicit
UTMs, raw rows, window validation, service-only access, and signed cash facts
are preserved. The test uses synthetic identifiers and no production credentials.
