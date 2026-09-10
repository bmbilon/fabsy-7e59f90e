# Admin Live View

Created: 2026-09-09. Reference: Brett's Shopify Live View screenshot.

## Feature principles / constitution

Use existing React, Tailwind, Cloudflare Pages, Supabase and admin authentication. Real collected data only; unavailable data is not zero. Keep visitor analytics separate from client identities, ticket contents and payment secrets. Preserve unrelated workspace changes. The private admin page is noindex; public SEO/schema requirements do not apply.

## Specification and clarification

- Add a Live View tile and `/admin/live` page for administrators.
- Present a globe with approximate visitor locations, current visitors, today's sessions, submitted cases and paid cases, a 30-minute session chart, current stages, pages, sources and devices.
- Clarification review: “who” means anonymous browser sessions, not identified clients. Location is Cloudflare's coarse IP-derived location, never GPS. No client names, IP addresses, form values, query strings, hashes, private routes or raw referrers enter the visitor table.
- A browser session expires after 30 minutes without a visible-page heartbeat. Tabs share a browser session ID; refreshes do not create another session. “Right now” means seen in the past 90 seconds. A visible page sends at most one heartbeat per 30 seconds plus navigation/stage changes. Admin refresh is every 15 seconds while visible.
- Today's session count is sessions started since midnight America/Edmonton. Submission and paid-case totals use existing server records and are independent of anonymous sessions. Paid cases count each ticket once, not revenue or all product orders.
- Intake and review stages describe on-site pages/steps, not a Stripe checkout or confirmed purchase. No inferred purchases or invented revenue.
- Require the existing first-party measurement opt-in; stop and clear the local session on withdrawal. Respect DNT/GPC, exclude obvious bots, and do not collect on localhost or previews. Store visitor rows for 48 hours, with scheduled cleanup. Temporary salted network hashes for rate limits expire after two hours.
- New pages include loading, empty, disconnected/stale and denied states, responsive layout, reduced motion support and keyboard-accessible map controls.

## Technical plan

1. Pure shared route/source/stage validation plus a best-effort browser heartbeat tracker.
2. Cloudflare same-origin endpoint enriches metadata, validates payloads and forwards ingestion with a server-only Supabase service key. GET passes the user's token to an admin-only RPC. No external geolocation service.
3. Additive migration: private sessions/rate limits, atomic throttled ingestion, bounded aggregate snapshot and scheduled retention. Explicit grants and role checks; no visitor-level public reads.
4. Lazy admin page and lightweight SVG globe, generated from public-domain Natural Earth land geometry, with only actual visitors plotted.
5. Unit, endpoint and isolated Postgres security/aggregation tests; TypeScript, focused lint, Vite build and desktop/mobile browser verification.
6. Rollout requires applying this migration and configuring Cloudflare's server-only Supabase credentials before publishing frontend assets. No unrelated migrations or workspace changes are included.

## Tasks and consistency analysis

- [x] Collector, validation, session lifecycle and privacy exclusions.
- [x] Database ingestion, snapshot, retention, permissions and meaningful tests.
- [x] Admin route, navigation, globe, metrics, filtering and connection states.
- [x] Browser, build and security verification; deployment instructions and evidence.

Result: implemented and verified locally. Brett authorized activation. The production migration and runtime credentials are configured; frontend release and live verification follow the existing backend-first deployment gate. The isolated production-based release passes the full build, including contrast checks. See `reports/admin-live-view/README.md` for evidence.

Coverage review before implementation: every requirement maps to the tasks above. Existing Supabase is already provisioned; Vercel Marketplace discovery was reviewed but production runs on Cloudflare, so no new integration or provider migration is required. A public analytics endpoint is best-effort telemetry, not an audited source of people counts. Browser blocking, DNT/GPC, idle-tab expiry, mobile IP routing and bots can affect counts and locations.
