# Fable Five independent QC prompt

Perform a fresh, read-only adversarial review of the Fabsy paid-acquisition restart candidate. Do not edit files, push, deploy, contact providers, send messages, create transactions, delete records, change campaigns, or authorize spend.

## Candidate and prior review

- Worktree: `/private/tmp/fabsy-paid-acquisition-readiness`
- Branch: `codex/paid-acquisition-readiness`
- Remediation source commit: `eb299d7a7d61ff29283cd482393dbe997dd124cf`
- Prior reviewed commit: `f2fde2aeb1d633f3ae432e9758f3bc823a1cac7f`
- Prior Fable report: `/Users/brettbilon/.codex/attachments/ce616f0c-7f61-4938-b928-479cfa708a9b/pasted-text.txt`
- New evidence: `docs/paid-acquisition/2026-09-04-fable-remediation-evidence/`
- Readiness record: `docs/paid-acquisition/2026-09-03-restart-readiness.json`
- Runbook: `docs/paid-acquisition/2026-09-03-paid-acquisition-restart-runbook.md`

First verify the source commit, clean tracked tree, evidence manifest, build hashes, and that every path in the manifest is repository-backed. Treat the evidence as claims to reproduce, not as proof by assertion.

## Required re-review

1. Re-read every P1 and P2 from the prior report against the current diff. State separately whether each is closed locally, intentionally deferred with a safe default, or still a defect.
2. Reproduce converted-draft deletion 24 hours after expiry, preservation of the canonical case document, no folder tombstone, and non-blocking submission/client erasure with the disposable PostgreSQL suite.
3. Reproduce converted-intake recovery, explicit new-intake clearing, wrong-ticket replacement in both English and localized journeys, canceled-checkout recovery, and fresh consent after conversion.
4. Render `/rapid-resolution` at 360×560, 360×640, 390×844, and 1440×900. Confirm H1, outcome, qualified service-fee refund, `$198 CAD + GST`, Upload, and Call are unobstructed; confirm the mobile sticky action is hidden while the initial consent panel is open. Compare DOM geometry with the committed captures; do not approve from screenshots alone.
5. Attack `scripts/paid-acquisition-readiness.mjs` with nonexistent evidence, files omitted from the manifest, path traversal, hostile/cross-origin bundle paths, fake commits and tags, dirty source, stale/future timestamps, role aliases, invalid ordering, incorrect provider identity/objective/restriction data, and Meta/Google UTM drift. A fabricated GO must fail. An honest `NO_GO` must remain CI-valid.
6. Verify deployment ordering: migration `20260903120000` first; migrations through `20260903194000` in dependency order; backend and signed webhook before checkout; cleanup manual proof before schedule enablement; frontend manual and last. Confirm ordinary pushes and prerender refreshes cannot publish the frontend and the cleanup cron remains inert unless the repository variable is exactly `true`.
7. Verify resume-delivery safeguards even though provider delivery remains off: five sends per draft lifetime, ten action attempts per hour, NANP-only SMS, converted-row denial, and at-most-once notification claim semantics. Treat ambiguous provider outcomes as manual-review `indeterminate`, never safe automatic retries.
8. Verify first-party/Google/Meta consent withdrawal clears durable and in-memory attribution and funnel identifiers; verify no PII, raw click ID, IP, user agent, form value, capability, or ticket data enters analytics or the payment ledger.
9. Verify the trusted-proxy code accepts only valid `cf-connecting-ip`; keep staging and production proxy-header proof open.
10. Verify staff lead handling is staff-only, audited, conflict-safe, and cannot expose a customer capability. Do not demand a raw-token resend shortcut. If a resend feature is recommended, specify the authenticated server design and keep it outside this candidate.
11. Re-run both TypeScript configs, changed-file ESLint, Actionlint, YAML parsing, `git diff --check`, the three Deno shared tests, Deno checks for all release functions, all four disposable PostgreSQL suites, measurement, ticket-upload, readiness, SEO/content/runtime, public-offer, homepage, accessibility, crawler-snapshot, and visual guardrails.

## Expected build result

`npm run build` must currently stop at the owner-controlled i18n publication check because the Privacy Policy changed and all seven non-English legal-publication fingerprints are stale/unpublished. Do not alter `review-status.json`, generate an owner attestation, or call this a code regression. Separately reproduce the browser-configured `npx vite build` artifact hashes in `verification.json`; do not treat local configured bytes as production proof.

## Required verdict format

Return two independent decisions:

1. `LOCAL CODE QC: PASS` or `FAIL`, with exact remaining code defects and reproduction evidence.
2. `PRODUCTION READINESS: NO-GO` unless every production, provider, owner, independent-review, GO, and separate spend-authorization gate has real evidence.

List any temporary files you create. Do not turn a local pass into deployment or advertising authorization.
