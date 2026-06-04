# Fabsy Content Engine

Drop-in replacement for the dead n8n pipeline. Runs as a GitHub Actions cron, generates one AEO-optimized article per run with the Claude API, and inserts it directly into the `blog_posts` table. Posts appear on fabsy.ca/blog immediately (the blog reads from Supabase client-side).

## Files

Copy into the repo root, preserving paths:

- `.github/workflows/content-engine.yml`: cron Mon/Wed/Fri 7-8am MT, plus manual trigger with topic override and draft mode
- `scripts/content-engine/generate-post.mjs`: generator (no npm dependencies, Node 20 native fetch)
- `scripts/content-engine/topics.json`: 30-topic queue, priority ordered, consumed one per run
- `scripts/generate-sitemap-from-db.js`: PATCHED, replaces the existing file. This fixes the CI failure: the script crashed with "supabaseUrl is required" on every push since June 2 because the Build step gets no SUPABASE_URL env and .env is no longer committed. The patch adds the same public URL and anon key fallbacks already hardcoded in src/integrations/supabase/client.ts.

## Setup (one time)

1. ROTATE THE SERVICE ROLE KEY FIRST. The current one is committed in publish-blog-post.json in a public repo (a Google API key is exposed in fabsy-simple-workflow.json too). Supabase dashboard > Settings > API > rotate. Then delete those workflow JSON files from the repo.
2. Add repo secrets (Settings > Secrets and variables > Actions):
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL` = https://gcasbisxfrssonllpqrw.supabase.co
   - `SUPABASE_SERVICE_ROLE_KEY` = the NEW rotated key
3. Commit the files, then run the workflow once manually (Actions > Content Engine > Run workflow) to verify before letting cron take over.

## Behavior

- Picks highest-priority unused topic, marks it used, commits the queue state back to main
- Dedupes slugs against existing posts, aborts insert if the article comes back under 700 words
- Publishes as `published` by default; pass `status: draft` on manual runs if you want review first
- Manual `topic` input bypasses the queue without consuming it
- Queue exhausts in 10 weeks at 3/week; refill topics.json or ask me to generate the next batch

## Notes

- GitHub disables cron workflows after 60 days of repo inactivity. The engine's own state commits count as activity, so it keeps itself alive.
- Generation prompt enforces: flat $488 + 30% contingency (no zero-risk/refund claims), 95%+ success rate, degendered audience, no em-dashes, no invented fine amounts.
