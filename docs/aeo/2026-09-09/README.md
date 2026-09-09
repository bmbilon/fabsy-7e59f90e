# Fabsy AEO work — September 9, 2026

## Production release

The guide is live at [fabsy.ca/hubs/alberta-tickets-101](https://fabsy.ca/hubs/alberta-tickets-101). AEO commit `1ca3148c` shipped in production commit `26e699e0` through [the successful gated release workflow](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/34367913179). The intervening commit changed disclosure-operations documentation only. See `deployment-receipt.json`, `crawl-after.json` and `live-checks.json` for production evidence. Browser checks at 1280 px and 390 px confirmed the new guide, pricing, agent scope, retained links and no horizontal overflow.

IndexNow notification did **not** succeed: its optional workflow step returned HTTP 403 for key verification. The public verification file was reachable with the expected contents, but one focused submission retry also failed. See `indexnow-after.json`. Publication succeeded; accelerated index notification remains unresolved. No ChatGPT citation or ranking result is claimed.

## Decision

Prioritize organic discovery for “how to fight ticket Alberta,” supported by a useful procedural guide, accurate business facts, real evidence of service experience and measured citations/conversions. Fabsy provides ticket administration and permitted agent representation. Do not present Fabsy as a law firm or a provider of legal advice.

ChatGPT ads are worth an eligibility inquiry, with no campaign budget committed yet. Canada appears in [OpenAI’s self-service availability list](https://help.openai.com/en-us/articles/20001245-ads-manager-availability). However, the [specific legal-services policy](https://openai.com/policies/ad-policies/) includes representation/document preparation and currently restricts legal-services advertising to licensed U.S. practitioners. It does not explicitly classify Alberta ticket administration agents. Fabsy’s classification is **unconfirmed**, rather than established as either eligible or prohibited. Explain the actual work when asking OpenAI. An educational label would not resolve a service landing page’s eligibility.

Paid placement does not change organic answers. [OpenAI’s explanation](https://help.openai.com/en/articles/20001047) separates ads from answers and recommendation ranking.

## Work completed locally

- Expanded the existing `/hubs/alberta-tickets-101` page around the primary query: direct response, notice types, five practical steps, DIY versus agent support, current Fabsy pricing, common questions and official links. Retained the canonical URL.
- Described Fabsy as ticket administration and permitted agent representation, with accurate service scope. No invented human reviewer, credential, case outcome or success rate.
- Updated the page title, description and WebPage structured data, including the actual source-check date.
- Refreshed only the matching crawler snapshot’s article, metadata and page schema; verified that its article text matches the browser-rendered guide.
- Corrected the foundation-guide target in the runtime linking configuration and database-link generation script, from `/content/alberta-tickets-101` to `/hubs/alberta-tickets-101`. Existing database-generated link records were not regenerated.
- Updated the [ChatGPT benchmark](../../chatgpt-visibility-benchmark.md) to version 2, replacing retired Ticket Triage pricing and adding role accuracy. The [capture sheet](benchmark-capture.csv) contains 12 unrun prompts, including 10 organic discovery prompts and two brand fact checks. This is not an observed ChatGPT ranking baseline.
- Added a repeatable, read-only [HTTP audit](../../../scripts/audit-chatgpt-crawl.mjs) and saved 20 observations in [crawl-baseline.json](crawl-baseline.json).

Changes are local and have not been published. The repository already contained extensive uncommitted work; no broad build lifecycle, database sync, deployment, ad submission or external outreach was run.

## What the live HTTP audit found

These are unauthenticated HTTP fetches without JavaScript, with browser-like and simulated OAI-SearchBot user agents. They do **not** establish access from verified OpenAI IP ranges, indexing, citations or commercial recommendation rank.

| Observation | Evidence | Implication |
| --- | --- | --- |
| Nine sampled canonical public pages returned HTTP 200, page headings and self-canonicals to the simulated search bot | `crawl-baseline.json` | The sampled snapshot delivery works from this machine; inspect real bot logs separately |
| The primary Alberta hub contained approximately 185 main-content words | Same audit | A practical guide can answer more of the actual task; word count itself is not a ranking target |
| The configured legacy foundation URL returned HTTP 200 with no article or H1 | `/content/alberta-tickets-101` observation | Correct the target; audit persisted links and handle the legacy URL in a focused follow-up |
| Browser-like fetches returned the JavaScript app shell | Browser observations | Expected for the existing SPA design; browser rendering and crawler HTML need separate checks |
| Public robots directives explicitly allow OAI-SearchBot and ChatGPT-User | Saved robots response | No robots-level search-bot block was observed; firewall access is a separate question |

[OpenAI publisher guidance](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq) identifies OAI-SearchBot access and ChatGPT referral tracking as practical requirements. GPTBot training permission is distinct from search discovery. No new AI-specific file is required by the evidence reviewed here.

Google’s [generative AI search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) recommends useful original content, crawlability and fewer duplicates. It does not promise an advantage from extra AI text files or special markup. These are Google’s statements, not a disclosure of ChatGPT’s ranking formula.

## Next 30 days, in priority order

| Priority | Action | Acceptance evidence |
| --- | --- | --- |
| 1 | Publish the reviewed guide and its matching crawler snapshot through the normal Fabsy release workflow | Live HTML and rendered page both show the new guide, canonical, pricing and source links |
| 2 | Run benchmark v2 in fresh consumer ChatGPT conversations using a consistent location/search/personalization setup | Saved answers and cited URLs for all 12 prompts; organic citation coverage reported out of 10 |
| 3 | Inspect Google/Bing index coverage and real OpenAI crawler logs for the guide and key service pages; audit existing links to obsolete hub paths | Actual indexed URL/canonical evidence, verified bot requests and a bounded list of links to correct |
| 4 | Verify ChatGPT referral attribution through intake and completed purchase, then separate refunds and paid traffic | A controlled, non-billable verification with a retained source and deduplicated conversion; no raw ticket/identity data in analytics |
| 5 | Add original, permissioned service examples: ticket type, steps taken, timeline, result and limitations | Two documented examples supported by files and publication permission, with no inferred win-rate statistic |
| 6 | Strengthen the disclosure, response-deadline and photo-radar guides; remove contradictions across existing pages | Source-backed edits to existing canonical pages, consistent offers and useful internal links |
| 7 | Improve independent corroboration through accurate eligible business listings and relevant Alberta driving/trucking resources | Verified service descriptions and real editorial mentions; no fake reviews or undisclosed promotional posts |

The goal for the first month is a trustworthy baseline plus demonstrably better source pages and attribution. Do not forecast a citation share or claim “domination” before observing comparable runs. Repeat the same benchmark protocol weekly; scheduling has not been set up.

### Measurement verification before using GA4 totals

The initial concern about all UTM-bearing URLs being ineligible came from the older working checkout. The release source explicitly permits validated UTM parameters on `/rapid-resolution`, and the proposed OpenAI paid link passes the pure URL/context checks recorded in `../../paid-acquisition/2026-09-09-openai-test/attribution-preflight.json`. Other paths have narrower rules. Attribution capture is consent-aware. Real referrers, consent transitions, intake and purchase correlation still need end-to-end verification before treating GA4 as a complete count. Preserve protections against ticket IDs, checkout tokens and private referrers. No analytics settings or protections were changed in this work.

## OpenAI classification inquiry — draft for Brett

Fabsy provides ticket administration and permitted agent representation for eligible Alberta provincial traffic-ticket matters. We are not a law firm and do not provide legal advice. With client authorization, our work includes ticket intake, disclosure requests and tracking, disclosure review, pre-trial prosecutor-review submissions, status updates and obtaining the client’s instructions on any available resolution. Trial representation is separate from the advertised Rapid Resolution service.

Can this service advertise to adults in Alberta through ChatGPT Ads? Please confirm how OpenAI classifies ticket administration agents under the current policy, including the references to representation and document preparation. Our proposed landing page is https://fabsy.ca/rapid-resolution.

This inquiry has not been sent. The existing OpenAI login reached Ads onboarding and an ad preview was prepared; no advertising terms were accepted, no campaign was created, and no spend started. See `../../paid-acquisition/2026-09-09-openai-test/README.md`.

## Validation

- Targeted ESLint and JavaScript syntax checks passed.
- Vite production compilation passed in a temporary output directory. The existing large-chunk warning remains; the database-connected npm prebuild/postbuild pipeline was not run.
- Browser and crawler-snapshot verification evidence is recorded in `local-verification.json`; screenshots show the desktop and mobile layout.
- Desktop (1280 px) and mobile (390 px) checks found no horizontal overflow or page runtime errors. All 10 internal article-link targets have local snapshots; the updated crawler snapshot passes canonical/head checks and JSON-LD parsing. The scoped whitespace check passed.
- Re-run the read-only audit after a release: `node scripts/audit-chatgpt-crawl.mjs docs/aeo/<date>/crawl-after.json`.

### Content sources checked

- [Alberta fine payment and TTDS options](https://www.alberta.ca/fine-payment): current online response options and SafeRoads distinction.
- [Alberta Court of Justice traffic information](https://albertacourts.ca/cj/areas-of-law/traffic): ticket instructions, required appearances and municipal bylaw distinction.
- [Traffic Tickets Digital Service](https://traffictickets.alberta.ca/): official service entry point. The web text extractor did not expose its application content; no authenticated workflow was exercised.
- Fabsy’s existing offer configuration and public service descriptions: prices, tasks included and service limits. This guide does not restate refund conditions where other working-tree sources currently differ.
