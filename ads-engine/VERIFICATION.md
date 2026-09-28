# Release verification

September 27, 2026. The officer pilot is enabled. Google policy review and actual conversion recording remain unverified; no live test transaction or diagnostic receipt is claimed.

## Passed

- Full `npm run build`: current intake, checkout branding, Google/Meta privacy, i18n, SEO, content contracts, snapshots and production bundle. 1122 English content snapshots and 56 localized snapshots passed.
- 25 engine/account tests passed. They cover approved scope, immutable payloads, paused creation, native total budgets, fixed serving dates, default Google device criteria, policy-review metadata, exact copy/pins, omitted false goal flags, disapprovals, rollback, deduplication and uncertain writes. The earlier isolated PostgreSQL checks passed for all three migrations, RLS, authenticated approval identity, leases and deduplication.
- Measurement endpoint tests reject invalid private capabilities, caller-invented verification and stale contact/document proof; accept only current stored evidence.
- Frontend TypeScript and deployed Supabase graphs through Deno. Existing phone/cloud runner checks, build and deployment passed.
- Browser network suite: 13 scenarios passed with inert provider fixtures, including granted defaults, persisted opt-out, cross-tab retirement, held-loader/private navigation and receipt-token isolation. Google contact delivery was not simulated as a real conversion.
- Mobile 390x844: camera nonrefund copy, footer opt-out persistence, no horizontal overflow, camera upload selection and untagged private form. No runtime errors. Synthetic, with external requests blocked; no file submitted or purchase made.
- Production Google account read, Alberta Province geo, conversion resource names/labels and primary/secondary states verified. The qualified primary-resource hold is cleared.
- Named migrations and backend measurement, real payment webhook and receipt hooks are deployed. Worker dependencies were taken from downloaded production sources before adding ads hooks, preserving existing fulfillment and messaging behavior.

## Public production release

- Cloudflare Pages deployment: https://37781a5b.fabsy-9qa.pages.dev, serving https://fabsy.ca. Frontend release commit `9be969d678f36e1fb05b34943cc9021c3d87385a`; public officer destination returned HTTP 200 and the matching `index-k4k7JaLh.js` bundle.
- Public camera copy explicitly states nonrefundable service fees. Google defaults are granted, with a footer opt-out and prior refusals retained. Private documents and bearer URLs are excluded.
- Brett authorized acceptance of Google's displayed Customer Data Terms; they are saved. Enhanced conversions uses Google Tag with automatic detection and CSS/JavaScript selectors off. Local and GitHub frontend flags enable code-supplied SHA256 email/phone hashes only.
- Existing public provider settings are preserved. The existing phone worker was deployed with `--keep-vars`; version `563a451a-5a71-4e86-9496-7f2bb862b729`.

## Pilot launch and live readback

- The superseded C$2100 batch `246b7561-98ef-4f38-807a-1287f89f8148` is rejected. Both old Search campaigns, `24214394599` and `24266674718`, are PAUSED; stop action `7a950772-6c0c-4157-b9b0-c8bbc892c4fe` is applied.
- Authenticated approval for officer-only batch `13b9e5c2-d665-428a-95fd-90aa555ce9ca` is retained, with exact copy, destination hashes, C$150 total budget, 14 calendar days and truthful owner readiness evidence.
- Paused creation action `eb68bdfd-52c6-4bdf-9c70-f5da2faf9349`, goal sync `0d3d01bd-de95-4e16-ae9d-33ecf0f3b16b` and launch `d586da7c-50a7-4a53-bdc1-94199cc2b80d` are applied through the single mutation gate. Each retains validation, idempotency, before/after and rollback evidence.
- Live API confirms G-Search-Officer `24294977663` ENABLED; budget `15906156135` has CUSTOM_PERIOD and totalAmountMicros `150000000`, with no daily amount. End is October 10, 2026 at 23:59:59 America/Edmonton. This uses Google's [native campaign total budget](https://developers.google.com/google-ads/api/docs/campaigns/budgets/create-budgets).
- Qualified Ticket Upload is the sole bidding goal. Officer Paid and Camera Paid remain secondary. Calls and purchases are not campaign bidding goals. Google Search only, Alberta presence, phrase keywords, AI Max off and text/final URL automation off remain verified.
- Camera campaign was not created. Cross-service price extensions are disabled; officer price remains in approved copy and destination.
- Both responsive Search ads are REVIEW_IN_PROGRESS with approval UNKNOWN. Enabling permits Google to begin serving after its review; no impressions, clicks or spend were observed for the pilot at readback.
- Deployed cloud monitor ran successfully with no safety stops, no freeze and no last error. The existing 15-minute monitor and morning report remain configured. Earlier legacy account spend of C$36.81 today counts toward the account learning cap and may stop this pilot before its full C$150 campaign budget is used. No budget increase or reallocation is automatic.
- Detailed launch receipt: `ads-engine/pilot-receipt.json`.

## Measurement evidence

Brett instructed "just do it, the checkout works fine" after the missing post-deployment upload/payment test was explained. The authenticated readiness record retains that waiver of an additional launch test. It does not claim Google recording. Qualified Ticket Upload last showed Awaiting conversions, and paid-action diagnostics last showed Misconfigured before the latest deployment and account setup. Recording must be observed from actual future events; no ticket, payment or diagnostic conversion was fabricated.

Meta activation and the deferred optimizer work remain out of scope.
