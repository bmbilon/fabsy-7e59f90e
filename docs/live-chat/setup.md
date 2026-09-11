# Fabsy live chat operations

Provider: Tawk.to. Property: Fabsy (`https://fabsy.ca`).

## Account setup

1. The site uses Fabsy property `6aa1fe19a9c2983442420e67`, widget `1k24ch563`. Public configuration is in `src/config/live-chat.ts`; no further embed code is needed.
2. Keep the JavaScript API signing key out of frontend code and public configuration. It is not required for anonymous website chat.
3. Install the official Tawk.to iOS or Android app and sign in to the same account. Select the Fabsy property and allow notifications. Set your availability to Online when able to answer.
4. Configure widget appearance: a compact bottom-right bubble, Fabsy colours, and no attention grabber or unsolicited popup. The website integration reserves extra space above the mobile call/purchase bar.
5. Use a plain greeting such as “Hi! Have a question about Fabsy? Send us a message.” Configure the offline form to request a contact email so staff can follow up. Do not claim a guaranteed response time unless you can meet it.
6. Keep AI Assist disabled unless separately requested. Direct ticket images, licence documents and payment details to the secure Fabsy intake/portal.

## Acceptance check

With an authorized test conversation, open Fabsy as a visitor, send a clearly labelled test message, receive it in the phone app and reply. Confirm that the visitor receives the reply and that history is still available after navigating and refreshing. Repeat while the phone is locked to check notification delivery. Check the offline form separately; successful widget loading alone does not verify delivery.

Returning anonymous visitors normally retain their chat in the same browser/device while the necessary cookies/storage remain available. Clearing storage, using private browsing or changing devices can create a new visitor. Brett's signed-in staff inbox is separate from anonymous visitor identity.

## Sources

- [Website installation](https://help.tawk.to/article/adding-a-widget-to-your-website)
- [JavaScript API](https://developer.tawk.to/jsapi/)
- [Mobile and desktop placement](https://help.tawk.to/article/customizing-your-widget-placement-with-the-javascript-api)
- [Cookies and browser storage](https://help.tawk.to/article/what-are-tawkto-cookies-and-what-do-they-do)
- [Official apps and live-chat features](https://www.tawk.to/products/live-chat/)

## Current status

The shared app shell shows a compact chat button. The provider loads only after the visitor clicks it; greetings and quick replies appear inside the opened chat. Minimizing chat hides the provider's launcher and message previews, returning to the compact button. Replies received while closed add a small unread dot without reopening chat. Once loaded, the same widget retains its conversation across public-page navigation. Entering intake, contact forms, portals, payment links or admin starts an untagged document before exposing private page content. Public pages with unknown query data are also excluded. Chat does not identify visitors from their Fabsy account. A blocked widget exposes a compact direct-chat link, and prerendered crawler snapshots never initialize chat.

The English privacy disclosure now describes the chat provider, history and browser storage. Only that source-document fingerprint was deliberately reconciled in the existing locale publication records; translated bundles, owner authorization, indexing authorization, reviewer fields and service-readiness settings were preserved. This is an operational privacy disclosure for the requested integration, not a claim of fresh translation or legal review.

The real widget has been verified locally, including public navigation and private intake suppression. Automated tests cover singleton loading, delayed callbacks, failed loading, route boundaries and receipt isolation. Released on September 9, 2026 at https://fabsy.ca; see `release-verification.json` for the exact Cloudflare deployment, source commit and checks. The live widget and private intake isolation were verified after publication. Phone login, push delivery, two-way replies and Tawk dashboard appearance/offline settings require Brett's account and have not been verified by this task.
