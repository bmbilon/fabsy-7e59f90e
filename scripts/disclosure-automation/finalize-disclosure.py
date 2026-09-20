#!/usr/bin/env python3
"""Record an already confirmed disclosure request, never submit another one.

The receipt RPC can advance staff status and queue its authorized client notice.
It does not file a plea, contact the traffic portal or send an email directly.
One RPC attempt only; uncertain attempts require reconciliation before retry.
"""
import argparse
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import urllib.error
import urllib.request
import uuid


def local_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


approval_api = local_module('disclosure_finalizer_approval_api', 'approval-api.py')
ledger_module = local_module('disclosure_finalizer_ledger', 'ledger.py')
Ledger = ledger_module.Ledger
REPO = Path(__file__).resolve().parents[2]
MAX_RESPONSE_BYTES = 100000
STATUS_SYNC = {'advanced', 'already_requested', 'held_deleted', 'held_inactive',
               'held_ambiguous', 'held_later_stage'}
STAFF_STAGES = {'partial', 'paid', 'disclosure_requested', 'crown_offer_received',
                'done_reduced', 'done_withdrawn', 'lapsed_expired', 'trial_proceeding',
                'trial_date_pending', 'trial_date_set', 'trial_concluded_reduced',
                'trial_concluded_upheld'}
RESPONSE_FIELDS = {'receipt_id', 'created', 'status_sync', 'submission_id', 'ticket_number',
                   'source', 'portal_session_id', 'confirmed_at', 'staff_stage_before',
                   'staff_version_before', 'staff_version_after', 'outbox_id'}


class FinalizeError(Exception):
    """Only fixed, non-sensitive error messages may be printed."""


def identifier(value):
    try:
        parsed = str(uuid.UUID(value))
        if value != parsed:
            raise ValueError()
        return parsed
    except (ValueError, TypeError, AttributeError):
        raise FinalizeError('A canonical UUID is required; do not invent missing session or operation identifiers.') from None


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed
    except (ValueError, TypeError, AttributeError):
        raise FinalizeError('A recorded confirmation timestamp with timezone is required.') from None


def private_path(value):
    path = Path(value).expanduser().resolve()
    if path == REPO or REPO in path.parents or any((parent / '.git').exists()
            for parent in (path, *path.parents)):
        raise FinalizeError('Receipt evidence and runtime files must stay outside repositories.')
    return path


def file_digest(value):
    if not isinstance(value, str) or not Path(value).expanduser().is_absolute():
        raise FinalizeError('An existing absolute evidence or consent path is required.')
    path = private_path(value)
    try:
        if not path.is_file() or not 0 < path.stat().st_size <= 50 * 1024 * 1024:
            raise FinalizeError('Evidence and consent must be nonempty regular files of at most 50 MiB.')
        digest = hashlib.sha256()
        with path.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
    except OSError:
        raise FinalizeError('Local evidence or consent could not be read.') from None
    return str(path), digest.hexdigest()


def prepare_request(ledger, ticket, claim_token, portal_session_id):
    ticket = ledger_module.ticket_key(ticket)
    identifier(claim_token)
    identifier(portal_session_id)
    row = ledger.get(ticket)
    if not row or not isinstance(row.get('claim_token'), str) or not hmac.compare_digest(row['claim_token'], claim_token):
        raise FinalizeError('The claim token does not own this ticket.')
    step = row.get('steps', {}).get('disclosure')
    if not step or step.get('status') != 'confirmed':
        raise FinalizeError('The disclosure step must already be locally confirmed; a plea receipt is insufficient.')
    operation_id = identifier(step.get('operation_id'))
    confirmed_at = timestamp(step.get('confirmed_at'))
    if confirmed_at > datetime.now(timezone.utc) + timedelta(minutes=5) or timestamp(step.get('started_at')) > confirmed_at:
        raise FinalizeError('The recorded disclosure confirmation time is inconsistent; reconcile the ledger.')
    evidence_path, evidence_sha = file_digest(step.get('evidence_path'))
    if len(evidence_path) > 1000 or any(ord(char) < 32 for char in evidence_path):
        raise FinalizeError('The private evidence reference is invalid.')
    _, consent_sha = file_digest(step.get('consent_path'))
    if not re.fullmatch(r'[a-f0-9]{64}', step.get('consent_sha256') or '') or (
            consent_sha != step['consent_sha256'] or consent_sha != row.get('consent_sha256')):
        raise FinalizeError('Consent differs from the confirmed disclosure attempt; reconcile before recording the receipt.')
    return {
        'p_submission_id': identifier(row['submission_id']), 'p_ticket_number': ticket,
        'p_source': 'portal', 'p_source_key': 'portal:' + operation_id,
        'p_confirmed_at': step['confirmed_at'], 'p_evidence_reference': evidence_path,
        'p_evidence_sha256': evidence_sha, 'p_portal_session_id': portal_session_id,
        'p_confirmation_id': None, 'p_request_confirmed': True,
    }, consent_sha


def safe_response(payload, request):
    if not isinstance(payload, dict) or not RESPONSE_FIELDS <= payload.keys():
        raise FinalizeError('Receipt API returned an unexpected response; reconcile before retrying.')
    result = {name: payload[name] for name in RESPONSE_FIELDS}
    if result['submission_id'] != request['p_submission_id'] or result['ticket_number'] != request['p_ticket_number']:
        raise FinalizeError('Receipt API returned another case; reconcile before retrying.')
    for field in ('receipt_id', 'submission_id'):
        identifier(result[field])
    for field in ('portal_session_id', 'outbox_id'):
        if result[field] is not None:
            identifier(result[field])
    if (type(result['created']) is not bool or not isinstance(result['status_sync'], str)
            or result['status_sync'] not in STATUS_SYNC or result['source'] not in ('portal', 'manual', 'inbound')
            or result['staff_stage_before'] is not None and (not isinstance(result['staff_stage_before'], str)
                or result['staff_stage_before'] not in STAFF_STAGES)
            or any(type(result[field]) is not int or result[field] < 0
                   for field in ('staff_version_before', 'staff_version_after'))):
        raise FinalizeError('Receipt API returned invalid receipt fields; reconcile before retrying.')
    response_time = timestamp(result['confirmed_at'])
    if result['created'] and (result['source'] != 'portal'
            or result['portal_session_id'] != request['p_portal_session_id']
            or response_time != timestamp(request['p_confirmed_at'])):
        raise FinalizeError('New receipt does not match the confirmed portal session; reconcile before retrying.')
    return result


def call_api(request):
    ref = approval_api.project_ref()
    key = approval_api.service_key(ref)
    http_request = urllib.request.Request(
        f'https://{ref}.supabase.co/rest/v1/rpc/record_disclosure_request_receipt',
        data=json.dumps(request).encode(), method='POST', headers={
            'Content-Type': 'application/json', 'Authorization': f'Bearer {key}', 'apikey': key})
    try:
        with urllib.request.build_opener(approval_api.NoRedirect()).open(http_request, timeout=40) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        raise FinalizeError(f'Receipt API failed (HTTP {error.code}); reconcile before retrying.') from None
    except (urllib.error.URLError, OSError, TimeoutError):
        raise FinalizeError('Receipt API result is uncertain; reconcile before retrying.') from None
    if len(raw) > MAX_RESPONSE_BYTES:
        raise FinalizeError('Receipt API response is oversized; reconcile before retrying.')
    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeError):
        raise FinalizeError('Receipt API returned invalid JSON; reconcile before retrying.') from None
    return safe_response(payload, request)


def write_private_json(path, payload):
    path = private_path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix='.receipt-', dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(payload, stream, indent=2, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def finalize(data_dir, ticket, claim_token, portal_session_id, reconciled_retry=False, output=None):
    directory = private_path(data_dir)
    ticket = ledger_module.ticket_key(ticket)
    journal_path = private_path(directory / 'disclosure-receipts' / (ticket + '.json'))
    output_path = private_path(output) if output else None
    if output_path and (output_path == directory or directory in output_path.parents):
        raise FinalizeError('An optional export must be outside the private runtime directory.')
    ledger = Ledger(directory)
    try:
        journal_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(journal_path.parent, 0o700)
        lock_path = journal_path.with_suffix('.lock')
        with lock_path.open('a') as lock:
            os.chmod(lock_path, 0o600)
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise FinalizeError('Another receipt operation is running for this ticket.') from None
            request, consent_sha = prepare_request(ledger, ticket, claim_token, portal_session_id)
            journal = {'version': 1, 'request': request, 'consent_sha256': consent_sha, 'state': 'uncertain'}
            if journal_path.exists():
                try:
                    if journal_path.stat().st_size > MAX_RESPONSE_BYTES:
                        raise ValueError()
                    prior = json.loads(journal_path.read_bytes())
                except (ValueError, UnicodeError):
                    raise FinalizeError('Local receipt state is invalid; reconcile before retrying.') from None
                if not isinstance(prior, dict) or any(prior.get(field) != journal[field]
                        for field in ('version', 'request', 'consent_sha256')):
                    raise FinalizeError('Receipt evidence or session differs from the saved attempt; reconcile before retrying.')
                if prior.get('state') == 'completed':
                    result = safe_response(prior.get('response'), request)
                    if output_path:
                        write_private_json(output_path, result)
                    return result
                if prior.get('state') != 'uncertain' or not reconciled_retry:
                    raise FinalizeError('Prior receipt attempt is uncertain; reconcile, then explicitly use --reconciled-retry.')
            # Persist binding before the sole POST, including when its response
            # is lost. A rerun must retain exactly this source key and session.
            write_private_json(journal_path, journal)
            result = call_api(request)
            write_private_json(journal_path, {**journal, 'state': 'completed', 'response': result})
            if output_path:
                write_private_json(output_path, result)
            return result
    finally:
        ledger.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ticket', required=True)
    parser.add_argument('--claim-token', required=True)
    parser.add_argument('--portal-session-id', required=True, help='Recorded original session UUID; never generate a replacement here.')
    parser.add_argument('--data-dir', default=str(ledger_module.DEFAULT_DATA_DIR))
    parser.add_argument('--output', help='Optional sanitized receipt export outside repositories and the runtime directory.')
    parser.add_argument('--reconciled-retry', action='store_true', help='Retry the identical RPC only after operator reconciliation of an uncertain result.')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        result = finalize(args.data_dir, args.ticket, args.claim_token, args.portal_session_id,
                          args.reconciled_retry, args.output)
        print(json.dumps(result, indent=2, sort_keys=True))
    except (FinalizeError, approval_api.ApprovalError, ledger_module.LedgerError) as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        return 1
    except (OSError, sqlite3.Error):
        print(json.dumps({'error': 'Private receipt state could not be read or saved; reconcile before retrying.'}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
