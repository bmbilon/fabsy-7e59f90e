# Ticket photo guidance

## Constitution
Help customers provide readable original tickets using the existing upload flow. Keep guidance short, usable on mobile, and accessible. Use a generic illustration; never publish the customer's example photo or details. Preserve the existing manual fallback for faint originals and the current upload, OCR, consent and payment behavior.

## Specification and clarification
The user identified repeated crumpled, dim, cropped ticket photos and asked for instructions showing a flat ticket with the ticket number, offence and other details legible. Show four practical steps before choosing a photo, explicitly name the required readable details, and offer an expandable generic framing illustration. After an image is selected, remind the customer to check readability and retake a poor photo. PDFs remain supported. This adds guidance rather than a new compulsory confirmation or an automated quality assessment.

## Plan and consistency check
Use one shared guide and photo-check message in the main ticket capture, free ticket review and localized/replacement upload screens. English guidance is explicitly marked `lang="en"` and `dir="ltr"`, consistent with existing English operational controls in the localized journey; no translation is presented as newly reviewed. Use a native keyboard-accessible disclosure for the illustration, with text alternatives and reduced-motion support.

## Tasks
- [x] Shared instructions, generic framing example and selected-photo reminder
- [x] Integrate with the existing upload entry points
- [x] Existing upload regression checks and mobile/desktop visual verification
- [ ] Deploy through the existing frontend release workflow and verify the live guide

The visible tips cover flatness, light, full framing and focus. The required-details line covers ticket number, offence/section, dates, fine and court details. The faint-original note preserves a usable path for damaged source documents.

## Verification
`npm run test:ticket-upload` passed the existing upload/capture/state, helper/cache/date and admin ticket-opening regressions. Browser checks covered the main intake and free-review dialog at 390px and 1280px, expanded illustration readability, disclosure open/close, and the Arabic intake at 390px with English language/direction annotations and no horizontal overflow. Guide spacing uses explicit Tailwind values where the existing theme overrides numbered margin/padding utilities. No real ticket was uploaded during visual checks. Production release evidence will be recorded on the pull request after the deployment gate and live checks pass.
