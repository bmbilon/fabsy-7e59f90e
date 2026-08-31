Candidate maintenance note — 31 August 2026. **Publication is not confirmed here.** Append the source commit, deployment URL, workflow results and verification receipts before recording a live release.

Public measurement destinations:

| Purpose | ID / destination |
| --- | --- |
| GA4 | `G-26G8CMWTKY` |
| Google Ads | `AW-18419256057` |
| Rapid Resolution purchase | `AW-18419256057/MyAbCPiLj-scEPmV_s5E` |
| Photo Radar purchase | `AW-18419256057/TEo-CJH0kescEPmV_s5E` |

Google tags require the production build gate, an exact production origin, a safe public page/referrer and explicit acceptance. Unknown or declined consent loads no Google tag; this follows [basic consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode). Only allowlisted public visits and verified receipt purchases are measured. Personalization, Google signals and enhanced conversions stay disabled. Campaigns, budgets and bidding are unchanged. Cloudflare and necessary service providers remain separate from this Google choice.

Ticket/contact/fleet forms, portals, admin and representation flows remain untagged. `MeasurementRouter` requires a fresh document when crossing the public/private boundary, before exposing private URLs or children. Its persistent `GoogleMeasurementGuardian` keeps consent, storage, visibility and expiry listeners alive even while navigation is held and route children are unmounted. Withdrawal retires a Google-touched document; late loader callbacks and purchase dispatches fail closed.

Choices expire after 180 days without refreshing `savedAt` on reads. Timers use bounded chunks and retire an expired foreground document. Failed storage writes allow an explicit choice only in the current document. Persisted acceptance requires a successful transient write/read/remove probe; throwing or silently failing storage cannot restore stale acceptance after withdrawal.

Receipt/session matching, paid status, product, currency, price, tax and discount checks remain mandatory. WebCrypto derives a stable 64-character SHA-256 hexadecimal transaction ID from the verified session. Google events and purchase deduplication keys use that hash, never the raw bearer. Hash failure sends nothing; destinations deduplicate independently after asynchronous checks. The identifier fits [Google Ads’ 64-character limit](https://support.google.com/google-ads/answer/6386790?hl=en).

Both `build.yml` and `prerender-refresh.yml` must use matching `vars.VITE_GOOGLE_MEASUREMENT_ENABLED` (literal `true` to enable), `secrets.VITE_GADS_ID`, the fixed GA4 ID above, and their respective `VITE_GADS_PURCHASE_LABEL` / `VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL` secrets. To roll back measurement, set the shared flag to `false`, then rebuild, validate and deploy through the guarded pipeline. Changing the variable alone does not change deployed Vite JavaScript; do not redeploy an older enabled artifact.

From the repository root, using an already-built candidate with measurement enabled:

```sh
npm run test:measurement
node scripts/test-measurement-navigation-browser.mjs
node scripts/test-google-measurement-network.mjs --offline --dist dist --pending-navigation-guardian --artifact-dir /tmp/fabsy-google-offline
```

With explicit permission for real Google requests, repeat the final command with `--live-google` and a fresh artifact directory. That harness serves unchanged candidate bytes at the production origin; backend/payment requests and purchase events remain blocked. Never relax origin or private-data gates to test.

Unit fixtures and inert browser tests establish application behavior. Real-request receipts establish observed request contents, not Google ingestion, attribution or an actual paid conversion. This note certifies none of those outcomes.
