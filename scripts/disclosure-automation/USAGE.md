# Disclosure automation helpers

These scripts support the browser operator. They do not open the portal, enter a
plea, submit a request, change Supabase records, or send email.

## Read all candidate pages

From the checkout containing these scripts, run:

```sh
python3 scripts/disclosure-automation/query.py --offset 0 --limit 50
```

The helper uses existing authenticated Supabase CLI access and enforces a
read-only database transaction. Do not use debug logging or print credentials.
`--print-sql` prints the reviewed query without contacting any service.

Every returned row includes `active_representation_count`, `page_offset`,
`page_limit`, and `page_has_more`. When `page_has_more` is true, run the next page
with `--offset 50`, then `100`, and so on. Continue even if every previous row is
held or already submitted locally. Stop only at `page_has_more=false` or an empty
page. Keep the same limit throughout an enumeration; do not change remote case
state during pagination. New records normally append to the stable
`created_at,id` order and will also be found on the next hourly enumeration.

Rows are candidates for review, not a submit list. Verify representation payment,
refund/dispute holds, document content, case identity, exact plea instruction,
duplicate case counts, all-date disclosure acknowledgements, and the local
ledger before proceeding. A new quick-intake plea requires the v3 JSON boolean
`pleadNotGuilty=true`; false must never be replaced by a legacy strategy. Legacy
strategy indicators require actual detailed-intake origin verification. No DOB,
licence, client email, or defendant explanation is returned by this query.
`disclosure_request_state=already_acknowledged` prohibits repeating disclosure;
it does not establish that the separate plea/trial step happened. Ambiguous
acknowledgements and partial cases require reconciliation under the approval
service's existing guards before continuation.

## Reserve and record a browser attempt

Ledger data defaults to `~/.codex/fabsy-disclosure/ledger.sqlite3`, outside git.
`--data-dir /absolute/private/directory` overrides the directory and belongs
before the subcommand. All claims for the same normalized ticket share one row,
even if a duplicate submission ID exists. Claims never expire automatically.

```sh
python3 scripts/disclosure-automation/ledger.py status --ticket T12345678Z
python3 scripts/disclosure-automation/ledger.py claim --ticket T12345678Z --submission-id SUBMISSION_UUID
```

Save the returned `claim_token`; use the same claim for both separate steps.
The observed portal has a trial request and a separate disclosure form with
consent upload. Choose `--step plea` or `--step disclosure` to match the actual
form. After verifying it, **before its final click**, persist the attempt and
hash the actual consent file:

```sh
python3 scripts/disclosure-automation/ledger.py mark-submitting --ticket T12345678Z --claim-token CLAIM_UUID --step disclosure --consent-file /absolute/private/consent.pdf
```

Only after the portal confirms success, record its actual reference or a saved
confirmation evidence file (both may be supplied):

```sh
python3 scripts/disclosure-automation/ledger.py confirm --ticket T12345678Z --claim-token CLAIM_UUID --step disclosure --reference DISCLOSURE_REFERENCE --evidence /absolute/private/disclosure-confirmation.png --note 'Portal confirmed disclosure request'
```

Repeat the mark/confirm protocol for `--step plea` only if that step is actually
ready and lacks a receipt. Store its separate trial reference and evidence. One
confirmed step yields `status=partial`; both confirmed steps yield `completed`.
If trial-appearance preference is missing, hold the plea without losing or
repeating a confirmed disclosure request. A confirmed plea is likewise preserved
if disclosure fails. `completed_steps` and `steps` show these independent facts.

If the response is uncertain after a click, use `mark-uncertain --step ...` with
the ticket, claim token and reason in `--note`. An interrupted `submitting` step
has the same no-retry effect. `hold` records a blocker for a case without an
unresolved final click, including a partial case. `list` shows all states. Never
click again merely because a run stopped.

Manual `resume` requires `--verified-not-submitted`, an existing `--evidence`
file, a `--note`, and `--step plea` or `--step disclosure` for an uncertain step.
Verify that specific operation did not occur. It makes the case ready for a new
explicit claim, preserves all confirmed steps and old events, and invalidates the
prior token. Confirmed steps can never be resumed or reset. Revalidate source
records and authority before continuing in the same still-live accepted Terms
session. A lost session after consumption or disclosure acknowledgement requires
explicit operator reconciliation/new case-specific permission, never an
automatic approval reissue.

`record-existing --step plea` or `--step disclosure`, with ticket, claim token,
actual `--reference` or `--evidence`, and `--note`, records an independently
verified prior receipt. It never infers the other step. Historical single-record
submissions remain `legacy_submitted_needs_reconciliation`; adding one known
receipt leaves the other uncertain until separately reconciled.

`--step combined` is available only for a genuinely observed future UI that
performs both operations in a single submit. Its mark command additionally
requires `--combined-observed --evidence /absolute/private/combined-summary.png`.
The current separate forms do not qualify. Never reuse older helper copies that
predate per-step tracking against this ledger.

## Phone approval API

`approval-api.py --request-file /absolute/private/request.json` invokes only
`create`, `status`, `consume`, or `revoke` against the linked project's
`disclosure-approval` function. It retrieves the existing project service key
through authenticated Supabase CLI access into memory; it never prints or saves
the key or follows HTTP redirects. Request JSON must be outside this repository.
The helper never approves or rejects on Brett's behalf. No automatic retry is
performed after an uncertain API response.

The `create` request must contain `action`, `submission_id`, `ticket_number`,
`portal_session_id`, `terms_url`, `terms_text`, `terms_version`, `consent_sha256`,
`portal_terms_unchecked: true`, and `case_documents_verified: true`. Add
`legacy_plea_origin_verified: true` only after verifying an existing legacy
detailed-form not-guilty instruction. The terms URL must be the actual
`https://traffictickets.alberta.ca/` URL and the text must be captured from the
live unchecked terms step. Creating the request sends the configured approval
text; only do so under the user's authorized approval workflow.

Every ticket-specific approval SMS must include the full actual ticket number
from the stored case, matched to the prepared ticket and consent. Hold the request
without sending a text if the number is missing, invalid, or mismatched. Keep the
phone preview masked and keep bearer links and tokens out of logs.

`status` and `revoke` need `action` and the approval `id`. `consume` requires
`action`, `id`, `submission_id`, `portal_session_id`, `case_fingerprint`,
`consent_sha256`, and `terms_sha256` returned for the same prepared session.
Successful consumption is a single-use authorization receipt, not proof of a
portal submission; retain the local ledger's separate final-click protocol.

## Local verification

```sh
python3 -m unittest discover -s scripts/disclosure-automation -p 'test_*.py' -v
```

The SQL tests create and remove a dedicated local PostgreSQL cluster with
synthetic records. They never connect to Supabase or use real client files.
