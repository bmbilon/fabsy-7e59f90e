# FABSY WhatsApp phone inbox

## Outcome

Brett can read and answer messages sent to +1 825 793 2279 from Chatwoot on his iPhone. Customers continue using WhatsApp and the existing website links. Fabsy's AI answers eligible general questions until a human takes over.

## Clarifications

### Session 2026-09-11

- The user explicitly selected Fabsy's AI assistant for WhatsApp and specified the greeting: “Thanks for contacting us, how can I help?”
- The user subsequently requested personal access to answer messages from his phone.
- After the distinction between the native WhatsApp Business app and a separate inbox was explained, the user created a Chatwoot account and said “Chatwoot up and running - lfg.” This authorizes the Chatwoot integration and human takeover workflow.
- Chrome remains the user's chosen browser for account setup. Chatwoot is currently signed out there; sign-in is an operational dependency, not a change to the requirements.

## Requirements and acceptance

1. **Phone access:** a dedicated FABSY WhatsApp inbox in the user's Chatwoot account receives customer messages and staff replies as the existing business number. Verify incoming, manual outgoing and delivery on an authorized test conversation.
2. **AI ownership:** generate only for the configured inbox while a conversation is pending and has no human assignee. Opening, assigning, resolving or snoozing a conversation must suppress subsequent AI replies. Returning it to pending explicitly permits AI again. Validate ownership before and after generation and immediately before sending; document the provider's unavoidable already-in-flight send race.
3. **Authenticity and isolation:** verify signed Chatwoot webhooks, reject stale requests and wrong account/inbox IDs, and retrieve/verify the actual inbound Twilio message before sending its text to Vapi. Ignore outgoing, private and activity messages for generation. No changes to ordinary SMS or voice routing.
4. **Reliable handling:** acknowledge webhook receipt within Chatwoot's timeout after durable metadata-only enqueueing. Serialize conversation work, deduplicate provider messages, recover interrupted jobs and reconcile uncertain sends before retrying.
5. **Conversation boundaries:** preserve the requested greeting, same-language assistance, honest AI identification when asked, opt-out handling, rate/cost limits, and no legal advice or invented case access. Send text only to Vapi. Human requests and failures should surface the conversation to staff.
6. **Reply eligibility:** require an authoritative open WhatsApp service window before automated free-form replies. Do not send templates or initiate customer outreach as part of this change.
7. **Data handling:** Chatwoot holds the history and attachments necessary for staff support. Disclose that processing and US Cloud hosting, keep secure document intake guidance, and do not invent a retention period. Supabase's additional queue/control data contains operational identifiers, not message bodies or attachments.
8. **Release:** preserve the existing WhatsApp function for rollback, deploy and verify the new backend before switching the WhatsApp callback, publish matching privacy/contact copy through the existing release gate, and verify human takeover plus return to AI. No new subscriptions are purchased without a concrete user-approved charge.

## Scope boundaries

The existing Tawk.to website chat, Facebook/website channels already created in Chatwoot, phone service and ordinary SMS are outside this change. No private customer conversations are used as synthetic test fixtures. Chatwoot sign-in, account entitlements and mobile notification permission must be established through the user's account/device.

## Constitution application

This feature implements the existing constitution's mobile access, typed API design, privacy, error handling and user-value principles. Existing public page metadata and semantic structure remain intact. Customer conversations and internal webhook endpoints are not public SEO content and must not be indexed or included in analytics.
