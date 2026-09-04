# Fable Five independent QC prompt

Perform a fresh, read-only adversarial review of the Fabsy paid-acquisition restart candidate. Do not edit files, push, deploy, contact providers, send messages, create transactions, delete records, change campaigns, or authorize spend.

## Candidate and chain of custody

- Worktree: `/private/tmp/fabsy-paid-acquisition-readiness`
- Branch: `codex/paid-acquisition-readiness`
- Agreed failing baseline `B`: `f2fde2aeb1d633f3ae432e9758f3bc823a1cac7f`
- Frozen remediation source `S`: `b1cca461e9d56ca75cd43f473a31a42c3bbaed33`
- Prior Fable report: `/Users/brettbilon/.codex/attachments/ce616f0c-7f61-4938-b928-479cfa708a9b/pasted-text.txt`
- Evidence directory: `docs/paid-acquisition/2026-09-04-fable-remediation-evidence`
- Readiness record: `docs/paid-acquisition/2026-09-03-restart-readiness.json`
- Runbook: `docs/paid-acquisition/2026-09-03-paid-acquisition-restart-runbook.md`

Do not trust the branch name. Read all seven `localReview` values from the readiness record at `HEAD`. Verify full SHAs; `B` is the agreed baseline and an ancestor of `S`; evidence commit `E` is the direct child of `S`; `HEAD` is readiness commit `R`, the direct child of `E`; only the evidence directory and candidate manifest change from `S` to `E`; only the readiness JSON changes from `E` to `R`; and the tracked and untracked worktree is clean. Explain that ancestry alone cannot establish that a chosen baseline is the agreed review boundary.

Verify `artifact-hashes.sha256` has the exact `manifestEntryCount`, contains each path in `git diff --name-only B..E` except itself and the readiness path exactly once, contains no other path, names only regular files committed at `E`, and matches the bytes at `HEAD`. Treat every evidence file as a claim to reproduce.

## Required re-review

1. Re-read every P1 and P2 in the prior report against `B..S`. Classify each as closed locally, deliberately absent with a safe default, production-open, or still defective.
2. Reproduce the converted-draft purge 24 hours after expiry, preservation of the canonical case document, absence of folder tombstones, cascading/non-blocking submission and client erasure, and bounded locking.
3. Reproduce converted-intake recovery, explicit new-intake clearing, wrong-ticket replacement in English and localized journeys, canceled-checkout recovery, and fresh representation consent after conversion.
4. Verify initial, malformed, expired, cross-tab, `pageshow`, and visible-document consent recovery clears stale durable and in-memory attribution and dedupe state without discarding the current undecided page touch. Confirm no later grant can revive attribution from a prior grant.
5. Render `/rapid-resolution` from the synthetic build at CSS viewports 360×560, 360×640, 390×844, and desktop. Inspect the page as well as DOM geometry. Confirm H1, outcome, qualified service-fee refund, `$198 CAD + GST`, Upload, and Call are visible and unobstructed and the competing sticky action is hidden while the initial consent panel is open. Verify each committed image is really `image/jpeg`, has the raster dimensions stated in its filename and metadata, and matches the bound SHA-256. Do not confuse CSS viewport, visual viewport, device pixel ratio, or capture raster.
6. Attack `scripts/paid-acquisition-readiness.mjs` with: explicit `FAIL` and hyphenated `NO-GO` support; nonexistent or omitted evidence; missing manifest rows; duplicate rows; a broken symlink; path traversal; dirty evidence; fake or non-direct commits; a narrowed self-selected baseline; hostile/cross-origin bundles; stale/future/pre-deployment receipts; role aliases; invalid deployment order; invented Meta/Google objective-goal pairs; fake Supabase origins; provider UTM drift; and committed or uncommitted release-critical source drift. A fabricated GO must fail closed. An evidence-bearing NO_GO without a pinned handoff must be CI-invalid. An evidence-free pre-deployment NO_GO with evidence-dependent gates reset to PRODUCTION_OPEN must be CI-valid.
7. Verify the deployment sequence in the runbook is executable with `.github/workflows/build.yml`: terminal local `S → E → R` stops at NO_GO; a later production attempt begins with a fresh `S2` that resets the readiness record to evidence-free NO_GO and passes both readiness suites before deployment; then backend, signed webhook, manual cleanup proof, gated scheduler, normal frontend build/deploy, fresh `E2`, and readiness-only `R2`. Confirm ordinary pushes do not deploy the frontend and scheduled cleanup stays inert unless its repository variable is exactly `true`.
8. Verify resume-delivery safeguards while provider delivery remains disabled: five sends per draft lifetime, ten action attempts per hour, NANP-only SMS, converted-row denial, and at-most-once notification claims. Treat ambiguous provider outcomes as manual-review `indeterminate`, never automatic retry.
9. Verify no PII, raw click ID, IP, user agent, form value, capability, or ticket data enters analytics or the payment ledger. Verify checkout-attribution withdrawal, payment/refund ledger behavior, and notification idempotency.
10. Verify trusted-proxy code accepts only a valid `cf-connecting-ip` and ignores client-controlled forwarded headers. Keep staging and production proxy-header proof open.
11. Verify staff lead handling is staff-only, audited, conflict-safe, and cannot expose a customer capability. Do not demand a raw-token resend shortcut; any future resend needs a separately reviewed authenticated server design.
12. Re-run both TypeScript configs, changed-file ESLint, Actionlint, `git diff --check`, the Deno shared tests and release-function checks, all four disposable PostgreSQL runners, measurement, ticket-upload, readiness, SEO/content/runtime, public-offer, homepage, crawler-snapshot, and visual guardrails.

## Deterministic local build

Use Node `22.17.0`, npm `10.9.2`, and the committed lockfile. Build from an isolated checkout of exact source `S`, not from `R` with evidence files mixed in.

1. Run `npm ci`.
2. Run `npm run build:evidence` and save a complete sorted path-plus-SHA-256 inventory of every file under `dist/`.
3. Re-run with hostile ambient `BROWSERSLIST*` and `VITE_*` values. The script should admit only its documented child environment and produce an identical 1,346-entry inventory.
4. Compare that inventory with `docs/paid-acquisition/2026-09-04-fable-remediation-evidence/dist-artifact-hashes.sha256`.
5. Confirm the built `dist/index.html` references `/assets/index-BiKzCkMS.js` and that selected hashes and toolchain values match `verification.json`.

This evidence build uses mode `paid-acquisition-evidence`, disables Fabsy/Google/Meta measurement, uses synthetic Supabase browser values, and intentionally skips normal prebuild/postbuild steps. It is local rendering evidence only. It must not be described as a production build or provider proof.

Run `npm run build` separately. It is expected to stop at the owner-controlled i18n publication check because the Privacy Policy changed and all seven non-English legal-publication fingerprints are stale/unpublished. Do not modify `review-status.json`, fabricate an owner attestation, or call that deliberate refusal a code regression.

## Required verdict

Return two separate decisions:

1. `LOCAL CODE QC: PASS` or `LOCAL CODE QC: FAIL`, with exact remaining code/evidence defects and reproduction steps.
2. `PRODUCTION READINESS: NO-GO` unless every production, provider, owner, independent-review, GO, and separate spend-authorization gate has real evidence.

List every temporary file or directory you create. A local pass is not deployment or advertising authorization.
