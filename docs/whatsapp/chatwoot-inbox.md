# Fabsy WhatsApp staff inbox

## Scope and status

Brett requested personal replies from his phone and chose Chatwoot while retaining Fabsy's Vapi AI assistant. This integration is limited to WhatsApp on `+18257932279` and the existing website contact link. It does not change the number's voice or SMS routing, replace the Tawk.to website widget, or authorize unsolicited messages.

This is the setup and release handoff, not a deployment receipt. Chatwoot account access, its subscription plan, live routing and mobile acceptance remain to be verified before activation.

## Routing and mobile operation

Use Chatwoot's native Twilio WhatsApp inbox for inbound messages and staff replies. Connect a custom AgentBot to the existing Vapi assistant: Twilio delivers the customer's message to Chatwoot, the AgentBot processes eligible text through Vapi, and the resulting reply returns through Chatwoot and Twilio. The former direct Twilio-to-Vapi handler must not also answer the same incoming message.

Observed during setup on September 11, 2026: creating the native Twilio WhatsApp inbox in Chatwoot Cloud automatically changed the WhatsApp sender's incoming-message callback to `https://app.chatwoot.com/twilio/callback`. The setup UI explicitly reported automatic webhook configuration. This differed from the public source examined, so inbox creation must be treated as a live routing change. Record the sender's callback URL and method before creation, inspect them directly in Twilio afterward, and restore the existing `whatsapp-vapi-webhook` with method `POST` until the new bot is ready for controlled activation. During this setup, the callback was restored and verified through Twilio's API; the parent number's voice, SMS and status callback settings remained unchanged. Verify these settings again at activation rather than relying on the setup UI or public source alone.

Treat `pending` as AI-controlled and `open` as human-controlled. Taking over a conversation in the Chatwoot mobile app must move it to `open`, prevent new AI generation and suppress completed responses that have not been submitted. Chatwoot's API cannot atomically cancel an outbound request already in flight, so a reply being submitted during takeover may still arrive. The final ownership check narrows this interval but cannot guarantee zero late messages. To deliberately return a conversation to AI, first clear its human assignee, then set it to `pending`; `pending` alone is insufficient while a person remains assigned. The explicit pending transition must show no human assignee to release the recorded hold. A mobile return-to-bot action may perform both changes, but its actual behavior must be verified before relying on it. Confirm the resulting status and ownership before expecting AI replies to resume.

Staff sign in to the same Fabsy Chatwoot account, select the WhatsApp inbox and enable notifications. Human availability does not guarantee an immediate reply. Keep the neutral greeting, truthful AI identity when asked, secure-document directions and STOP/START handling. Never send ordinary automated replies while a sender is opted out or while a person controls the conversation.

## Privacy operations

Chatwoot Cloud stores conversation history, contact identifiers and inbound attachments, including attachments customers send despite the secure-intake reminder. Authorized staff can access these records through the dashboard and mobile app. Keep sensitive ticket, licence and payment documents in Fabsy's secure intake or client portal. Media must remain excluded from Vapi processing.

Chatwoot documents United States hosting. Its workspace history retention depends on the account plan; verify the active plan before promising a duration. Workspace removal, exports, backups and copies retained by Meta/WhatsApp, Twilio or Vapi are separate concerns. Resolving a conversation is not deletion. Route access or deletion requests through Fabsy's privacy contact and check each affected provider rather than treating a Supabase purge as transcript deletion.

The existing Supabase bridge retains operational metadata rather than message bodies or raw contact details. Its event expiry, Vapi continuity-pointer expiry and opt-out suppression records do not set Chatwoot transcript retention. New integration state must follow the same minimum-data approach.

The Contact and English Privacy Policy copy disclose staff replies, Chatwoot history/contact/media storage and US processing. Only the Privacy Policy source-document fingerprint is deliberately reconciled in the seven existing locale publication records. Preserve translated bundles, owner and indexing authorization, reviewer fields and service-readiness settings. This operational update does not claim fresh translation or legal review.

## Release acceptance

Before routing live visitors to the staff inbox, verify an authorized WhatsApp test end to end: one AI reply, mobile notification, human takeover, a reply from the phone, suppression of new AI generation and responses not yet submitted, and deliberate return to AI. Record the possible completion of an outbound request already in flight during takeover. Verify duplicate deliveries, STOP/START and attachment handling. Confirm the existing voice and SMS configuration remains unchanged. Record backend deployment and live acceptance before the gated frontend release; do not claim that source checks alone verify message delivery.

Scoped source checks are `node scripts/validate-i18n.mjs`, `node scripts/test-public-language-flow.mjs`, focused ESLint and the app TypeScript check. Browser and mobile acceptance are recorded separately by the release owner.

## Provider references

- [Chatwoot Cloud hosting and plans](https://www.chatwoot.com/pricing)
- [Workspace history retention](https://www.chatwoot.com/fair-use-policy)
- [Chatwoot privacy and deletion requests](https://www.chatwoot.com/privacy-policy)
- [Conversation lifecycle](https://www.chatwoot.com/hc/user-guide/articles/1677229173-lesson-1-your-first-chatwoot-conversation)
- [Message and attachment deletion API](https://developers.chatwoot.com/api-reference/messages/delete-a-message)
