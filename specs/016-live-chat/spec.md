# Persistent live chat

Created: 2026-09-09. Provider selected by Brett: Tawk.to (free live chat).

## Feature principles / constitution

Use the existing React/Vite app and Cloudflare production hosting. Connect the real Fabsy Tawk.to property; do not build a separate message store or simulate delivery. Keep the chat instance outside page routes, load the provider asynchronously, and preserve unrelated workspace changes. Keep private client/admin pages and sensitive intake content out of the integration. Public widget identifiers may ship to the browser; the JavaScript API signing key must not. The existing public pages retain their SEO metadata and content.

## Specification and clarification

- Brett wants website visitors to chat with him and wants to answer from his phone, similarly to Shopify chat.
- Brett selected Tawk.to and created the enabled Fabsy property at `https://fabsy.ca`; screenshots show property ID `6aa1fe19a9c2983442420e67`.
- Persistence means the same chat remains available during public-page navigation and refreshes, with Tawk.to retaining conversation history. Anonymous visitor continuity depends on the same browser/device and retained provider cookies; cross-device visitor identity is not part of this change. Brett's authenticated mobile inbox supplies staff history and replies.
- Use the native Tawk.to widget and inbox, with its online/offline status, message delivery and unread indicators. Do not activate an AI agent or promise that staff are always online.
- The launcher must clear the mobile sticky call/purchase bar. No automatic popup on arrival is added by the app.
- Exclude admin, client portals, payment/consent links and unknown private routes. Do not identify visitors from Supabase or send ticket, form or payment data to the chat API.
- Brett supplied the complete embed URL: `https://embed.tawk.to/6aa1fe19a9c2983442420e67/1k24ch563`. The official endpoint returned HTTP 200 and the correct property/widget identifiers.
- Staff account setup, mobile login and notification permissions belong to Brett. The browser API key shown in the account screenshot is not needed for this anonymous widget integration and is not copied into source.

## Technical plan

1. Validate the real embed URL and keep public widget identifiers in a small configuration module.
2. Mount one lifecycle controller inside the router but outside its page routes. Load the official script asynchronously; preserve the instance across public navigation and handle private-route transitions and load failure.
3. Apply provider-supported desktop/mobile positioning before loading the script. Describe chat processing and browser persistence in the privacy policy.
4. Verify TypeScript, focused lint, production compilation and desktop/mobile behavior. Check public navigation, reload, private-route suppression, blocked script behavior and duplicate initialization.
5. Test a real message exchange only when authorized; record mobile push delivery as unverified until Brett confirms it on his phone.

## Tasks and consistency analysis

- [x] Provider selection and real property creation confirmed.
- [x] Obtain and validate the exact widget URL.
- [x] Implement lifecycle, route handling and mobile positioning.
- [x] Update privacy disclosure and staff setup notes.
- [x] Run local checks and real-widget browser verification (desktop and 390×844 viewport, public persistence and secure intake isolation).
- [x] Deploy the reviewed change and verify the production widget.
- [ ] Brett confirms mobile login, notifications and a two-way test.

Coverage review: visitor messaging, history and the staff phone app are supplied by Tawk.to. The application work is the shared widget lifecycle and its placement. No database migration or new backend service is needed. Vercel Marketplace discovery returned only email for messaging; production remains on Cloudflare. Browser blocking and deleted cookies can affect widget availability/history. A widget that renders is not proof of phone notification delivery.
