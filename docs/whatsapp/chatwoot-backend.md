# Chatwoot WhatsApp backend operations

Prepared for Supabase project `gcasbisxfrssonllpqrw`, Chatwoot account `185532`, native Twilio WhatsApp inbox `136731`, and FABSY `+18257932279`. These commands are an operator runbook, not evidence that deployment or activation has occurred. Run commands sequentially from the reviewed release checkout.

The new migration starts the Chatwoot circuit **OFF** and the recovery cron **inactive**. The old WhatsApp webhook and its migration remain unchanged for rollback.

## Validation

```sh
deno test --no-config --no-lock supabase/functions/chatwoot-vapi-webhook/handler.test.ts supabase/functions/chatwoot-vapi-worker/worker.test.ts supabase/functions/_shared/chatwoot-vapi-runtime.test.ts supabase/functions/_shared/whatsapp-vapi.test.ts supabase/functions/whatsapp-vapi-webhook/handler.test.ts
deno check --no-config --no-lock supabase/functions/chatwoot-vapi-webhook/index.ts supabase/functions/chatwoot-vapi-worker/index.ts
python3 supabase/tests/chatwoot-vapi-queue/run.py
git diff --check
```

The [SQL regression README](../../supabase/tests/chatwoot-vapi-queue/README.md) describes its disposable local PostgreSQL cluster and inert network/scheduler fixtures. Never apply those test fixtures to a deployed database.

## Configuration

Prepare a mode-600 env file outside the repository, for example `/private/tmp/fabsy-chatwoot-launch.env`, containing only these new secrets. Do not print token values or enable CLI debug logging.

| Name | Value/source |
| --- | --- |
| `CHATWOOT_ACCOUNT_ID` | `185532` |
| `CHATWOOT_WHATSAPP_INBOX_ID` | `136731` |
| `CHATWOOT_AGENT_BOT_ID` | ID of the dedicated Fabsy AI AgentBot |
| `CHATWOOT_AGENT_BOT_TOKEN` | Dedicated AgentBot access token, used to read conversation state, send replies and hand off |
| `CHATWOOT_AGENT_BOT_SIGNING_SECRET` | Native AgentBot webhook signing secret; generated 24-character secrets are supported |
| `CHATWOOT_API_ACCESS_TOKEN` | Account user token with access to this inbox and message history, used for ambiguous-send reconciliation |
| `CHATWOOT_WORKER_SECRET` | Independently generated random bearer secret, at least 32 characters; use the same value in Vault below |
| `CHATWOOT_BASE_URL` | Optional; defaults to `https://app.chatwoot.com` |

The worker reuses the existing `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `WHATSAPP_SENDER_HASH_KEY`, optional `WHATSAPP_SENDER_HASH_KEY_PREVIOUS`, `WHATSAPP_VAPI_ASSISTANT_ID`, and `VAPI_PRIVATE_API_KEY`. Preserve these values. Supabase supplies its URL and service-role key.

```sh
supabase secrets set --project-ref gcasbisxfrssonllpqrw --env-file /private/tmp/fabsy-chatwoot-launch.env
```

Verify actual account API entitlement, the AgentBot token's conversation access, and the separate reader token's message-history access before cutover. The token UI may require a paid Chatwoot plan even when native inbox and bot creation are available. Never substitute an unsigned webhook or bypass these access checks.

## Apply only this migration and deploy only these functions

First inspect the exact migration/object state:

```sh
supabase db query --linked --project-ref gcasbisxfrssonllpqrw "select exists(select 1 from supabase_migrations.schema_migrations where version = '20260911213000') as recorded, to_regclass('public.chatwoot_vapi_jobs') is not null as objects_present;"
```

If both are absent, execute only the reviewed file, then record that version as applied after successful completion. If either exists, verify the existing state instead of rerunning or blindly repairing it. **Never run `supabase db push` for this release.** Do not reapply `20260901173000_whatsapp_vapi_bridge.sql`.

```sh
supabase db query --linked --project-ref gcasbisxfrssonllpqrw --file supabase/migrations/20260911213000_chatwoot_vapi_queue.sql
supabase migration repair 20260911213000 --status applied --linked --project-ref gcasbisxfrssonllpqrw
supabase functions deploy chatwoot-vapi-webhook --project-ref gcasbisxfrssonllpqrw --no-verify-jwt --use-api
supabase functions deploy chatwoot-vapi-worker --project-ref gcasbisxfrssonllpqrw --no-verify-jwt --use-api
```

The public receiver uses Chatwoot HMAC signatures over `timestamp.rawBody`; the internal worker requires its independent bearer secret. Both have `verify_jwt=false` intentionally. Verify deployed source against this checkout and confirm malformed/unsigned webhook requests, oversized bodies and unauthorized worker calls are rejected before a controlled real-message test.

## Vault and recovery scheduler

Create or update these **named Vault secrets**, without exposing their decrypted values. The SQL below uses the documented [Supabase Vault functions](https://supabase.com/docs/guides/database/vault):

- `chatwoot_vapi_worker_url`: `https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/chatwoot-vapi-worker`
- `chatwoot_vapi_worker_token`: the exact `CHATWOOT_WORKER_SECRET` value.

Use a protected SQL file outside git. The following template describes the Vault operations; replace the token placeholder only in that protected file, never in chat, shell arguments, committed files or logs. Existing secrets should be updated by their matching names rather than duplicated.

```sql
do $vault_setup$
declare secret_id uuid;
begin
  select id into secret_id from vault.secrets where name = 'chatwoot_vapi_worker_url';
  if secret_id is null then
    perform vault.create_secret('https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/chatwoot-vapi-worker', 'chatwoot_vapi_worker_url');
  else
    perform vault.update_secret(secret_id, 'https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/chatwoot-vapi-worker');
  end if;
  select id into secret_id from vault.secrets where name = 'chatwoot_vapi_worker_token';
  if secret_id is null then
    perform vault.create_secret('<REPLACE_IN_PROTECTED_FILE>', 'chatwoot_vapi_worker_token');
  else
    perform vault.update_secret(secret_id, '<REPLACE_IN_PROTECTED_FILE>');
  end if;
end;
$vault_setup$;
```

```sh
supabase db query --linked --project-ref gcasbisxfrssonllpqrw --file /private/tmp/fabsy-chatwoot-vault.sql
supabase db query --linked --project-ref gcasbisxfrssonllpqrw "select public.configure_chatwoot_vapi_recovery(true);"
```

`configure_chatwoot_vapi_recovery` verifies Vault names, URL shape and secret length before activating the minute schedule `fabsy-chatwoot-vapi-recovery`. The schedule contains only function calls; no embedded secret values. Each authenticated wake acknowledges promptly and processes a bounded batch through `EdgeRuntime.waitUntil`; committed jobs and leases recover interrupted invocations.

## Controlled activation

1. Keep the new circuit OFF during configuration. Attach the dedicated bot to this inbox with its outgoing webhook URL set to `https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/chatwoot-vapi-webhook`. Disable duplicate channel greetings and other AI responders. Confirm account/inbox/bot IDs and signed webhook delivery against the actual Cloud installation.
2. Preserve all parent SMS, voice and status URLs. Chatwoot Cloud inbox creation can automatically change the WhatsApp sender callback; always inspect actual Twilio state after setup. Until ready, restore the old callback as described below.
3. The **existing WhatsApp global quota circuit MUST stay ON** when Chatwoot AI is active, because the new worker reuses its authorization RPC and limits: 10 messages per sender/10 minutes, 60 Vapi chats/10 minutes, 500/day. Inspect it before proceeding:

```sh
supabase db query --linked --project-ref gcasbisxfrssonllpqrw "select circuit_enabled, ten_minute_chat_count, daily_chat_count from public.whatsapp_vapi_runtime;"
```

If it is OFF and activation is authorized, enable it explicitly:

```sh
supabase db query --linked --project-ref gcasbisxfrssonllpqrw "select public.set_whatsapp_vapi_circuit_enabled(true);"
```

4. Switch only the Twilio WhatsApp sender's inbound callback to `https://app.chatwoot.com/twilio/callback`, POST. Verify sender Online and parent endpoints unchanged. Then enable the separate Chatwoot circuit for the owner's test:

```sh
supabase db query --linked --project-ref gcasbisxfrssonllpqrw "select public.set_chatwoot_vapi_circuit_enabled(true);"
```

5. Test greeting, substantive follow-up, human handoff and phone reply, then explicit return to AI by clearing human assignment and setting Pending. Also verify STOP/START, attachments and actual delivery. Public website promotion waits for those checks. The [inbox operations guide](chatwoot-inbox.md) covers staff ownership and the unavoidable final check-to-send race.

Read metadata without customer text, phone numbers or sender hashes:

```sh
supabase db query --linked --project-ref gcasbisxfrssonllpqrw "select jsonb_build_object('runtime',(select to_jsonb(r) from public.chatwoot_vapi_runtime r where singleton_id=1),'jobs',(select coalesce(jsonb_agg(s),'[]'::jsonb) from(select state,count(*) as count from public.chatwoot_vapi_jobs group by state)s),'cron',(select coalesce(jsonb_agg(s),'[]'::jsonb) from(select jobname,active from cron.job where jobname='fabsy-chatwoot-vapi-recovery')s));"
```

Use the new job ledger and Chatwoot/Twilio delivery records for transport outcomes. The legacy ledger also records reply preparation and shared authorization; its `replied` state alone does not prove Chatwoot sent or delivered a reply. `send_uncertain` requires staff review; never replay its outgoing POST merely because no marker was found.

## Rollback

Pause new AI immediately while leaving the human inbox and reconciliation available:

```sh
supabase db query --linked --project-ref gcasbisxfrssonllpqrw "select public.set_chatwoot_vapi_circuit_enabled(false);"
```

Queued AI generation stops. Existing `sending`/`uncertain` jobs can still reconcile while the circuit is OFF; a provider-accepted message cannot be recalled by this switch. Keep recovery active until those outcomes settle.

To restore the old AI transport, detach the Chatwoot bot and switch **only** the Twilio WhatsApp sender's inbound URL back to `https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/whatsapp-vapi-webhook`, POST. Verify persistence after reload, sender Online, and unchanged parent SMS/voice/status URLs. The original function remains deployed. Keep the shared WhatsApp quota circuit ON for that responder as well.

When reconciliation is complete and the new integration is being retired, disable its recovery schedule:

```sh
supabase db query --linked --project-ref gcasbisxfrssonllpqrw "select public.configure_chatwoot_vapi_recovery(false);"
```

Do not delete migration records, queue metadata, sender control clocks or Vault secrets as an immediate rollback. Retain unresolved send metadata for review. Remove the temporary env/Vault SQL files after verified setup; preserve the deployed secret values needed for recovery.
