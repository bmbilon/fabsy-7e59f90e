# Admin Live View — implementation and verification

Live View was activated on September 9, 2026, with production migration, runtime credentials and live visitor checks completed. The Alberta map revision replaces the globe/world controls at Brett’s request. Release work uses an isolated branch from current production main; unrelated shared-workspace edits are excluded.

The new admin tile opens `/admin/live`. The page displays anonymous active sessions, approximate locations, current public pages, referral categories, devices and intake stages, plus today's saved submissions and cases with confirmed payments. It includes an Alberta map, session activity chart, pause/resume, manual refresh, visitor search, clear connection errors and a mobile card layout.

## Preview

Both images are labelled **SIMULATED VISITORS**. The numbers are isolated browser-test fixtures, not measured Fabsy traffic. The production application contains no fixture fallback or authentication bypass.

- [Desktop preview](fixture-desktop.png)
- [Phone preview](fixture-mobile.png)
- [Browser verification results](browser-checks.json)

## Verified

- 12 automated unit/integration tests covering public route exclusions, session continuity and expiry, first-source attribution, opt-in consent, withdrawal, privacy signals, hidden-tab tracking, cleanup, server-side metadata enrichment, request validation, anonymous/unauthorized access, upstream failure and rate-limit handling.
- Isolated temporary PostgreSQL tests for real migration execution, grants/RLS, admin-role enforcement, duplicate tabs, 90-second expiry, Edmonton date boundaries, payment deduplication, 30 chart buckets, bounded visitor results with uncapped totals, rate limiting and retention scheduling.
- Desktop (1440 px) and phone (390 px) browser checks: no page overflow, filtering, Alberta markers and outside/unknown location handling, 15-second polling, pause/resume, connection loss, no visitors, denied access, no public mobile call bar and no runtime errors.
- TypeScript application check and focused ESLint passed.
- Cloudflare Pages Functions compiled successfully with Wrangler.
- Full `npm run build` passed, including contrast, i18n, snapshot generation and postbuild checks. Existing large-bundle and Sass deprecation warnings remain.
- Production database checks confirm anonymous ingestion/reads and direct authenticated reads are denied. Migration history records `20260909180000`, and the hourly retention job is active. See [backend checks](backend-checks.json).
- Privacy-policy source fingerprints were refreshed for the additional English disclosure. Existing owner-authorized machine-translation publication status, human-review status, and translation strings were preserved.

## Deployment procedure

1. Build from current production main. The earlier contrast failure was confined to unpublished workspace changes; the isolated release passes that guard.
2. Apply **only** `supabase/migrations/20260909180000_admin_live_view.sql` to the existing Supabase project. Do not push all pending migrations from this shared working directory. It adds private visitor tables, a service-only ingestion RPC, an admin-only snapshot RPC and the hourly `live-view-retention` cron job. The existing project must have `pg_cron` enabled, as used by its other workers.
3. In the Cloudflare Pages **production runtime** environment for `fabsy`, set `SUPABASE_SERVICE_ROLE_KEY` as a secret. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the same project as the frontend. Defaults for the public URL/key point to Fabsy's current project. These are runtime bindings, not just GitHub build variables. Never put the service key in any `VITE_` variable, source file, screenshot or client bundle.
4. Publish the reviewed frontend and `functions/api/live-view.ts` together using the existing Cloudflare Pages pipeline. `VITE_LIVE_VIEW_ENABLED=false` can disable collection at build time; otherwise collection is enabled only on production `fabsy.ca`/`www.fabsy.ca`, after hydration and acceptance of Fabsy first-party measurement, with DNT/GPC and bot exclusions.
5. Verify the production endpoint: no bearer token → 401; a regular client token → 403; an admin token → an aggregate snapshot. Accept Fabsy first-party measurement on a public page in a separate browser without DNT/GPC and confirm one visitor, then another tab and confirm it remains one session. Move to intake and review, close/hide the public tabs, and confirm expiry after 90 seconds plus one 15-second dashboard refresh.
6. Confirm `live-view-retention` in `cron.job` and its first successful execution in `cron.job_run_details`. Verify the browser bundle contains no service key. Record a production deployment receipt separately; the local browser results do not establish production operation.

## Definitions and limits

- Collection requires the existing Fabsy first-party measurement opt-in. Declining or withdrawing stops collection and clears the local session ID; existing live presence expires within 90 seconds. Consent expiry is checked before each heartbeat. Google/Meta consent alone does not enable Live View.
- A visitor is a random browser session shared by tabs; it renews after 30 minutes without a visible heartbeat. A visible tab sends every 30 seconds plus navigation/stage changes. Admin screens poll every 15 seconds while visible. No continuous pointer, typing, screen or session recording is performed.
- “Right now” means seen within 90 seconds. This is approximate telemetry: mobile routing, blocked tracking, privacy preferences, multiple devices and bots can affect counts.
- “Sessions today” counts session starts since midnight America/Edmonton. The initial collection date is shown; there is no historical visitor backfill.
- “Submissions today” counts saved `ticket_submissions` created today. “Paid cases today” counts each ticket once when `representation_paid_at` or `assessment_paid_at` is today. It does not claim revenue, net sales, distinct buyers, refund status, standalone insurance-product orders or attribution to a visitor.
- Intake stages are coarse on-site activity, not observation of Stripe checkout. Private portal, manual representation links and receipt pages are excluded.
- Locations come from Cloudflare request metadata, rounded to 0.1 degrees; missing locations stay unknown. The map shows Alberta only, with static city labels and purple live-visitor markers. Visitors outside Alberta and those without coordinates remain in the list and overall counts. Province geometry comes from [Natural Earth admin-1 boundaries](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_1_states_provinces.geojson), available in the [public domain](https://www.naturalearthdata.com/about/terms-of-use/). No third-party map/geolocation calls run in visitors' browsers.
- Snapshot detail is capped at the 200 most recently active visitors and 200 grouped locations; total counters and top-page/source aggregations include all active sessions.
- The endpoint limits each daily-salted network hash to 180 requests/minute. Session updates are throttled to 10 seconds unless the page/stage changes. This is abuse reduction, not proof that every session is a person.
- Visitor rows expire after 48 hours of inactivity, and temporary network hashes after two hours, on the next hourly cleanup. The visitor table has no IPs, raw URLs/referrers, query strings, client identity, documents or form answers. Standard hosting-provider request logs are separate from these application tables.

## Reproduce local checks

```sh
node --test scripts/test-live-view.mjs
node scripts/test-live-view-database.mjs
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/lib/live-view/core.ts src/components/LiveVisitorTracker.tsx src/components/live-view/VisitorAlbertaMap.tsx src/pages/AdminLiveView.tsx functions/api/live-view.ts
npx wrangler pages functions build functions --outfile /tmp/fabsy-live-view-worker.js
npx vite build --outDir /tmp/fabsy-live-view-build
```

For browser verification, start Vite on `127.0.0.1:4187` and run `node scripts/verify-live-view-browser.mjs`. It uses an isolated browser context and intercepts all Supabase and Live View requests. Use the installed Chrome channel on macOS or install Playwright Chromium elsewhere. The database runner uses a fresh temporary Postgres cluster; override `LIVE_VIEW_TEST_PG_BIN` for another installation. Neither test runner targets production.
