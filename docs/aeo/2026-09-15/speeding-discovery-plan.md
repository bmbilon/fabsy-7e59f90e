# Alberta speeding discovery enhancement

## Purpose and constraints

Make the existing `/content/speeding-ticket-alberta` guide more useful for “fight speeding ticket Alberta” and related questions about online disputes, disclosure, response options and agent help. The current URL already matches the intent; retain it as the primary guide. The general ticket-dispute guide supports it.

Apply the project constitution's factual, semantic, citation-ready content principles. This is an enhancement to existing content and rendering. Scope is clear from Brett's request and his confirmation that Fabsy is entirely online. No new offer, outcome promise, physical office, credential or customer story is introduced.

## Findings

- The current title and H1 already target the query, but the browser page displays repeated generic commercial summaries before the reviewed answer.
- The speeding guide explains procedure and evidence well. It lacks a short, early provider answer, an easy comparison of response options and answers to several practical follow-up questions.
- Search results still display old pricing on the provincial-highway blog article. A direct live simulated-crawler fetch on September 15 showed current pricing, no $488 claim and no old 95% claim. This is observed search-cache lag; no new live pricing defect was reproduced.
- Google's AI search guidance recommends useful textual answers, crawlable internal links and structured data that matches visible content. Special AI files or schema are not required.

## Implementation

1. Put the actual reviewed answer and key facts at the top of the two Alberta cornerstone guides. Retain direct access to official online response options and Fabsy service details.
2. Remove the generic three-step HowTo markup on those guides when its corresponding commercial summary is replaced. Keep Article and visible FAQ markup.
3. Expand the speeding guide with a concise online-agent answer, a comparison of paying/prosecutor review/trial, a document checklist and practical FAQs. Reuse the published complete pricing contract.
4. Strengthen descriptive links from the homepage, footer, general guide and two city guides. Keep existing route canonicals and analytics inventory.
5. Regenerate the four affected crawler snapshots and test admission, FAQ equality, browser content and mobile layout. Submit the two updated cornerstone URLs through Search Console after deployment if access permits.

## Verification and measurement

Existing legal numeric passages and their original source-check date remain intact. Newly added procedural explanations link directly to the official sources checked on September 15. No law-firm status, winning percentage or outcome prevalence is inferred from competitor copy.

Acceptance: the two core pages have one prominent reviewed summary; browser and crawler copies include the new answers; FAQ JSON-LD matches visible answers; all important links resolve; private measurement protections remain in place; the production build passes.

The completed twelve-prompt benchmark in this directory remains the pre-enhancement baseline: 2/10 unbranded citations. Immediate recrawling or citations are not guaranteed. Do not treat synthetic verification visits or a single fresh answer as traffic growth.

## Sources checked September 15, 2026

- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/essentials
- https://help.openai.com/en/articles/12627856-publishers-and-developers-faq
- https://www.alberta.ca/fine-payment — response options, ticket-not-found guidance and official contacts
- https://albertacourts.ca/cj/areas-of-law/traffic — ticket instructions, mandatory appearances and bylaw exclusion
- https://www.alberta.ca/speeding-fines-in-alberta — official current schedule; no new fine table copied
- `src/config/offers.json` — published service scope, complete prices and unchanged refund terms

## Consistency review

One primary speeding URL; general and city pages link to it without creating competing near-duplicate pages. Business facts match the published offer. Crawler and browser content use the same reviewed records. No extra tracking, backend dependency or external listing is needed.

## Local validation

- Full SEO suite passed, including legal-content preservation, redirect/canonical policy, blog uniqueness, sitemap and citation-benchmark contracts.
- Four-guide Chromium regression passed: reviewed answer appears once, source and metadata parity, visible FAQ/JSON-LD equality, removal of the replaced HowTo, mobile width and content-API independence.
- Curated admission, price normalization and snapshot guardrails passed (38 curated inputs, 1,122 generated content snapshots checked).
- Vite compilation passed. Targeted ESLint reported no errors and two pre-existing inline-style warnings in Footer.
- A visual browser review confirmed the shorter guide introduction and prominent reviewed answer. The desktop viewport displayed the existing consent banner; consent behavior was not altered.

The legal preservation test was updated only for the intentional decision-section heading change. Browser FAQ checks compare DOM-normalized markup so HTML entity escaping does not cause a false mismatch.
