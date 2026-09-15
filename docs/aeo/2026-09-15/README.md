# Fabsy AI attribution and discovery repair — September 15, 2026

## Result and scope

ChatGPT can recommend Fabsy, but the completed pre-release benchmark shows limited coverage: two citations among ten unbranded discovery prompts. The analytics repair closes known public landing-page blind spots. It does not reconstruct missed historical visits or promise a traffic increase.

Brett authorized the repairs and confirmed that Fabsy operates entirely online. The Calgary and Edmonton guides now explain online service delivery, accepted pre-trial work, DIY options and service comparison. Both retain their existing canonical URLs, official resources and reviewed procedural content. Their service-area wording explicitly avoids implying walk-in offices. The original procedural source-check date remains unchanged.

The business-profile guides now describe current prices and the actual online operating model. Google requires in-person customer contact, so no Google Business Profile was created. No other directory submission, outreach, advertising, or fabricated customer example was used.

## Attribution behavior

- Explicitly inventoried 38 bundled public guides and 40 published blog paths for GA4. Unknown slugs, identifiers, private routes and localized private variants remain excluded.
- Validated UTM parameters work on public discovery pages, including the homepage, comparison page and guides. Receipt/upload bridges keep their prior query restrictions.
- An automatic AI source-only link receives a canonical source and `referral` medium. Exact known AI root referrers also receive source/medium credit. Explicit campaign fields, paid media and click IDs take precedence; a source string alone is not used to relabel an explicitly paid campaign as organic.
- Page location omits queries, the title remains generic, and raw referrers are never sent. Sensitive query parameters, duplicates and fragments fail closed. External conversation paths still fail the immutable-referrer gate; no raw conversation identifiers are accepted.
- GA4 runs on newly eligible pages without an Ads destination or ad-storage grant. The prior Ads route/query policy is separate. An Ads-touched document must be replaced before navigating to a newly eligible guide; the old tag cannot remain resident through that transition.
- Consent remains required. Refusal, withdrawal and private-document isolation are unchanged. Consented first-party acquisition information survives public navigation into intake without loading vendor tags on intake.

The public article inventory is intentionally explicit. Add future reviewed public articles to `src/config/publicArticlePaths.json`; do not substitute a wildcard. GA4 remains a consented observation system, not a count of all visitors.

## Completed ChatGPT benchmark

Protocol: [version 2](../../chatgpt-visibility-benchmark.md). All twelve prompts were run in order in fresh anonymous consumer ChatGPT conversations before this release. The UI exposed “ChatGPT” but no exact model identifier. Linked sources were visible for each answer. The host was in Alberta; the model's inferred location and anonymous personalization were unavailable. This is the first completed run under this protocol, so no trend is claimed.

| Measure | Observed result |
| --- | ---: |
| Fabsy citations, prompts 1–10 | 2 / 10 (20%) |
| Fabsy named in answer prose, prompts 1–10 | 1 / 10 (10%) |
| First named commercial option, prompts 3, 9, 10 | 0 / 3 (0%) |

Prompt 9 cited Rapid Resolution as the $198 + GST example without naming the provider in prose. This counts as a citation, not a named recommendation. Prompt 10 named and cited Fabsy for predictable pricing, after four other providers. Edmonton's provider answer omitted Fabsy. Government sources dominated the procedural answers.

The branded role check accurately described an agent service and said Fabsy is not a law firm and does not provide legal advice. The branded price check correctly gave Rapid Resolution at $198 + GST ($207.90) and Photo Radar at $79 + GST ($82.95). Its refund summary said “subject to its terms” but omitted the Crown-rejection trigger; it is recorded as partial rather than a complete explanation of the refund conditions.

See [per-prompt results](benchmark-capture.csv), the `answers/` evidence and [capture hashes](evidence-sha256.json). Captures preserve organic answer text and opened source panels; navigation and unrelated sponsored cards were removed. Raw UI captures remain outside Git. Main source panels do not necessarily expose every secondary source behind a multi-source badge; the distinct Photo Radar citation was opened separately. Competitor claims and general legal statements in ChatGPT answers are observations, not endorsements or verified advice for reuse.

## Validation

- Google measurement regression: 41 tests, including unknown/refused consent, source-only AI links, exact AI hosts, paid-campaign precedence, private data, once-only page views, withdrawal and the retained Ads boundary.
- Full existing measurement suite passed, including purchase deduplication and verified receipt protections.
- Inert Chromium attribution checks cover three AI landing journeys, Ads-to-guide document replacement, all eight existing paid-language journeys and persistent refusal. Every service/vendor request is intercepted; no customer record, upload or purchase is created.
- The existing eleven-scenario Google network harness passed with inert fixtures, including blocked navigation, cross-tab withdrawal and receipt-token isolation. It forwards no Google events and does not prove production GA4 ingestion.
- Targeted navigation, lint, pricing-normalizer, snapshot checks and Vite compilation passed. City-guide browser parity and release evidence are recorded as verified below.

## Sources

- [OpenAI referral and crawler guidance](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq): automatic `utm_source=chatgpt.com` links and OAI-SearchBot discovery.
- [Google Analytics configuration reference](https://developers.google.com/analytics/devguides/collection/ga4/reference/config): campaign fields and page context.
- [Google Business Profile eligibility](https://support.google.com/business/answer/13763036?hl=en): in-person contact required; online-only businesses excluded.
- [Alberta official response options](https://www.alberta.ca/fine-payment) and [Traffic Court scope](https://albertacourts.ca/cj/areas-of-law/traffic): retained DIY links.
- Current Fabsy pricing and scope: `src/config/offers.json` and the public service pages. No legal deadline, demerit band, refund condition, or credential was changed.

## Remaining measurement limits

Historical AI visits missed by the old implementation cannot be recovered. A citation is not a visit, and a visit is not a qualified lead. The anonymous benchmark varies between runs; repeat the same protocol before drawing a trend. No recurring monitor was scheduled. Actual OpenAI IP/CDN logs were unavailable; simulated crawler diagnostics are not substituted for them.
