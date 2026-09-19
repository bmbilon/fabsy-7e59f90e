# Paid acquisition intake and operational handoff

## Requirements and governing principles

Implement the approved conversion improvements without changing the CA$140 campaign budget. Keep contact, ticket, authorization, payment and case records connected in Supabase. Preserve consent, private-page isolation, existing role checks, case deadlines and the distinction between selecting a local file and uploading it.

1. A new visitor can choose a local ticket photo or PDF before entering contact details. No file, OCR request or new lead is sent before the existing contact and permission checks succeed. A saved draft resumes through the existing capability-based flow.
2. Camera intake skips unnecessary optional narrative navigation while retaining the information required by the existing backend and authorization process.
3. The homepage and offer pages show a scrolling strip of existing permissioned testimonials, accurately labelled by client, location and matter, plus a route to the Fabsy team. Include explicit pause, hover/focus pause, hidden duplicate content for assistive technology, and a static reduced-motion presentation. No new outcome or response-time claims.
4. Consented Photo Radar landing and engagement events work through the browser, Edge Function, database and acquisition report.
5. Audit and repair affected admin, Vapi, Twilio, email and phone notification paths. Retain configured recipients; inspect delivery evidence without contacting real clients or exposing message content/secrets.

## Clarifications resolved from existing context

The user authorized implementation and all affected connector wiring. Existing notification settings remain authoritative. No new provider, spend increase, human availability promise or removal of required legal identity data is implied. Email/SMS delivery to real recipients is distinct from mocked integration verification; report that distinction in release evidence.

## Implementation plan and tasks

- Frontend: select locally, persist one authorized contact/draft, continue existing upload; preserve reload/retry/back behavior and localization. Shorten the camera step sequence.
- Landing pages: reusable source-backed feedback adjacent to the CTA and explicit contact route.
- Backend/admin: trace source records through queues, provider calls, status callbacks and admin visibility; fix confirmed defects with retries and idempotency intact.
- Verification: meaningful frontend/browser, shared contract and disposable-database tests, plus read-only live connector inventory. Test errors, duplicate actions, consent refusal and private boundaries.
- Release: reviewed commit; apply additive database changes, deploy affected Edge Functions, verify backend, then deploy frontend. Verify the public result and record versions and remaining delivery limits.

## Consistency check

No camera-only field relaxation is valid unless checkout, submission, consent and admin handling all accept it. Local file selection must not count as a completed upload or paid conversion. Changing navigation must not create duplicate leads, upload notices or purchases. Operational notifications and consented advertising measurement remain separate.

## Additional testimonial copy awaiting factual details

The user supplied these proposed quotes. They are not published by this change. The first name/last initial, city/zone, offence, accuracy of each outcome and publication permission have been requested. Until supplied, the marquee uses the three existing permissioned client records.

- “Fabsy got my $600 ticket and 6 demerit points thrown out completely. They are amazing.”
- “Best customer service and communication. Fast replies all the time and easy to get call back anytime I needed one.”
- “My ticket got cut in half and fewer demerit points thanks to Fabsy.”
