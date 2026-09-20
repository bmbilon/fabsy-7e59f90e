# Staff case stages and trial matters

## Principles and requirements
Staff can update any intake or submitted ticket from its row or detail page. Stages are Partial intake, Paid, Disclosure requested, Crown offer received, Done — ticket reduced, Done — ticket voided/withdrawn, and Crown offer rejected — client proceeding to trial. Trial matters have a separate section and stages Trial date pending, Trial date set, Trial concluded — ticket reduced, and Trial concluded — ticket upheld.

## Clarifications and plan
These are operational case stages. A manual Paid selection records staff's case tracking and does not create a Stripe payment or revenue event. Updating an outcome never sends a customer message. Existing payment, consent, disclosure evidence and detailed camera-ticket outcome records remain authoritative for their respective systems. Cases moved beyond partial intake remain accessible even if their original draft expires. Trial completion remains visible in Trial matters and Completed.

A staff-only status table and append-only history keep operational stages independent of intake and payment state. Version checks reject stale competing edits. Linked draft stages carry through to converted submissions. Managed drafts are excluded from automated abandoned-draft cleanup. The dashboard queue, case list and ticket detail reuse one accessible dropdown. Coady Barnes's matching ticket will be corrected to voided/withdrawn based on Brett's explicit report.

## Tasks and consistency checks
- Implement staff authorization, audited status changes, version checks and cleanup protection.
- Extend dashboard categories and create the Trial matters section.
- Add the shared editor beside dashboard, intake, case and detail records.
- Verify authorization, stale edits, draft conversion, categorization, payment isolation and trial outcomes with synthetic records.
- Verify the interface at desktop/mobile widths and correct the identified real ticket.

## Verification
The isolated PostgreSQL suite covers anonymous/customer denial, staff roles, forbidden direct writes, invalid/deleted targets, stale versions, idempotent retries, all stages, trial routing, audit identity, payment isolation, cleanup exclusion, conversion, retention and reminder suppression. The mounted editor tests cover failed saves, server confirmation, concurrent updates, disabled records and stale query results. Existing ticket opening and follow-up tests remain green. The synthetic browser preview verifies partial-to-completed and trial transitions at desktop and 390px mobile width.

## Lapsed/expired status
Add Lapsed/expired as a terminal staff case status on every shared ticket dropdown. It leaves partial/active queues and remains accessible under Completed and All submissions. The same staff authorization, audit, stale-edit protection, retention and automation exclusions apply. Verify saving, reopening and queue classification, then correct the uniquely identified reported example before releasing the combined updates.
