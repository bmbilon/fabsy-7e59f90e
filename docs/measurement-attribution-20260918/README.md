# Attribution and reporting repair — September 18, 2026

## Observed production defects

The seven-day report read on September 18 showed 66 aggregate paid landing requests, 13 consented landing sessions, one upload/lead, and zero signed live purchases. A grouped database query confirmed nine of the apparently direct landing sessions contained a validated Google click hash and one contained a Meta click hash. The upload/lead was explicitly tagged verification traffic (`utm_medium=qa`), not a customer lead. One of the 13 landings was also tagged QA. These are different counting populations and must not be divided to claim a consent or conversion rate.

## Changes

- Infer missing Google source/medium from unambiguous validated Google click IDs; infer only Meta source from an unambiguous Facebook click. Never invent campaign or creative labels. Explicit UTM labels remain authoritative.
- Recover historical source labels in aggregate reports from click kind and hash already stored. Raw records are unchanged.
- Exclude explicitly tagged verification events consistently from the consented funnel, behavior, steps, and daily totals. Keep all signed live purchase/refund cash facts. The fixed policy is documented in `../paid-acquisition/verification-reporting-policy.md`.
- Preserve long Meta `_fbc` values through browser, checkout, database, and server delivery. The 512-character validated click-ID suffix is supported throughout; `_fbp` retains its smaller bound. Consent, withdrawal, terminal identifier cleanup, and access controls remain enforced.
- Show an unavailable state on report failure and reject stale responses after a reporting-window change.
- Exclude known automation, empty user agents, and speculative prefetch/prerender requests from preconsent landing counts. Log only a fixed failure code when a background counter write fails; request data never enters the log.

## Release order

1. Apply the two forward migrations after their isolated PostgreSQL tests pass.
2. Deploy `meta-capi-worker` with the widened parser.
3. Deploy `create-payment` and `ticket-intake-draft` with the widened validators.
4. Deploy the verified frontend and Cloudflare middleware.
5. Read the live authenticated report and verify recovered sources, excluded QA, and unchanged financial facts.

Keep the widened worker parser when rolling back a writer/frontend: an older worker cannot process longer `_fbc` values already queued. The database widening is backward compatible with older writers. Do not narrow the constraint while longer values remain stored. The reporting changes can be reverted without deleting data.

## Boundaries

No campaign settings, ad budgets, creative, consent defaults, customer contact, live upload, purchase, or provider event was changed or fabricated to verify this release. Browser funnel tests use inert provider and backend fixtures. Actual ad-platform purchase attribution still requires a real consented ad-driven order and provider readback. Aggregate historical QA without retained tags cannot be separated reliably. Requests with ignored consent remain outside the session funnel.

## Validation

Targeted tests and production receipts are recorded in the release receipt after completion.
