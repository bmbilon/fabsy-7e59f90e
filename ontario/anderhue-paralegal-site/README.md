# AnderHue Paralegal public site

Static Ontario public site and private LTB workspace for AnderHue Paralegal Professional Corporation. Fabsy is the software vendor only.

- Production project: `anderhue-paralegal` in the `execom` Vercel team.
- Canonical public domain: `https://anderhue.ca`. The `www` host and existing `vercel.app` aliases remain attached to the project.
- Build: `npm run build:anderhue` at the repository root. Deploy the complete `dist-anderhue/` directory. The build includes static public pages, the bundled portal and its assets, and Vercel routing.
- Public routes: `/`, `/landlords`, `/traffic-tickets`, `/other-matters`.
- Private routes: `/sign-in` and `/admin/ltb`, both served by the portal bundle.

The homepage links to all three practice areas. `/landlords` retains the existing N4, L1 and L2 information, date calculator and connected LTB intake. The Traffic Tickets and Other Matters pages currently offer a phone and email consultation. They do not use the Alberta ticket checkout, open an Ontario case or collect payment. A full Ontario traffic workflow requires its own verified scope, intake rules and backend before launch.

The public pages use a shared purple, ivory and gold identity. The crest is adapted from the AnderHue Canada Inc. image supplied by Brett, using only its laurel and circuit-A mark. The company name, address and firm number from that image are not practice details on this site. The private sign-in uses the same crest and palette. Public pages are indexable; the sign-in and admin routes remain `noindex`. `robots.txt` and `sitemap.xml` cover the public routes.

## Landlord intake and access

The landlord form posts to the Supabase Edge Function `ltb-intake` (`submit`, private document uploads, then `finalize`). The anon key in `data-key` is a public browser key. The `LTB_ALLOWED_ORIGINS` function secret includes both Vercel aliases plus `https://anderhue.ca` and `https://www.anderhue.ca`. Changes to this function must be deployed individually with `--use-api`.

`ltb-intake` registers or reuses a client, opens an `LTB-YYYY-NNNN` case and returns signed upload URLs. `process-ltb-intake` reads uploaded photos and fills only empty fields. Conflicts, low confidence, PDFs and missing registration data require review. Staff receive one case alert and work the file at `/admin/ltb`.

Practice access is granted through `ltb_practice_members` for `anderhue-paralegal`, using `licensee` or `clerk`. This grants LTB access only. Do not add a practice member to traffic `user_roles` unless separately authorized. Database policies and portal routing enforce the separation. Signing up creates a login only; membership must be granted after email confirmation.

Supabase Auth must allow `https://anderhue.ca/sign-in` and `https://www.anderhue.ca/sign-in` as redirect URLs, while preserving the existing Vercel aliases and the Fabsy site URL. The public site omits a licence number until Don's exact LSO number is confirmed. Do not publish a placeholder number.

## Release checks

Run `npm run build:anderhue` and `node scripts/verify-anderhue-browser.mjs`. The browser check uses fixtures for authentication and data, so it cannot create accounts or read production cases. Deploy a preview, require passing PR checks, then promote the reviewed build. Verify the public pages, private sign-in and landlord intake CORS on the final domain.
