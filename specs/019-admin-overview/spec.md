# Admin overview

## Principles and requirements

Build on Fabsy's existing React/Tailwind admin UI and staff permissions. The home screen is an operational overview, with clickable queues and reports; secondary destinations remain accessible as compact links. Never equate an uploaded ticket with a submitted or paid case. Missing data must not appear as zero.

## Clarified defaults

Use the existing admin dashboard as the visual/code target. Include partial intakes (including contact-only leads), submitted cases, active work and completed cases. Weekly means the last seven Edmonton calendar days including today; monthly means the last thirty. Compare the preceding period through the same local time. Historical traffic and funnel counts cover consented Rapid Resolution / Photo Radar landing sessions, with tagged QA traffic excluded. Service revenue uses the existing signed Stripe ticket-purchase ledger, before tax and refunds; refunds are shown separately. Live traffic remains admin-only. No outbound messages or customer mutations are part of the overview.

## Plan

1. Add two staff-authorized, bounded read-only SQL functions: aggregate performance and a searchable/paginated work queue. Keep financial identifiers and full intake payloads server-side.
2. Replace the tile wall with today's activity, queue filters, live traffic, weekly/monthly KPIs, an interactive daily chart and measured funnel. All report counts use explicit definitions.
3. Link to existing case, partial-intake, live and acquisition views; preserve secondary tools as small buttons. Add partial-intake deep links and acquisition period selection.
4. Verify database authorization, duplicate handling, timezone windows, money, zero-filled trends and pagination, then TypeScript/lint/build and desktop/mobile browser interactions.

## Coverage analysis

Uploads use confirmed draft uploads and verified stored submission files, deduplicated by file (including assessment-to-representation upgrades). The header and upload drilldown share one query definition. Partial drafts disappear from the partial queue once converted, without double-counting an unpaid submission. Completed work and deleted/dismissed/expired intakes do not appear as attention items. Nondeleted dismissed/expired uploads remain in that day's history and are explicitly labelled. Current counts and period totals are separate. No historical site-wide traffic is inferred from the 48-hour live table. The existing detailed acquisition report retains rolling 24-hour windows and explicitly explains its boundary difference from the overview.

## Release

The second top tile is "Clients paid today". It counts nondeleted ticket clients with confirmed representation or assessment payment timestamps during the Edmonton calendar day, regardless of submission date. Clients are deduplicated by trimmed, case-insensitive email; records without an email remain distinct. Its click-through uses the same paid-client query and shows each client's latest matching paid case. Submission counts remain available in Performance and All submissions.

Copy revision requested September 20: no visible overview hero, taglines, instructional subtitles, or explanatory body paragraphs. The operational section is titled "Case management"; supporting sections use "Live traffic", "Performance", "Funnel" and "Traffic sources". Preserve compact metric labels, units, date ranges, controls and necessary status/error messages. Keep detailed source definitions in this implementation specification rather than dashboard prose.

Apply migration `20260920100000_admin_dashboard_overview.sql` before deploying the UI. Existing data and functions remain intact. The overview reports unavailability until the migration exists. Preview fixtures are synthetic and served only by a loopback development harness, never the production app.

## Verification and handoff

- `node scripts/test-admin-dashboard-database.mjs`: passed against an isolated PostgreSQL 17 cluster. Covers anonymous/customer denial, staff access without ledger access, the three-upload/one-submission incident, draft conversion deduplication, shared files, inactive history, money/refunds, QA exclusions, Edmonton boundaries, 7/30 daily rows, date/search filters and stable pagination.
- TypeScript: passed with `tsc -p tsconfig.app.json --noEmit --lib ES2021,DOM,DOM.Iterable`. The repository's unmodified ES2020 configuration reports four existing `replaceAll` errors in unrelated files; no dashboard errors.
- New dashboard TypeScript/TSX files: ESLint passed without warnings. Existing case management retains two pre-existing effect-dependency warnings.
- Vite production-mode build: passed with existing Sass and bundle-size warnings. Preview fixtures are not imported by the production entry.
- Browser: inspected desktop (1280px) and mobile (390px), rendered charts and funnel, monthly 30-row daily table, metric selection, upload drilldown (three rows), pagination (8+1), search reset, no results, partial-intake destination, empty state, failed loads/retries and case-manager live restriction. Corrected overlapping mobile funnel numbers and re-inspected.
- Existing case/detail destination screens were verified by route/code inspection; navigation in the isolated preview shows the resolved destination without accessing real customer data.

Sources: operational rows come from `public.ticket_submissions`, `public.ticket_intake_drafts` and confirmed `storage.objects` metadata. Historical visits/funnel come from `analytics_private.paid_funnel_events` with the existing verification filter. Revenue/refunds come from `analytics_private.paid_payment_purchases` and `analytics_private.paid_payment_refunds`. Current traffic uses the existing admin-only `admin_live_view` RPC. The operational day filter follows each refreshed overview; explicit period drilldowns preserve their clicked snapshot.

Start the local example with `node scripts/preview-admin-overview.mjs` and open `http://127.0.0.1:4193/admin/dashboard`. This preview is not a production-data report. The app and migration are prepared on `codex/admin-overview-20260919`; no production migration, deployment or customer writes have been performed.
