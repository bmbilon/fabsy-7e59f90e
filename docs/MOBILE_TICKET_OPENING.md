# Mobile ticket opening

## Problem and behavior

The staff incomplete-intake button previously awaited `createSignedUrl` and then called `window.open`. Mobile browsers can lose the original tap's user activation during signing and block that new window without visible feedback. See [MDN's window.open guidance](https://developer.mozilla.org/en-US/docs/Web/API/Window/open#description).

The button now opens the signed file in the current tab. It displays “Opening…” with a disabled, busy button while signing; errors leave the staff member in the queue with a retryable button and a notification. Browser Back returns to the queue. Private storage, staff authorization, the 60-second link lifetime, and the site's no-referrer policy remain in force.

## Validation and release plan

- Verified the reported September 9 upload exists in private storage and its signed URL returns HTTP 200, `image/jpeg`, 2,530,428 bytes. No file contents, signed URLs or customer contact details were saved to this report.
- `npm run test:ticket-upload` passes, including the mounted staff-page regression test with delayed signing and pop-ups blocked. It also covers duplicate taps, signing errors, missing URLs and rejected network requests.
- The button fix has no backend changes. The only backend additions since the preceding frontend release are the upload-alert migration and worker, already deployed and verified in `TICKET_UPLOAD_ALERTS.md`.
- Publish the exact reviewed source through the existing backend-first, frontend-last GitHub workflow; verify the live staff page and same-tab file opening afterward.
