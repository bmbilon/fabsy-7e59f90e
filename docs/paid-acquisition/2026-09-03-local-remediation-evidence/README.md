# Local paid-acquisition remediation evidence

This directory records the isolated local release prepared from the September 3, 2026 independent NO-GO review. It is evidence of a tested local candidate only. It is not a production deployment, GO decision or spend authorization.

- `verification.json` records the implementation source, test outcomes, local artifact hashes, independent review, deployment order and remaining blockers.
- `artifact-hashes.sha256` freezes the changed implementation and release-control files. It intentionally does not hash itself.

The authoritative operating sequence and business formulas are in `../2026-09-03-paid-acquisition-restart-runbook.md`. The mutable readiness record remains `../2026-09-03-restart-readiness.json`; it must continue returning NO-GO until production, provider, owner, review and spend evidence is complete.
