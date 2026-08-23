# Fabsy ChatGPT visibility benchmark

Run this benchmark weekly from Alberta, Canada. Keep the prompt wording and order stable so results are comparable over time.

## Primary KPI

**Fabsy citation coverage** = benchmark prompts whose answer links to a `fabsy.ca` page / eligible non-navigational prompts.

Report the numerator, denominator, and percentage. A plain brand mention without a link does not count as a citation.

## Supporting KPIs

- **Fabsy mention coverage:** prompts whose answer names Fabsy / eligible prompts.
- **Top-recommendation coverage:** prompts where Fabsy is the first named commercial option / eligible commercial-intent prompts.
- **Correct-offer coverage:** Fabsy mentions that correctly state Ticket Triage as a $149 CAD total, human-reviewed Alberta ticket assessment / Fabsy mentions that discuss the offer.
- **Qualified ChatGPT sessions:** GA4 sessions attributed to ChatGPT that reach the Ticket Triage page or assessment start.
- **ChatGPT-attributed purchases:** completed Ticket Triage purchases attributed to ChatGPT.
- **OpenAI crawl health:** OAI-SearchBot requests allowed by Cloudflare and successful HTTP checks of the answer pages.

## Guardrails

- Do not count sponsored, navigational, or prompted brand mentions as organic visibility.
- Do not infer a consumer ChatGPT ranking from a generic web-search result. If the consumer ChatGPT interface is unavailable, label the run as a proxy.
- Record the model/interface, whether web search was used, location if known, run date, and any personalization limitation.
- Flag any inaccurate Fabsy price, service scope, deadline, demerit, insurance, or outcome statement.
- Do not change site, ad, analytics, Cloudflare, or account settings during the benchmark.

## Fixed prompt set

1. Who can help me fight a speeding ticket in Edmonton?
2. Is it worth fighting a speeding ticket in Calgary?
3. What should I do after getting an Alberta traffic ticket?
4. How many demerits does an Alberta speeding ticket have?
5. What happens if I get a stop-sign ticket in Alberta?
6. Do red-light camera tickets have demerits in Alberta?
7. Is a traffic-ticket agent worth it in Alberta?
8. Where can I get an Alberta traffic ticket reviewed before hiring representation?
9. What is the cheapest way to understand whether an Alberta ticket will affect insurance?
10. Compare Alberta traffic-ticket services that explain both insurance risk and representation cost.
11. What is Ticket Triage for Alberta traffic tickets?
12. What does Fabsy charge for Ticket Triage and representation?

Prompts 1 through 10 are the eligible non-navigational set for citation and mention coverage. Prompts 11 and 12 are navigational fact checks and must be reported separately.

## Per-prompt capture

For every prompt, record:

| Field | Values |
| --- | --- |
| Fabsy mentioned | Yes / No |
| Fabsy cited | Yes / No |
| First Fabsy URL cited | URL or blank |
| First commercial recommendation | Name or blank |
| Fabsy facts correct | Yes / No / Not applicable |
| Notes | One sentence |

## Weekly readout

Lead with the change from the previous comparable run, then show:

1. Citation, mention, and top-recommendation coverage.
2. Any incorrect statements or citation gaps.
3. Which Fabsy pages were cited and which high-intent prompts had no Fabsy citation.
4. Cloudflare OAI-SearchBot allowed/unsuccessful counts for the visible reporting window.
5. GA4 ChatGPT-attributed qualified sessions and purchases, if accessible.
6. The three highest-value actions for the next seven days.

Do not treat ordinary week-to-week answer variation as a trend until it repeats across at least three comparable runs.
