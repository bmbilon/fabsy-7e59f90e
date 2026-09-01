# Search and LLM citation benchmark procedure

## Purpose

Measure whether Fabsy is surfaced and linked for a fixed set of 30 non-branded Alberta traffic-ticket prompts. The benchmark is evidence collection, not a ranking guarantee and not a substitute for Search Console data.

The fixed prompts are in `citation-benchmark-queries.csv`. Do not silently rewrite or reorder them between comparable runs. If a prompt must change because law, terminology, or a product interface changed, create a new benchmark version and retain the old file.

## Data states

- `fixed_prompt` means the row defines a benchmark prompt. It is not an observed search result.
- `planned_not_run` means a platform/prompt observation is scheduled but has not been executed.
- `observed_single_run` means a human actually ran the prompt once and recorded the result.
- `observed_repeated_run` means the prompt was executed as one of the later controlled repetitions.
- Blank, `not_recorded`, and `not_reviewed` are intentional unknowns. They must not be converted to `no`.

The 2026-08-31 Perplexity run is stored separately in `citation-benchmark-observed-perplexity-2026-08-31.csv`. The empty `citation-benchmark-observations-template.csv` is for future observations.

## Platforms

Run the complete prompt set on each platform being compared:

1. Google organic web search
2. Bing organic web search
3. Perplexity Search
4. ChatGPT with web search enabled
5. Claude with web search enabled

If a consumer interface or web-search mode is unavailable, record the row as `not_run_interface_unavailable`. Do not substitute an API or generic web query without giving that run a different `interface_or_product` and labeling it as a proxy.

## Controlled run protocol

1. Create a unique `run_id`, such as `perplexity-2026-09-30-r1`.
2. Record the local run date, interface/product name, visible model or index if disclosed, whether web search was enabled, and location if known.
3. Use an anonymous/incognito or fresh session. Record any personalization that could not be disabled.
4. Run one clean direct search per prompt in benchmark order. Do not mention Fabsy unless the fixed prompt itself does.
5. Do not click or upvote results between prompts in a way that could personalize later results.
6. For Google and Bing, inspect the first 10 non-sponsored organic results. Record the first Fabsy result position if present. Exclude ads, map ads, and prompted brand results.
7. For Perplexity, ChatGPT, and Claude, inspect the visible answer and its source/citation panel. A Fabsy citation requires a clickable `fabsy.ca` URL. A plain brand mention is not a citation.
8. Record the first Fabsy URL exactly as returned, including the path. Do not replace a weak long-tail citation with the URL that the benchmark expected.
9. Record `not_recorded` when the run evidence does not support a field. Never infer a source, rank, fact check, or brand mention from another field.
10. Save a stable result URL when the product provides one. If a direct anonymous query has no stable URL, use `direct-query-unavailable`; do not invent an identifier.
11. If saving a screenshot or text capture outside the repository, record its path and SHA-256 digest. Do not paste whole copyrighted answers into the CSV.

For a baseline robust enough to compare over time, run three independent repetitions per platform within a 48-hour window. Keep each repetition as separate rows. The existing Perplexity run is a valid directional single-run baseline, not the first repetition of a fabricated three-run set.

## Observation fields

The template contains the following evidence controls:

- `observation_status`: whether the row was actually run.
- `fabsy_mentioned`: `yes`, `no`, or `not_recorded`.
- `fabsy_cited`: `yes` only for a clickable Fabsy URL or a Fabsy organic result in the defined search-result scope.
- `result_position`: first Fabsy organic position for classic search; leave blank for answer engines unless the interface exposes a meaningful order.
- `top_source_type`: one of `government`, `court`, `statute_or_case`, `law_firm`, `ticket_agent`, `insurer`, `media`, `forum`, `other`, or `not_recorded`.
- `authority_sources_cited`: concise domains or source names; do not copy the answer.
- `answer_factually_safe`: `yes`, `no`, or `not_reviewed`. This requires a separate fact review.
- `legal_error_flags`: semicolon-separated controlled labels such as `deadline_absolute`, `ticket_stream_conflation`, `automatic_suspension_claim`, `guaranteed_outcome`, `demerit_error`, `agent_scope_error`, or `none`.
- `commercial_fact_accuracy`: `yes`, `no`, `not_applicable`, or `not_reviewed` for price and service-scope claims.

## Metrics

Compute metrics only from completed comparable rows:

- Citation coverage = prompts with `fabsy_cited=yes` / eligible completed prompts.
- Mention coverage = prompts with `fabsy_mentioned=yes` / eligible completed prompts with mention review completed.
- Commercial coverage = commercial-intent prompts with a Fabsy citation / completed commercial-intent prompts.
- Canonical citation share = Fabsy citations pointing to the recommended canonical URL / all Fabsy citations.
- Factual safety rate = reviewed answers marked safe / answers receiving fact review.
- Primary-authority share = answers citing at least one government, court, statute, or case source / answers with source classification completed.

Always report numerator, denominator, percentage, platform, interface, and repetition count. Do not combine classic organic positions with LLM citation order.

## Baseline interpretation

The authenticated 2026-08-31 Perplexity single run cited Fabsy for 2 of 30 prompts (6.7%):

- B016 cited `https://fabsy.ca/content/red-light-ticket-calgary-new-driver`.
- B028 cited `https://fabsy.ca/blog/alberta-traffic-ticket-comparison-guide`.

The remaining 28 prompts did not contain a recorded Fabsy citation. Fabsy mention status and factual safety were not reviewed for those rows, so they remain `not_recorded` or `not_reviewed`, not `no`. Frequent source domains across the run included `albertaticketfighter.com`, `wedefendtickets.ca`, `thepointman.ca`, `gotaticketfightit.com`, Reddit, and official Alberta/court sources. That aggregate competitor note is directional; it is not row-level attribution.

Do not describe 2/30 as a stable Perplexity ranking. Compare only after at least three controlled repetitions or repeated monthly runs under equivalent conditions.

## Relationship to Search Console

Search Console Generative AI Features impressions prove that a Fabsy URL appeared in that first-party report. They do not prove which query caused the impression, that a user read the answer, or that the URL was a textual citation. Keep GSC visibility and the controlled citation benchmark as complementary datasets.

The aggregate and page-row provenance rules are documented in `gsc-aggregate-baseline.csv` and `first-party-evidence-baseline.md`.
