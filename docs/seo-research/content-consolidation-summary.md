# Content consolidation candidate summary

## Reproducible run

The scorer was run against manifest version 2 generated `2026-09-01T00:39:36.250Z`, the authenticated 16-month whole-site Search Console page export, and the authenticated Generative AI Features page export:

```sh
node scripts/seo-evidence/score-content-consolidation.mjs \
  --manifest public/prerendered/content-manifest.json \
  --gsc /tmp/fabsy-gsc.ZQDE2s/Pages.csv \
  --gsc-ai /tmp/fabsy-gsc-ai.bzWeoT/Pages.csv \
  --out /tmp/fabsy-content-candidates.csv \
  --summary /tmp/fabsy-content-candidates-summary.json
```

The raw exports and 1,122-row candidate output are intentionally not checked into the repository. Re-run the command against fresh exports to reproduce or update it.

## Input quality

- Manifest: 1,122 database-source/generated slugs, 38 curated pages, and 1,084 fallback pages.
- Ordinary GSC export: 623 `/content/` URL rows; all 623 matched manifest slugs. The remaining 499 manifest URLs are absent from the export and therefore unknown, not zero.
- Generative AI export: 86 `/content/` URL rows; all 86 matched manifest slugs and were protected. The page-row sum is not treated as the AI report total.

## Advisory output

| Recommendation | Pages | Meaning |
| --- | ---: | --- |
| `KEEP` | 164 | Curated, clicked, strongly visible, or observed in Generative AI Features |
| `ENRICH` | 131 | Likely province-wide destination or meaningful impression opportunity |
| `REVIEW` | 715 | Insufficient evidence or potentially distinct city-level value |
| `MERGE_CANDIDATE` | 112 | Low-signal scenario/persona variant with an existing province-wide target |

The 164 `KEEP` rows are assigned by precedence: 38 curated rows, 73 additional rows protected by observed Generative AI visibility, and 53 additional rows protected by ordinary clicks. A row can satisfy more than one underlying guardrail even though it has one recorded reason.

All 112 merge candidates are scenario variants. By modifier: 19 commercial-driver, 10 first-time-offender, 12 multiple-tickets, 14 new-driver, 17 officer-error, 16 out-of-province, 12 photo-radar, and 12 weather-conditions.

Safety invariants passed:

- output rows equal manifest rows: 1,122 = 1,122;
- merge candidates with an observed click: 0;
- merge candidates with observed Generative AI impressions: 0;
- merge candidates without an existing province-wide target: 0;
- routes, redirects, source content, and snapshots modified by the scorer: 0.

## What the output does not decide

The score is a triage aid, not a redirect map. It does not measure content similarity, backlinks, conversions, local court information, legal distinctness, or current index state. Before implementing any merge candidate:

1. inspect its GSC queries and landing-page trend;
2. check conversions, backlinks, referrals, and other first-party value;
3. compare the page against the proposed province-wide target for genuinely distinct facts;
4. confirm the target is legally current and satisfies the same intent;
5. approve an explicit URL-by-URL redirect/noindex decision with rollback documentation.

There is deliberately no bulk-delete, redirect-writing, noindex-writing, or snapshot-mutating code in the scorer.

## Bounded first pilot

After scoring, 20 generic careless-driving scenario pages were manually compared with the reviewed province-wide guide and selected for a first 301 cohort. Every selected URL has zero observed clicks when a GSC row exists, no row in the Generative AI Features export, at most three observed ordinary impressions, no unique scenario detail in the rendered fallback body, and an existing reviewed target at `/content/careless-driving-ticket-alberta`.

The exact mapping and known evidence gaps are recorded in `content-consolidation-pilot.csv`. URLs absent from the GSC export remain labelled unknown rather than zero. Search Console's site-level Links report showed zero external links, but that is not treated as a complete third-party backlink audit; GA4 had only newly activated data, so historical conversions were unavailable. Those limitations are explicit in every row.

The cohort is implemented only as reversible 301 policies plus sitemap exclusion; source records and snapshots are not deleted. Rollback is to remove the 20 policy entries and regenerate the sitemaps. Review the target and retired-URL impressions, clicks, index state, and conversions after 30 days before approving another cohort.
