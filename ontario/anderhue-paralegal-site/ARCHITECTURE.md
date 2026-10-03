# AnderHue practice files: architecture and build contract

This is the build contract for the AnderHue client file system: the public site at anderhue.ca, the client intake and file portal, the staff workspace at /admin, and the Supabase backend behind them. Every stream of work implements exactly the names, shapes and rules below. If something here is wrong, fix this document first and then the code.

Fabsy is the software vendor only. AnderHue Paralegal Professional Corporation (Don Anderson, licensed by the Law Society of Ontario) owns the clients, files and documents. Client-facing surfaces carry the practice brand. Fabsy appears only as a small software credit where one already exists (landlords page footer, privacy page).

## 1. Practice areas

| Area (internal) | Public name | /start param | File number | Tables | Bucket |
|---|---|---|---|---|---|
| `ltb` | Landlords | `landlord` | `LTB-2026-0001` | `ltb_cases`, `ltb_case_documents`, `ltb_case_events` (existing) | `ltb-documents` (existing) |
| `traffic` | Traffic Tickets | `traffic` | `TKT-2026-0001` | `practice_matters` (area `traffic`), `practice_matter_documents`, `practice_matter_events` | `practice-documents` |
| `general` | Historical Other Matters only | Unavailable | `MAT-2026-0001` | `practice_matters` (area `general`), same | `practice-documents` |

As of October 2, 2026, AnderHue accepts new LTB and traffic files only. `ANDERHUE_INTAKE_AREAS` controls the public chooser and staff creation controls. The intake API rejects `general`/`other` for AnderHue, and migration `20261002120000_anderhue_ltb_traffic_only.sql` blocks new general records at the table level, including staff RPCs. Existing general records and their workflows remain available. `/other-matters` permanently redirects to `/start`.

The single source of truth for stages, outcomes, labels, client copy, intake vocabularies and upload limits is `supabase/functions/_shared/practice-catalog.ts`. The browser apps import it by relative path. SQL CHECK constraints mirror its values exactly.

Clients are shared across areas: `ltb_clients` is the practice client registry (unique per practice and email) for all three areas.

## 2. Client journey

1. Visitor picks a service on anderhue.ca and presses **Start a file**, landing on `/start?area=landlord|traffic`.
2. The step-by-step uploader collects documents first (drag and drop, or camera on phones), then a few details, then contact info.
3. Submit: `ltb-intake` (landlord, existing contract) or `practice-intake` (traffic) opens the file and returns one-time signed upload URLs. The browser uploads each file with progress, then calls `finalize`.
4. Confirmation screen shows the file number and what happens next. An email (`intake_received`) arrives from `AnderHue Paralegal <files@anderhue.ca>` with a secure link to the file. A public intake under an email that already has a file is held (`portal_visible = false`): no receipt, and it stays out of that client's portal until staff take it forward, so a stranger cannot plant files in someone else's portal.
5. The secure link opens `/files` (the client portal): status, what happens next, key dates, documents both ways, history, upload more.
6. Every time staff move the file to a client-visible stage, the client gets an automatic email (template approved once; staff may add a personal line). Staff can also request documents, share a document, or send an upload invite. Each email links back into the portal.
7. A client without a current link enters their email at `/files` and receives a fresh link (`portal_link`), if that email has a file with the practice. The response never reveals whether it does.

## 3. Database (migration `supabase/migrations/20261001150000_anderhue_practice_files.sql`)

Builds on `20260925150000_ltb_intake_pipeline.sql`. Wrapped in `begin; ... commit;`. All functions `security definer set search_path = public, pg_temp` unless they are plain triggers. Error codes are raised as exception messages starting with `PRACTICE_`.

### 3.1 Changes to existing LTB tables

`ltb_practices` new columns:
- `display_name text` (client-facing short name; `AnderHue Paralegal` for anderhue-paralegal)
- `site_url text not null default 'https://anderhue.ca'` (https origin, no trailing slash)
- `public_email text` (`hello@anderhue.ca`)
- `phone text` (`(289) 985-0166`)
- `client_email_from text` (`AnderHue Paralegal <files@anderhue.ca>`)
- `client_reply_to text` (`hello@anderhue.ca`)
- `notice_from text` (staff alert sender; null means `Fabsy Case Desk <hello@fabsy.ca>`)
- `client_updates_enabled boolean not null default false` (go-live switch; false means no client notices are queued)
- Update anderhue-paralegal: the values above, and `admin_base_url = 'https://anderhue.ca'`. Leave `alert_emails` unchanged.

`ltb_clients` new column: `portal_revoked_before timestamptz` (portal links issued before this are rejected).

`ltb_cases` new columns: `client_request_message text check (char_length <= 1000)`, `client_request_at timestamptz`, `client_uploaded_at timestamptz`.

`ltb_case_documents` new columns: `uploaded_by text not null default 'client' check (uploaded_by in ('client','staff'))`, `shared_with_client boolean not null default false`.

Fix the case-number default so it grows past 9999 instead of truncating: new immutable helper `practice_format_number(p_prefix text, p_year text, p_n bigint) returns text` (4-digit zero pad below 10000, plain digits above) and `alter table ltb_cases alter column case_number set default ('LTB-' || ... )` using it.

### 3.2 New tables

`practice_matters`
- `id uuid pk default gen_random_uuid()`, `practice_id text not null references ltb_practices(id)`, `client_id uuid not null references ltb_clients(id)`
- `area text not null check (area in ('traffic','general'))`
- `matter_number text not null unique` set by a BEFORE INSERT trigger from per-area sequences `practice_traffic_number_seq` / `practice_general_number_seq`: `TKT-YYYY-NNNN` / `MAT-YYYY-NNNN`, year in America/Toronto, via `practice_format_number`. Immutable after insert (trigger raises `PRACTICE_NUMBER_IMMUTABLE`).
- `stage text not null default 'new_intake'`, CHECK per area (values from the catalog), `stage_changed_at timestamptz not null default now()`
- `outcome text` CHECK per area: traffic `withdrawn|amended|not_guilty|convicted|client_paid|other|declined`; general `resolved|settled|judgment|withdrawn|referred_out|other|declined`. `closed_at timestamptz`
- `intake_review_status text not null default 'pending_scan' check in ('pending_scan','scanning','needs_review','ready')`, `intake_scan_started_at timestamptz`
- `client_notes text (<=2000)` (client's own words), `review_notes text (<=4000)` (internal)
- `field_sources jsonb not null default '{}'` (same shape as LTB: `{source:'form'|'document'|'staff', documentId?, kind?, confidence?}`)
- `returning_client boolean not null default false`, `intake_token_hash text (^[0-9a-f]{64}$)`, `intake_finalized_at timestamptz`
- `source text not null default 'anderhue-site' check in ('anderhue-site','staff','smoke-test')`, `user_agent text (<=400)`
- Traffic: `ticket_type text check in (catalog TICKET_TYPES)`, `ticket_city text (<=100)`, `ticket_received_on date`, `option_chosen text not null default 'unsure' check in ('none','trial','meeting','paid','unsure')`, `offence_number text (<=40)`, `offence_date date`, `offence_description text (<=300)`, `statute_section text (<=80)`, `set_fine_cents integer >= 0`, `total_payable_cents integer >= 0`, `court_location text (<=200)`, `option_deadline date`, `disclosure_requested_on date`, `meeting_date date`, `trial_date date`
- General: `category text check in ('small_claims','tribunal','offence','notary','other')`, `deadline_date date`, `other_party text (<=200)`, `client_city text (<=100)`
- Area guard: traffic rows must have `category is null`; general rows must have `ticket_type is null`.
- Portal: `client_request_message text (<=1000)`, `client_request_at timestamptz`, `client_uploaded_at timestamptz`, `portal_visible boolean not null default true` (same column on `ltb_cases`; set false by a BEFORE INSERT trigger for public intakes whose client already has a file, and true when the file leaves `new_intake`, when staff request documents or share a document, and for staff-opened files)
- `created_at`, `updated_at` (touch trigger)
- Indexes: `(practice_id, area, stage, created_at desc)`, `(client_id)`, scan index like LTB.

`practice_matter_documents`: same shape as `ltb_case_documents` with `matter_id uuid not null references practice_matters(id) on delete cascade` instead of `case_id`, storage path `{matter_id}/{document_id}.{ext}`, `kind text check in ('ticket','court_document','disclosure','correspondence','evidence','notice','government_id','other')`, plus `uploaded_by` and `shared_with_client` as above.

`practice_matter_events`: same shape as `ltb_case_events` with `matter_id`.

`practice_notices` (one outbox for client updates and staff alerts)
- `id uuid pk`, `practice_id text not null`, `area text check in ('ltb','traffic','general')` (null allowed only for `portal_link`), `case_id uuid` (the ltb_cases.id or practice_matters.id; null only for `portal_link`), `client_id uuid references ltb_clients(id)`
- `audience text not null check in ('client','staff')`
- `kind text not null check in ('intake_received','stage_changed','documents_requested','document_shared','portal_link','upload_invite','staff_new_intake','staff_client_uploaded')`; client kinds require audience client, staff kinds audience staff
- `event_key text not null unique` (dedupe)
- `detail jsonb not null default '{}'` (kind-specific: `stage`, `outcome`, `message`, `documentId`, `documentName`, `count`, `note`)
- `snapshot jsonb not null` (see 3.5), `recipients text[] not null` (1..5 valid emails)
- outbox columns exactly as `ltb_intake_alerts`: `status` in `pending|sending|retry|sent|failed|indeterminate|superseded|cancelled`, `attempt_count`, `first_attempt_at`, `next_attempt_at`, `claim_id`, `claim_expires_at`, `email_payload`, `provider_email_id`, `sent_at`, `failure_code`, `created_at`, `created_by uuid`
- Force RLS. Staff may SELECT only these columns for their practice: `id, practice_id, area, case_id, audience, kind, detail, status, next_attempt_at, sent_at, failure_code, created_at`. Never `snapshot`, `email_payload`, `recipients` (the payload holds the client's portal link).

### 3.3 Triggers

- Touch `updated_at` on `practice_matters`.
- Staff edit logging on `practice_matters` (like `ltb_log_case_edit`, event `case_updated`).
- Stage-change notice trigger on BOTH `ltb_cases` and `practice_matters` (AFTER UPDATE OF stage): when stage changed, row source is not `smoke-test`, the stage's catalog `notify` is true, the GUC `practice.notify` is `on` (only `practice_set_stage` sets it, so the legacy `ltb_set_case_stage` path, which has no preview or undo, never emails clients), and the practice has `client_updates_enabled`: enqueue `stage_changed` with `detail = {stage, outcome, message}` where message comes from GUC `practice.client_message` (empty means none), `event_key = 'stage/{area}/{id}/{stage}/{epoch_ms(stage_changed_at)}'`, due `now() + 90 seconds`. (The SQL keeps its own copy of the notify-stage list; the catalog test checks they match.)
- Intake receipt trigger on BOTH tables: when `intake_finalized_at` goes from null to a value (or a row is inserted with it set) and source is a public intake (`ltb-landing` / `anderhue-site`): enqueue `intake_received`, `event_key = 'intake/{area}/{id}'`. Skipped for held files (`portal_visible = false`) and when the client already got two receipts in 24 hours.
- Staff alert trigger on `practice_matters` (mirror of `ltb_queue_intake_alert`): first move of `intake_review_status` to `ready` or `needs_review` for a non-smoke row enqueues `staff_new_intake`, `event_key = 'staff-intake/{id}'`, recipients = practice `alert_emails` (skip if empty). LTB keeps its existing alert outbox untouched.

Client notices are only queued when `client_updates_enabled` is true and the client email is valid; switching it off also cancels queued client notices at the next claim (`client_updates_disabled`). Staff notices are always queued. Claims supersede a pending stage update when the file's (stage, outcome) has moved on, when a newer update about the current state exists, or when it would repeat the last update the client received without a personal message.

### 3.4 Functions

Helpers:
- `practice_format_number(text, text, bigint) returns text` (immutable)
- `practice_case_ref(p_area text, p_case_id uuid) returns table(practice_id text, client_id uuid, stage text, source text)` reads the right table.
- `practice_notice_snapshot(p_area text, p_case_id uuid, p_client_id uuid) returns jsonb` (3.5).
- `practice_enqueue_notice(p_practice_id text, p_area text, p_case_id uuid, p_client_id uuid, p_kind text, p_event_key text, p_detail jsonb default '{}', p_delay_seconds integer default 0, p_actor uuid default null) returns uuid`: derives audience from kind, builds snapshot and recipients, applies the enabled/valid-email rules, `on conflict (event_key) do nothing`, returns the id or null.

Service role only (edge functions):
- `practice_register_intake(p_practice_id text, p_area text, p_intake jsonb, p_token_hash text, p_documents jsonb default '[]') returns table(matter_id uuid, client_id uuid, matter_number text, returning_client boolean)`: same client reuse rules as `ltb_register_intake` (registered clients are never overwritten; differences become review notes; provisional clients only gain empty fields). `p_intake` keys: `email, firstName, lastName, phone, notes, userAgent`, traffic `ticketType, ticketCity, ticketReceivedOn, optionChosen`, general `category, deadline, otherParty, clientCity`. Traffic sets `option_deadline = ticketReceivedOn + 15` when given (source `form`, estimate). No documents means `needs_review` and finalized immediately with a review note. Max 6 documents (`{id, extension, contentType, size, name}`). Logs `intake_received`.
- `practice_finalize_intake(p_matter_id uuid, p_token_hash text, p_uploaded uuid[]) returns text`: mirror of `ltb_finalize_intake` (raises `PRACTICE_INTAKE_UNAUTHORIZED`). For `general` matters with uploads, set `intake_review_status = 'needs_review'` directly (nothing is read automatically); `traffic` with uploads stays `pending_scan` for the reader.
- `practice_claim_intake_scan(p_matter_id uuid) returns boolean`, `practice_sweep_stalled_intakes() returns integer` (mirrors of LTB).
- `practice_portal_session(p_client_id uuid) returns jsonb` → `{client:{id,email,firstName,lastName,organizationName}, practice:{id,name,displayName,phone,publicEmail,siteUrl}, revokedBefore, files:[{area,id,number,stage,outcome,issue,ticketType,category,createdAt,updatedAt,requestOpen,closed}]}`; files across `ltb_cases` and `practice_matters` for that client, excluding smoke tests, newest activity first. Null when the client does not exist.
- `practice_portal_file(p_client_id uuid, p_area text, p_case_id uuid) returns jsonb` → null unless the case belongs to the client. Shape: `{area,id,number,stage,outcome,issue,ticketType,category,createdAt,updatedAt,closedAt, keyDates:{noticeTerminationDate,hearingDate,optionDeadline,offenceDate,meetingDate,trialDate,deadlineDate}, request:{message,at}|null, clientUploadedAt, documents:[{id,name,contentType,sizeBytes,uploadedAt,uploadedBy,kind}], history:[{at,event,stage,count}]}`. Documents: uploaded only, and `uploaded_by='client' or shared_with_client`. History: only events `intake_received, stage_changed, client_uploaded, document_shared, documents_requested`, detail reduced to `stage` / `count` (never notes or messages).
- `practice_portal_register_uploads(p_client_id uuid, p_area text, p_case_id uuid, p_documents jsonb) returns jsonb` → `[{documentId,bucket,storagePath}]`. Rejects (`PRACTICE_CASE_NOT_FOUND`) unless the case belongs to the client, (`PRACTICE_FILE_CLOSED`) when the stage is terminal, (`PRACTICE_UPLOAD_LIMIT`) beyond 6 per call or 40 client documents per file, (`PRACTICE_DOCUMENT_INVALID`) on bad specs. Rows: `uploaded_by='client'`, `extraction_status='awaiting_upload'`.
- `practice_portal_confirm_uploads(p_client_id uuid, p_area text, p_case_id uuid, p_document_ids uuid[], p_note text default null) returns integer`: marks those client documents uploaded (`extraction_status='skipped'`), sets `client_uploaded_at`, logs `client_uploaded {count, note}`, enqueues `staff_client_uploaded` (`event_key = 'staff-upload/{area}/{case}/{first document id}'`). The edge function confirms storage presence first.
- `practice_portal_document(p_client_id uuid, p_area text, p_case_id uuid, p_document_id uuid) returns table(bucket text, storage_path text, original_name text, content_type text)`: only downloadable documents (rules above).
- `practice_request_portal_link(p_practice_id text, p_email text) returns boolean`: enqueues `portal_link` for an existing client with at least one non-smoke file, `event_key = 'portal-link/{client_id}/{floor(epoch/600)}'`. Returns whether a notice was queued (the edge function never reveals it).
- `claim_practice_notices(p_limit integer default 10) returns setof practice_notices`: same as `claim_ltb_intake_alerts`, plus: before claiming, pending/retry `stage_changed` notices whose case stage no longer equals `detail->>'stage'` become `superseded`.
- `freeze_practice_notice(p_id uuid, p_claim_id uuid, p_payload jsonb) returns jsonb`, `finish_practice_notice(p_id uuid, p_claim_id uuid, p_status text, p_provider_email_id text default null, p_failure_code text default null) returns boolean`: same contracts as the LTB alert functions (payload must have `from`, `to` array 1..5, `subject`, `html`; optional `reply_to`, `text`).

Staff (authenticated; every one checks `ltb_can_access(practice_id)` of the target and raises `PRACTICE_CASE_NOT_FOUND` otherwise):
- `practice_set_stage(p_area text, p_case_id uuid, p_stage text, p_outcome text default null, p_note text default null, p_client_message text default null, p_notify boolean default true) returns jsonb` → `{stage, outcome, noticeId}`. Validates stage per area (`PRACTICE_STAGE_INVALID`), outcome required and valid for `closed` (`PRACTICE_OUTCOME_REQUIRED` / `PRACTICE_OUTCOME_INVALID`), declined forces outcome `declined`, note <= 1000 (`PRACTICE_NOTE_TOO_LONG`), message <= 1000 (`PRACTICE_MESSAGE_TOO_LONG`). Sets GUCs `practice.client_message` and `practice.notify` (transaction-local) and updates the row so the trigger enqueues; logs `stage_changed {stage, outcome, note}` in the area's events table. Same-stage calls return without change. For `ltb` this replaces calling `ltb_set_case_stage` from the AnderHue workspace (the old RPC keeps working for the Fabsy admin but sends no client email). Correcting only the outcome of a closed file logs `outcome_changed` and, with notify on, queues a fresh `stage_changed` update (90 s delay) carrying the corrected outcome.
- `practice_request_documents(p_area text, p_case_id uuid, p_message text) returns uuid`: sets `client_request_message/at`, logs `documents_requested`, enqueues `documents_requested` (`event_key = 'request/{area}/{case}/{epoch_ms}'`). Message 1..1000 chars.
- `practice_clear_request(p_area text, p_case_id uuid) returns void`.
- `practice_staff_add_document(p_area text, p_case_id uuid, p_name text, p_content_type text, p_size integer, p_kind text default null, p_share boolean default false) returns table(document_id uuid, bucket text, storage_path text)`: row with `uploaded_by='staff'`, `uploaded_at` null, `extraction_status='skipped'`.
- `practice_staff_confirm_document(p_area text, p_document_id uuid) returns boolean`: requires the storage object to exist (`storage.objects` by bucket and name; `PRACTICE_UPLOAD_MISSING`), sets `uploaded_at`, logs `staff_uploaded`, and if shared logs `document_shared` and enqueues `document_shared` (`event_key = 'shared/{document_id}'`).
- `practice_set_document_shared(p_area text, p_document_id uuid, p_shared boolean) returns boolean`: newly shared uploaded documents log and enqueue as above.
- `practice_cancel_notice(p_notice_id uuid) returns boolean`: `pending` or `retry` client notices of an accessible practice; sets `cancelled`.
- `practice_create_matter(p_practice_id text, p_area text, p_client jsonb, p_details jsonb, p_send_invite boolean default false) returns table(case_id uuid, case_number text, client_id uuid, notice_id uuid)`: staff-opened file for a phone or walk-in client. `p_client`: `{email (required), firstName, lastName, organizationName, phone}`; `p_details`: ltb `{issue, city, notes}`, traffic `{ticketType, ticketCity, ticketReceivedOn, notes}`, general `{category, deadline, otherParty, notes}`. Source `staff`, `intake_finalized_at = now()`, `intake_review_status = 'needs_review'`. Invite enqueues `upload_invite` (`event_key = 'invite/{area}/{case}'`).
- `practice_revoke_portal_access(p_client_id uuid) returns timestamptz`: sets `portal_revoked_before = now()` and cancels the client's unsent client notices (`portal_access_revoked`).
- `practice_set_client_email(p_client_id uuid, p_email text) returns text`: corrects a client's email (lowercased; `PRACTICE_CLIENT_NOT_FOUND`, `PRACTICE_EMAIL_INVALID`, `PRACTICE_EMAIL_TAKEN`), revokes every link already sent and cancels unsent client notices (`client_email_changed`).
- Unsharing a document removes its pending `document_shared` notice; share notices wait 90 s so a slip can be undone.
- `practice_rate_limit_hit(p_key_hash text, p_limit integer, p_window_seconds integer) returns boolean` (service role): database-backed fixed-window limiter over `practice_rate_limits` (hashed keys only, row-locked upsert, idle rows pruned).
- Existing `ltb_set_client_registration` is reused for client registration in every area.

Grants: authenticated SELECT on `practice_matters`, `practice_matter_documents`, `practice_matter_events` and the limited `practice_notices` columns, all under RLS `ltb_can_access(practice_id)`. Authenticated column UPDATE on `practice_matters`: `ticket_type, ticket_city, ticket_received_on, option_chosen, offence_number, offence_date, offence_description, statute_section, set_fine_cents, total_payable_cents, court_location, option_deadline, disclosure_requested_on, meeting_date, trial_date, category, deadline_date, other_party, client_city, review_notes, field_sources, intake_review_status` with the same `with check` as LTB (`intake_review_status in ('needs_review','ready')`). No INSERT or DELETE grants. Service role gets everything. Revoke execute from public/anon on every function; grant staff RPCs to authenticated, service RPCs to service_role.

Storage:
- Bucket `practice-documents` (private, 10 MB, the six content types).
- SELECT for staff on `practice-documents` via the document row and `ltb_can_access` (mirror of the LTB policy).
- INSERT for staff on both `ltb-documents` and `practice-documents`: allowed only when a document row with that exact `storage_path`, `uploaded_by='staff'` and `uploaded_at is null` exists and the user can access its practice (helper `practice_staff_can_upload(p_bucket text, p_name text) returns boolean`).
- Client uploads always use service-role signed upload URLs from the edge functions.

Cron: `anderhue-practice-notices`, every minute, posting to `/functions/v1/process-practice-notices` with the same vault secrets as the LTB alert job (guarded the same way).

### 3.5 Notice snapshot (jsonb)

```
{
  "practice": { "id", "name", "displayName", "licenseeName", "phone", "publicEmail", "siteUrl",
                "clientEmailFrom", "clientReplyTo", "noticeFrom" },
  "client":   { "id", "firstName", "lastName", "organizationName", "email" },
  "file":     { "area", "id", "number", "stage", "outcome", "issue", "ticketType", "category",
                "city", "createdAt", "reviewStatus", "documentCount", "clientNotes",
                "keyDates": { "noticeTerminationDate", "hearingDate", "optionDeadline", "offenceDate",
                              "meetingDate", "trialDate", "deadlineDate" },
                "request": { "message", "at" } | null }   // null for portal_link
}
```
`clientNotes` is used only in staff alerts (null in client notices). Staff notices also carry `client.phone`, `file.reviewNotes` and `file.returningClient`; client notices never do. Recipients: the client email (client notices) or the practice `alert_emails` (staff notices).

## 4. Edge functions

All three: `verify_jwt = false` in `supabase/config.toml` (with a comment like the LTB entries), CORS allowlist from `PRACTICE_ALLOWED_ORIGINS` (fallback `https://anderhue.ca,https://www.anderhue.ca,https://anderhue-paralegal.vercel.app`) for the two public functions, JSON in and out, `Cache-Control: no-store`, errors as `{error: "plain sentence"}` with status 400/401/403/404/422/429/503. Pure logic lives in `_shared/*.ts` files with no Deno or network APIs so `scripts/test-practice-files.mjs` can bundle them with esbuild (see `scripts/test-ltb-intake.mjs`).

Env vars (names): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRACTICE_ALLOWED_ORIGINS`, `PRACTICE_PORTAL_SIGNING_SECRET` (>= 32 chars), `RESEND_API_KEY`, `LOVABLE_API_KEY`, `IDR_CRON_SECRET`.

### 4.1 `practice-intake` (public)

`POST {action:"submit", practiceId, area:"traffic"|"general", name, email, phone, notes, files:[{name,contentType,size}], company, elapsedMs, ...}`
- traffic: `ticketType`, `ticketCity`, `ticketReceivedOn` (YYYY-MM-DD, not in the future, not before 2 years ago), `optionChosen`
- general: `category`, `deadline` (YYYY-MM-DD, optional), `otherParty`, `clientCity`; `notes` required (at least 10 characters) for general
- Same validation, honeypot (`company` filled or `elapsedMs < 2500` returns a fake success and stores nothing), rate limit of 8 per hour per network address (database-backed through `practice_rate_limit_hit`; the address comes from `cf-connecting-ip` only, never `x-forwarded-for`; keys are HMACs, so raw addresses are never stored) and file rules as `ltb-intake` (max 6, 10 MB, six content types, extension fallback). Unknown enum values fall back to `other` / `unsure`. No smoke-test switch.
- Response `{ok:true, matterId, matterNumber, intakeToken, uploads:[{documentId,index,path,signedUrl,contentType}]}`.

`POST {action:"finalize", matterId, intakeToken, uploaded:[documentId]}` → lists `practice-documents/{matterId}` to confirm what actually arrived, calls `practice_finalize_intake`, then for traffic with images starts the ticket reader in the background (`EdgeRuntime.waitUntil`). Response `{ok:true, received}`.

Ticket reader (`_shared/practice-extract.ts`, same gateway, model and 45 s timeout as `ltb-extract.ts`): reads images only (PDFs are skipped with a review note), forced tool `extract_ontario_offence_notice` returning `offence_number, offence_date, offence_description, statute_section, set_fine, total_payable, court_location, ticket_city, low_confidence_fields, notes`. The prompt forbids returning licence, plate or other identification numbers and forbids guessing. Normalised values only fill empty fields (`field_sources` source `document`). The matter becomes `ready` only when offence number, offence date and offence description were read with no low-confidence fields and no conflicts; otherwise `needs_review` with notes. Option deadline estimate: when `option_deadline` is empty and an offence date was read, set `offence_date + 15` (source `document`, confidence low, noted as an estimate). Any failure ends in `needs_review`.

### 4.2 `practice-portal` (public, token-authorised)

Portal token: `ahp1.{clientId}.{iat}.{exp}.{sig}` where iat/exp are unix seconds, `exp - iat <= 31 days`, `sig = base64url(HMAC-SHA256(PRACTICE_PORTAL_SIGNING_SECRET, "ahp1.{clientId}.{iat}.{exp}"))`. Verify with a constant-time compare, then reject if `iat * 1000 < portal_revoked_before`. Signing and verifying live in `_shared/practice-portal-token.ts` (Web Crypto only). Links: `{siteUrl}/files#t={token}` and `{siteUrl}/files/{area}/{id}#t={token}`.

Actions (`POST`, token in the body as `token`):
- `request_link {practiceId, email, company, elapsedMs}` → always `{ok:true}` (honeypot, 5 per hour per address and 3 per hour per email apply; invalid email is 422).
- `session {token}` → `{ok:true, client:{firstName, displayName, email}, practice:{name, displayName, phone, publicEmail, siteUrl}, files:[{area, id, number, title, stage, stageLabel, phase, closed, requestOpen, updatedAt, createdAt}], expiresAt}`.
- `file {token, area, id}` → `{ok:true, file:{area, id, number, title, areaLabel, stage, stageLabel, clientNext, phase, closed, outcomeLabel, createdAt, updatedAt, keyDates:[{label, date}], request:{message, at, answered}|null, documents:[{id, name, contentType, sizeBytes, uploadedAt, from:"you"|"practice", kindLabel}], history:[{at, label}], canUpload, limits:{maxFiles, maxBytes}}}`. `answered` is true when `clientUploadedAt` is after the request. Key date labels: `Earliest termination date`, `Hearing date`, `Response deadline (estimate)`, `Offence date`, `Meeting with the prosecutor`, `Trial date`, `Deadline`. History labels come from the catalog (`clientLabel` for stage changes, `File opened`, `You added N documents`, `New document from the practice`, `Documents requested`).
- `download {token, area, id, documentId}` → `{ok:true, url, name}` (signed URL, 120 s, `download` set to the original name).
- `prepare_upload {token, area, id, files:[{name, contentType, size}]}` → `{ok:true, uploads:[{documentId, index, signedUrl, contentType}]}`.
- `confirm_upload {token, area, id, documentIds:[...], note}` → `{ok:true, received}`.

Invalid or expired token: 401 `{error:"This link has expired. Enter your email and we will send a fresh one."}`.

### 4.3 `process-practice-notices` (cron / service role)

Auth exactly as `process-ltb-intake-alerts`. Sweeps stalled practice intakes, then claim → render → freeze → send (Resend, `Idempotency-Key: practice-notice/{id}`) → finish, with the same retry and permanent-failure rules as `_shared/ltb-intake-alert.ts`. Rendering lives in `_shared/practice-notices.ts` and uses the catalog.

Client email rules:
- From `snapshot.practice.clientEmailFrom`, `reply_to` `clientReplyTo`, to the client only. Refuse (permanent `sender_missing`) when either is missing. Staff notices use `noticeFrom` or `Fabsy Case Desk <hello@fabsy.ca>`.
- Subject `{File number} · {headline}` (portal_link: `Your secure link · {practice displayName}`).
- Body: crest logo (`{siteUrl}/crest-email.png`), greeting by first name, one-line headline, the stage `clientNext` copy, the staff personal message in a quoted block when present, key dates when relevant, a primary button to the file (portal link signed for 30 days, iat = notice `created_at`), and a footer with phone, public email, practice legal name and "Representation begins only after a written retainer." Plain-text alternative included. No Fabsy branding in client emails.
- Headlines: `intake_received` "We have your file", `stage_changed` the stage `clientLabel` (closed adds the outcome label), `documents_requested` "We need a document from you", `document_shared` "A new document is in your file", `upload_invite` "Upload your documents", `portal_link` "Your secure link".
- Staff alerts: `staff_new_intake` (mirrors the LTB alert content for traffic/general fields, link `{siteUrl}/admin/files/{area}/{id}`), `staff_client_uploaded` (count, note, link).

## 5. Frontend

### 5.1 Build and routing (`vite.anderhue.config.ts`, `scripts/build-anderhue.mjs`, `ontario/anderhue-paralegal-site/vercel.json`)

Two Vite entries in `ontario/anderhue-paralegal-site/`: `client.html` → `src/anderhue-client.tsx` (intake + portal), `portal.html` → `src/anderhue.tsx` (staff). Static public pages are copied as-is. Rewrites: `/start` and `/files/:path*` and `/files` → `/client`; `/sign-in`, `/admin` and `/admin/:path*` → `/portal`. `noindex` headers on `/start`, `/files`, `/sign-in`, `/admin`.

### 5.2 Client app (`src/anderhue/client/`)

Routes: `/start` (wizard), `/files` (sign-in by link or file list), `/files/:area/:id` (file detail). Talks only to `ltb-intake`, `practice-intake` and `practice-portal` with `fetch` (anon key headers like the landlords form). Uploads use `XMLHttpRequest` PUT of `FormData` to the signed URL (with `x-upsert: false`, `apikey`, `Authorization: Bearer <anon>`) for real progress. The portal token from `#t=` is moved into `sessionStorage` (`anderhue.portal.v1`) and stripped from the URL; "Remember this device" also keeps it in `localStorage`. No Supabase auth session is used by clients.

### 5.3 Staff app (`src/anderhue/staff/`)

Email and password sign-in (same rules as the current `AnderHuePortal.tsx`: signup creates a login only, membership via `ltb_my_practices`). Routes: `/sign-in`, `/admin/today`, `/admin/landlord`, `/admin/traffic`, `/admin/other`, `/admin/files/:area/:id`, legacy redirects `/admin/ltb` → `/admin/landlord` and `/admin/ltb/cases/:id` → `/admin/files/ltb/:id`. Every query is scoped with `practice_id = eq.anderhue-paralegal`. Writes only through the staff RPCs in 3.4, `ltb_set_client_registration`, the granted column updates, and storage uploads to registered paths.

### 5.4 Design tokens (public site and both apps)

- Colours: plum-950 `#140a24`, plum-900 `#1d1032`, plum-800 `#2d1848`, plum-600 `#673b86`, plum-100 `#ede5ef`, gold-600 `#9a7641`, gold-500 `#b28d54`, gold-300 `#d5b47c`, gold-200 `#e9d8b8`, ivory-50 `#fffdf9`, ivory-100 `#f7f1e8`, ivory-200 `#efe6d8`, ink `#261d2c`, ink-2 `#54465d`, muted `#6e6274`, line `#ded3c8`, line-strong `#c9b9c6`, danger `#b22a1f`, danger-soft `#f6deda`, success `#2f6b4f`, success-soft `#dcebe2`, warn-soft `#f5e6a8`, warn-ink `#4a3a00`.
- Type: display `Newsreader` (400/500, optical sizes), body `Public Sans` (400/500/600/700), numbers and file numbers `IBM Plex Mono` (400/500). Google Fonts with `display=swap` and preconnect.
- Shape: 6px radius on controls and cards, 1px hairline rules, gold focus ring (`outline: 3px solid #b28d54; outline-offset: 2px`).
- Motion: 150 to 250 ms ease-out; none under `prefers-reduced-motion`.
- Light theme only. WCAG AA contrast. Everything works at 360 px wide with no horizontal scroll.

## 6. Tests

- `scripts/test-practice-files.mjs` (node:test + esbuild bundles): catalog integrity (unique values, every area has the common stages, notify flags match the SQL list), intake parsing, ticket extraction normalisation, portal token sign/verify/tamper/expiry/revocation, portal handler against an in-memory fake (session, file, upload, download authorisation across clients), notice rendering for every kind and stage, outbox processing (sent, retry, permanent failure, superseded skip, recipient policy).
- `supabase/tests/practice-files.test.sql` (rolled-back transaction, same style as `ltb-intake.test.sql`), run locally against PostgreSQL 16 with Supabase stubs.
- `scripts/verify-anderhue-browser.mjs` (Playwright, fixtures only): public pages, `/start` for all three areas, `/files` link request, token portal, upload, staff sign-in, Today, boards, file detail, stage change preview, practice scoping.

### Browser compatibility

The `AnderHue browser compatibility` GitHub workflow runs the complete suite in
Chromium, Google Chrome, Microsoft Edge, Firefox and WebKit on each relevant pull
request. WebKit runs on macOS. Choose one locally with
`AH_QA_BROWSER=webkit npm run verify:anderhue` (also `chromium`, `chrome`, `msedge`,
or `firefox`); install its runtime first with `npx playwright install <browser>`.
Chrome and Edge use their branded stable channels, not a user-agent override.

Coverage includes 360/390/1440 px layouts, mobile navigation, keyboard focus,
touch file selection, all three intake flows, reload recovery, partial uploads,
portal sign-in and expiry, document downloads, and the 22 staff checks. Firefox
uses narrow viewports with touch because its Playwright driver does not support
the `isMobile` flag. This is browser-engine and device emulation coverage, not a
claim that every physical phone or OS version has been tested.

Intake text drafts save after each field update and flush when the page is
hidden, avoiding lost answers during quick reloads or mobile backgrounding.
Staff downloads use the same attachment navigation as the client portal,
without opening a second window after the signed-link request.
Downloads in QA use a real local HTTP attachment because WebKit's mocked PDF
responses do not emit a download event (Playwright issue 22691). The download
still requires the fixture client or staff document authorization and checks
the actual browser download filename. Chromium-based staff PDF checks also use
real HTTP responses. Firefox and WebKit cannot fulfill intercepted redirects,
so their staff checks assert the authorized download URL and safe filename;
their native attachment download is exercised through the client portal.
Playwright 1.63 drives the current branded browsers. No production data or
emails are used.

The browser Supabase SDK is 2.117.2 or newer. Firefox 155 exposed an unhandled
Navigator LockManager error in the former 2.57.4 auth initialization. The
supported SDK uses lockless session coordination with refresh deduplication
and stale-refresh commit guards; we do not disable auth or supply a no-op lock.

## 7. Go-live checklist

Order matters: the portal must be live before any client email can link to it.

1. Apply the migration; deploy `practice-intake`, `practice-portal`, `process-practice-notices` (`--use-api`, `verify_jwt=false`); set `PRACTICE_ALLOWED_ORIGINS` and `PRACTICE_PORTAL_SIGNING_SECRET` (32+ random characters). Confirm the functions receive `cf-connecting-ip`; without it every visitor shares one rate-limit bucket.
2. Deploy the reviewed `dist-anderhue` build to production (anderhue.ca).
3. Cloudflare DNS for anderhue.ca: Resend domain records (DKIM, SPF, return path) and inbound forwarding for `hello@anderhue.ca`.
4. After Resend verifies the domain: `update ltb_practices set client_updates_enabled = true, notice_from = 'AnderHue Case Desk <files@anderhue.ca>' where id = 'anderhue-paralegal';`
5. Point `alert_emails` at the practice inbox once forwarding works (today alerts go to info@onlineparalegals.ca and brett@execom.ca).
6. Have the AnderHue team work files at anderhue.ca/admin. The Fabsy admin's LTB pages still work but send no client emails.

### Production deployment command

Run `npm run deploy:anderhue` from the repository root. It builds first, links the
fresh output directory to `execom/anderhue-paralegal`, verifies the expected project
and team IDs, then deploys with an explicit working directory and configuration.
Vite removes the previous output directory, including `.vercel`, during a build;
never assume a link made before the build still exists. The generated deployment
configuration disables npm build/install detection because the output is already
built. Passing only `--cwd` from the Fabsy root can pick up the parent project's
configuration and omit the AnderHue routes and headers.

### Launch status, October 1, 2026

- The practice-files migration is applied to `gcasbisxfrssonllpqrw` and recorded
  in migration history. The three edge functions and both `PRACTICE_*` secrets
  are deployed. The allowed origins include the production apex, www, production
  Vercel alias and the separate preview alias. A temporary authenticated probe
  confirmed `cf-connecting-ip` reaches the edge runtime; that probe was deleted.
- Production deployment `dpl_7xmrqijMXLwtLggux1xTJrQqb8P2` serves `anderhue.ca`.
  Public pages, `/start`, `/files`, `/admin` and nested portal routes returned 200
  with the production CSP. Private app routes carry `noindex, nofollow`.
- All 48 practice unit tests, the local PostgreSQL SQL harness, and the complete
  browser suite (including 22 staff checks) passed. The keyboard-focus assertion
  now waits for the application's scheduled focus change. The portal stepper
  uses a dark base foreground and light checkmarks only on completed steps,
  passing the shared contrast guard. Live traffic/general
  submission, signed upload and finalization passed with synthetic records;
  zero notices were queued, and the test records and objects were removed.
- The unverified Ontario Paralegal Association membership chip was removed.
- Cloudflare inbound MX, SPF and routing DKIM records are installed. A forwarding
  destination for `hello@anderhue.ca` still needs to be selected and configured.
  `brett@execom.ca` is already a verified Cloudflare destination;
  `info@onlineparalegals.ca` is not in the current verified destination list.
- Resend's production secret exists and is restricted to sending. It cannot list
  or manage domains. The browser's `brettbilon@gmail.com` Resend account lists
  `auth.fabsy.ca`, but neither `fabsy.ca` nor `anderhue.ca`; the production email
  account must be identified before adding/verifying AnderHue's sending records.
- **Client updates remain disabled.** Template approval has not been recorded.
  Staff alerts still target `info@onlineparalegals.ca` and `brett@execom.ca`.
  The minute notice-worker schedule is active; its outbox is empty.
- The imported `anderhue-files.bundle` was verified against the GitHub branch
  and removed from `fabsy-ltb`.

The prior production deployment for rollback is
`anderhue-paralegal-f94b46s09-execom.vercel.app`. A frontend rollback does not undo
the additive database migration or enable client emails.
