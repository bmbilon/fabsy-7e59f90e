# Implementation plan

1. Freeze product facts and proposed campaign configuration; record unresolved live-account and destination holds.
2. Reuse upload and verified receipt flows for consent-aware attribution and stable funnel events. Add private internal payment reporting from the existing webhook.
3. Build JSON-compatible YAML Search specs, compliance lint with a small AI review interface, live Google graph diff, paused operations and one approval/idempotency/action module with rollback.
4. Add batch review and pause to the existing authenticated mobile portal; use its existing push subscriptions.
5. Add separate Supabase morning-report and spend-monitor workers with durable storage and leases. Generate reports with no purchases and weekly observed-data memos.
6. Render three composited static Meta concepts, run focused gate, deduplication and spend tests, then document setup and unresolved launch gates.
