# Fabsy traffic recovery — September 15, 2026

## Observed baseline

Authenticated Google Search Console, property `sc-domain:fabsy.ca`, search type Web, no country/device/query filters:

| Window | Clicks | Impressions | CTR | Average position |
| --- | ---: | ---: | ---: | ---: |
| June 14–September 13 | 259 | 33,750 | 0.8% | 19.5 |
| August 17–September 13 (28 days) | 104 | 12,029 | 0.9% | 16.9 |
| September 7–13 (7 days) | 39 | 3,994 | 1.0% | 14.3 |

The totals indicate low organic traffic, with a better latest week; they do not establish a sudden traffic collapse. Clicks are Google search clicks, not unique people or purchases. Search Console totals are independent of visitor analytics consent.

Page indexing was last updated September 3: 189 indexed, 1,082 not indexed. Reasons: 554 discovered but not indexed, 293 crawled but not indexed, 209 duplicate with a different Google-selected canonical, 17 noindex, four soft 404, four redirects, one alternate with proper canonical. Exclusions are not all errors. Recent fixes cannot be evaluated against this stale coverage snapshot alone.

The submitted sitemap index showed Success, last read September 10, with 1,205 discovered pages. The current local sitemap inventory contained 1,206 URLs, all with indexable snapshots. Public HTTP checks found readable crawler HTML on key content pages and an accessible sitemap/robots file.

### Pages with existing demand (28-day page rows)

| Page | Clicks | Impressions | Position |
| --- | ---: | ---: | ---: |
| `/content/speeding-ticket-calgary` | 2 | 1,365 | 20.2 |
| `/content/speeding-ticket-edmonton` | 3 | 1,228 | 22.8 |
| `/content/fight-stop-sign-ticket-alberta` | 2 | 1,050 | 15.3 |
| `/content/speeding-ticket-alberta` | 6 | 654 | 15.7 |
| `/blog/alberta-traffic-ticket-comparison-guide` | 7 | 551 | 23.9 |

Page-dimensional values are evidence for prioritization; do not replace chart totals with their sum. The raw authenticated UI captures are retained outside Git in the local evidence directory.

## Confirmed implementation problems and fixes

1. **Reviewed guide bodies were replaced with generic text in React.** The pricing validator treated the exact approved outcome/refund FAQ as a fresh price claim because it mentions a service fee. The snapshot generator accepted that same approved text. Reproduced on Edmonton in a configured local browser: the crawler title/body was detailed, while React displayed “Speeding Ticket in Edmonton” and the fallback paragraphs. The exact FAQ occurs in 33 curated source records. A narrow match for the entire approved question and answer now exempts that FAQ from the price-ladder requirement. Other content, safety and pricing checks remain active. Altered questions, appended prices, changed conditions and wrapped markup fail the exception. Browser parity regressions now include Calgary and Edmonton.
2. **The homepage did not link to the useful ticket guides.** Added a visible six-guide section, procedural guide link and blog link, plus prominent links in the English footer. The deterministic content snapshots expose the same key guide destinations.
3. **The homepage title led with an internal product name.** The title now describes the search intent and brand: “Fight a Traffic Ticket in Alberta | Fabsy”. The app-shell title, description and social metadata match the React homepage.
4. **The obsolete `/content/alberta-tickets-101` path returned an app shell.** It now redirects permanently to `/hubs/alberta-tickets-101` in Cloudflare policy and static/Vercel configuration, and redirects during React navigation.
5. **The city guides lacked useful local resources.** Added distinct official Calgary/Edmonton court-directory information, online/DIY response resources and contextual links to the detailed province-wide guides. Original source-check dates remain intact; the added court and response links were checked September 15. No new outcome claims, prices or credentials were introduced.
6. **Bundled guides still required a successful content database request.** The Vercel preview exposed a “Page Not Found” failure even though the approved guide was bundled. React now loads those reviewed records directly, through the existing admission checks. Database-backed legacy pages retain their existing fetch path. Browser regression checks block the content API and confirm the four priority guides still render without making that request.

## Measurement limitation

`publicMeasurementPath` in `src/lib/googleMeasurement.ts` excludes article URLs. Google measurement also requires visitor consent and a safe referrer/document. GA4 is therefore not a total-site visitor count. These privacy protections were not relaxed. Use Search Console for the organic baseline and the consented funnel for observed conversions; do not call either a count of all visitors.

## Validation and release

Targeted ESLint passed with only the two existing inline-style warnings in Footer. SEO tests, the 37-check homepage snapshot suite, curated normalizer checks and production Vite compilation passed. Configured local browser verification confirmed both city guides' full headings, local court links and self-canonicals, the legacy guide redirect, all eight homepage guide links and no horizontal overflow at 390 px. Final build, preview and production evidence are recorded separately as they complete.

## Follow-up priorities

- Compare the same 28-day Google Web chart and these destination pages after enough recrawl time; report clicks, impressions, CTR and position separately. The latest seven-day baseline is useful for an early directional check.
- Inspect Google-selected canonicals and URL-level click/AI visibility before extending the existing small consolidation pilot. The 209 duplicate count does not justify deleting or redirecting every variant.
- Expand original, verified information on the guides already receiving impressions. Preserve their URLs and any supported unique content.
- Pursue legitimate Alberta referral relationships and accurate business listings with actual publication/outreach authorization. No messages, ads or additional spend were started by this release.

No ranking or traffic increase is claimed from deploying the changes. No recurring monitor was created.

## Sources for this change

- [Google: crawlable links and internal linking](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Google: helpful, reliable content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google: canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization)
- [Alberta Court of Justice: Calgary directory](https://albertacourts.ca/cj/court-practice-and-schedules/locations-map/location-detail/calgary)
- [Alberta Court of Justice: Edmonton directory](https://albertacourts.ca/cj/court-practice-and-schedules/locations-map/location-detail/edmonton)
- [Alberta: fine payment and response options](https://www.alberta.ca/fine-payment)
- [Alberta Court of Justice: Traffic Court and online service scope](https://albertacourts.ca/cj/areas-of-law/traffic)
