# Refund offer release validation

Prepared August 31, 2026 in an isolated worktree based on `cd5eef208e4ade776e4a947278dbad29edae77f0`. This is a validation record, not a claim that the website or ads have already been published. The final publication receipt is recorded separately after deployment.

## Validated behavior

- The homepage, Rapid Resolution, Photo Radar, Pro Driver, FAQ, terms and checkout disclosures use the same upfront-paid service-fee refund promise. A Crown offer improving neither the original fine nor demerits triggers refund within 30 days of Fabsy receiving it; owner-camera notices use the fine only.
- The actual fee paid, including a discounted or bundled ticket-service order, is covered together with corresponding GST. No minimum reduction, final-offer restriction, claim deadline, guilty-plea requirement or deduction for work/processor fees was introduced. Government fines and standalone insurance reports remain separate.
- Existing paid receipts and private cases refer to their own written order terms. Updating the current offer does not rewrite those agreements or stored signed PDFs.
- All eight language dictionaries remain present; the seven existing owner-published machine translations retain their authorization basis and lack of asserted native review. Tagalog wording explicitly says Fabsy **receives** the offer, not accepts it.
- Checkout terms open separately so reading them does not discard in-memory intake progress. Receipt verification, money calculations, product/language restrictions and conversion routing remain intact.

## Checks completed before publication

- Full production build with the existing GA4/Google Ads IDs and explicit-consent gate enabled.
- i18n validation, publication/translation gates, runtime dictionaries, public language flow and 34 locale SEO integration groups.
- 181 deterministic, actual-React and mutation checks for public-offer copy. Incorrect deadlines, missing disclosures, wrong links, hidden/appended claims and guaranteed legal outcomes remain blocked.
- Photo content/FAQ, seven Photo intake checks, existing pricing and published-content regressions.
- Fresh browser capture of 158 routes; full-tree guardrails pass for all 1,280 HTML snapshots, including 1,122 generated content pages. All 77 captured blog article bodies are unchanged.
- FAQ JSON-LD equality and rendered FAQ parity.
- TypeScript compilation; scoped lint has zero errors and only two unchanged footer inline-style warnings.
- Eight consent-PDF regressions. Two local synthetic English RR/Photo PDFs (four pages) passed original-field, clause, margin and visual checks. No customer document was used as a fixture.
- Private-document navigation in Chromium and the enabled **offline/inert** Google network acceptance matrix (11/11). No Google, service, customer or payment requests were forwarded in that matrix; no purchase conversion was fabricated. The earlier activation's real-Google and Tag Assistant evidence remains separate.
- The 34 app assets/index/headers covered by that matrix are byte-identical after the final crawler copy. Google consent, private navigation and purchase reporting source are unchanged; `ThankYou.tsx` changes only one displayed outcome/refund sentence.

## Generated-change audit

Against the baseline, 1,119 cached content pages contain only the new exact RR disclaimer substitution and three Photo pages contain their reviewed copy changes. The 38 curated pages follow the same pattern (35 RR plus three Photo). Other factual fields, page titles, H1s, canonicals and languages are unchanged. The source and snapshot route inventories are unchanged, and all 13 sitemap files are byte-identical to baseline. Generated manifest changes are timestamps and expected source/translation hashes.

## Narrow backend deployment

Only `supabase/functions/_shared/consent-pdf.ts` changed under the backend source. `generate-consent-form` was deployed through the existing CLI/Docker path with its local font/WASM assets, preserving its existing authentication configuration and application authorization checks. Provider readback reports version **162**, **ACTIVE**, bundle SHA256 `c34a54193a4f99504054d1ede08274225543f61044abdec44172a54470d521e0`; every other deployed function record is unchanged. The CLI reported a 15 MB script bundle.

Live negative checks rejected missing authorization with 400 and a malformed submission identifier with 403, before case lookup or storage. Preflight returned 200. Successful hosted PDF generation/storage against a customer record was not exercised, and no historical PDF was regenerated.

## Advertising boundaries

Nine prepared Google RSAs lead with the fee-refund promise and retain their price/condition pins and 30/90-character limits. The separate Meta owner has prepared matching local text/graphics while preserving Brett's requested alternative as review provenance. A prepared pack or local graphic is not a saved provider edit or delivered advertisement.

No campaign, budget, schedule, audience, Primary conversion, enhanced-conversion setting, payment or refund was enabled or changed by this release. Campaigns remain off and a concrete daily budget and test cap have not been supplied. Refund processing remains an operational responsibility; this release creates no automated refund worker.

Local execution evidence is retained under `/Users/brettbilon/.cache/fabsy-fee-refund-evidence/`. See [the policy and operating checklist](refund-policy-operations.md) and [the separate Meta-copy handoff](meta-owner-handoff.md).
