# Wave 1 owner-publication evidence

This directory records the verified source publication of the seven existing owner-authorized machine translations on `codex/publish-legal-translations`.

- Source commit: `21a835414668d1def468236988130244bea10d70`
- Base commit: `c4faa9ad47b7a96216a792760ac6df8a452edfc3`
- Locales: Punjabi, Tagalog, Simplified Chinese, Traditional Chinese, Arabic, Hindi and Spanish
- Source-publication decision: PASS
- Production deployment: not performed
- Paid-acquisition decision: NO-GO with 45 open requirements

The refresh preserves Brett Bilon's original owner-publication and indexing authorization. It does not claim native-language review, legal review or staffed service in those languages. `reviewedBy` and `reviewedAt` remain null, and `serviceReady` remains false for all seven locales.

The source commit was pushed to the isolated remote branch. It was not merged to `main` or deployed because the branch includes the paid-acquisition candidate, which remains production NO-GO. A controlled release must regenerate the locale manifest and all 56 full browser-prerendered localized pages before any frontend deployment.

`verification.json` contains the exact fingerprints, source hashes, test results, independent review result and deployment boundary. `artifact-hashes.sha256` covers the complete source diff plus this evidence directory, excluding the manifest itself.
