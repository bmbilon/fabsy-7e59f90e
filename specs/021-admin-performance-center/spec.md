# Admin performance center

## Principles
Build within Fabsy's authenticated React/Supabase admin. Every number must have a defined source and scope; missing history is not zero. Preserve staff controls, private ledgers, customer data, and the user's preference for concise labels without promotional copy. Report dates in America/Edmonton.

## Requirements and clarified defaults
- Default performance to All time, beginning with the earliest retained business record. Support today, 7/30/90/365 days, year to date, last year, and inclusive custom dates.
- Compare previous periods or previous years, with matched elapsed time for today's partial day. All time has no artificial previous baseline.
- Provide daily/weekly/monthly aggregation, current/comparison charts, exact data tables, CSV exports, revenue by service, cash reconciliation, funnel and source diagnostics.
- Add persistent desktop navigation, mobile navigation, keyboard command search, refreshed visual hierarchy, and direct access to existing operational tools.
- Keep the case board and all existing queue/status workflows. Do not introduce outbound messaging or automated case mutations.

## Plan and tasks
1. Add a staff-only aggregate RPC with unrestricted historical date selection and bounded chart buckets. Keep existing RPCs backwards compatible.
2. Separate period reporting from the fixed current-day operational counters. Cache by user and filter, cancel obsolete requests, retain explicit errors, and poll only in the foreground.
3. Implement range/comparison controls, reports, export, navigation and keyboard actions using existing components.
4. Verify real PostgreSQL aggregation, role restrictions, historical ranges, timezone boundaries, comparison alignment, refund semantics, source deduplication and exports. Inspect representative desktop/mobile flows in the isolated synthetic preview.
5. Release the targeted migration before the frontend, using the existing backend-first deployment gate.

## Coverage analysis
Saved nondeleted cases currently begin February 27, 2026 (Edmonton). The signed ticket-payment ledger begins September 5, 2026; retained measured traffic also begins September 5. These are first recorded observations, not proof of earlier zero activity. Show per-source coverage, leave chart metrics before their first observation blank, and never estimate historical payments from today's service price. Traffic retains its existing 400-day raw-event policy; the All time selector covers all available recorded data, not deleted or never-collected events. Financials cover CAD ticket purchases in the existing ledger, not insurance-only orders or all Stripe products.

Revenue is before tax and refunds; gross cash includes tax; refunds are successful refunds observed in the selected period. Net cash = gross cash minus those refunds, not profit or purchase-cohort retention. Average order value = service revenue / verified orders. Source attribution uses each session's first landing in the selected range; funnel stages remain independent distinct sessions, not an ordered conversion cohort. Period distinct sessions are not sums of bucket distinct sessions.

Design references: Shopify's official analytics dashboard guidance (date ranges, comparisons, direct report access) and admin search guidance informed interaction patterns; this remains Fabsy's own app and backend.

## Verification
+- Isolated PostgreSQL 17: passed existing dashboard, case-status and lapsed-case suites plus the new historical reporting suite. Tests cover 2021-to-present history, custom dates, DST, leap-year comparison lengths, range totals, money/refunds, source deduplication, permissions, and operational-counter parity.
+- TypeScript and changed-file ESLint passed. Report calculation/coverage/CSV tests passed; existing case-board and staff-status tests passed.
+- Production Vite build passed. Overview and workspace are now separate lazy chunks; reporting does not load in the public entry. Existing bundle-size/Sass warnings remain.
+- Browser: desktop and 390px mobile; no horizontal page overflow; rendered area/comparison/bar charts; all-time, rolling year and Jan–Dec 2025 custom range; twelve monthly table/chart entries; mobile navigation; keyboard command search and exact case destination; empty/error states; case-manager navigation restrictions. Synthetic fixtures stay in the loopback preview and are not production data.
+- Found and corrected partial historical comparisons that would otherwise report spurious growth. Full growth deltas require recorded coverage for both complete calendar windows.
