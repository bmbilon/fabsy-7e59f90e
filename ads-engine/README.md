# Fabsy ads launch engine

## Current status

Public frontend, Google conversion setup, cloud backend and phone controls are deployed. Two Search specifications contain 24 phrase keywords each and remain paused. The public release corrects camera refunds and uses granted Google defaults with a footer opt-out. Hashed contact delivery remains disabled pending the Google account customer-data setup.

Read ASSUMPTIONS.md for evidence and remaining holds. Live account sync passes the primary conversion check. Google has not yet verified a real upload/payment recording. The launch needs those receipts, the account learning-spend limit and the frozen approval. A local test is not a Google diagnostic receipt.

## Setup

1. Install existing repository dependencies and Deno 2. No new provider or orchestration service.
2. Configure the server environment values listed in .env.example. Google Ads OAuth requires the adwords scope, client ID/secret, refresh token and actual client account ID. Apply for production API access through the owning Google Cloud project's Google Ads API overview. Google sunset developer tokens on September 9, 2026; the adapter does not send one. A manager login ID is optional. The Lovable gateway already used by this repository supplies the public-copy AI check through LOVABLE_API_KEY. No ticket data is passed to it.
3. Apply the three named ads migrations dated 20260927160000, 20260927183000 and 20260927184500 and deploy ads-engine, ads-measurement, portal-agent, create-payment, get-checkout-session and idr-payment-webhook together. Existing workers continue their own behavior. Do not deploy a payment hook that references undeployed tables. Existing Vault idr_project_url and idr_cron_secret schedule the monitor every 15 minutes and invoke the morning report hourly; it chooses 08:05 Edmonton including DST. Inspect cron.job after migration; scheduling is skipped if those prerequisites are absent.
4. Build the existing frontend and portal-agent phone bundle. Keep VITE_GOOGLE_MEASUREMENT_ENABLED=false until privacy/tag QA. Add VITE_GADS_QUALIFIED_UPLOAD_LABEL, the separate officer/camera purchase labels and the account Ads ID. Visitors must also opt in to Privacy choices. Google automatic user-data collection must be off in the account; only explicit hashed email/phone values are allowed.
5. Read the real account graph with `node ads-engine/cli.mjs sync --live-read`. Set googleCustomerId, actual conversion-action resource names, verified Alberta geoTargetConstant and any existing campaign IDs in config.json. Existing same-name or same-destination Search campaigns are detected. Ambiguous or incompatible historical campaigns hold for review instead of duplicating them. Shared budgets, unknown ad groups, keywords, targeting and differing creative require review before reuse.
6. Qualified Ticket Upload must be the only enabled primary website action in its category. Client Paid website actions are secondary. Google campaign goals are overridden to qualify uploads only. Purchase remains observed from day one. New campaigns inherit goals until the post-create paused sync configures them. Launch refuses unverified goals or Google-disapproved ads.

## Dry run and one launch approval

`npm run ads:sync` writes launch-dry-run.json and cannot spend. Specs use the JSON subset of YAML so no YAML parser dependency is needed. Commands are dry-run by default.

Propose actual limits without authorizing a spend:

```
node ads-engine/cli.mjs stage --learning-limit 2100 --start YYYY-MM-DD
```

The number above is an example proposal. Set the actual learning limit and date for Brett's review. Default daily proposals are $50 officer and $20 camera; actual positive budgets are frozen for approval from config.json. The single frozen batch includes copy, destinations, geographic targeting, goals, bidding, budgets, limit, duration, safety stops and mutation preview. Server-generated regex and AI checks must pass. No approval is inferred from a CLI call, maintenance credential or notification open.

In https://fabsy.ca/admin/portal, record actual upload/payment/Google diagnostic evidence and verify the corrected destinations. The server checks live destination content and stores text hashes. Then an authenticated administrator taps Approve this launch batch. Server credentials cannot call the SQL approval function. Notification delivery uses the existing staff push outbox and subscriptions.

After approval:

```
node ads-engine/cli.mjs apply <batch_id>
node ads-engine/cli.mjs apply <batch_id> --execute
node ads-engine/cli.mjs apply <batch_id> --execute
node ads-engine/cli.mjs launch <batch_id>
node ads-engine/cli.mjs launch <batch_id> --execute
```

The second apply is an idempotent paused goal/graph sync after creation. One approval covers the deterministic initial specs and launch. Each execution re-reads the account and checks the exact approved scope. No new offer, creative, destination or budget is inferred. An incompatible graph stays held. Google validateOnly runs before a single commit; ambiguous outcomes stay uncertain with no automatic retry.

Google assets include the $198 and $79 services. Google price assets require three offerings, so the verified existing $229 Resolution + Insurance Planning bundle is explicitly shown as the third offering in the frozen mutation preview and brief. This does not create a third campaign.

## Measurement

- Marketing attribution is an allowlist: UTMs, Google click IDs, Meta identifiers, known public landing path and variant ID, with invalid and private values rejected. Google collection defaults to granted on public pages and respects the footer opt-out and retained refusals. The saved intake links it internally through checkout and the signed Stripe webhook; it is not keyed by a person's name or email.
- ticket_uploaded is recorded from an actual completed draft upload or saved intake. qualified_ticket_upload additionally requires existing ready-scan or administrator readability evidence and verified contact ownership. Existing Auth or a redeemed signed email resume capability can prove ownership; no additional verification screen is added. An entered email is never called verified. Signed-in confirmed contact must match the saved intake. Phone-only ownership needs administrator evidence via the authenticated `ads-qualify` action; it remains held without it.
- Browser events use the scoped Google dispatcher, deduplicated stable transaction IDs and explicit labels. Google gets no ticket, licence, case narrative or arbitrary metadata. Enhanced conversion hashes respect Google opt-out and are scoped to the actual checkout ID on purchase. Set VITE_GADS_ENHANCED_CONVERSIONS_ENABLED=true only after Google Customer Data Terms and manual Google tag setup are saved. No automatic user-data collection.
- New bundle payments use the existing public thank-you receipt, followed by a link into the existing protected report intake. This keeps bearer/order URLs outside Google collection. Already-created checkout URLs retain their former return behavior and can be unattributed.
- Client Paid uses actual server-confirmed subtotal, discount, tax, quantity and line items. Tax remains separate. Existing live-receipt safeguards remain in place. Test Stripe payments stay internal and are excluded from live performance. Missing browser return, unavailable tags, denied consent or unmatched attribution remains a limitation, not a fabricated conversion.
- Refunds stay in the existing financial records. Outcomes never become refund events or ad-platform adjustments. No offline imports or historical backfill.

## Pause, safety and reconciliation

The existing mobile page has Pause paid campaigns. CLI pause is dry-run until `--execute`. Pause immediately freezes discretionary launches and checks live delivery. If an action is in flight, the next independent monitor enforces the saved owner pause after the lease clears.

Safety pauses apply at inclusive 150% of the approved daily campaign budget, the approved account learning-spend limit, or the end of 30 days. They are logged through platform/actions. Google may deliver above a daily average budget, and provider reports lag. The 15-minute monitor is a delayed check, never a real-time or exact spend cap. Account-level learning spend includes other account campaigns. No budget is reallocated automatically.

`node ads-engine/cli.mjs revert <action_id> --batch <approved_batch_id>` stages the saved rollback for mobile review. Execute the approved rollback through `ads-revert`. New campaigns are paused and added child resources removed; prior mutable fields are restored. Original resources and logs are retained. A changed live graph holds the rollback instead of overwriting later work.

Interrupted writes are uncertain. An administrator can call `ads-reconcile` with the action ID and freshly read liveHash. The server accepts only a provable before state, exact synced state or status-only result. It records reconciliation and never retries the original write. Review partial or unprovable changes manually. Recheck live data clears a stale-data freeze only after fresh access succeeds and all uncertain actions are resolved; it does not resume paused delivery.

## Reports and learning

`node ads-engine/cli.mjs report --local` verifies an empty dataset without any external access. `report` retrieves the cloud report. `memo` exports the latest observed memo to learnings/YYYY-WW.md. The Monday morning worker also saves the completed week to the private ads-engine Storage bucket at that same path. Daily reports store spend, clicks, impressions, uploads, qualified uploads, checkout starts, live paid clients, actual net revenue, tax and costs where available. Unknown spend is null, unattributed orders stay separate and no paid conversions are labeled honestly.

The report checks obvious irrelevant terms, landing HTTP failures and disapprovals. It proposes one next action. After roughly 15 live paid clients in 30 days, it proposes switching primary to Client Paid. After seven observed camera days under 100 impressions/day on average, it proposes the camera fold as insufficient delivery. These changes need owner approval; budgets stay fixed. Tag diagnostics require operator evidence because API account reporting alone cannot prove browser tag delivery.

## Creative and tests

`npm run ads:creative` renders three static concepts through one HTML/CSS template at 1080x1080, 1080x1350 and 1080x1920. Exports include exact text and source/image hashes in creative/manifest.json, with Story safe margins. All exports remain unapproved. Meta has no allocated budget; no Meta API write, pixel or CAPI is enabled. A future activation must verify the account API, explicitly disable Advantage+ text/visual enhancements and pair pixel/CAPI event IDs before spending.

`npm run ads:test` runs focused approval, dry-run, idempotency, actual-revenue, safe-field, account-diff and spend tests, existing receipt/privacy tests, and an isolated temporary PostgreSQL migration/RLS test. `npm --prefix portal-agent run check` checks the existing phone and cloud source. Frontend `tsc` and Vite verify integration. Tests never create real cases, send mail, make purchases or spend.

## Deferred

AI Max, target CPA/ROAS and value bidding, LTV/cohorts, offline imports/backfills/outcome adjustments, term classifiers, autonomous budget shifts, creative matrices and promotion rules, retargeting, Meta activation/value optimization, significance tests, custom dashboards and video.

## API references checked

Google Ads REST v23 is explicitly used rather than assuming a package SDK. Live validateOnly remains an access-dependent launch check. References: [version support](https://developers.google.com/google-ads/api/docs/sunset-dates), [Search campaign creation](https://developers.google.com/google-ads/api/docs/campaigns/create-campaigns), [responsive Search ads](https://developers.google.com/google-ads/api/docs/responsive-search-ads/create-responsive-search-ads), [campaign conversion goals](https://developers.google.com/google-ads/api/docs/conversions/goals/campaign-goals), [asset automation controls](https://developers.google.com/google-ads/api/docs/assets/asset-automation-settings), and [consent mode](https://developers.google.com/tag-platform/security/guides/consent). Account-level dynamic-image controls require Google UI verification.
