# Pro driver and referral verification receipt

Local implementation frozen on 2026-08-31 in `/Users/brettbilon/fabsy`.
The scoped source manifest is [source-handoff.json](source-handoff.json), with
SHA-256 hashes for 28 new program sources, 20 shared merge references and 15 test
files. All 63 hashes were rechecked after freeze and were unchanged. Shared files
must be merged by the stated boundaries onto current main; they are not safe
whole-file replacements for the newer live language policy.

## Verified locally

| Check | Result |
| --- | --- |
| Deno pro pricing/image, referral and resolution helpers | 20 tests passed: 9 + 7 + 4. |
| Real local PostgreSQL migration integration | Photo115000 → pro120000 → referral121000 → resolution122000 passed, including populated RLS/privacy, invalid/NULL input, immutable pricing and concurrent/stale refund handling. |
| Real local PostgreSQL referral lifecycle | Signed attribution, all five identity matches, settlement plus acceptance/wait, fleet exclusion, refunds before/concurrent with payment linkage, concurrent payouts, second-payout profile and annual tax totals passed. |
| Read-only aggregate metrics | Actual SQL checked bundle counting, GST exclusion, one PRO adjustment, unknown/legacy revenue exclusion, officer verification share and camera fleet holds. |
| Actual mounted PaymentStep | Seven cases passed: eligible service/bundle, mismatch, unavailable verification, missing photo, Class5 and camera exclusion. No external service calls. |
| Attribution and date handoff | Last touch, expiry, forged/stale tokens, bounded storage and races passed; explicit camera entry, separate offence dates and manual edits/clears survive cache/OCR/remounts. |
| Actual bundled resolution endpoint | Staff/paid/saved gates, side-effect-free preview, current result/recipient/content fingerprint, default-off consent, camera HTML, immutable retries and crash-safe duplicate protection passed. |
| Actual mounted resolution control | No send on mount/preview, explicit review, cancellation, consent and stale-case protection passed. |
| Safe Stripe provisioning script | Zero-network dry runs and exact coupon validation passed. This task did not invoke apply. |
| Public snapshot contract | Real React SSR copy, Service/FAQ schema and metadata parity; exact route-scoped claim guard admission; deterministic/private-route-safe generation and offline sitemap preservation passed. |
| App TypeScript | Passed. |
| Direct Vite production compile | Passed; output isolated at `/tmp/fabsy-pro-referral-build`. No prebuild/database synchronization or publication. |
| Scoped lint | No errors. The existing AdminDashboard effect dependency warning remains; adding its Referrals tile did not change that effect. |
| Browser | Desktop/mobile public pages, terms anchors, FAQ expansion, private sign-in gates and short-link routing passed, with no horizontal overflow or console errors. |

The browser screenshots and per-route checks are in
[the QA report](../../reports/pro-referral-qa-2026-08-31/README.md).
Build output also reports existing Sass/Browserslist deprecations, mixed static
and dynamic Supabase imports and a large application chunk; these did not prevent
compilation and were not broadened into an unrelated refactor.

The two generated public snapshots were subsequently checked byte-for-byte against
the frozen renderers, and the offline sitemap check passed. A broader whole-tree
snapshot check in this shared checkout stops before validation because its generated
`public/prerendered/locale-manifest.json` is absent. The release worktree must
generate that manifest and pass its complete current-main guards before publication;
the passing program checks do not replace that gate.

Reproduction commands are in
[PRO_DRIVER_OPERATIONS.md](../../supabase/PRO_DRIVER_OPERATIONS.md),
[REFERRAL_OPERATIONS.md](../../supabase/REFERRAL_OPERATIONS.md) and
[seo-snapshots.md](seo-snapshots.md). Additional email checks:

```sh
deno test supabase/functions/_shared/resolution-email.test.ts
node scripts/test-resolution-email-endpoint.mjs
node src/lib/referrals/resolution-email-action.test.mjs
```

## Coordinated billing evidence

The Photo Radar owner reported and verified via the authenticated Stripe
Dashboard on 2026-08-31 that live account `acct_1PG64qAt6NWmIwaS` now contains
[coupon PRO20](https://dashboard.stripe.com/acct_1PG64qAt6NWmIwaS/coupons/PRO20):

- 20% off, duration once, valid at the time of inspection.
- No product restrictions, expiry/date range or redemption cap.
- No public promotion code; zero redemptions at inspection.
- Metadata `fabsy_program=pro_drivers` and
  `fabsy_pricing_version=pro_drivers_2026_08`.

This is the separate owner's provider evidence, not a live API check by this task.
The owner also confirmed its photo price/GST IDs were configured in the matching
Supabase project. Only that owner provisioned photo billing; no duplicate SKU was
created here. No customer, payment, refund, invoice or email was involved in the
reported coupon provisioning.

## Release limits

The Allstate/multilingual task is coordinating the authorized deployment in its
separate release worktree, preserving current `FABSY_LIVE_SERVICE_LOCALES`, exact
publication checks and its reviewed homepage promotion contract. This receipt is
not a claim that source, migrations or functions have been deployed. The release
owner must record deployment and authenticated integration checks separately.

`REFERRAL_EMAIL_ENABLED` remains unset/false until the actual mailing address,
consent records and unsubscribe process are ready. Case updates require a staff
preview and explicit send. The admin payout screen only records already completed
Interac transfers. This task made no live AI uploads, customer charges/refunds,
email sends, money transfers, ad changes or production deployments.
