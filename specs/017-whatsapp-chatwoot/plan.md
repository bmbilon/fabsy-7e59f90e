# Implementation plan

## Architecture

Twilio WhatsApp delivers into a dedicated native Chatwoot Twilio inbox. A dedicated Chatwoot AgentBot sends signed events to `chatwoot-vapi-webhook`. The receiver queues identifiers and starts a worker after acknowledging receipt. `chatwoot-vapi-worker` verifies the inbound message through Twilio, checks current Chatwoot ownership and reply eligibility, calls the existing dedicated Vapi assistant, and sends the answer through Chatwoot so staff can see it. A database recovery schedule handles abandoned work. Secrets stay in server configuration/Vault.

The currently deployed `whatsapp-vapi-webhook` remains unchanged and available for rollback. Only the WhatsApp sender callback changes at cutover. Human takeover uses Chatwoot's pending/open states and assignment controls; state changes invalidate work in progress. Since Chatwoot offers no atomic conditional-status send API, a message already being submitted can still complete during takeover. The final authoritative check narrows this interval; the UI guide will describe it accurately.

## Work streams

- Backend: signed receiver, authenticated worker, metadata-only queue/leases, provider adapters and tests.
- Account setup: inspect Chatwoot plan and existing inboxes; create only the dedicated WhatsApp inbox/AgentBot; configure secrets and staff membership; verify notifications and takeover.
- Website: revise Contact and Privacy Policy for human WhatsApp replies and Chatwoot processing; update only the corresponding seven locale source fingerprints.
- Release: scoped checks and independent review, selective migration/function deployment, isolated test where possible, controlled callback switch, live acceptance and existing exact-commit website deployment.

## Evidence and constraints

- AgentBot lifecycle: https://www.chatwoot.com/hc/user-guide/articles/1677497472-how-to-use-agent-bots
- Webhook transport/signing: https://github.com/chatwoot/chatwoot/blob/develop/lib/webhooks/trigger.rb
- Create messages: https://developers.chatwoot.com/api-reference/messages/create-new-message
- Mobile app: https://www.chatwoot.com/mobile-apps
- Cloud retention: https://www.chatwoot.com/fair-use-policy

Public source does not establish Twilio signature validation in Chatwoot's native callback. The bot therefore validates input against Twilio's authenticated message API rather than trusting body/address claims in an inbox event alone. Chatwoot's own ingress controls are provider-managed. Its native inbox can store inbound media; the bot must not forward it to Vapi.

## Validation

Exercise HMAC/timestamp/size/account/inbox rejection, actual Twilio address and SID binding, duplicate and concurrent events, takeover before/during generation, STOP/START, media exclusion, closed reply windows, provider timeouts, ambiguous sends and retry recovery. Verify SQL privileges/RLS and metadata-only storage. Re-run existing WhatsApp tests unchanged. Compile/lint the changed frontend and validate locale publication fingerprints. Finish with a real authorized WhatsApp conversation visible in Chatwoot, a staff reply and delivery, AI suppression during takeover and explicit return to AI.

## Analysis before implementation

All eight requirements map to tasks below. The architecture preserves the existing runtime for rollback and does not require a number migration. Account IDs, tokens, plan entitlement and mobile login remain configuration dependencies. No requirement promises impossible atomic coordination with an external provider or unverified data deletion. Implementation must report those practical limits rather than weaken authentication, duplicate prevention or ownership checks.
