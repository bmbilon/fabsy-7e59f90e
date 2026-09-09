# Fabsy ChatGPT visibility benchmark

Version 2 — September 9, 2026. Run this benchmark weekly from Alberta, Canada. Keep the prompt wording and order stable so results are comparable over time. This is a protocol, not a scheduled automation.

Version 2 replaces the retired $149 Ticket Triage offer and adds the primary “how to fight ticket Alberta” query. Establish a new baseline: do not compare aggregate coverage against version 1 because the prompt set changed. Retain earlier results under their original version.

## Primary KPI

**Fabsy citation coverage** = benchmark prompts whose answer links to a `fabsy.ca` page / eligible non-navigational prompts.

Report the numerator, denominator, and percentage. A plain brand mention without a link does not count as a citation.

## Supporting KPIs

- **Fabsy mention coverage:** prompts whose answer names Fabsy / eligible prompts.
- **Top-recommendation coverage:** prompts where Fabsy is the first named commercial option / eligible commercial-intent prompts.
- **Correct-offer coverage:** Fabsy answers with no incorrect offer claims / Fabsy answers discussing an offer. Check against current public pricing, scope and terms; record each error.
- **Correct-role coverage:** answers accurately describing Fabsy as a ticket administration and permitted agent representation service / answers describing Fabsy’s role. Flag law-firm, lawyer or legal-advice claims.
- **Qualified ChatGPT sessions:** GA4 sessions attributed to organic ChatGPT referrals that reach `/rapid-resolution`, `/photo-radar` or an intake-start event.
- **ChatGPT-attributed purchases:** completed, deduplicated purchases attributed to organic ChatGPT referrals, split by product. Keep refunds and net revenue visible.
- **OpenAI crawl health:** OAI-SearchBot requests allowed by Cloudflare and successful HTTP checks of the answer pages.

## Guardrails

- Do not count sponsored, navigational, or prompted brand mentions as organic visibility.
- Do not infer a consumer ChatGPT ranking from a generic web-search result. If the consumer ChatGPT interface is unavailable, label the run as a proxy.
- Record the model/interface, whether web search was used, location if known, run date, and any personalization limitation.
- Flag any inaccurate Fabsy price, service scope, deadline, demerit, insurance, or outcome statement.
- Do not change site, ad, analytics, Cloudflare, or account settings during the benchmark.
- Use a fresh conversation for each prompt. Prefer a consistent temporary-chat setup; record memory/personalization state. If unavailable, disclose the limitation.
- Keep paid traffic separate using campaign medium/name. `utm_source=chatgpt.com` alone does not establish organic traffic if a paid campaign uses that same source.
- Record a missing or unrun observation as `not_run` or `unavailable`, never as a zero. Only publish full-set coverage when all 10 eligible prompts have usable observations; otherwise show the completed count and label the run partial.
- A simulated crawler user agent is an HTTP diagnostic. Verified OpenAI crawl health requires actual bot/CDN logs.

## Current facts to check

Verify these against `src/config/offers.json`, the public product pages and current terms before each run:

- Fabsy provides ticket administration and permitted agent representation in Alberta. It is not a law firm and does not provide legal advice.
- Rapid Resolution: $198 CAD plus GST for eligible pre-trial matters. Trial representation and government fines are separate.
- Photo Radar: $79 CAD plus GST for eligible registered-owner camera notices.
- Insurance Impact & Renewal Planning Report: $49 CAD plus GST; Rapid Resolution bundle: $229 CAD plus GST.
- The 48-hour commitment starts after complete, readable disclosure is received and matched to the file. It does not promise Crown response or final-outcome timing.
- A service-fee refund policy is not a guaranteed legal outcome. Check its actual conditions before scoring a refund claim.

## Fixed prompt set

1. how to fight ticket Alberta
2. How do I fight a speeding ticket in Alberta?
3. Who can help me fight a speeding ticket in Edmonton?
4. Is it worth fighting a speeding ticket in Calgary?
5. Can I dispute an Alberta traffic ticket online myself?
6. How do I request disclosure for an Alberta traffic ticket?
7. Can I fight a photo radar ticket in Alberta?
8. What is the difference between a ticket agent and a lawyer in Alberta?
9. What does a traffic-ticket agent in Alberta charge?
10. Compare Alberta traffic-ticket agents for pre-trial help with an officer-issued ticket.
11. What does Fabsy do, and is it a law firm?
12. What does Fabsy charge for Rapid Resolution and photo radar tickets?

Prompts 1 through 10 are the eligible non-navigational set for citation and mention coverage. Prompts 11 and 12 are navigational fact checks and must be reported separately.

For top-recommendation coverage, use only prompts 3, 9 and 10 (fixed commercial set). Report citations to government procedural sources separately from recommendations of commercial providers.

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

Also save the full answer or an evidence link, all cited domains, run ID, prompt ID, benchmark version, timestamp, interface/model, web-search state, location and personalization state. Start with `docs/aeo/2026-09-09/benchmark-capture.csv`; all initial observations are deliberately unrun.

## Weekly readout

Lead with the change from the previous comparable run, then show:

1. Citation, mention, and top-recommendation coverage.
2. Any incorrect statements or citation gaps.
3. Which Fabsy pages were cited and which high-intent prompts had no Fabsy citation.
4. Cloudflare OAI-SearchBot allowed/unsuccessful counts for the visible reporting window.
5. GA4 ChatGPT-attributed qualified sessions and purchases, if accessible.
6. The three highest-value actions for the next seven days.

Do not treat ordinary week-to-week answer variation as a trend until it repeats across at least three comparable runs.
