# Fable Five remediation handoff

This folder is the local review handoff for the paid-acquisition remediation frozen in source commit `eb299d7a7d61ff29283cd482393dbe997dd124cf` on `codex/paid-acquisition-readiness`.

## Decision boundary

- **Local status:** ready for a new independent code and evidence review.
- **Production status:** **NO-GO**. Nothing in this candidate has been deployed or exercised against production providers.
- **Advertising status:** this handoff authorizes no campaign change or spend.

The local remediation closes the four unconditional P1 code failures in Fable Five's September 4 report: converted-draft retention and blocking foreign keys, converted-intake lockout, small-screen consent obstruction, and fabricated-evidence acceptance by the readiness validator. It also adds bounded delivery-abuse controls before resume delivery can ever be enabled.

The committed English crawler snapshots, mobile screenshots, geometry record, test inventory, and artifact hashes are provided for independent reproduction. The normal release build intentionally remains blocked by the seven-language owner-publication gate after the Privacy Policy change. That gate must be completed by an authorized owner; it was not bypassed or represented as approved.

## Review files

- `verification.json` — machine-readable local results, hashes, closed findings, and open release gates.
- `artifact-hashes.sha256` — SHA-256 manifest for the source changes and this evidence pack, excluding the manifest itself.
- `mobile-layout-geometry.json` — exact first-view geometry for 360×560, 360×640, and 390×844.
- `screenshots/` — viewport captures corresponding to the geometry record.
- `FABLE-FIVE-REVIEW-PROMPT.md` — copy-ready independent-review prompt.

The staff lead queue now supports audited `open`, `contacted`, `dismissed`, and reopen actions. A staff resend control is deliberately absent: the browser capability is never stored in raw form, and adding resend safely requires a separately reviewed authenticated server action with capability rotation, consent and expiry checks, provider claims, throttles, and an audit trail.

## Actions not taken

No push, deployment, database migration, Edge Function deployment, provider change, message, call, payment, refund, record deletion, campaign mutation, campaign activation, or advertising spend was performed.
