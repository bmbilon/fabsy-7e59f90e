# Upload-first ticket intake — August 31, 2026

The English `/submit-ticket` entry starts with a photo/file prompt. Ticket type, ticket fields, optional details, licence-class selection, navigation and missing-field lists appear only once the current capture is ready for review. PDFs and unsuccessful scans open manual entry; unread values receive red borders and linked correction messages. Optional fields remain optional.

The captured file is tied to readiness. Replacing or removing it clears prior ticket-specific data, cancels stale OCR callbacks and invalidates cache hydration. Returning from a later step retains completed corrections without rescanning. Ticket-type, ownership and vehicle-seizure restrictions remain enforced. Payment execution and OCR service behavior are unchanged.

Validation: 12 mounted React integration scenarios with synthetic fixtures and blocked network; existing Photo Radar intake tests; TypeScript and scoped ESLint; desktop and phone visual checks. The initial screen has no ticket text fields; the primary upload controls fit within a 390 × 844 viewport. Synthetic partial-scan review shows red borders and accessible messages, and correcting a value clears its border/message. No ticket, payment, refund or customer notification was submitted during verification.

The new `test:ticket-upload` command runs in the guarded build. Production deployment is recorded separately after CI completes.
