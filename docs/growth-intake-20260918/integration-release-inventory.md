# Growth intake integration and release inventory

Read-only inspection on 2026-09-18/19 UTC. No customer messages, transcripts,
recordings, ticket files, or contact records were read. No notification, call,
provider change, migration, deployment, or commit was triggered by this audit.
Production can change after these observations; repeat the release readbacks.

## Confirmed production baseline

- Supabase project: `gcasbisxfrssonllpqrw`.
- PR 53 was open at `39ee5b0ca5bbb203eda3b951567e7a17c9389731`; its build check
  succeeded in [run 35407231239](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/35407231239).
- Main was `227849cd13e1d504e06a492583bbbbbf2afde07d` (generated snapshots).
- Latest Pages production deployment was `25ffaffb-eaf3-476d-b417-f08f0fec7046`,
  [deployment URL](https://25ffaffb.fabsy-9qa.pages.dev), source
  `864b5fc110090d4eb89f76edcb989a2c51395b1b`.
- `FABSY_FRONTEND_DEPLOY_COMMIT` still pinned that deployed source. Its successful
  manual [build/deploy run](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/35394476771)
  proves the current repository workflow is usable.
- Measurement runtime variables for Google, Meta, and OpenAI Ads were enabled;
  WhatsApp was enabled. No settings were changed.
- Migrations `20260918160000_meta_fbc_click_id_length` and
  `20260918170000_paid_funnel_verification_filter` were already applied.
- PR 53's `20260918180000_paid_funnel_photo_radar` was **not** applied.
- `20260918190000_voice_notifications` was already applied remotely, although
  its source and worker are absent from this checkout/main. Preserve that
  independent integration; do not deploy an indiscriminate migration/function set.

## Active functions

These are live versions, not a claim that every current branch edit is deployed.
All entries have `verify_jwt=false` except the Meta worker. The upload, abandoned,
portal, and voice workers authenticate their cron/service credentials themselves.

| Function | Version | Last updated UTC |
|---|---:|---|
| `record-funnel-event` | 12 | Sep 06 22:43 |
| `paid-funnel-report` | 13 | Sep 13 13:08 |
| `ticket-intake-draft` | 13 | Sep 18 20:54 |
| `submit-ticket` | 178 | Sep 06 00:13 |
| `create-payment` | 206 | Sep 18 20:54 |
| `idr-payment-webhook` | 33 | Sep 15 15:20 |
| `meta-capi-worker` | 13 | Sep 18 20:53 |
| `send-notification` | 205 | Sep 15 21:46 |
| `process-ticket-upload-alerts` | 7 | Sep 15 21:45 |
| `process-abandoned-ticket-emails` | 7 | Sep 15 21:45 |
| `process-portal-activity` | 6 | Sep 15 21:45 |
| `sms-to-email` | 73 | Sep 15 21:46 |
| `vapi-call-webhook` | 28 | Sep 15 21:46 |
| `whatsapp-vapi-webhook` | 14 | Sep 11 19:38 |
| `chatwoot-vapi-webhook` / `chatwoot-vapi-worker` | 4 / 4 | Sep 11 22:25 / 22:26 |
| `process-voice-notifications` | 4 | Sep 18 19:04 |

Downloaded live upload-alert, SMS, and Vapi webhook sources into a temporary audit
folder: their entrypoints and shared internal-recipient code byte-match the branch.
The voice worker uses a separate deployed source unavailable in this branch.

## Email, draft, and staff follow-up wiring

- Confirmed draft triggers: `queue_confirmed_ticket_upload_alert` and
  `queue_abandoned_ticket_email`. Submission conversion and portal-activity
  triggers are also installed.
- Upload alerts, abandoned reminders, portal activity, voice notifications, and
  Chatwoot recovery have active once-per-minute cron jobs. Each had 120 successful
  cron executions in the two-hour readback ending Sep 18 23:55 UTC. Cron success
  proves the SQL enqueue ran; it alone does not prove downstream delivery.
- Vault's project URL matches this Supabase project. The runtime `IDR_CRON_SECRET`
  fingerprint matches the Vault cron secret. No secret values are recorded here.
- Abandoned reminders were enabled, activated Sep 11 17:33 UTC.
- Aggregate outbox readback: upload alerts 6 sent, abandoned emails 3 sent, voice
  notifications 2 sent; each row has a provider ID. No pending/retry backlog was
  present. These are provider acceptance facts, not inbox placement claims.
- The deployed internal-email policy is primary `h***@fabsy.ca`, backup Bcc
  `b***@execom.ca`. The latest upload alert (Sep 15 21:55 UTC) used this routing;
  older already-sent rows predate that policy and must not be resent.
- Upload/abandoned/internal notification mail uses Resend. Voice missed-call and
  voicemail mail uses Google Workspace to `h***@fabsy.ca`, with an idempotent
  queue and provider reconciliation. Both provider credential sets are present.
- A `TICKET_UPLOAD_ALERT_TO` secret exists, but current upload-alert code uses the
  shared fixed recipient policy; the secret name is not proof of its active use.

## Phone, Twilio, and Vapi

- Twilio main number `***2279` has voice, SMS, and MMS capabilities.
- Its voice URL is `https://fabsy-voice-forwarding-5248.twil.io/fabsy-inbound`.
  Its status callback is the same host's `/fabsy-call-status`; both use POST.
- Production Twilio build `ZB0e3a7f16385f7b714e3b793450dce026` contains protected
  inbound, accept, whisper, language-route, dial-result, voicemail, and status
  handlers; `/voice-notifications` is private. The private helper uses a service
  credential to call Supabase RPC `enqueue_voice_notification`.
- Forwarding destination is `***5353`; caller ID is `***2279`. Production also has
  Vapi inbound/SIP configuration and a voicemail greeting. These values were not
  changed. Do not replace this newer voice setup with older repository scripts.
- Incoming SMS currently routes to `https://api.vapi.ai/twilio/sms`, **not directly**
  to the repository's `sms-to-email` function. The older Twilio SMS/email service
  is present but is not this number's active SMS URL.
- Runtime `TWILIO_ACCOUNT_SID` fingerprint matches the verified account. However,
  `TWILIO_PHONE_NUMBER` matches neither owned number (`***2279` or `***0987`),
  including simple newline/without-plus variants. Resolve the sender configuration
  before enabling the new upload SMS channel; secret presence alone is insufficient.
- Supabase has Vapi, Twilio, WhatsApp, and Chatwoot secret names required by the
  existing code. Their presence does not verify an assistant configuration or a
  delivery. The release owner verified the existing Vapi browser configuration: main SMS
  is enabled and assigned to Fabsy Intake v5, whose server URL points to
  `vapi-call-webhook` with only `end-of-call-report` selected and no configured
  authentication. WhatsApp uses its separate v4 assistant. The Supabase handler
  ignores chat events, so that call-report configuration does not establish
  staff capture of incoming SMS.
- A bounded last-30-days metadata read returned three main-number messages:
  Sep 11 inbound `***5353` to `***2279` was received, its same-second
  `outbound-reply` was delivered, and a Sep 5 `outbound-api` message to `***5353`
  was delivered. All error codes were null. This proves a historical two-way SMS
  transport exchange, not AI authorship or current Vapi support. No message
  bodies were output or stored. See `twilio-message-metadata-redacted.json`.
- Current [Vapi inbound SMS documentation](https://docs.vapi.ai/phone-numbers/inbound-sms)
  limits that feature to US Twilio numbers and US-to-US messaging. The Canadian
  route should therefore not be presented as verified Vapi SMS intake merely
  because its toggle is enabled or a historical Twilio reply was delivered.
- Live `sms-to-email` and `vapi-call-webhook` match the repository and contain no
  explicit provider signature/secret validation. This is a confirmed handler
  gap, but changing authentication needs the actual sender/callback contract so
  that a new check does not silently break production. Twilio voice callbacks
  above already use protected Twilio Functions and are a separate path.

## Exact release path

1. Freeze the final reviewed source commit and rerun relevant local tests. For
   PR 53 these include both PostgreSQL funnel migration suites and the browser
   attribution test. Include the new intake/backend agent's tests for its changes.
2. Read live migration history again. Apply only the named approved migrations;
   do not blindly push every local migration or mark the independent live voice
   migration reverted. PR 53 needs only `20260918180000` on the observed baseline.
3. For targeted migration execution, the already-authenticated route is:

   ```sh
   supabase db query --linked --project-ref gcasbisxfrssonllpqrw \
     --file /absolute/path/to/reviewed-release-transaction.sql -o json
   ```

   Prepare that temporary SQL from the exact committed migration, preserving its
   `BEGIN` and `COMMIT`, and insert its `supabase_migrations.schema_migrations`
   history row **before** the final `COMMIT` in the same transaction. Record the
   exact version, name, and original SQL in the statements array. Refuse if that
   version is already present; do not use `ON CONFLICT DO NOTHING` to hide drift.
   Verify schema/function contracts and the history row afterward. This avoids
   applying unrelated migrations and avoids marking unapplied DDL as complete.
4. Deploy the changed backend functions after their schema. PR 53's changed
   `_shared/funnel-measurement.ts` is imported by `record-funnel-event` only:

   ```sh
   supabase functions deploy record-funnel-event \
     --project-ref gcasbisxfrssonllpqrw --use-api --no-verify-jwt
   ```

   Preserve each changed function's existing JWT/custom-auth contract. Include
   additional intake functions only where the final diff requires them. Do not
   redeploy all functions. If payment code changes, signed-webhook compatibility
   must be ready before its checkout producer.
5. Validate the live schema and deployed parser before exposing new browser
   events. For notification additions, verify worker auth, empty/controlled
   outbox behavior, opt-in/routing, retry fencing, and the prospective activation
   cutoff. An authorized delivery drill should use an explicit test destination;
   never replay old customer rows to prove deployment.
6. Merge the reviewed release and use the existing backend-first frontend gate.
   From the exact final main commit, after the backend readback:

   ```sh
   gh variable set FABSY_FRONTEND_DEPLOY_COMMIT --body "$release_sha"
   gh workflow run build.yml --ref main \
     -f deploy_frontend=true \
     -f backend_release_commit="$release_sha" \
     -f backend_first_confirmation=BACKEND_READY_FRONTEND_LAST
   ```

   This workflow performs the normal production build and `wrangler pages deploy
   dist --project-name=fabsy --branch=main`. It rejects an advanced main head or
   stale pin. Ordinary pushes and PR builds do not deploy the frontend. Never use
   synthetic `build:evidence` output as the production bundle.
7. Wait for the exact workflow run, confirm the Pages production source matches
   the reviewed SHA, then inspect canonical `/photo-radar`, relevant landing and
   intake routes, and same-origin asset bytes. Run consented and declined paths.
   Use the reserved QA campaign marker for measurement-only drills, and verify
   public checkpoints appear without private-page leakage or customer messages.
8. Read back migration history, function versions, worker auth, active schedules,
   and aggregate queue outcomes. Record what was verified separately from any
   unperformed provider delivery or real paid-order check.

## Authenticated inspection routes

Supabase CLI 2.115.0 is already logged in; no token needs to appear in a command
or document. `supabase db query --linked --project-ref ... -o json` uses the saved
Management API login. `supabase functions list` and `supabase secrets list` can
be projected to safe names/version/status fields. Secret-list values are
fingerprints; do not treat them as runtime credentials.

Twilio CLI 6.2.0 reads the `brett` profile in
`~/.twilio-cli/config.json`. Its fields are `accountSid`, `apiKey`, `apiSecret`,
and `id`; read credentials in-process only. The installed CLI requires `-o json`,
not `--output json`. For API reads, use Basic authentication in an in-memory
request to `serverless.twilio.com`; project results to masked destinations,
handler paths, and visibility. Never print the complete profile or environment
variable values. The old `deploy-twilio-sms-forward.sh` uses stale CLI output
flags and would also change SMS routing, so it is not the release path here.
