# Photo upload and consent

## Principles and requirements

The English intake is one photo/PDF picker, one unchecked “I consent for Fabsy to fight my ticket” checkbox, and one Submit button. Remove the ticket-type, identity, contact, licence, ticket-number, optional-details, narrative and referral-code fields from the initial form. Missing information never blocks receipt of a ticket. Existing link-based referral attribution still travels with the upload.

Above the picker, keep “How to properly capture an image of your ticket” collapsed by default. Expanding it reveals the previously created photo checklist, four capture steps and example illustration. Opening the guidance is optional and adds no submission requirements.

The homepage embeds the same upload-and-consent form in its hero, including the post-submission contact screen. The free assessment tool sits below the comparison and outcome sections. Embedded form headings use level two and preserve homepage anchor scrolling. The homepage mobile shortcut links to the upload form.

Save the private ticket and affirmative consent before showing “Success, Your ticket has been received”. The success screen then presents “Provide me with updates”, an email field, a phone field and an Accept button. Either contact method, or both, is accepted. A contact-save failure must leave the ticket receipt intact and retry only the contact save.

Preserve React/TypeScript, private Supabase storage, existing service prices and checkout authorization. Do not infer consent from file selection, OCR, cached data or a previous ticket. Do not invent names, licence numbers, emails, signatures or ownership answers.

## Clarifications resolved

Brett explicitly removed all identity/contact questions from the upload screen and selected email and/or phone collection after a successful receipt. This supersedes the earlier implementation's required name, email, phone, ticket number and DL. No customer-entered DL or DOB is required in the new flow.

The consent is the submitter's electronic acceptance for the person identified on the attached ticket. The record binds the acceptance to the submission ID, private ticket path, exact wording/version and server timestamp. It records an identity awaiting review rather than a fabricated typed signature. Existing prescribed-government-form invitations and localized typed-consent journeys remain available.

OCR runs after receipt, using a [Supabase background task](https://supabase.com/docs/guides/functions/background-tasks). PDFs, unreadable images, uncertain classifications and seizure matters go to staff review. OCR never links the upload to an existing client based on an unverified licence/name. A provisional client has an actual NULL licence and empty unknown fields. Customer contact details are saved separately and are not overwritten by OCR.

## Plan and tasks

- [x] Reduce the English upload screen to file, checkbox and Submit.
- [x] Restore the existing capture instructions and illustration inside a single collapsed guide above the picker.
- [x] Bind versioned acceptance to the submitted file without requiring typed identity fields.
- [x] Prepare provisional records atomically with a private capability and stable retry identity.
- [x] Save the file and accurate consent PDF before returning success; keep OCR out of the critical path.
- [x] Collect email and/or phone on the confirmation screen without resubmitting the ticket.
- [x] Process readable fields in the background and mark missing/uncertain details for staff follow-up.
- [x] Expose received unpaid photo submissions in case management, with missing-data labels.
- [x] Preserve checkout verification and require a real ownership answer for camera notices before payment.
- [x] Verify failure/retry paths, existing journeys, database permissions and mobile layout.

## Consistency analysis

The short flow currently serves English. Existing localized journeys retain their reviewed-language gate. Existing manual invitations retain actual typed signatures.

Consent succeeds independently of scanning, contact collection and payment. Checkout is available after extracted name, ticket number and type are ready and an email has been provided. A camera ownership question is deferred until checkout. Phone-only receipts and tickets that need manual clarification remain received cases for staff follow-up; they do not open an unverified checkout. Existing post-payment pro-driver verification remains available; its optional pre-upload fields were removed with the rest of the details section.

## Release verification — 2026-09-20

The release is based on current production main. It preserves signed completion links, resume-link capability rotation, measurement privacy boundaries, current refund terms, translated journeys and the current admin dashboard.

- Photo intake UI: 16 passing checks for receipt, retries, contact choices, fresh consent and checkout reuse.
- Backend: 17 passing handler, PDF and consent tests, including existing localized consent PDFs. Edge-function type checks pass.
- Homepage: 49 visual snapshot guardrail checks and 11 conversion checks pass for the upload-first layout.
- Both migrations and synthetic RPC assertions passed against the live schema in a rolled-back transaction. No test records were retained.
- Focused ESLint has no errors; existing admin hook dependency warnings remain. The normal TypeScript target still reports existing ES2020 `replaceAll` incompatibilities; validation also runs with ES2021 library definitions.
- Full legacy-flow and release checks run in CI before frontend deployment. No production ticket submission or payment is used for verification.

## Deployment order

Apply only `20260920120000_combined_ticket_consent.sql` and `20260920130000_photo_only_intake.sql`. Deploy `photo-ticket-intake`, `generate-consent-form`, `ocr-ticket` and `create-payment` with their shared dependencies. The existing `submit-ticket` contract is unchanged. Publish the frontend through the backend-first Cloudflare Pages workflow after its required checks pass.
