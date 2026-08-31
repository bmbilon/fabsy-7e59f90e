# Multilingual Phase 1

Release prepared 2026-08-30 with previews gated by review status. All seven translations are **machine drafts awaiting native and legal-adjacent review**. The isolated release candidate retains the current main branch's consent security and written-order protections. Production deployment is not asserted by this document; no ad campaign, live payment, customer message, reviewer procurement, or WhatsApp setup is part of translation preparation.

## Preview

Run `npm run dev` and open the dev server's printed URL with one of these paths:

| Language | Home | Intake |
| --- | --- | --- |
| Punjabi, Gurmukhi | `/pa/` | `/pa/submit-ticket` |
| Tagalog | `/tl/` | `/tl/submit-ticket` |
| Simplified Chinese | `/zh-hans/` | `/zh-hans/submit-ticket` |
| Traditional Chinese | `/zh-hant/` | `/zh-hant/submit-ticket` |
| Arabic | `/ar/` | `/ar/submit-ticket` |
| Hindi | `/hi/` | `/hi/submit-ticket` |
| Spanish | `/es/` | `/es/submit-ticket` |

English keeps its existing root URLs. Each locale also covers `/rapid-resolution`, `/how-it-works`, `/faq`, `/contact`, `/terms-of-service`, `/payment-canceled` and `/thank-you`. The localized `/ticket-form` is an alias for `/submit-ticket`. A localized `/terms-of-purchase` displays an explicit English handoff to the separate `/terms-of-purchase` document, with a draft notice while the interface is unapproved; it never renders the service-term translation as purchase terms. The handoff remains noindex and has no translated snapshot. The English purchase page keeps its own canonical URL and indexability. The receipt page never infers a successful payment from a URL alone.

In development, the selector exposes all Wave 1 drafts for review. In a production build, only released languages and the current preview's language appear. Direct draft URLs remain accessible with prominent notices and `noindex`; checkout and ticket OCR are disabled. Completing a preview form does not submit a case or create a payment session. English remains available.

Language changes preserve the current intake through a shared draft and route-state handoff, clear the signature/consent, and return no further than the consent step. There is no new intake cache in localStorage. The selector stores only an explicit language preference; dismissing the offer is session-scoped. Language offers use the browser preference, supplemented by the read-only Cloudflare `/api/language` endpoint when available. They never redirect automatically.

## Delivered scope

- `react-i18next`, lazy JSON dictionaries, route-derived language, native-name selector and Arabic RTL.
- Eight bundles with 243 matching strings each: English plus seven Wave 1 drafts. Native-script input is preserved independently of the selected interface language.
- Home, service, process, FAQ, contact, sixteen-section service terms, all six intake steps, validation and the Rapid Resolution checkout summary. Purchase terms are a separate English handoff. The existing English application and pricing remain the source of truth.
- Self-canonical URLs, reviewed-equivalent hreflang, a per-locale sitemap after release, and 56 deterministic localized snapshots. Intake/payment-return surfaces stay noindex. Missing translations never become English content under a translated URL.
- Stored language preference, payment metadata/return URLs, a protected original-text/English-review queue, and explicitly labelled English notification fallback. Backend details and migration/deployment ordering are in [MULTILINGUAL_OPERATIONS.md](../../supabase/MULTILINGUAL_OPERATIONS.md).
- Consent PDFs retain native-script client fields and the full English authorization, with proper shaping, pagination and an exact UTF-8 attachment. Unsupported characters stop generation before payment and require contacting Fabsy; they are never silently removed. Stored user text is escaped when displayed in notification HTML.
- A [review brief](translation-review.md) and [1,701-row review inventory](translation-review.csv), with exact source/target text and per-string hashes. No approval is implied by a completed row inventory.

Wave 2 is registered but has no bundles or published routes. The 1,160-page content translation program, n8n/Claude worker connection, staff translation-queue UI, approved translated email rendering, translated Stripe-hosted copy/receipts, ads, and community outreach remain subsequent work. The existing Stripe flow and transactional messages still use English. A preferred-language field is not a staffed language service.

## Release one language at a time

1. Start with Punjabi and Tagalog. Have the exact rendered pages and source/target strings reviewed by paid native reviewers, plus appropriate legal review of scope, consent, fees, exclusions, disclaimers, deadlines and terms. Record the real evidence in the inventory; do not invent reviewer identities or dates.
2. Confirm the contact channel and response expectations for that language. A phone number does not establish WhatsApp access or an available speaker. `src/i18n/review-status.json` currently has no WhatsApp number, so the CTA is hidden. Only configure a verified WhatsApp destination after the channel is operational; language release also requires `serviceReady`.
3. Obtain the current build fingerprints with `node scripts/validate-i18n.mjs --review-values`. After actual approval, record `status`, `reviewedBy`, `reviewedAt`, `sourceFingerprint`, `bundleFingerprint`, `sourceDocuments` and `serviceReady` for that locale in `src/i18n/review-status.json`. `sourceVersion` must match the registry. These implementation fingerprints are **not** the CSV's SHA-256 hashes.
4. Source strings, offer data, the translated bundle, and all three English legal source documents are included in review checks: `src/pages/TermsOfService.tsx`, `src/pages/TermsOfPurchase.tsx`, and `src/components/form-steps/ConsentStep.tsx`. The shared `LEGAL_SOURCE_DOCUMENT_PATHS` inventory drives the browser build, validation and snapshot gate. Changing any of them invalidates the corresponding approval, including a purchase-term change while its route remains an English handoff. Obtain review of the changes, refresh the record, rebuild the app and regenerate snapshots/sitemaps together. Restart a dev preview after dictionary edits when assessing exact reviewed wording.
5. Follow the backend runbook: migration first, then the affected functions, then synthetic staging verification. Only after review and service readiness are established may an operator attest the same locale in `FABSY_REVIEWED_SERVICE_LOCALES`. The browser cannot set this secret. Remove that attestation whenever approval or service readiness is withdrawn. It does not enable translated emails.
6. Inspect the production build, mobile layout, exact localized destination, reciprocal hreflang and sitemap, server rejection of unreleased locales, test-mode payment return and consent PDF. Run the complete build and retain the existing English offer guardrails before deploying.
7. Point approved language-specific ads to the exact matching locale. Confirm current ad-platform capabilities, copy and policies when preparing campaigns; no language targeting assumptions or native-script CPC claims were validated by this implementation. Do not spend against a draft landing page or an unstaffed contact channel.

Authoritative English terms links appear before localized consent/purchase and on localized service terms pages. The purchase handoff does not promise a translated purchase agreement; its English document preserves written-order precedence, existing-order prices and waivers, and the distinction between consent and payment authorization. Source hashes detect drift; they cannot establish that a translation is correct or that a reviewer actually approved it.

## Verification and safe local builds

```sh
npm run test:i18n
npx tsc -p tsconfig.app.json --noEmit

# Refresh review rows after editing JSON; unchanged evidence is retained.
npm run i18n:review

# Compile without the existing prebuild's live database sync/content writes.
fabsy_build_dir="$(mktemp -d /tmp/fabsy-i18n-build.XXXXXX)"
npx vite build --outDir "$fabsy_build_dir"

# Inspect deterministic locale snapshots without changing public/prerendered.
fabsy_snapshot_dir="$(mktemp -d /tmp/fabsy-locale-snapshots.XXXXXX)"
LOCALE_SNAPSHOT_OUT_DIR="$fabsy_snapshot_dir" node scripts/generate-localized-snapshots.mjs
```

The normal `npm run build` retains the existing prebuild database synchronization and content generators. Its localized generation runs before snapshot validation, then the postbuild validates manifests and copies staged snapshots. A compile-only Vite build is not a substitute for that deployment pipeline.

Local verification covered the actual i18next runtime for all eight dictionaries (including both Chinese script codes), key/placeholder parity, draft/stale approval rejection, script-aware language negotiation, query/hash preservation, unsafe URL inputs, native-script validation and combined API field-length limits. Rendered-route tests cover the seven purchase handoffs, the complete service-term sections, and invalidation for changed or missing English purchase terms. The SEO suite has 21 offline integration groups covering snapshots, sitemaps, staged copy, crawler routing, English purchase terms and Accept-Language. Browser checks exercised every Wave 1 homepage at mobile width, Arabic RTL, English direction restoration, Tagalog's complete six-step synthetic intake, native dates, invalid signatures, draft payment blocking, all sixteen terms sections and language handoff with fresh consent. The production preview offers only English at the root; direct locale drafts retain noindex and a draft notice.

Seven network-free backend locale/notification tests and six Unicode PDF tests pass. An isolated PostgreSQL cluster verified the actual migration's source preservation, queue claims/retries, stale output handling, RLS, staff-only approval and checkout immutability. Nine synthetic PDFs (nineteen pages) were structurally checked and rendered for inspection. See the backend runbook for exact commands, font licenses, the approximately 15 MB static asset bundle, CLI/Docker deployment requirements and PDF reader limitations. Hosted function resource limits, live storage and test-mode payment integration still need staging verification.

The isolated release starts from current `origin/main`, whose upstream validator passed 1,219 snapshots. It retains that branch's offer guardrails and consent-route fixes; the earlier dirty-worktree report of 138 English snapshot issues does not describe this release baseline. The complete production build passed with 1,122 English content snapshots, 56 draft localized snapshots and 1,276 total snapshots checked. Cloudflare's Pages Functions compiler also passed. The deployment workflow repeats the dictionary, review, runtime and SEO tests, browser snapshot capture, guardrail checks and atomic snapshot copy before publishing. Generated output is verified in the isolated release workflow without overwriting the original working tree.
