import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('finalize_disclosure', Path(__file__).with_name('finalize-disclosure.py'))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
SUBMISSION = '10000000-0000-4000-8000-000000000001'
SESSION = '20000000-0000-4000-8000-000000000001'
OTHER_SESSION = '20000000-0000-4000-8000-000000000002'
RECEIPT = '30000000-0000-4000-8000-000000000001'
OUTBOX = '40000000-0000-4000-8000-000000000001'
TICKET = 'E12345678T'
SECRET = 'synthetic-service-key-do-not-print'


class FinalizeDisclosureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name) / 'private'
        self.ledger = api.Ledger(self.directory)
        self.consent = self.directory / 'synthetic-consent.pdf'
        self.consent.write_bytes(b'%PDF-1.7 synthetic consent')
        self.evidence = self.directory / 'synthetic-disclosure.png'
        self.evidence.write_bytes(b'synthetic screenshot, never a real client')
        self.token = self.ledger.claim(TICKET, SUBMISSION)['claim_token']

    def tearDown(self):
        self.ledger.close()
        self.tmp.cleanup()

    def confirm(self, step='disclosure', evidence=True):
        self.ledger.transition(TICKET, self.token, 'mark-submitting', step=step, consent_file=str(self.consent))
        return self.ledger.transition(TICKET, self.token, 'confirm', step=step,
            evidence=str(self.evidence) if evidence else None, reference='synthetic-reference',
            note='Visible synthetic success confirmation')

    def request(self):
        return api.prepare_request(self.ledger, TICKET, self.token, SESSION)[0]

    def response(self, request, **overrides):
        return {'receipt_id': RECEIPT, 'created': True, 'status_sync': 'advanced',
            'submission_id': SUBMISSION, 'ticket_number': TICKET, 'source': 'portal',
            'portal_session_id': SESSION, 'confirmed_at': request['p_confirmed_at'],
            'staff_stage_before': 'paid', 'staff_version_before': 2, 'staff_version_after': 3,
            'outbox_id': OUTBOX, **overrides}

    def test_actual_confirmed_disclosure_builds_stable_bound_request(self):
        row = self.confirm()
        self.ledger.transition(TICKET, self.token, 'hold', note='Plea appearance instruction pending')
        request = self.request()
        self.assertEqual(request, self.request())
        self.assertEqual(request['p_source_key'], 'portal:' + row['steps']['disclosure']['operation_id'])
        self.assertEqual(request['p_confirmed_at'], row['steps']['disclosure']['confirmed_at'])
        self.assertEqual(request['p_evidence_sha256'], hashlib.sha256(self.evidence.read_bytes()).hexdigest())
        self.assertEqual(request['p_evidence_reference'], str(self.evidence.resolve()))
        self.assertEqual(request['p_source'], 'portal')
        self.assertIs(request['p_request_confirmed'], True)
        self.assertIsNone(request['p_confirmation_id'])
        self.assertNotIn(self.evidence.read_text(), json.dumps(request))

    def test_missing_plea_only_and_unresolved_disclosure_never_call_api(self):
        for state in ('missing', 'plea_only', 'submitting', 'uncertain'):
            with self.subTest(state=state):
                if state == 'plea_only':
                    self.confirm('plea')
                if state == 'submitting':
                    self.ledger.transition(TICKET, self.token, 'mark-submitting', step='disclosure', consent_file=str(self.consent))
                if state == 'uncertain':
                    self.ledger.transition(TICKET, self.token, 'mark-uncertain', step='disclosure', note='Unknown result')
                with patch.object(api, 'call_api') as call:
                    with self.assertRaises(api.FinalizeError):
                        api.finalize(self.directory, TICKET, self.token, SESSION)
                    call.assert_not_called()

    def test_claim_and_original_session_identifiers_are_required(self):
        self.confirm()
        for token, session in ((OTHER_SESSION, SESSION), (self.token, ''), (self.token, 'not-a-uuid')):
            with self.assertRaises(api.FinalizeError):
                api.prepare_request(self.ledger, TICKET, token, session)

    def test_record_existing_without_operation_is_held_not_given_new_identifier(self):
        self.ledger.transition(TICKET, self.token, 'record-existing', step='disclosure',
            evidence=str(self.evidence), reference='existing', note='Existing synthetic receipt')
        with self.assertRaises(api.FinalizeError):
            self.request()
        self.assertIsNone(self.ledger.get(TICKET)['steps']['disclosure']['operation_id'])

    def test_reference_alone_is_not_evidence_and_changed_consent_is_blocked(self):
        self.confirm(evidence=False)
        with self.assertRaises(api.FinalizeError):
            self.request()
        self.ledger.db.execute("UPDATE steps SET evidence_path=? WHERE ticket=? AND step='disclosure'", (str(self.evidence), TICKET))
        self.consent.write_bytes(b'changed consent')
        with self.assertRaises(api.FinalizeError):
            self.request()
        self.consent.write_bytes(b'%PDF-1.7 synthetic consent')
        self.evidence.unlink()
        with self.assertRaises(api.FinalizeError):
            self.request()

    def test_success_is_saved_privately_and_rerun_does_not_call_again(self):
        self.confirm()
        request = self.request()
        export = Path(self.tmp.name) / 'receipt-export.json'
        response = self.response(request)
        with patch.object(api, 'call_api', return_value=response) as call:
            self.assertEqual(api.finalize(self.directory, TICKET, self.token, SESSION, output=export), response)
            self.assertEqual(api.finalize(self.directory, TICKET, self.token, SESSION), response)
        call.assert_called_once_with(request)
        journal = self.directory / 'disclosure-receipts' / (TICKET + '.json')
        saved = json.loads(journal.read_text())
        self.assertEqual(saved['state'], 'completed')
        self.assertEqual(saved['request'], request)
        self.assertEqual(saved['response'], response)
        self.assertNotIn(self.token, journal.read_text())
        self.assertEqual(journal.stat().st_mode & 0o777, 0o600)
        self.assertEqual(export.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.ledger.get(TICKET)['completed_steps'], ['disclosure'])

    def test_uncertain_attempt_requires_reconciliation_and_identical_source_binding(self):
        self.confirm()
        request = self.request()
        with patch.object(api, 'call_api', side_effect=api.FinalizeError('Uncertain result')) as call:
            with self.assertRaises(api.FinalizeError):
                api.finalize(self.directory, TICKET, self.token, SESSION)
            call.assert_called_once_with(request)
        with patch.object(api, 'call_api', return_value=self.response(request)) as call:
            for session, reconciled in ((SESSION, False), (OTHER_SESSION, True)):
                with self.assertRaises(api.FinalizeError):
                    api.finalize(self.directory, TICKET, self.token, session, reconciled)
            call.assert_not_called()
            api.finalize(self.directory, TICKET, self.token, SESSION, reconciled_retry=True)
            call.assert_called_once_with(request)

    def test_changed_evidence_after_uncertain_result_cannot_change_idempotent_request(self):
        self.confirm()
        with patch.object(api, 'call_api', side_effect=api.FinalizeError('Uncertain result')):
            with self.assertRaises(api.FinalizeError):
                api.finalize(self.directory, TICKET, self.token, SESSION)
        self.evidence.write_bytes(b'different screenshot')
        with patch.object(api, 'call_api') as call:
            with self.assertRaises(api.FinalizeError):
                api.finalize(self.directory, TICKET, self.token, SESSION, reconciled_retry=True)
            call.assert_not_called()

    def test_response_sanitizer_strips_secrets_and_checks_case_and_new_session(self):
        self.confirm()
        request = self.request()
        response = self.response(request)
        self.assertEqual(api.safe_response({**response, 'token': SECRET, 'snapshot': {'email': SECRET}}, request), response)
        for changes in ({'submission_id': OTHER_SESSION}, {'ticket_number': 'E87654321T'},
                        {'portal_session_id': OTHER_SESSION}, {'receipt_id': SECRET},
                        {'staff_stage_before': {'token': SECRET}}, {'status_sync': {'token': SECRET}},
                        {'staff_version_after': True}, {'created': 'true'}):
            with self.subTest(changes=changes), self.assertRaises(api.FinalizeError):
                api.safe_response({**response, **changes}, request)
        existing = self.response(request, created=False, source='inbound', portal_session_id=None)
        self.assertEqual(api.safe_response(existing, request), existing,
            'A matched Crown email may have recorded the canonical receipt first')

    def test_fixed_rpc_uses_existing_key_in_headers_no_redirect_or_retry(self):
        self.confirm()
        request = self.request()
        http_response = Mock()
        http_response.read.return_value = json.dumps({**self.response(request), 'secret': SECRET}).encode()
        opener = Mock()
        opener.open.return_value.__enter__ = Mock(return_value=http_response)
        opener.open.return_value.__exit__ = Mock(return_value=False)
        with patch.object(api.approval_api, 'project_ref', return_value='syntheticprojectref'), \
             patch.object(api.approval_api, 'service_key', return_value=SECRET), \
             patch.object(api.urllib.request, 'build_opener', return_value=opener) as builder:
            result = api.call_api(request)
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertIsInstance(builder.call_args.args[0], api.approval_api.NoRedirect)
        opener.open.assert_called_once()
        sent = opener.open.call_args.args[0]
        self.assertEqual(sent.full_url, 'https://syntheticprojectref.supabase.co/rest/v1/rpc/record_disclosure_request_receipt')
        self.assertEqual(sent.method, 'POST')
        self.assertEqual(json.loads(sent.data), request)
        self.assertEqual(sent.headers['Authorization'], 'Bearer ' + SECRET)
        self.assertNotIn(SECRET, sent.full_url)

    def test_http_errors_never_echo_provider_body_or_secret(self):
        self.confirm()
        opener = Mock()
        opener.open.side_effect = api.urllib.error.HTTPError('https://synthetic.invalid', 502,
            SECRET, {}, io.BytesIO(SECRET.encode()))
        with patch.object(api.approval_api, 'project_ref', return_value='syntheticprojectref'), \
             patch.object(api.approval_api, 'service_key', return_value=SECRET), \
             patch.object(api.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaises(api.FinalizeError) as error:
                api.call_api(self.request())
        self.assertNotIn(SECRET, str(error.exception))
        self.assertIn('502', str(error.exception))
        opener.open.assert_called_once()

    def test_private_files_cannot_be_written_in_a_git_checkout(self):
        self.confirm()
        checkout = Path(self.tmp.name) / 'another-checkout'
        checkout.mkdir()
        (checkout / '.git').write_text('gitdir: synthetic metadata')
        with patch.object(api, 'call_api') as call:
            with self.assertRaises(api.FinalizeError):
                api.finalize(self.directory, TICKET, self.token, SESSION, output=checkout / 'receipt.json')
            call.assert_not_called()


if __name__ == '__main__':
    unittest.main()
