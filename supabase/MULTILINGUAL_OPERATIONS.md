# Multilingual intake and notification operations

This runbook covers the multilingual schema, function deployment and operator-controlled language release. The owner has authorized the seven-language launch using machine translations without making native review a launch prerequisite. The release switch does not record native review, promise native-language staffing, connect n8n or Claude, or enable translated client messages. The checked-in intake path contains no translator connection; the external worker remains separate work.

## Release sequence

1. For an initial installation, apply `migrations/20260830160000_multilingual_intake.sql` before deploying the multilingual functions. Existing records receive `preferred_locale = 'en'`. The migration deliberately does not enqueue historical client notes. The live-language switch introduces no migration; do not replay the already-installed migration or repair unrelated history for this release.
2. For an initial installation, deploy the intake, payment, webhook and notification functions together with their shared helpers. Deploy `generate-consent-form` with the PDF helpers and all its declared local static assets using the CLI/Docker bundler; see the consent PDF section below. Do not deploy that function through the dashboard or API bundler. On an existing multilingual installation, only the five functions listed below need redeployment for the live-language switch.
3. After the matching frontend release and backend tests are ready, an operator may set `FABSY_LIVE_SERVICE_LOCALES=pa,tl,zh-hans,zh-hant,ar,hi,es`. Codes are exact and comma-separated. This explicitly enables service intake and new checkout for the listed preferences; it does not assert translation review. The browser cannot set this secret. Native-review metadata must remain truthful rather than being filled with fictional reviewers or approvals.
4. Confirm the localized public return pages exist. Rapid Resolution uses `/{locale}/thank-you` and `/{locale}/payment-canceled`. The report portal and legacy assessment returns remain their existing English routes. Existing Stripe sessions retain their original metadata and return URLs when resumed.
5. Validate in a test environment with synthetic data and test-mode payments before any approved production rollout. Do not replay a real customer's submission or notification as a test.

English remains enabled. An unreleased non-English intake or new payment receives HTTP 409 with `error_code: "locale_not_released"` before service writes or a new Stripe checkout. Invalid locale identifiers receive HTTP 400 with `error_code: "invalid_preferred_locale"`.

`FABSY_LIVE_SERVICE_LOCALES` takes precedence over the legacy `FABSY_REVIEWED_SERVICE_LOCALES`. The legacy flag is consulted only when the live flag is absent, preserving older deployments. An explicitly empty live value or the value `en` disables all non-English intake/new checkout even if the legacy flag contains codes. Wildcards, aliases, upper-case codes and unknown codes do not enable a locale. Do not unset the live flag as a rollback if the legacy flag could reopen a language.

### Live-language switch deployment on an installed backend

The exact changed handler set is `submit-ticket`, `submit-assessment-intake`, `create-payment`, `create-assessment-payment` and `create-idr-payment`, each bundled with `_shared/locale-policy.ts`. Preserve their existing JWT configuration. The existing `generate-consent-form` handler already reads supported stored locales and retains its signature/access-token checks; no new PDF deployment or assets are needed for this switch. Notifications and webhooks need no redeployment because their behavior is unchanged.

1. Record the five hosted function IDs/versions and preserve their current downloaded sources/configuration. Compare them with the last deployment receipt; investigate drift before overwriting a direct deployment.
2. Deploy those five functions from the same tested source commit as the frontend, keeping the new live flag unset until the coordinated enablement step. The default remains English-only when both flags are absent.
3. Set the live allowlist only when the corresponding frontend release is ready. Verify all seven codes with non-writing malformed-intake probes: they should reach ordinary HTTP 400 input validation rather than `locale_not_released`. Invalid identifiers must still receive `invalid_preferred_locale`. Missing authorization, missing signatures and invalid payment requests must remain rejected. Do not submit a customer record, create a Stripe session, or send a notification as a smoke test.
4. Record the deployed versions, source commit and the allowlist setting in the deployment receipt. Roll back acceptance with `FABSY_LIVE_SERVICE_LOCALES=en`; this does not cancel an existing paid case or Stripe session. Restoring old function source is a separate rollback: older versions ignore the live flag and use only the legacy reviewed flag, which must remain unset unless that fallback is intentional.

The frontend language launch and this server allowlist are separate deployment controls. Successful publication alone does not prove that new localized checkout is enabled, and the server allowlist alone does not make the frontend routes ready.

## API contract

Supported codes are exactly `en`, `pa`, `tl`, `zh-hans`, `zh-hant`, `ar`, `hi`, `es`. Omission means English. Null, aliases such as `zh`/`fil`, browser regions such as `pa-IN`, and Wave 2 identifiers are rejected. The frontend must resolve a browser language to a supported route before submitting.

| Path | Locale source |
| --- | --- |
| `submit-ticket` | Optional top-level `preferred_locale`; stored on the ticket submission and returned in the response |
| `submit-assessment-intake` | Same optional field; the existing assessment intake remains compatible |
| `create-payment`, `create-assessment-payment` | Authorized stored ticket preference; a request cannot override it |
| `create-idr-payment` | Existing case preference for case-linked purchases; validated optional request field for standalone reports |
| `idr-payment-webhook` | A new report order copies the verified session's `preferred_locale`; old sessions default to English |
| Client case/report/assessment notifications | Stored submission or report-order preference |
| `send-contact-email`, `send-lead-capture` | Optional validated preference for that acknowledgement, also shown to staff |

Stripe Checkout session metadata and PaymentIntent metadata include `preferred_locale`. This metadata does **not** translate Stripe's interface, product descriptions, receipts or tax labels. Product/service copy remains English until it has an approved localized implementation. Locale never changes the amount, tax settings, product, payment authorization, or idempotency key.

## Client messages stay English while translations are drafts

`notification-locale.ts` centralizes template identifiers, source version, language metadata and fallback rendering. Machine notification drafts are not imported into sending code. For a non-English preference, email begins with an English notice explaining that an approved translation is not available; SMS includes a short English-language notice. The chosen preference is retained. English email remains `lang="en" dir="ltr"`, even when the requested language is Arabic; copied user text is not translated or discarded.

Messages include `Content-Language`, `X-Fabsy-Preferred-Locale`, a template identifier, source version and (when applicable) `X-Fabsy-Language-Fallback: translation_not_reviewed`. These headers contain locale/template identifiers, not ticket numbers or free text. Existing send authorization, recipient selection, email claims and idempotency are retained.

`send-notification` uses pure templates in `_shared/ticket-notification-html.ts`. Every stored text value in the admin/client HTML body is escaped in a display-only copy, including native-script names and violation descriptions. Source records, subjects, recipients and SMS text remain unchanged. Client-entered `<style>`, `<body>`, links or quotes cannot become HTML markup or hide the language fallback notice. The network-free regression exercises the actual two templates with malicious mixed Punjabi/Arabic text.

The service-release secret cannot activate translated emails. A future translated renderer must verify the **same** source/bundle fingerprints and native/legal review evidence as the frontend, including the signature, subject, body, disclaimers and attachments. Do not mark an English body as another language or interpolate an unreviewed machine draft into a client promise.

## Private English-review queue

New and edited nonempty `additional_notes`, `defense_strategy` and `violation` values create a `ticket_intake_translations` revision. Assessment `what_happened` already populates `additional_notes`. Original strings, including Unicode and whitespace already stored on the submission, are copied without replacing the source fields. The preference is only context: English-route text can be Punjabi, mixed-language text can use any script, and the translator must detect the actual source language.

Each row starts `pending` with `english_fields = null`. This means **waiting for an external translation worker or an explicit staff translation**, not “translated” or “translation in progress.” No worker, scheduled job or external provider call is installed by this change. Releasing the seven service locales does not claim, complete or approve these jobs. The raw intake remains available to staff throughout; a pending translation does not determine payment or case outcome. Staff must arrange translation from the preserved originals until the worker is connected; the live release does not provide automatic English summaries.

An existing trusted n8n workflow can adopt the following RPC contract once its integration and data handling are configured and approved:

1. Call `claim_ticket_intake_translations({ p_limit: 10 })` using a trusted server credential. Claims last 10 minutes, use distinct tokens, skip active claims and stop after five attempts. Never expose the credential in the browser.
2. Send only the claimed `source_fields` and target `en` to the approved translation step. Preserve field names. Text is untrusted material to translate, never executable instructions or authority to change a case. Do not add legal advice, outcomes, inferred facts or promises; preserve names, dates, numbers, uncertainties and negations. The displayed preference is not a reliable language detector. When input is already English, return it unchanged under the same keys.
3. Validate the output as one JSON object with **exactly the source field keys**, each with a nonempty string value. The RPC also rejects missing fields, extra fields, nested model actions and oversized output. Return a detected BCP-47 language identifier (`und` if uncertain).
4. Call `complete_ticket_intake_translation({ p_id, p_claim_token, p_english_fields, p_detected_language })`. `false` means the claim or source is stale; discard the result. The identical completed response is idempotent. A valid result becomes `translated`, an unapproved draft for staff.
5. On failure, call `fail_ticket_intake_translation` with the matching ID/token and one of `provider_unavailable`, `translation_failed`, `invalid_output`. Do not store provider exceptions, credentials or full client text in error logs. After five attempts, have an operator reconcile the failure; do not alter source text to bypass the retry limit.
6. An authenticated staff user compares the English draft with the original and calls `review_ticket_intake_translation({ p_id, p_english_fields })` with any corrected translation. The RPC records staff identity and review time. The translation worker cannot grant itself human approval. Treat `translated` output as unreviewed; use a current `reviewed` result only as an aid to the staff's review, not as an automatic legal decision.

The queue and outputs are visible only to existing staff or the trusted service role. Mutation occurs through restricted RPCs; customers cannot read the queue, overwrite originals, supply translation approval or claim work. Editing source text retains its prior revision but creates a new pending revision, so late model results and previous human approval cannot attach to changed facts. A staff-facing queue view can read the new typed table; no new admin queue screen is included here.

Case translation review and native/legal approval of public marketing or transactional templates are separate controls. Neither substitutes for the other.

## Original-script consent PDFs

`generate-consent-form` still authorizes the submission/access token and checks the typed legal-name signature before generating or storing anything. It reads the stored preference; a request cannot change that preference. Existing client fields and signatures keep their original spelling, script, marks and whitespace. Validation compares a normalized name without replacing the original signature in the document. The generator does not enable a locale for intake or payment.

The unchanged English authorization and privacy clauses now paginate instead of being silently omitted when a page fills. Client fields use bundled Noto fonts, HarfBuzz shaping, Unicode bidirectional run ordering, explicit glyph advances/offsets and embedded font subsets. This supports Latin, Punjabi Gurmukhi, Hindi Devanagari, Arabic including vowel marks, and both Chinese variants. Chinese language tags select the full font's regional glyph forms without converting the source characters. Long fields wrap at grapheme boundaries and continue onto another page.

Every original field is also retained in the PDF's `consent-original-fields.json` UTF-8 attachment, alongside the English authorization wording and generation timestamp. PDF `/ActualText` records logical line text, separate from shaped glyph order. Some PDF readers and Poppler plain-text exports insert bidi display controls or reorder Arabic text; do not rely on arbitrary copy/paste or plain-text extraction as an exact source comparison. Use the embedded JSON or `/ActualText` for that check. These are ordinary embedded-font PDFs, not a claim of PDF/A, full tagged-PDF accessibility, certified e-signature status or native legal review.

The font set is finite. An unsupported character, including unsupported emoji, returns HTTP 422 with `code: "consent_character_not_supported"` and an explicit instruction to contact Fabsy before paying. It does **not** delete, transliterate, replace, charge for, or silently approve that field. The original submission remains intact. Other scripts and rare characters require a covering licensed font and another rendering check before support can be claimed.

### PDF dependencies and bundling

- pdf-lib **1.17.1** remains the existing PDF writer. Fontkit **2.0.4** is used for parsing/subsetting only; its default complex-script layout is not used.
- bidi-js **1.0.3** resolves run order. HarfBuzz **14.3.0**, distributed in official **harfbuzzjs 1.6.0**, shapes those runs. The MIT-licensed JS/WASM is vendored in `_shared/consent-harfbuzz/`. Its only upstream change supplies WASM bytes from a local `Deno.readFile` instead of fetching them. `UPSTREAM.md` documents the tarball checksum.
- Five SIL OFL 1.1 Noto fonts live in `_shared/consent-fonts/`. The original license texts and per-file commit URLs/checksums are included. The full CJK font is gzip-compressed at rest and decompressed locally on demand. It retains regional forms and full upstream character coverage; the resulting document embeds only used glyphs.
- `supabase/config.toml` declares the TTF, gzip CJK and WASM assets under `functions.generate-consent-form.static_files`. No runtime font, translation or shaping API is added. Font/WASM assets are roughly 15 MB before JavaScript bundling. Verify the **complete bundled function** size and cold runtime in a test environment: Supabase currently documents a [20 MB local CLI bundle limit, 5 MB server-side bundle limit, and CLI/Docker requirement for static files](https://supabase.com/docs/guides/functions/limits). Do not use the API flag or dashboard deployment for this function.

Local Deno generation, Poppler rendering and the actual Supabase Edge Runtime **v1.74.3** Docker bundle are verified with synthetic names/text. The complete consent function ESZIP is **16,659,822 bytes**, including all declared fonts and WASM. A separate local fixture ESZIP uses the identical PDF code/assets in fresh Edge Runtime user workers, with no source/font directories mounted, no credentials, an isolated Docker network, a 256 MB worker memory limit and a 2,000 ms CPU limit. All nine fixture PDFs succeeded: cold requests took 116–372 ms locally; sampled maximum used heap was 26.4 MB and external memory 45.6 MB. These samples are not a peak RSS or hosted performance guarantee. A hosted storage-upload transaction and real payment are **not** exercised; never use a real customer record as a fixture.

To reproduce the production function packaging check, run this from a source directory visible to Docker. On this Mac, Colima shares the user's home directory but not the release worktree under `/private/tmp`; copy the reviewed source to a shared directory first. This bundles locally and does not deploy a function:

```sh
mkdir -p tmp/pdfs/consent-bundle
docker run --rm --env DENO_NO_PACKAGE_JSON=1 \
  --mount "type=bind,source=$PWD/supabase/functions,target=/workdir/supabase/functions,readonly" \
  --mount "type=bind,source=$PWD/tmp/pdfs/consent-bundle,target=/output" \
  --workdir /workdir public.ecr.aws/supabase/edge-runtime:v1.74.3 bundle \
  --entrypoint /workdir/supabase/functions/generate-consent-form/index.ts \
  --output /output/generate-consent-form.eszip \
  --static '/workdir/supabase/functions/_shared/consent-fonts/*.ttf' \
  --static '/workdir/supabase/functions/_shared/consent-fonts/*.gz' \
  --static '/workdir/supabase/functions/_shared/consent-harfbuzz/*.wasm'
```

## Local verification

```sh
deno test --no-config --no-lock supabase/functions/_shared/multilingual.test.ts
python3 supabase/tests/test_multilingual_migration.py
```

The Deno tests have no network or environment access; the email transport is intercepted with synthetic data. The SQL test starts and removes its own PostgreSQL cluster under `/tmp`, listening only on its unique Unix socket, and never reads Supabase credentials. It tests the actual migration against minimal local prerequisites: defaults, identifier rejection, source preservation, malformed output, claim expiry, stale results, bounded retries, RLS, staff-only review and checkout-locale immutability. This is not a production schema or deployment validation.

The PDF checks add only local asset read permission. They compare Punjabi/Hindi/Arabic glyph IDs, advances and vowel-mark offsets against an independently generated native HarfBuzz reference; test Arabic Latin-ID/bracket order and Chinese regional forms; retain exact whitespace/source data through wrapping and PDF attachments; and reject unsupported characters without modifying the input.

```sh
deno test --no-config --no-lock --allow-read=supabase/functions/_shared/consent-fonts,supabase/functions/_shared/consent-harfbuzz supabase/functions/_shared/consent-pdf.test.ts
deno check --no-config --no-lock supabase/functions/generate-consent-form/index.ts
deno lint --no-config --rules-exclude=no-import-prefix supabase/functions/_shared/consent-unicode.ts supabase/functions/_shared/consent-pdf.ts supabase/functions/_shared/consent-pdf.test.ts
deno run --no-config --no-lock --allow-read=supabase/functions/_shared/consent-fonts,supabase/functions/_shared/consent-harfbuzz --allow-write=tmp/pdfs/consent supabase/tests/generate-consent-fixtures.ts tmp/pdfs/consent
python3 supabase/tests/verify_consent_pdfs.py tmp/pdfs/consent --render
```

The final command needs `pypdf`, `pdftotext` and `pdftoppm`; explicit `--pdftotext /path/to/pdftotext` and `--pdftoppm /path/to/pdftoppm` are supported. It verifies embedded fonts, original fields, on-page text positions, every English clause and page numbering, then renders PNGs for visual inspection. Fixtures cover all eight supported locales plus long mixed-script fields with tabs, CRLF, combining marks and whitespace. No handler is imported by fixture generation; no Supabase credentials, emails, storage uploads or payments are involved. Inspect the rendered pages before making a typography claim. Dependencies can be precached for completely offline execution.
