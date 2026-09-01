# Fabsy SEO research and evidence artifacts

This directory separates evidence and operating artifacts that are easy to conflate:

1. first-party observed evidence;
2. fixed research plans and benchmark prompts;
3. advisory content-consolidation candidates;
4. legal/editorial review controls; and
5. earned-link research and unsent outreach drafts.

Nothing here authorizes a redirect, noindex, deletion, canonical change, or legal-content publication.

## Artifact inventory

- `alberta-traffic-ticket-query-map.csv` — 100 planned query/intention rows. Demand and exact volume are explicitly unmeasured.
- `citation-benchmark-queries.csv` — the fixed 30-prompt benchmark set.
- `citation-benchmark-observed-perplexity-2026-08-31.csv` — one observed anonymous/incognito Perplexity run with stable result URLs where available.
- `citation-benchmark-observations-template.csv` — empty schema for future platform runs.
- `citation-benchmark-procedure.md` — controlled execution, evidence, and KPI rules.
- `citation-benchmark-runs/YYYY-MM-DD/` — non-overwriting dated monthly run artifacts created by the benchmark generator.
- `kpi-measurement-spec.md` — primary SEO/business/citation KPI definitions, sources, targets, guardrails, and known instrumentation gaps.
- `alberta-legal-editorial-review-packet.md` — version-bound checklist for a qualified Alberta reviewer; approval remains pending until a real reviewer completes it.
- `backlink-prospects.csv` — 12 bounded outreach candidates and eight citation-only authorities, with verification, fit, and risk notes.
- `backlink-outreach-drafts.md` — unsent, relationship-first drafts that remain gated on completed qualified review of the exact linked page.
- `gsc-aggregate-baseline.csv` — manually verified aggregate Search Console facts and explicit dimensional caveats.
- `gsc-generative-ai-top-pages.csv` — selected observed page rows from the authenticated Generative AI Features export.
- `first-party-evidence-baseline.md` — human-readable evidence receipt and interpretation limits.
- `content-consolidation-summary.md` — reproducible scorer results from the current manifest and read-only GSC exports.
- `content-consolidation-pilot.csv` — the bounded, manually reviewed 20-URL first redirect cohort with evidence gaps and rollback recorded per URL.

The raw authenticated Search Console exports are intentionally not stored in the repository.

## Run the consolidation scorer

Without page-level Search Console evidence:

```sh
node scripts/seo-evidence/score-content-consolidation.mjs \
  --manifest public/prerendered/content-manifest.json \
  --out /tmp/fabsy-content-candidates.csv \
  --summary /tmp/fabsy-content-candidates-summary.json
```

With ordinary and Generative AI Features page exports:

```sh
node scripts/seo-evidence/score-content-consolidation.mjs \
  --manifest public/prerendered/content-manifest.json \
  --gsc /secure/path/Pages.csv \
  --gsc-ai /secure/path/generative-ai/Pages.csv \
  --out /tmp/fabsy-content-candidates.csv \
  --summary /tmp/fabsy-content-candidates-summary.json
```

The ordinary export must be a Search Console Pages export with URL, Clicks, and Impressions columns. The Generative AI export needs URL and Impressions. A URL absent from an export is `unknown`, not zero.

Recommendations are conservative:

- `KEEP` protects curated pages, every URL with an observed ordinary click, every URL with at least 1,000 ordinary impressions, and every URL with observed Generative AI Features impressions.
- `ENRICH` identifies province-wide consolidation destinations or URLs with meaningful impressions but weak/no clicks.
- `REVIEW` means the evidence is insufficient or the city page may have distinct local value.
- `MERGE_CANDIDATE` is limited to a scenario/persona variant with an existing province-wide target, no observed clicks, no observed AI impressions, and fewer than 10 observed ordinary impressions when a row exists. It is never an implementation instruction.

Run tests with:

```sh
node scripts/seo-evidence/test-score-content-consolidation.mjs
node scripts/seo-evidence/test-research-artifacts.mjs
node scripts/seo-evidence/test-create-citation-benchmark-run.mjs
```

Create a new citation run without touching prior results:

```sh
node scripts/seo-evidence/create-citation-benchmark-run.mjs \
  --platform perplexity \
  --date YYYY-MM-DD \
  --repetition 1 \
  --reviewer REVIEWER_INITIALS
```

The generator writes 30 `planned_not_run` rows under a dated directory using exclusive file creation. Follow `citation-benchmark-procedure.md` to record only direct observations.
