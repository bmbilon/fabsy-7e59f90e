# First-party evidence baseline

## Provenance

| Evidence | Window/run date | State | Repository treatment |
| --- | --- | --- | --- |
| Search Console Web Performance chart and `/content/` filter | 2025-10-01 to 2026-08-29 | Manually verified authenticated UI snapshot | Aggregates recorded in `gsc-aggregate-baseline.csv`; raw export excluded |
| Search Console whole-site `Pages.csv` | 2025-10-01 to 2026-08-29 | Authenticated export observed | Read-only scorer input; raw export excluded |
| Search Console Generative AI Features beta | 2026-05-30 to 2026-08-29 | Manually verified chart plus authenticated page export | Aggregates/top rows recorded; raw export excluded |
| Perplexity 30-query run | 2026-08-31 | One anonymous/incognito observed run | Row-level result URLs recorded where stable |
| 100-query intent map | 2026-08-31 planning artifact | Planned and unobserved | No search-volume claims |
| Future Google/Bing/ChatGPT/Claude benchmark rows | Future | Planned and not run | Empty observations template only |

## Search Console Web Performance

The verified chart-level whole-site baseline is 645 clicks, 70,457 impressions, 0.9% CTR, and average position 15.8.

The manually filtered `/content/` view contains 623 table rows with 497 clicks, 62,780 impressions, 0.8% CTR, and average position 18.1. Of those rows:

- 108 have at least one click and 515 have zero clicks;
- 267 have at least 10 impressions;
- 58 have at least 100 impressions;
- 14 have at least 1,000 impressions;
- the top 25 pages account for 375 clicks (75.5% of `/content/` clicks);
- the top 100 account for 489 clicks (98.4%).

The authenticated whole-site `Pages.csv` contains 705 parsed page rows. Its dimensional row sum is 651 clicks and 77,084 impressions, which does not reconcile to the chart total. This is retained as a data-quality warning: chart totals are the KPI; page rows are URL-level evidence for protection and review. The `/content/` subset of that export exactly matches the manually verified 623-row/497-click/62,780-impression filtered baseline.

URL-pattern cohort aggregates are in `gsc-aggregate-baseline.csv`. They are descriptive cohorts, not mutually exclusive causal segments.

## Generative AI Features beta

The verified chart reports 2,023 impressions across 131 pages. The page-export rows sum to 2,252 impressions because a result can expose multiple Fabsy URLs and because the report dimensions are non-additive. Never replace the 2,023 chart KPI with the page-row sum.

Within the page export:

- 86 `/content/` rows sum to 1,588 page impressions;
- 33 `/blog/` rows sum to 469 page impressions;
- every observed `/content/` row is protected by the consolidation scorer;
- only two `officer-error` URLs appear: red-light Calgary with 4 page impressions and no-seatbelt Red Deer with 1.

Selected top page rows are in `gsc-generative-ai-top-pages.csv`. An AI Features impression proves first-party visibility in the report; it does not identify the query or prove a textual citation.

## Perplexity directional baseline

The one observed 30-query run cited Fabsy on 2 prompts (6.7%): B016 and B028. The other 28 rows have `fabsy_cited=no`. Mention status and factual accuracy were not reviewed, so those fields remain unknown. Stable Perplexity result URLs are recorded for B001 through B026; B027 through B030 used direct anonymous query URLs without stable UUIDs.

This is a single-run directional baseline. Require three controlled repetitions before making a stable visibility comparison.

## Interpretation guardrails

- A missing GSC page row is unknown rather than proven zero.
- A zero-click row can still have valuable impressions or AI visibility.
- GSC Generative AI impressions and a controlled LLM citation are different metrics.
- Qualitative query priority in the intent map is editorial triage, not measured demand.
- No aggregate number supplies URL-level redirect authority.
