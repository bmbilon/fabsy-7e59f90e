# AnderHue Paralegal LTB page

Static landing page for AnderHue Paralegal Professional Corporation (landlord LTB work). Fabsy is the software vendor only.

- Vercel project: `anderhue-paralegal` (execom team), aliases `anderhue-paralegal.vercel.app` and `anderson-paralegal.vercel.app`.
- Deploy: upload `index.html` and `vercel.json` only. No build step, no serverless functions.
- The form posts to the Supabase edge function `ltb-intake` (`submit`, then private uploads to bucket `ltb-documents`, then `finalize`). The anon key in `data-key` is the public key.
- New origins must be added to the `LTB_ALLOWED_ORIGINS` function secret.

## Pipeline

1. `ltb-intake` registers or reuses the client (`ltb_clients`), opens a case (`ltb_cases`, `LTB-YYYY-NNNN`) and returns signed upload URLs.
2. Uploaded photos are read by `process-ltb-intake` (Lovable AI gateway). Registration and tenancy fields fill only empty values. Conflicts, low confidence, PDFs and missing registration data put the case in `needs_review`. ID numbers are never stored.
3. When reading finishes, `ltb_intake_alerts` queues one email per case. The `fabsy-ltb-intake-alerts` cron job sends it to `ltb_practices.alert_emails`.
4. Staff work the file at `/admin/ltb` (practice members and Fabsy admins only).

### Practice access

Add an existing login to `ltb_practice_members` for `anderhue-paralegal` with
role `licensee` or `clerk`. This grants access to that practice's LTB files only.
Do not add a practice member to `user_roles` as `admin` or `case_manager`, since
those separate roles grant access to the Fabsy traffic workspace. The shared
admin shell redirects members without a traffic role to `/admin/ltb` before
mounting other admin pages. Database policies enforce the same separation for
traffic data and limit LTB records to the member's practice.

## Pending

- LSO licence number (`P#####` placeholders).
- Custom domain.
