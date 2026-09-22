# September 21 content review: 34 priority URLs

This is the URL-level follow-up to the local Search Console inventory. The exact dispositions and evidence gaps are in `content-consolidation-next-review.csv`. The full joined audit, including the raw export receipts, is kept outside Git at `/Users/brettbilon/Documents/Fabsy-SEO-Audit-2026-09-21/reviewed-priority.csv`.

## Observed evidence

- All 34 are generated fallback scenario pages. Their rendered bodies repeat the same deadline and Fabsy service instructions. The city and modifier appear in the heading, but the article does not answer that modifier with a distinct fact.
- Search Console Web Pages, 16 months through September 19, records **124 impressions and 0 clicks** across these exact URLs. None was indexed in the September 17 indexing examples. The example export is incomplete, so the inventory does not establish the current state of every URL.
- Search Console exposes visible query rows for only 3 of the 34 exact-page filters. Those rows contain broad offence or city terms, not the scenario modifier. The other 31 page filters still have impressions; their query detail is unavailable.
- Five current URL inspections were checked. Three selected a different, sometimes cross-offence Fabsy canonical; one selected a same-offence city page; one inspection conflicted with its older indexing example. These observations are recorded per URL, not extrapolated to the other 29.
- A scan of the rendered snapshot corpus found no incoming links to any of the 34. Search Console's site-level Links report showed zero external links, which is not a complete URL-level backlink audit. Third-party backlink detail remained unavailable.
- The live Fabsy all-source report began collecting on September 21 at 5:34 p.m. Edmonton time. No priority URL appeared in its current page breakdown. GA4's last-28-day Pages report also showed none. Neither observation proves zero historical traffic or conversions.

## Decisions

| Count | Disposition | Reason |
| ---: | --- | --- |
| 2 | Withdraw with HTTP 410 now | The Calgary and Edmonton “distracted-driving photo radar” pages promise a ticket type unsupported by Alberta's [current automated-enforcement overview](https://www.alberta.ca/photo-radar-alberta) and [intersection device rules](https://www.alberta.ca/intersection-safety-devices). Their body gives no clarification. Middleware returns a reversible 410, and the sitemap omits them. |
| 26 | Candidate for a reversible 301 to the curated province-wide guide | The source has no unique scenario answer and the proposed guide covers the same offence and response process. Do not activate until the first 20-URL pilot has 30-day results and a qualified review confirms the destination's current legal content. |
| 4 | Hold for commercial-driver coverage | The red-light guide does not address commercial-driver-specific consequences. An offence-only redirect would leave the stated intent unanswered. |
| 2 | Hold for out-of-province coverage | The offence guide does not address cross-jurisdiction licence or record implications. |

The first redirect pilot launched September 21. Review its retired-URL and destination impressions, clicks, index state, and conversions around October 21 before expanding it. Preserve source records and snapshots; rollback for the two withdrawn pages is to remove their `gone` entries and regenerate the sitemaps. The 26 candidate redirects remain unimplemented.
