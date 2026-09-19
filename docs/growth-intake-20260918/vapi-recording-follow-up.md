# Vapi recording compatibility follow-up

Vapi now requires a private API key when retrieving recordings from its artifact API. The API returns a short-lived signed download URL. Direct private-storage URLs are not reliable recording links. [Official retrieval documentation](https://docs.vapi.ai/assistants/retrieve-call-artifacts)

The audited live `vapi-call-webhook` v28 matched the release checkout and fetched webhook-provided `recordingUrl` directly without authentication. A read-only 30-day aggregate showed 12 call records, five stored recording copies and seven private recording URLs without a copy; the latest missing copy was September 16. These counts establish incomplete archival but do not establish every failure's cause.

This isolated change constructs `GET https://api.vapi.ai/call/{callId}/mono-recording`, authenticates only that canonical endpoint, and downloads the returned HTTPS location without the Vapi credential. Each request and body read has a 15-second timeout. Additional storage redirects are rejected. Fetch errors report coarse codes instead of signed URLs or provider error bodies. The webhook also recognizes `artifact.recording.mono.combinedUrl` and only offers a successfully signed Supabase recording link in its notification; retrieval/signing failure produces a clear status message.

Call persistence, Resend transport, primary/backup email routing and the separate Twilio voice notification worker are unchanged. Existing shared `email-signature.ts` and `resend-email.ts` match the downloaded live dependencies. The old dirty-main recording helper was inspected as a reference, but no dirty files were copied; its broader index also switched email providers and was intentionally excluded. This change does not repair existing missing copies or replay notifications.

## Validation

- `deno test --no-config --no-npm supabase/functions/vapi-call-webhook/recording.test.ts`: seven tests passed without network permission, covering canonical authentication, credential-free redirect, direct responses, WAV/MP3 detection, missing keys, unsafe IDs, HTTPS-only targets, provider failures and notification output.
- `node scripts/test-vapi-recording-webhook.mjs`: actual bundled handler passed against local Vapi, Storage, database and Resend mocks. Checks nested/legacy artifacts, successful copy, unavailable recording, signing failure, missing key, original recipients and absence of raw private links.
- `deno check --node-modules-dir=none --frozen supabase/functions/vapi-call-webhook/index.ts`: passed.
- New helper/test lint passed. The unchanged legacy `body: any` declaration in the handler still triggers its existing `no-explicit-any` lint error. No unrelated schema refactor was included.
- `.github/workflows/vapi-recordings.yml` runs both regression suites without provider credentials. No real recordings were downloaded and no calls, emails or other notifications were sent during implementation.

## Safe release sequence

1. Keep this follow-up separate from the already committed growth release. Review only the handler's small integration diff, recording helper/tests, integration test, dedicated workflow and this note.
2. Confirm runtime `VAPI_PRIVATE_API_KEY` is present and belongs to the organization that owns the calls. An authenticated read-only artifact API request can verify access without invoking the notification webhook or sending a message. Do not print or persist the returned signed URL.
3. Verify the current live handler has not changed since the v28 source comparison. Deploy only `vapi-call-webhook` plus its new recording helper; no database migration, webhook credential change, gateway JWT change or separate voice-worker deployment is required.
4. Verify deployed source/version, then check the next naturally occurring completed call for a stored recording copy. Do not synthesize an end-of-call webhook or replay historical webhooks as a test: the existing handler sends an email on those requests.

The legacy callback's inbound authentication and email retry behavior are outside this recording-only change. Pair any later authentication changes with the actual Vapi server credential configuration before deployment.
