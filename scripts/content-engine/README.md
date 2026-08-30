# Fabsy Content Engine

Human-gated replacement for the old n8n pipeline. A manual GitHub Actions run generates one AEO-optimized draft with the Claude API and inserts it into the `blog_posts` table for editorial review. An operator can explicitly request publication when the topic, facts, source links, and claims have been checked.

## Files

Copy into the repo root, preserving paths:

- `.github/workflows/content-engine.yml`: manual trigger with topic override and draft-by-default review mode
- `scripts/content-engine/generate-post.mjs`: generator (no npm dependencies, Node 20 native fetch)
- `scripts/content-engine/topics.json`: 30-topic queue, priority ordered, consumed one per run
- `scripts/generate-sitemap-from-db.js`: PATCHED, replaces the existing file. This fixes the CI failure: the script crashed with "supabaseUrl is required" on every push since June 2 because the Build step gets no SUPABASE_URL env and .env is no longer committed. The patch adds the same public URL and anon key fallbacks already hardcoded in src/integrations/supabase/client.ts.

## Setup (one time)

1. ROTATE THE SERVICE ROLE KEY FIRST. The current one is committed in publish-blog-post.json in a public repo (a Google API key is exposed in fabsy-simple-workflow.json too). Supabase dashboard > Settings > API > rotate. Then delete those workflow JSON files from the repo.
2. Add repo secrets (Settings > Secrets and variables > Actions):
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL` = https://gcasbisxfrssonllpqrw.supabase.co
   - `SUPABASE_SERVICE_ROLE_KEY` = the NEW rotated key
3. Commit the files, then run the workflow manually (Actions > Content Engine > Run workflow). Review drafts in the Fabsy admin before publication.

## Behavior

- Picks highest-priority unused topic, marks it used, commits the queue state back to main
- Dedupes slugs against existing posts, aborts insert if the article comes back under 700 words
- Creates a `draft` by default; publication requires selecting `status: published` on an explicit manual run
- Requires at least two approved official Alberta source links and dispatches the prerender refresh only after an explicit publication
- Manual `topic` input bypasses the queue without consuming it
- Refill `topics.json` before the queue is exhausted

## Notes

- Generation prompt enforces the canonical Rapid Resolution, Insurance Impact & Renewal Planning Report and bundle pricing, permits only the exact bounded 48-hour Fabsy-action commitment, keeps trial representation separate, bans outcome-rate percentages and prohibited claim wording, uses a non-gendered audience, avoids em dashes, and prohibits invented legal numbers.
