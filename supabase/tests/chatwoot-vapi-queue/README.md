Run the queue SQL regressions from the repository root:

```sh
python3 supabase/tests/chatwoot-vapi-queue/run.py
```

Requires Python 3 and local PostgreSQL 14 binaries. The runner discovers them with `pg_config --bindir`. To select an installation explicitly:

```sh
python3 supabase/tests/chatwoot-vapi-queue/run.py --pg-bindir /opt/homebrew/opt/postgresql@14/bin
```

The runner creates a temporary cluster and private Unix socket, disables TCP, ignores inherited `PG*` settings and `.psqlrc`, and pins every connection to that socket. It has no database URL or external host option. It stops the cluster and removes temporary files when finished. Fixtures and assertions also require a local test marker, temporary data directory, and the dedicated test database. Run the harness as a normal user, since PostgreSQL refuses to initialize as root.

The complete existing `20260901173000_whatsapp_vapi_bridge.sql` migration runs, including its embedded assertions. Its single `CREATE EXTENSION pg_cron` statement is replaced with an inert local cron fixture; all tables and function definitions are unchanged. The complete new `20260911213000_chatwoot_vapi_queue.sql` migration then runs unchanged. Vault and HTTP fixtures use dummy values and local counters. They cannot issue HTTP requests or execute scheduled jobs.

Coverage:

- Unique inbound IDs, initial circuit OFF, per-conversation leases, deterministic FIFO despite timestamp ties, and the runtime's exact `job_id` return field.
- A single transition to sending, no resend after uncertain outcomes, and reconciliation while the circuit is OFF or a human hold is active.
- Human takeover fences, replay dedupe, explicit pending resume, receipt settlement after takeover during an outbound request, and protection against restoring stale AI continuity.
- Hinted controls preserved through takeover and later untrusted hints; atomic verified STOP/START ordering invokes the actual legacy claim function.
- Rejection of delayed older controls across conversations, sender-clock merging during HMAC key rotation, bounded pre-send retries, and server-only RPC privileges.
- Recovery cron starts inactive, refuses missing Vault secrets, sends nothing during configuration, and deactivates explicitly.

These tests check SQL semantics using PostgreSQL 14. They do not exercise Supabase's actual `pg_net` transport or `pg_cron` background worker, Chatwoot webhooks, Twilio delivery, or Vapi responses. Never apply the fixture SQL to a deployed database.
