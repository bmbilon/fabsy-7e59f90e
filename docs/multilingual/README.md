# Multilingual Phase 1

Updated 2026-09-01. Brett authorized publication and search indexing of all seven machine-translated interfaces without waiting for native or legal review, subject to the exact-copy gate and the prominent versioned `NOT LEGAL ADVICE` / machine-translation disclosure. Ordinary Rapid Resolution intake and checkout remain available in those languages when the exact publication fingerprints match. No native review, staffed multilingual phone service, WhatsApp setup, customer message or ad campaign is implied by publication or indexing.

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

English keeps its existing root URLs. Each locale also covers `/rapid-resolution`, `/how-it-works`, `/faq`, `/contact`, `/terms-of-service`, `/payment-canceled` and `/thank-you`. The localized `/ticket-form` is an alias for `/submit-ticket`. A localized `/terms-of-purchase` displays an explicit English handoff to the separate `/terms-of-purchase` document, with a draft notice while the interface is unreleased; it never renders the service-term translation as purchase terms. The handoff remains noindex and has no translated snapshot. The English purchase page keeps its own canonical URL and indexability. The receipt page never infers a successful payment from a URL alone.

The production selector exposes English and the seven released language options. Published machine translations display a prominent `NOT LEGAL ADVICE` banner that identifies machine translation, Fabsy's non-law-firm status and the English-terms boundary; they are not presented as professionally reviewed. Direct unpublished or stale URLs remain accessible with prominent notices and `noindex`; checkout and ticket OCR are disabled there. Completing an unpublished preview form does not submit a case or create a payment session. English remains available.

Language changes preserve the current intake through a shared draft and route-state handoff, clear the signature/consent, and return no further than the consent step. The selector stores an explicit language preference; dismissing the offer is session-scoped. Language offers use the browser preference, supplemented by the read-only Cloudflare `/api/language` endpoint when available. They never redirect automatically.

Photo Radar intake and authorization, Pro Driver verification and discounted purchasing, and referral registration, reward and payout flows remain in English. Their public pages and private portals are not added to the locale registry. The translated Pro Driver homepage promotion links explicitly to English eligibility details. Product query parameters or a carried licence declaration must not turn an ordinary localized Rapid Resolution form into a new-product checkout; the entry and server guards enforce that boundary. Licence photos are not stored in browser intake drafts.

## Delivered scope

- `react-i18next`, lazy JSON dictionaries, route-derived language, native-name selector and Arabic RTL.
- Eight bundles with 268 matching strings each: English plus seven owner-published machine translations. Native-script input is preserved independently of the selected interface language.
- Home, service, process, FAQ, contact, sixteen selected service-term sections, all six ordinary Rapid Resolution intake steps, validation and the checkout summary. The terms introduction explicitly directs users to the complete English agreement, including Photo Radar, Pro Driver and referral sections 5C–5E. Purchase terms are a separate English handoff.
- Self-canonical URLs and 56 deterministic localized snapshots for released pages. The 42 public-information URLs (six routes in each of seven languages) are indexable under an explicit owner indexing attestation and appear in seven locale sitemaps with reciprocal hreflang. The remaining 14 intake/payment-return snapshots stay `noindex`; receipt and purchase-handoff routes remain private or noindex. Missing translations never become English content under a translated URL.
- Stored language preference, payment metadata/return URLs, a protected original-text/English-review queue, and explicitly labelled English notification fallback. Backend details and migration/deployment ordering are in [MULTILINGUAL_OPERATIONS.md](../../supabase/MULTILINGUAL_OPERATIONS.md).
- Consent PDFs retain native-script client fields and the full English authorization, with proper shaping, pagination and an exact UTF-8 attachment. Unsupported characters stop generation before payment and require contacting Fabsy; they are never silently removed. Stored user text is escaped when displayed in notification HTML.
- A [review brief](translation-review.md) and [1,876-row review inventory](translation-review.csv), with exact source/target text and per-string hashes. No approval is implied by a completed row inventory.

Wave 2 is registered but has no bundles or published routes. The 1,160-page content translation program, n8n/Claude worker connection, staff translation-queue UI, approved translated email rendering, translated Stripe-hosted copy/receipts, ads, and community outreach remain subsequent work. The existing Stripe flow and transactional messages still use English. A preferred-language field is not a staffed language service.

## Maintain the authorized publication

1. Preserve `status: published`, the original `publication.basis: owner_authorized_machine_translation`, authorizing owner/date, and the separate `indexingAuthorizedBy`, `indexingAuthorizedAt` and `disclaimerVersion: not-legal-advice-machine-translation-v1` attestation. `reviewedBy` and `reviewedAt` remain null and `serviceReady` remains false. Native and legal review are optional follow-up quality work; record only real evidence. The separate `approved` path still requires real reviewer evidence and service readiness.
2. Confirm the actual contact channel and response expectations. Customers can write in their language; translation tools may be used, while replies and official documents currently use English. A phone number does not establish WhatsApp or a native-language speaker. The release record has no WhatsApp number, so that CTA stays hidden.
3. Freeze the accepted source before deliberately refreshing fingerprints. Use `node scripts/validate-i18n.mjs --review-values`; preserve authorization provenance while updating `sourceFingerprint`, `bundleFingerprint` and `sourceDocuments`. `sourceVersion` must match the registry. These fingerprints are **not** the CSV's SHA-256 digests, and a build must never refresh them automatically.
4. The shared `LEGAL_SOURCE_DOCUMENT_PATHS` inventory binds eight exact English source files: `src/pages/TermsOfService.tsx`, `src/pages/TermsOfPurchase.tsx`, `src/components/form-steps/ConsentStep.tsx`, `src/pages/PrivacyPolicy.tsx`, `src/config/pro-drivers.ts`, `src/config/offers.ts`, `src/config/feeRefund.json`, and `supabase/functions/_shared/consent-pdf.ts`. English strings and `src/config/offers.json` are also included in the aggregate source fingerprint. The browser build, validation and snapshots use this same inventory. Missing or changed sources invalidate the release until deliberately reconciled; no localized new-product purchase is enabled by refreshing it.
5. Regenerate the review CSV after catalog changes. Unchanged review evidence is retained; changed strings return to draft with blank approvals. Rebuild the app and regenerate snapshots and sitemaps from the same source candidate. Restart a dev preview after dictionary edits when checking exact wording.
6. Preserve the backend `FABSY_LIVE_SERVICE_LOCALES` allowlist for the seven existing ordinary Rapid Resolution flows. Its older reviewed-service fallback does not turn owner publication into native review. Product-language guards remain separate. Follow the backend runbook for migrations, functions and synthetic verification; frontend source hashes alone do not prove that a backend version was deployed.
7. Inspect mobile layout, exact localized destinations, reciprocal hreflang, sitemaps, private-route noindex, fresh consent on English handoff, and server rejection of untranslated product flows. Run the full production pipeline before deployment. Ads and outreach require their own accurate destinations, copy and operational checks; this implementation does not validate language-targeting assumptions or native-script CPC claims.

Search indexability remains a separate, fail-closed decision. An owner-authorized machine publication is indexable only when its current-copy checks pass and its publication record contains the explicit owner indexing identity/date plus the exact versioned disclaimer attestation. This enables discovery without claiming review or staffed service. Missing, partial, malformed or stale attestations remain released for users but `noindex`. A genuinely reviewed locale may still use the separate `approved` path.

Authoritative English terms links appear before localized consent/purchase and on localized service terms pages. The purchase handoff does not promise a translated purchase agreement; its English document preserves written-order precedence, existing-order prices and waivers, and the distinction between consent and payment authorization. Source hashes detect drift; they cannot establish that a translation is correct or that a reviewer actually approved it.

The declined-offer clarification added on August 31 is canonical English copy in `src/config/feeRefund.json`: declining an offer that reduces the fine or demerits does not qualify for a guarantee refund. It appears in the shared refund notice, before consent and checkout, in the complete English terms, and in future English consent PDFs. On localized pages it is explicitly labelled English, with its own language and direction attributes; no new translation or native-review evidence is claimed. Existing translated text and publication provenance stay unchanged. The canonical JSON now participates directly in source attestation so a future policy-only edit cannot leave a stale publication apparently current. Reconcile fingerprints deliberately only after the accepted release source is frozen.

For this release candidate, all seven existing publication records retain their original owner authorization, null reviewer fields and `serviceReady: false`, and record Brett's September 1 indexing authorization against the versioned disclaimer. The 268-key catalogs and 1,876-row review CSV are unchanged. Validation confirms 42 indexable public-information URLs, 14 noindex intake/payment-return snapshots, current review inventory and rejection of changed legal-source fingerprints; this is publication consistency evidence, not translation or legal review.

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

The current integration has passed TypeScript, scoped ESLint with no errors, rendered public-component checks for Photo Radar and ordinary pricing, and eight-source publication checks including rejection of each changed legal file. The rendered checks retain the purchase agreement, written-order and fee-waiver protections, all seven localized navigation branches and suppression of the English phone bar on localized pages. They do not assert native-language or legal equivalence.

The September 1 publication release preserves bundle fingerprints, source-document hashes, the original owner authorization, null reviewer fields and `serviceReady: false`. The separate indexing attestation makes only the six registered public-information routes per locale discoverable; it does not constitute translation or legal review and does not create translated blog or content-guide pages.

The existing runtime, DOM, backend and SEO suites cover dictionary parity, owner publication versus review, script-aware language negotiation, consent preservation, payment controls, private routes, snapshots, sitemaps and crawler routing. Run them against the final integrated candidate and retain that candidate's results; earlier draft-release counts are not evidence for a changed build. The deployment workflow must still repeat snapshot capture, guardrails and atomic copy before publishing. This document does not report a production deployment or a live payment, refund or notification test.
