# All-source traffic portal

The Acquisition screen is now **Traffic & acquisition**. It combines three measurement populations without pretending they share a denominator:

1. Cloudflare counts successful public HTML document requests in hourly buckets by public path, channel, fixed source, reviewed campaign label and device category. It includes direct/unknown, organic search, social, AI, email, referral and paid traffic. It does not count client-side SPA navigation, unique visitors or sessions. Known bots, speculative fetches, DNT/GPC requests and private routes are excluded. A missing or stripped referrer is direct/unknown.
2. With explicit funnel consent, Live View records anonymous session page/stage checkpoints. The new hourly rollup counts each session once per page and stage; the temporary dedupe record and live session expire after 48 hours. Stages can overlap and are not a funnel across different pages. Existing paid landing engagement and intake steps remain in the paid section.
3. Saved cases and signed Stripe purchase/refund totals are separate operational facts. The portal never divides them by all-source requests or assigns them to a source without a verified attribution link.

Reports refresh every minute while visible, with manual refresh and a separate 15-second Live View. The first all-source request and consented activity buckets begin **after deployment**. Historical all-source data cannot be reconstructed from the paid-only counters. The paid pre-consent counter may include `fbclid`-only shares; the new all-source channel classification treats a bare `fbclid` as inconclusive and uses its referrer unless a paid medium or reviewed campaign is present.

## Release order

1. Apply `supabase/migrations/20260921190000_all_source_traffic.sql`. It creates private aggregate counters, restricted writer/report RPCs and the consented activity rollup; it updates the Live View source allowlist and its retention job.
2. Deploy the `paid-funnel-report` Supabase Edge Function. Its staff authorization and previous report fields remain; it now includes `traffic` and needs the migration first.
3. Deploy the Cloudflare Pages build with the new request reducer, Live View source classification and admin page. The service-role key is already used by the paid pre-consent aggregate writer. `TRAFFIC_MEASUREMENT_ENABLED=false` disables only the new request counter.
4. In production, open `/admin/acquisition` as staff and check that the current hour grows on an ordinary public document request, the source/page rows agree with the known request, the consented checkpoint appears only after acceptance, and private/DNT/GPC requests do not write. Compare purchase totals with the existing paid report.

## Validation

- `node scripts/test-all-source-traffic.mjs`
- `node scripts/test-all-source-traffic-database.mjs` (local PostgreSQL 17)
- `node scripts/test-live-view.mjs`
- `node scripts/test-preconsent-measurement.mjs`
- `node scripts/test-paid-funnel-report.mjs`
- `vite build`

The first-party counter stores the bounded public path, fixed source/campaign/device categories and hourly count. It stores no full URL, query, referrer, click ID, IP, user agent, form contents or persistent session ID. The consented dedupe table is private and its session IDs are removed with Live View retention; the historical activity report contains counts only.
