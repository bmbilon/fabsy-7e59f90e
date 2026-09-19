# Homepage instant ticket assessment

## Principles and requirements

Keep the existing React/Tailwind, offer configuration, upload scanner, intake handoff and service-fee policy. Put the assessment in the left desktop hero column and the existing phone comparison artwork in the right at about half its former 672px display width (maximum 336px). Stack on mobile. Make the full-width primary button at least 72px tall and label it “Instant Ticket Assessment”.

Accept an image/PDF upload or manual offence, fine, demerits and clean-record answers. Reuse real OCR for images and manual entry for PDFs or failed scans. Let users review extracted values. Preserve the attachment and reviewed fields when continuing to the existing intake.

Show possible fine reduction, possible insurance impact over three years, and the combined conditional savings after the configured $198 officer or $79 camera fee. Camera notices have zero demerits and zero insurance impact. Keep negative net values; subtract the fee exactly once. Show GST separately. Never treat demerit reduction as proof of insurance savings.

## Clarifications resolved from existing work

The earlier calculator exists at git commit 40b99720a, with offence-specific illustrative fine-reduction and insurance factors, a clean/non-clean record adjustment, and an $1,800 annual premium baseline. These are scenario assumptions, not measured outcome probabilities or insurer quotes. Retain the legacy upper scenarios, explicitly allow zero reduction/insurance change, and let users replace the annual premium. The current offer config controls fees. Insurance value is conditional on avoiding an insurer-rated conviction; fine-only reductions may leave insurance unchanged. No email or payment is required for the calculation.

## Plan and tasks

- [x] Add an isolated, validated calculation module with legacy assumption provenance.
- [x] Build the accessible form, upload/review flow, result breakdown and intake handoff.
- [x] Recompose the hero and move the existing artwork out of the lower comparison section.
- [x] Check arithmetic, camera rules, invalid inputs, OCR failure/replacement and handoff with offline tests.
- [x] Run TypeScript, focused lint, production compilation and responsive browser checks.

## Consistency analysis

The new request supersedes earlier homepage instructions against monetary scenarios. It does not alter the refund policy, payment flow or underlying service prices. Calculation is local; only a selected image invokes the existing OCR service. Analytics record generic interaction events, not ticket details, record answers, premium or file contents. Existing translations retain their review gate.

## Sources and limits

- Legacy scenario factors: `40b99720a:src/data/ticketAssessmentData.ts` and `src/hooks/useTicketAssessment.ts`.
- [AIRB technical guidance](https://albertaairb.ca/wp-content/uploads/2025/10/Technical-Guidance-Effective-October-1-2025-Final.pdf): insurers use conviction classes and frequencies; this does not validate the legacy calculator percentages.
- [Alberta intersection safety devices](https://www.transportation.alberta.ca/images/Intersection_Safety_Devices.pdf): registered-owner camera offences carry no demerits.
- [Armour Insurance](https://www.armourinsurance.ca/blog/do-photo-radar-tickets-affect-my-insurance): Alberta registered-owner camera tickets do not affect insurance.

Production deployment was explicitly authorized on 2026-09-19 after the local implementation was reviewed.


## Initial local verification — 2026-09-19

- `node --test scripts/test-instant-ticket-assessment.mjs scripts/test-ticket-upload-review.mjs`: 20 tests passed. The 8 assessment tests also passed after preserving exact scanned descriptions and normalizing camera offence choices.
- Focused ESLint passed for all six affected components/modules. `git diff --check` passed.
- Vite production compilation passed; existing Sass deprecations and large-chunk warnings remain. Translation validation passed.
- The repository's normal TypeScript command reports the existing `String.replaceAll`/ES2020 mismatch at `src/pages/AdminManualRepresentationLinks.tsx:98`. TypeScript passes with `--lib ES2021,DOM,DOM.Iterable`; the project configuration was not changed.
- The repository contrast guard reports an existing translucent white background warning in `src/components/blog/BlogLanguageTools.tsx`. No bypass was added.
- Browser verified 1280px desktop columns, 334px rendered artwork inside its 336px frame, and a 572px-wide, 72px-tall assessment button. At 390px and 320px the page has no horizontal overflow; the narrowest CTA wraps and grows to 96px.
- Browser verified officer results ($300 fine, clean record, $1,800 premium: $0–$150 fine scenario, $0–$810 insurance scenario, -$198–$762 before GST) and camera results ($200 fine: $0–$20 fine scenario, $0 insurance, -$79–-$59 before GST).
- Camera result CTA reaches `/submit-ticket?ticket_type=photo_radar` with the correct $79 service and the $200 fine preserved. Missing intake fields still require review. No payment or submission was made.
- Homepage mobile sticky CTA now links to the assessment. Hovered/tapped link text was checked as white on its blue background. Other routes retain their existing sticky actions.
- Scanner behavior is covered using controlled offline OCR responses; production OCR was not sent a customer ticket during verification. PDFs retain the existing manual-entry fallback.
- Local preview: `http://127.0.0.1:5173/`. These checks preceded release preparation.


## Release integration — 2026-09-19

The authorized release is isolated on current `origin/main` at `9ba3a9ce1`, preserving the current homepage headline, refund policy, review marquee, contact consent, ticket photo checks, and funnel measurement. Only the assessment feature and its verification are included; unrelated local work is excluded. No database, Edge Function, payment or workflow configuration changes are required.

- Assessment plus current intake/upload regression suite: 54 tests passed.
- Homepage snapshot guardrail suite: 43 checks passed, including adversarial checks for personalized form values, altered fees, missing controls and added guarantee claims.
- Homepage conversion readiness: 11 checks passed.
- Focused ESLint, contrast guard and `git diff --check` passed.
- TypeScript passes with `--lib ES2021,DOM,DOM.Iterable`. The unchanged ES2020 project setting reports existing `String.replaceAll` errors in `SmsIntakeInbox.tsx` and `AdminManualRepresentationLinks.tsx`.
- The standard build, pull-request CI and production deployment workflow remain required release checks. The exact frontend commit is pinned only after verifying that this release contains no backend changes.
