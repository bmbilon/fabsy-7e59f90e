# Initial disclosure and portal lookup release

The initial disclosure queue now starts prospectively after verified representation payment and signed consent. The cloud adapter verifies the original ticket and signed consent before acquiring a browser, then requires the real administrator's acceptance of that session's current government terms. It fills one verified plate, DL or DOB, selects Agent and No defendant email, uploads the matching consent and records committing before the final click. Only an exact-ticket success sentence can complete the job. Unknown writes require receipt reconciliation.

The phone now displays the legal defendant as printed on the source ticket, shows selected-case lookup evidence, and provides explicit copy/open and verified save/continue controls. Missing source values stay unknown. The public photo intake collects one identifier before checkout using that upload's existing private capability; only a confirmed server save reveals payment.

## Released backend

- Supabase project: `gcasbisxfrssonllpqrw`.
- Individually applied/registered migrations: `20261008220000_automatic_initial_disclosure`, `20261008233000_case_portal_lookup`.
- New scoped Edge Function: `initial-disclosure-agent`; its entry point and two new helper modules were staged independently from the older checkout's general broker.
- Cloudflare Worker: `6c33f592-4d2b-4f09-ba5b-b3caf7e1fd5f`; existing `/admin/portal*` route and five-minute schedule.
- Live phone JavaScript SHA-256: `76ac5cd1723c5a5e8da5c5257b5b0f4cfd3935e70d4628f646ea383129b7241d`.
- Anonymous staff lookup, private-client save without a capability, and terms-acceptance calls returned 401. Client CORS remains scoped to `https://fabsy.ca`.

## Exact case result

At 2026-10-08 22:21:35 UTC, the live source verification recorded **HOGENHOUT, JAMES EDWARD**, ticket **E02605341B**, total fine **CAD373.00**, and zero lookup identifiers. The actual Part 3 notice, linked case/client fields, and signed consent contain no plate, driver's licence number or DOB. The consent's original attachment records an empty driver's licence field.

The existing job `d5df360c-c9e1-41c2-9c65-a8cda495f3e9` was requeued only from its pre-browser `SOURCE_TICKET_FACTS_MISMATCH` hold after correcting source name/fine format validation. It returned at 22:21:36 UTC to `needs_review`, phase `verification`, code `VERIFICATION_DETAIL_REQUIRED`, with no browser session and no initial disclosure receipt. This is the actual remaining information requirement, not a completed filing. Supplying one verified identifier through this job resumes it automatically while preserving the payment, consent and government-session terms gates.

[Staff case step](https://fabsy.ca/admin/portal?job=d5df360c-c9e1-41c2-9c65-a8cda495f3e9)

## Public frontend

Scoped published-source commit: `f4040b5dd32d300b9024324f7008d49fea672da7`. Its five files add the public lookup step, checkout gating, shared value validator, focused intake checks and the printed-ticket-name preference. Unrelated edits in the primary checkout were preserved.

[Backend-first frontend release workflow](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/37853305175) completed successfully for that exact commit. The deployment pin and backend-first gate matched; Cloudflare Pages deployment completed at 2026-10-08 22:34:23 UTC.

The public `https://fabsy.ca/rapid-resolution` page and its module `/assets/index-BZtDwjDn.js` both returned 200. The live module contains the private lookup status/save actions, the plate/DL/DOB choices, the new lookup step and the correct Supabase project. Module SHA-256: `40fad7470ac47143073336e6fbbd111c8be1a33c680b15f31d296cea435db5e0`.

## Verification

- 73 Worker/phone tests: portal field choice, exact receipt, leases/holds, committing interruption, explicit copy/save and failed clipboard handling.
- Eight Deno source/consent/lookup tests, including comma-form names, currency-form fines, distinct Unicode defendants and missing/invalid identifiers.
- Isolated PostgreSQL 17 suites for actual migration definitions, admission, roles, source/lookup fingerprint binding, session acceptance, duplicates and exact-ticket receipts.
- Current frontend's `test:ticket-upload` suite passed, including 46 photo-intake checks and failed lookup saves plus DL/DOB alternatives.
- Worker and phone TypeScript checks passed. Public frontend TypeScript passed with ES2022/DOM library declarations; the repository's unmodified ES2020 configuration has existing unrelated `replaceAll` errors.
- The current frontend's default Vite build passed. The existing custom build plugin requires `dist`, so an initial alternate-outdir invocation was replaced with the default build.

Physical-iPhone clipboard delivery and a successful real cloud filing have not been verified. No government terms acceptance, identifier, filing receipt or client email was fabricated. Paid acquisition remained paused.
