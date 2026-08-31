# Public pro driver and referral snapshots

The only program snapshot routes are `/pro-drivers` and `/refer`. The public React pages and deterministic snapshots share `src/config/proReferralContent.json`. The frontend adapter derives displayed pro prices from the existing offer and pro-driver constants. A regression check compares the resolved snapshot copy with the real frontend exports, so a pricing change cannot silently leave the two versions different.

Both pages have self-canonical URLs, English and x-default alternates, index/follow metadata, Open Graph and Twitter metadata, and visible expandable FAQs that match their FAQPage schema. The pro page's Service schema has two eligible officer-service offers, with prices in CAD and GST explicitly excluded. Referral rewards are described as rewards, not customer Offer prices. No referral code, order, licence document, payout profile or private portal data is rendered into a snapshot.

## Targeted generation

Generate only these two public pages, without database access or unrelated snapshot writes:

```sh
node scripts/generate-pro-referral-snapshots.cjs pro-drivers refer
```

Default outputs:

- `public/prerendered/pro-drivers/index.html`
- `public/prerendered/refer/index.html`

For an isolated preview, set `PRO_REFERRAL_SNAPSHOT_OUT_DIR` to a temporary directory. The generator exports `renderProDrivers()`, `renderRefer()`, `publicContent`, `pricing`, and `generateProReferralSnapshots(outDir, routes)`. Importing it does not write files. Route batches are validated before writing; private paths, path traversal, duplicates and unknown routes are rejected.

The existing dispatcher also supports:

```sh
node scripts/generate-static-snapshots.cjs pro-drivers refer
```

That selected-route form does not require the page-content cache and leaves photo-radar, fleet, free-check and content snapshots untouched. The normal full generator still includes the existing photo-radar generator and source/manifest safeguards. The browser prerender registry includes both program routes, materializes their deterministic snapshots, and skips browser replacement of those two routes so a stale deployed app cannot overwrite the reviewed copy.

## Offline static sitemap update

```sh
node scripts/update-static-sitemap-offline.mjs
node scripts/update-static-sitemap-offline.mjs --check
```

This uses the current `public/sitemaps/sitemap-pages.xml` as the source of already-published blog URLs and dates. It passes that inventory through `SITEMAP_BLOG_CACHE` to the existing sitemap generator with all generated outputs in a temporary directory. It copies back only `sitemaps/sitemap-pages.xml`, after checking that no existing URL or blog date disappeared. It never fetches the remote blog inventory and does not replace the sitemap index, content sitemaps or locale sitemaps. `SITEMAP_PUBLIC_DIR` can point to an isolated fixture for review.

The August 31 update preserved all 77 existing blog entries and produced 100 page URLs. It added the registered pro-driver, referral, photo-radar, fleet, free-check and terms routes that were missing from the checked-in XML. Locale alternates continue to follow the existing review/release gates. Private portal/admin routes and referral short codes are excluded.

## Verification and publication gate

```sh
node scripts/test-pro-referral-snapshots.mjs
node scripts/update-static-sitemap-offline.mjs --check
```

The snapshot test renders the real React page components on the server with only global navigation omitted. It checks visible-copy, FAQ and schema parity; metadata and locale policy; exact prices, eligibility and referral terms; safe route admission; deterministic output; targeted dispatcher isolation; and offline sitemap preservation and idempotence. Fixtures are temporary and no browser effects, authentication, API calls or payments run.

The test also requires the publishing guard to admit the exact program claims. The existing guard deliberately rejects unknown prices, percentages and timelines. Any allowance must be limited to reviewed pro/referral strings on the proper routes, plus qualified pro Service Offer prices. Do not disable the general pricing, numeric-claim, outcome, locale or private-route protections to make a build pass. The complete snapshot guard remains a separate release check.

The local browser follow-up confirmed the new FAQ controls open, public canonicals/titles are correct, desktop pages have no horizontal overflow, and the browser error log is empty. Screenshots are in `reports/pro-referral-qa-2026-08-31/pro-faq-desktop.jpg` and `referral-faq-desktop.jpg`; the earlier report covers mobile layouts and authentication gates.

No `npm run build` or prebuild was run for this work: that pipeline includes remote synchronization and broad generated-content changes. No external publishing or deployment was performed by the public-page task.
