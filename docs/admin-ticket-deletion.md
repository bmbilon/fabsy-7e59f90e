# Recoverable admin ticket deletion

## Requirements and decisions

Brett requested removal of his test tickets and Delete on every admin ticket. Use the existing staff roles (admin and case manager). Deletion moves a record out of active queues and counts; payment data, documents and case outcomes remain intact. Staff can restore it. An intake linked to a submission is the same ticket for deletion/restoration. Independent uploaded intakes have their own Deleted view. Do not send messages as part of cleanup or testing.

## Implementation and verification

- Add audited deletion columns and a staff-only RPC, with direct column mutation blocked.
- Add a reusable confirmation dialog to case cards, incomplete intakes, representation details and historical assessment details.
- Exclude deleted entries from active counts and ATE pilot metrics. Deleted detail routes show restoration only.
- Cancel unsent disclosure/upload alerts; reject new automatic matches/enqueues for deleted tickets. Restore does not automatically restart cancelled notices. Delivery already accepted by a provider cannot be recalled.
- Validate staff authorization, idempotency, targeted changes, linked-intake propagation, restore, failed requests and duplicate clicks using synthetic fixtures.
- Deploy and validate the database before the frontend. Clean the nine known Brett Bilon submissions and their two linked intakes using an explicit target set, retaining the client record and financial history.

## Validation commands

- `node scripts/test-admin-ticket-deletion-db.mjs` (isolated PostgreSQL; set `PG_BIN` if needed)
- `node scripts/test-admin-ticket-deletion.mjs` (real React page/dialog, synthetic services)
- `node scripts/test-admin-ticket-opening.mjs`
- `npx tsc --noEmit --project tsconfig.app.json`
- Repository build and deployment workflow checks

The migration also passed a transaction against the real database schema: delete, linked-intake check and restore, followed by rollback. Production cleanup and release receipts are recorded after deployment.

## Backend release and authorized cleanup

- Applied migration `20260910020000_admin_ticket_deletion` to the existing Fabsy Supabase project and recorded it in migration history.
- The real-schema rollback verification passed before application.
- Removed nine verified Brett/Brett Michael Bilon test submissions and their two linked uploaded intakes from active queues, through the staff RPC on Brett's explicit request.
- Eleven audit events recorded. Zero Brett submissions remain active. Hash comparisons verified that all other submissions and intakes were unchanged.
- The cleanup retained the client profile, uploaded documents, case status/outcome and payment records. It did not send messages or issue refunds.
- Local database tests, real React dialog tests, existing ticket-opening tests, TypeScript and full production build passed. ESLint reported only the three existing hook-dependency warnings in legacy pages.
