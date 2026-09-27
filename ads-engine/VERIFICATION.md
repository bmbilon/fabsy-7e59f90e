# Release verification

September 27, 2026. Real upload/payment recording and ad delivery are not claimed.

## Passed

- Full `npm run build`: current intake, checkout branding, Google/Meta privacy, i18n, SEO, content contracts, snapshots and production bundle. 1122 English content snapshots and 56 localized snapshots passed.
- `npm run ads:test`: 21 engine/account tests plus all three migrations, temporary PostgreSQL RLS, authenticated approval identity, leases and deduplication checks.
- Measurement endpoint tests reject invalid private capabilities, caller-invented verification and stale contact/document proof; accept only current stored evidence.
- Frontend TypeScript and deployed Supabase graphs through Deno. Existing phone/cloud runner checks and deploy passed.
- Browser network suite: 13 scenarios passed with inert provider fixtures, including granted defaults, persisted opt-out, cross-tab retirement, held-loader/private navigation and receipt-token isolation. Google contact delivery was not simulated as a real conversion.
- Mobile 390x844: camera nonrefund copy, footer opt-out persistence, no horizontal overflow, camera upload selection and untagged private form. No runtime errors. Synthetic, with external requests blocked; no file submitted or purchase made.
- Production Google account read, Alberta Province geo, conversion resource names/labels and primary/secondary states verified. Live sync has no primary-conversion hold.
- Nonspending conversion setup applied through the single platform mutation gate with authenticated admin approval, source hash, idempotency and before/after/rollback evidence.
- Named migrations and backend measurement, real payment webhook and receipt hooks are deployed. Modern worker dependencies were taken from downloaded production sources before adding ads hooks, preserving existing fulfillment and messaging behavior.
- Cloud daily report works with zero live purchases and recommends completing diagnostics/approval.

## Public production release

- Cloudflare Pages production deployment: https://072f03b5.fabsy-9qa.pages.dev, serving https://fabsy.ca. Frontend release commit 6c5a565c2911125caf1b820457d05bd861d3bef6. The previous release was 3c4020c; its application source matches the selected main base, whose later commit only refreshes crawler snapshots.
- Live browser verified the $79 plus GST camera offer, explicit nonrefundable fees, the footer opt-out and the loaded G-YRP61S5TPF Google tag. No runtime errors.
- Existing public WhatsApp and other provider build settings were preserved. Google enhanced hash delivery is disabled pending the account terms/setup.

## Outstanding owner input

- Google Customer Data Terms and manual enhanced-conversion setup. SHA256 contact delivery is disabled until account setup is saved; automatic collection and customer lists remain off.
- Authorized real ticket test and user-completed live payment. A Stripe test transaction cannot establish production Google recording. Retain exact internal events and Google diagnostics, including deduplication evidence.
- Frozen pending launch 246b7561-98ef-4f38-807a-1287f89f8148 proposes $50/$20 per day, $2100 account learning limit and September 27 start. Adjust the date to the actual approved start if later. Diagnostic hold remains. No new campaign spend or unpause has occurred.

Existing Search retirement is part of that frozen batch. Meta activation and all deferred optimizer work remain out of scope.
