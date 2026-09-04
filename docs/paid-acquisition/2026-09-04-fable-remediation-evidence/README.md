# Fable Five remediation handoff

This folder is the local, pre-deployment review handoff for the Fabsy paid-acquisition remediation.

- Agreed failing baseline `B`: `f2fde2aeb1d633f3ae432e9758f3bc823a1cac7f`
- Frozen remediation source `S`: `b1cca461e9d56ca75cd43f473a31a42c3bbaed33`
- Branch: `codex/paid-acquisition-readiness`
- Readiness record: `docs/paid-acquisition/2026-09-03-restart-readiness.json`

The evidence commit cannot contain its own final commit hash. The direct successor readiness commit is therefore the authority for `localReview.evidenceCommit`, along with all six other handoff fields. Reviewers must read those values from the readiness record at `HEAD`, verify the direct-child `B → S → E → R` relationships and exact path restrictions, and reject a mutable branch name as proof.

## Decision boundary

- **Local status:** ready for a fresh independent code and evidence review after the pinned handoff validates.
- **Production status:** **NO-GO**. Nothing in this candidate has been deployed or exercised against production services or advertising providers.
- **Advertising status:** no campaign change, reactivation, budget, or spend is authorized.

The candidate closes the reported local code failures for converted-draft retention and erasure, converted-intake recovery, small-screen consent obstruction, initial and missed consent-expiry cleanup, evidence-validator false positives, deterministic local builds, and screenshot provenance. Production proof and owner decisions remain open.

## Evidence files

- `verification.json` records the frozen source, toolchain, deterministic-build contract, local test results, closed findings, and production-open gates.
- `dist-artifact-hashes.sha256` is the complete 1,346-file hash inventory produced by `npm run build:evidence` in both ordinary and hostile ambient environments.
- `mobile-layout-geometry.json` binds each CSS viewport to its DOM geometry, actual JPEG raster, MIME type, device pixel ratio, per-axis capture ratio, byte length, and SHA-256.
- `screenshots/` contains the three fresh captures. Filenames state CSS viewport and actual raster dimensions; their `.jpg` extensions match the JFIF bytes returned by the browser capture surface.
- `artifact-hashes.sha256` is the candidate manifest. It must exactly cover the committed diff from `B` through evidence commit `E`, excluding itself and the readiness path.
- `FABLE-FIVE-REVIEW-PROMPT.md` is the copy-ready independent-review prompt.

The synthetic build deliberately disables all measurement providers and uses a committed fake Supabase browser configuration. Its bytes prove repeatability and support local rendering only. They are not production build, deployment, tag, or provider proof. The normal `npm run build` remains stopped by the owner-controlled publication gate for seven changed legal translations.

The staff lead queue supports audited `open`, `contacted`, `dismissed`, and reopen actions. A staff resend control is deliberately absent because the raw customer capability is not retained. Any future resend feature needs a separately reviewed authenticated server action with capability rotation, consent and expiry checks, provider claims, throttles, and an audit trail.

## Actions not taken

No push, deployment, database migration, Edge Function deployment, provider change, message, call, payment, refund, record deletion, campaign mutation, campaign activation, or advertising spend was performed.
