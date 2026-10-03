# AnderHue Paralegal: anderhue.ca

Public site, client intake and file portal, and the practice staff workspace for AnderHue Paralegal Professional Corporation (Don Anderson, licensed by the Law Society of Ontario). Fabsy is the case-software vendor only and appears only as the software credit on the landlords and privacy pages.

The build contract (database, edge functions, routes, design tokens, go-live order) is [ARCHITECTURE.md](ARCHITECTURE.md). Stages, labels and client copy live in `supabase/functions/_shared/practice-catalog.ts`.

## What is where

| Route | What it is | Source |
|---|---|---|
| `/`, `/landlords`, `/traffic-tickets`, `/privacy` | Static public pages | `*.html`, `public.css`, `site.js` in this folder |
| `/start?area=landlord\|traffic` | Step-by-step secure uploader that opens a file | `client.html` → `src/anderhue/client/` |
| `/files`, `/files/:area/:id` | Client portal, opened from secure email links | `client.html` → `src/anderhue/client/` |
| `/sign-in`, `/admin/...` | Practice staff workspace (Today, Landlord and Traffic boards, file pages) | `portal.html` → `src/anderhue/staff/` |

Landlord files keep using the live `ltb-intake` function and `ltb_*` tables. Traffic and historical other matters use `practice-intake` and `practice_matters`. The portal and client update emails cover all three (`practice-portal`, `process-practice-notices`, migration `20261001150000_anderhue_practice_files.sql`).

As of October 2, 2026, new files are limited to LTB and traffic tickets. `/other-matters` redirects to `/start`; old Other intake links show the two-area chooser. The intake API and migration `20261002120000_anderhue_ltb_traffic_only.sql` reject new AnderHue general matters, including staff-created files. Existing general files remain accessible through search, direct links and the client portal.

## Build and deploy

- Production project: `anderhue-paralegal` in the `execom` Vercel team. Domains: `anderhue.ca`, `www.anderhue.ca` and the existing `vercel.app` aliases.
- Build: `npm run build:anderhue` at the repository root, then deploy the whole `dist-anderhue/` folder (static pages, both app bundles, `vercel.json` with rewrites and security headers including the Content-Security-Policy).
- Public browser config (Supabase URL and anon key) comes from `site-config.json`.
- `client_updates_enabled` on the practice row is the go-live switch for client emails. Follow the order in ARCHITECTURE.md section 7.

## Checks

- `npm run test:practice`: edge function logic, catalog parity with the SQL, email rendering, portal tokens.
- `bash scripts/test-practice-sql.sh`: throwaway PostgreSQL 16 with Supabase stubs; applies the LTB and practice migrations and runs both SQL test files.
- `npm run verify:anderhue`: builds, then drives the public pages, the uploader, the portal and the staff workspace in Chromium against fixtures (no real accounts, emails or files). Set `ANDERHUE_QA_SCREENSHOTS=<dir>` for screenshots of every state.
- `node scripts/anderhue-qa/render-emails.mjs <dir>`: renders every client update and staff alert with sample data for one-time template approval.

## Rules that stay in force

- Practice members get access through `ltb_practice_members` (`licensee` or `clerk`). Never add them to Fabsy `user_roles`.
- Do not publish an LSO licence number until Don's exact number is confirmed. Never publish a placeholder.
- Client emails never carry Fabsy branding. Templates are approved once; individual sends then go out automatically.
