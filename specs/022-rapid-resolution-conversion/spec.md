# Rapid Resolution conversion repair — 2026-09-22

## Principles and requirements
Implement Fable's supplied audit against current origin/main. Preserve the published refund policy, explicit measurement consent, immutable plea evidence, server-authoritative eligibility and pricing, and existing customer data. No fabricated proof or response times. No ad activation, test purchases, customer messages or production release are part of this implementation.

## Clarifications and plan
The attached audit specifies the page and intake copy. Keep existing measurement consent unless Brett requests a policy change. Experiments, operational test calls, live ad changes and reporting that requires unavailable source data are follow-up work. Use a dedicated worktree because the starting checkout contains extensive unrelated changes and predates the deployed funnel.

## Tasks and acceptance checks
- Single-offer landing page, short header/footer, early eligibility/router, static permissioned proof, explicit total/payment timing, full refund conditions and accessible CTAs after meaningful sections.
- Hide mobile sticky CTA while hero CTA is visible; keep existing measurement overlay rules; remove paid-page floating chat.
- Intake service selector, entry-link/bundle context, email at upload, unchecked plea, visible authorization, clear steps; persist contact at prepare time atomically and preserve retry safety.
- Bundle handoff and checkout selection; server classification remains authoritative.
- Consent-gated WhatsApp event and bounded landing-page service context; no unconsented counters without policy decision.
- Static landing HTML and reduced English-page language loading, with existing translation publication checks preserved.
- Run build, affected integration/measurement/privacy tests, and mobile/desktop browser checks. Document constraints and release dependencies.

## Consistency review
Landing promises are tied to the existing feeRefund configuration and Terms s.5F. Contact must be saved in the same transaction that creates the intake, before upload/consent generation. Ticket selection is a customer hint, never checkout price authority. Existing published language fingerprints must still be validated.

## Final implementation
Brett's clarification prioritizes a compact, decisive first screen. The hero now leads with **Fight your ticket. We do the work.** and combines Alberta agent positioning, permissioned client proof, the conditional service-fee refund, the $198 + GST / $207.90 total, and one high-contrast upload action. Deadline urgency is factual: **Start before your deadline. Nothing charged now.** No invented availability, results or countdowns.

The mobile hero fits the main offer, proof, guarantee, price and button at 360 × 640. Desktop uses the same offer beside a proof card. The mobile sticky CTA appears after the hero leaves view. The page has a short header/footer, static proof, no floating chat, early camera routing, concise eligibility and full refund details below the fold.

The upload action opens the existing fresh private intake document. The next tap chooses a file or opens the camera; ticket files never enter the public advertising document. Paid entry links preselect the correct service, show the total, and retain bundle context through checkout. Email and affirmative consent are collected together. Plea authorization starts unchecked. The server saves contact and service context atomically before storage upload, then the reviewed ticket remains the authority for eligibility and price. A successful new prepare skips the old separate contact screen. Older clients and prepared submissions retain their existing flow.

The static entry is rendered from the actual React page at build time, using the production asset links. Cloudflare serves it to people and crawlers, checking its marker and canonical before using it. Missing/invalid assets fall back to the existing app. Published language bundles remain available on demand; English release checks use build-time fingerprints instead of fetching all seven dictionaries.

Existing aggregate traffic reporting already exists on the fetched main branch and is preserved. The added WhatsApp event remains consent-gated. The new landing-page field accepts only service-entry names, never arbitrary URLs or campaign identifiers.

## Verification
- `npm run build:evidence`: passed; actual static landing HTML generated.
- `npm run test:ticket-upload`: passed, including new contact/offer/bundle coverage. Corrected an existing timing-sensitive assertion to permit a normal autosave while verifying it retains the last confirmed ticket.
- `npm run test:measurement`: passed, including consent, private navigation, provider isolation, attribution and funnel contracts.
- `npm run test:i18n`: passed; eight bundles and seven published translation attestations validated.
- `npm run test:rapid-landing`: passed; usable HTML without JavaScript, canonical checks, GET/HEAD, bot parity, missing/wrong asset fallback and private-route exclusion.
- Photo-intake edge tests: 9 passed using synthetic mocked backend boundaries.
- `python3 supabase/tests/test_intake_plea_migration.py` with local PostgreSQL binaries on PATH: passed; real migrations, atomic contact capture, immutable retries/pleas, no orphan records and pricing isolation.
- `python3 supabase/tests/test_whatsapp_funnel_migration.py`: passed; local PostgreSQL only, consent enforcement, RPC permissions, allowed pages/positions and deduplication. Existing pg_cron scheduling is excluded from this local test because the local server lacks the extension.
- Chat eligibility: 10 passed. Camera intake: 7 passed. Homepage conversion-readiness checked for the revised shared copy and submit label.
- TypeScript passed with `--lib ES2021,DOM,DOM.Iterable`; the repository's current ES2020 setting otherwise reports existing `replaceAll` errors. Targeted ESLint and `git diff --check` passed.
- Browser review: 360 × 640, 390 × 844 and 1440 × 900; upload navigation, file chooser and synthetic file selection. No real ticket, payment or customer message was created.

Screenshots: [desktop](evidence/desktop.png), [mobile](evidence/mobile.png). Consent is declined in these saved screenshots; the small-screen hero was also checked with the initial banner present.

The existing main JavaScript bundle remains about 570 KB gzipped. This change adds an immediate HTML first paint and avoids unnecessary language requests; it does not claim a measured Lighthouse/LCP score or conversion uplift. Full production prebuild includes database-backed content synchronization and was not run against live sources.

## Release
Implementation branch: `codex/rapid-resolution-conversion-20260922`, based on `origin/main` at `f5affe78a`. Worktree: `/Users/brettbilon/fabsy-rapid-resolution-conversion-20260922`. The original `/Users/brettbilon/fabsy` checkout is untouched.

Deploy in this order:
1. Apply `20260922120000_intake_offer_context.sql` and `20260922121000_funnel_whatsapp_click.sql`.
2. Deploy `photo-ticket-intake` and `record-funnel-event` with their updated shared code.
3. Build and release the frontend plus Cloudflare middleware/static assets together.
4. Check the live offer, mobile CTA, private upload boundary and consented funnel after release.

No production migration, edge deployment, git push, ad change or site release was performed in this task. Existing operational verification, creative experiments and measured conversion lift require subsequent live observation.

Final release checks also passed: 49 homepage snapshot checks and 211 public-offer snapshot checks. The conversion page has an exact source/markup/schema fingerprint; changing a price, hiding refund qualifications, removing the refund notice, adding a hidden claim or changing the upload destination fails validation. After an intentional page revision, render it with `node scripts/render-rapid-landing.mjs`, review the copy/screenshots, then explicitly run `node scripts/update-rapid-conversion-fixture.cjs`. Normal builds never refresh this validation fixture automatically.
