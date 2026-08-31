# Multilingual Phase 1

## Constitution

Preserve the current English service, pricing and user work. Translate meaning without strengthening any promise. English terms control. Machine translations are drafts until a named native reviewer has reviewed legal-adjacent copy and the service channel is ready. Preserve original client text; translations are review aids. No automatic language redirects, automatic acceptance of resolutions, ad spend, deployments or customer messages are part of this implementation.

## Requirements

English remains at the root. Wave 1 is Punjabi, Tagalog, Simplified Chinese, Traditional Chinese, Arabic, Hindi and Spanish, in that order. Register Urdu, Vietnamese, French, Ukrainian, Korean and Persian for Wave 2 without publishing empty translations. Phase 1 covers the home page, Rapid Resolution, process, FAQ, contact, intake labels/errors, consent, review, checkout, terms and notification templates. Arabic uses RTL. Language offers are dismissible and voluntary. Keep language through navigation and intake.

Search metadata must describe the actual language, with self-canonicals and reciprocal hreflang only for reviewed equivalents. Drafts are noindex and absent from sitemaps. Do not copy English content into 1,160 fake translated pages. Extend the snapshot pipeline with locale support. Preserve original intake text and queue English translation for human review through a protected integration contract.

## Clarifications resolved from this request

- Build now; do not launch ads or publish the checkout with unreviewed terms.
- Use current repository offer and scope, not a broader promise of trial attendance.
- A WhatsApp number/staffing is not established by an existing telephone number. Hide WhatsApp until explicitly configured and marked ready.
- Existing notifications may fall back explicitly to English until their translations clear review.
- Paid native review, actual multilingual staffing and connecting a translator to the queue require external work; do not represent them as completed.
- Existing English routes and checkout remain available. Preview forms must not accidentally create customer records or payment sessions.

## Plan

Use react-i18next JSON resources, one route-derived language provider, shared locale/release policy, locale-aware links and a header selector. Add localized Phase 1 views around existing offer configuration and reuse the actual intake/payment implementation. Add a locale field and durable translation review contract to existing Supabase endpoints. Extend deterministic snapshots/sitemaps without regenerating unrelated user artifacts.

## Tasks

- [x] Locale registry, lazy JSON resources, route provider and release policy.
- [x] Seven Wave 1 draft bundles and complete English source bundle.
- [x] Phase 1 views, RTL, selector and dismissible language offer.
- [x] Intake labels/validation, locale payload, consent and checkout gate.
- [x] Persistence, original-text translation queue and explicit English notification fallback.
- [x] Snapshot locale loop, canonical/hreflang and per-locale sitemaps.
- [x] Automated coverage/gate checks, production compilation and browser verification.
- [x] Reviewer/operator handoff with exact launch requirements.

## Implementation verification

The local implementation has eight matching 243-string bundles, 1,701 review rows and 56 deterministic locale snapshots. Runtime tests verify both Chinese script codes resolve their own dictionaries. The six-step intake was exercised with synthetic mixed-script data; changing languages preserves the draft and clears consent. Unicode PDF and notification escaping checks pass, alongside the isolated PostgreSQL migration/RLS tests. All seven translations remain drafts, without search promotion or checkout access.

The production Vite bundle compiles. Full snapshot deployment validation still identifies 138 existing English pricing/schema issues; no broad bypass or rewrite of those English pages was introduced. Native/legal review, service staffing, translation-worker connection and hosted staging checks remain release work, not completed operational claims. See `docs/multilingual/README.md` and `supabase/MULTILINGUAL_OPERATIONS.md`.

## Analysis before implementation

Each requested surface maps to a task above. Release gates cover translation quality and service capability independently; only both permit purchase/promotion. Localized SEO cannot publish draft or untranslated content. Backend locale validation cannot trust browser state. The existing English checkout, blog/content URLs and draft user changes remain outside the rewrite scope. The most consequential tests are route/query preservation, RTL cleanup, placeholder parity, stale review invalidation, draft checkout rejection and noindex/sitemap behavior.
