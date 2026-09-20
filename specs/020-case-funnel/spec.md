# Case management funnel view

## Principles and requirements
Use the existing authenticated React admin page and staff status controls. Present eight horizontal columns: Ticket submitted, Consent submitted, Paid, Disclosure requested, Crown offer received, Proceeding to trial, Closed resolved and Closed refunded. Stack cases vertically within their current column. Place Expired/lapsed beneath the two closed columns on a grey background. Preserve historical outcome and trial substatuses, private document access, staff follow-up, deleted-record recovery, and dashboard links.

## Clarifications
The request changes the page view. Column groupings do not replace existing operational statuses or trigger payments, refunds, consent, correspondence, or legal actions. Consent and verified payment timestamps provide early-stage placement when no staff override exists. Existing reduced/withdrawn/trial-concluded statuses roll up to Closed resolved. A closed case with a refund record appears under Closed refunded; a refund/discount flag alone must not close an active case. An expired resume link cannot expire a staff-managed or converted submission. One converted intake/submission appears once, using canonical submission state before inherited draft state. Dismissed and deleted records remain accessible in the details section.

## Plan and tasks
- [x] Review existing data contracts and status precedence on current main; isolate work from the older dirty checkout.
- [x] Derive the funnel in a pure TypeScript helper without mutating case records.
- [x] Build accessible, horizontally scrollable stage columns with counts, search and compact case controls.
- [x] Put the board first and retain operational details/reporting in expandable sections.
- [x] Verify stage grouping, linked cases, refunds, expiry, search and existing status saves.
- [x] Verify desktop/mobile rendering and production compilation.

## Consistency analysis
No database migration or new backend integration is required for this view. Existing staff stages remain authoritative. Failed status loading is visible and does not silently show unverified groupings. Empty and filtered lanes remain visible. The board is scrollable independently of the page, with keyboard focus and explicit scroll buttons. Admin content remains behind the existing authorization checks.

## Verification — 2026-09-20
- `node scripts/test-case-funnel.mjs` passes all stage/evidence mappings, inherited/canonical precedence, converted-case deduplication, deletion/dismissal, expiry boundaries, active partial-refund protection and search.
- Existing `test-admin-case-status.mjs` and `test-intake-follow-up-status.mjs` pass, including server-confirmed changes, concurrent edits, mutation retries, refresh races, channel history and no delivery side effects.
- TypeScript passes with `--lib ES2021,DOM,DOM.Iterable`. Focused ESLint has no errors; two existing admin-page hook dependency warnings remain.
- Vite production compilation passes at `/tmp/fabsy-case-funnel-final-build`; existing Sass and bundle-size warnings remain. `git diff --check` passes.
- Browser verification uses the real page/components with isolated synthetic services from `scripts/preview-case-funnel.mjs`, not live customer records. It checks a status change moving a card into Disclosure requested, ticket-number search, mobile Manage intake/deep-link access and preserved follow-up controls.
- At 1920px, all eight stages align horizontally and the grey Expired/lapsed section spans the two closed columns directly below them (12px gap). At 390px, the document stays within the viewport while the board scrolls independently. The temporary viewport override was reset.
- Local preview: `http://127.0.0.1:5188/admin/cases`. Screenshot: `artifacts/case-funnel-desktop.png`. Build/restart it with `node scripts/preview-case-funnel.mjs`.

## Handoff
Changes are in `/Users/brettbilon/fabsy-case-funnel`, branch `codex/case-management-funnel`, based on `origin/main` at `ac3578cbf`. The original dirty checkout was preserved. No database changes, live case updates, deployment, message, commit or push was performed.

## Copy refinement — 2026-09-20
Removed the promotional heading, page subtitle, pipeline eyebrow, scrolling caption and intake-description prose. Retained functional stage labels, case data, counts, controls and operational error messages. Shortened search placeholders and result counts.
