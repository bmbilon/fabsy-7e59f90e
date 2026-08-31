# Coordinated Pro Driver and Photo Radar release

This release combines the seven-language Allstate insurer grid and homepage Pro Driver offer with the verified discount, the Photo Radar service, and their shared checkout dependencies. It was assembled in an isolated worktree based on main, without staging the shared working checkout.

## Public offer and language boundaries

- The 20% offer is for verified Alberta Class 1, 2 or 4 licence holders with an eligible officer-issued ticket. Rapid Resolution is $158.40 plus applicable GST; the bundle is $183.20 plus applicable GST. A declaration alone never changes the price.
- Photo radar and camera notices, Class 5 gig couriers and standalone insurance reports do not qualify for the Pro Driver discount. Other discounts do not stack.
- Photo Radar is $79 plus 5% GST ($82.95 total). It has a separate product, receipt validation and Stripe price.
- Punjabi, Tagalog, Simplified Chinese, Traditional Chinese, Arabic, Hindi and Spanish remain published for the existing Rapid Resolution/report flows. The localized homepage promotion links to the English Pro Driver program. New Photo Radar and Pro Driver purchase/authorization flows remain English-only; the server and database enforce that boundary.
- English terms control. Owner-authorized machine translations are disclosed; no native review or language-staffing attestation was added. The exact source publication fingerprint is `fnv1a-c22d9df5`.

## Coordinated backend rollout

The following four migrations were applied, in order, from a staging directory containing the exact 41 existing hosted migration records plus only these four tested files. No unrelated pending migrations, seeds, roles or vault changes were included:

1. `20260831115000_photo_radar_product.sql`
2. `20260831120000_pro_driver_discount.sql`
3. `20260831121000_referral_program.sql`
4. `20260831122000_resolution_referral_email.sql`

Hosted read-only verification found all four history additions and all 42 authored SQL function bodies matching the tested release. RLS, grants, licence identity binding, checkout locks, stored-locale guards and private licence storage were verified.

The 14 checkout/intake/consent/referral handlers and six existing content generators were deployed from the integrated source. `send-idr-case-update` retains gateway JWT verification; the other handlers retain their configured gateway settings and application-level checks. Consent fonts and shaping assets were preserved. Existing live language configuration was unchanged.

Live Stripe product/tax/coupon provisioning and the nine-event webhook subscription are documented in `docs/photo-radar/stripe-provisioning.json` and `docs/photo-radar/stripe-webhook-provisioning.json`. No live customer, payment, refund, payout or email was created for release verification.

## Operational limits

- Referral invitation email remains disabled (`REFERRAL_EMAIL_ENABLED` is absent). Referral payouts remain a staff operation; this release does not enable automated transfers or send invitations.
- The Photo Radar staff checklist, drafts, copy/reply and client approval flow are implemented. Raw-disclosure ingestion and clone delivery still require staff handling until an external worker is connected.
- Google Ads purchase labels are configured separately for officer and camera purchases, but the new Ads destination ID is disabled for this product release pending the separate tracking privacy handoff. Existing GA4 behavior is unchanged. Enhanced conversions, remarketing audiences, campaign activation and ad spend are not part of this release. A configured conversion action is not proof of event delivery.

## Validation and rollback

Verification included mounted checkout scenarios across all seven existing languages, actual-handler requests against mocked providers, disposable PostgreSQL migration/concurrency/locale tests, Unicode consent PDFs, source/translation publication gates, the full Vite build, generated content/FAQ parity, and browser checks at desktop and mobile widths. Production probes used invalid requests or unauthenticated access only; they do not establish that a real paid checkout was completed.

The pre-release site rollback deployment is Cloudflare Pages `5235dedd-b82a-41da-b397-992a9e8cf2c9` for project `fabsy`. Hosted pre-release function sources, static consent assets, affected SQL definitions, migration receipts, exact source inventories and validation logs were preserved in `/Users/brettbilon/.cache/fabsy-pro-live-evidence`. Do not roll back new additive schema by dropping customer data. If a runtime rollback is required, coordinate the compatible functions and site version and use the captured source/definition receipts.

Source handoff manifests describe the owners' frozen donor checkouts. The integrated Git commit and the release evidence inventory are the authority for the combined source; shared donor files were not copied wholesale over newer main.
