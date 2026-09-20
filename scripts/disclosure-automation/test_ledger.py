import importlib.util
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import unittest
from threading import Barrier

spec = importlib.util.spec_from_file_location('ledger',Path(__file__).with_name('ledger.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Ledger, LedgerError = module.Ledger,module.LedgerError
SUBMISSION = '10000000-0000-4000-8000-000000000001'
OTHER = '10000000-0000-4000-8000-000000000002'
TICKET = 'E12345678T'


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)
        self.ledger = Ledger(self.directory)
        self.consent = self.directory/'synthetic-consent.pdf'
        self.consent.write_bytes(b'%PDF-1.7 synthetic fixture only')

    def tearDown(self):
        self.ledger.close()
        self.tmp.cleanup()

    def submitting(self,step='plea',token=None):
        token = token or self.ledger.claim(TICKET,SUBMISSION)['claim_token']
        self.ledger.transition(TICKET,token,'mark-submitting',step=step,consent_file=str(self.consent))
        return token

    def test_normalization_blocks_other_submission_and_connection(self):
        self.ledger.claim('e 1234-5678 t',SUBMISSION)
        second = Ledger(self.directory)
        try:
            with self.assertRaises(LedgerError):
                second.claim(TICKET,OTHER)
        finally:
            second.close()

    def test_concurrent_claims_have_exactly_one_winner(self):
        barrier = Barrier(2)
        def compete(submission):
            ledger = Ledger(self.directory)
            try:
                barrier.wait(timeout=5)
                try:
                    ledger.claim(TICKET,submission)
                    return 'claimed'
                except LedgerError:
                    return 'blocked'
            finally:
                ledger.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(compete,[SUBMISSION,OTHER]))
        self.assertEqual(sorted(results),['blocked','claimed'])

    def test_interrupted_submitting_is_persistent_and_never_reclaimed(self):
        self.submitting()
        self.ledger.close()
        self.ledger = Ledger(self.directory)
        self.assertEqual(self.ledger.get(TICKET)['status'],'submitting')
        with self.assertRaises(LedgerError):
            self.ledger.claim(TICKET,SUBMISSION)

    def test_uncertain_cannot_be_downgraded_or_retried(self):
        token = self.submitting()
        self.ledger.transition(TICKET,token,'mark-uncertain',step='plea',note='Connection interrupted after click')
        for operation in (
            lambda:self.ledger.claim(TICKET,SUBMISSION),
            lambda:self.ledger.transition(TICKET,token,'hold',note='Try again'),
            lambda:self.ledger.resume(TICKET,'Unverified',str(self.consent),False),
        ):
            with self.assertRaises(LedgerError): operation()
        self.assertEqual(self.ledger.get(TICKET)['status'],'uncertain')

    def test_receipt_requires_actual_evidence_and_submitted_never_resumes(self):
        token = self.submitting()
        with self.assertRaises(LedgerError):
            self.ledger.transition(TICKET,token,'confirm',step='plea',note='No receipt yet')
        with self.assertRaises(LedgerError):
            self.ledger.transition(TICKET,'wrong-token','confirm',step='plea',reference='fixture',note='Fixture')
        self.ledger.transition(TICKET,token,'confirm',step='plea',reference='synthetic-trial',note='Synthetic plea receipt')
        self.assertEqual(self.ledger.get(TICKET)['status'],'partial')
        self.submitting('disclosure',token)
        self.ledger.transition(TICKET,token,'confirm',step='disclosure',reference='synthetic-disclosure',note='Synthetic disclosure receipt')
        self.assertEqual(self.ledger.get(TICKET)['status'],'completed')
        with self.assertRaises(LedgerError):
            self.ledger.resume(TICKET,'Cannot reset receipt',str(self.consent),True)

    def test_manual_reconciliation_changes_token_and_preserves_history(self):
        old = self.submitting()
        self.ledger.resume(TICKET,'Portal and inbox show no plea submission',str(self.consent),True,step='plea')
        new = self.ledger.claim(TICKET,SUBMISSION)
        self.assertEqual(new['attempt'],2)
        self.assertNotEqual(new['claim_token'],old)
        with self.assertRaises(LedgerError):
            self.ledger.transition(TICKET,old,'mark-submitting',step='plea',consent_file=str(self.consent))
        events = self.ledger.db.execute('SELECT count(*) FROM events').fetchone()[0]
        self.assertEqual(events,5)

    def test_preclick_requires_consent_and_rolls_back(self):
        claim = self.ledger.claim(TICKET,SUBMISSION)
        with self.assertRaises(LedgerError):
            self.ledger.transition(TICKET,claim['claim_token'],'mark-submitting',step='plea',consent_file='/missing/consent.pdf')
        self.assertEqual(self.ledger.get(TICKET)['status'],'claimed')
        self.assertEqual((self.directory/'ledger.sqlite3').stat().st_mode & 0o777,0o600)

    def test_overridden_data_directory_cannot_be_in_another_git_checkout(self):
        checkout = self.directory/'other-checkout'
        checkout.mkdir()
        (checkout/'.git').write_text('gitdir: synthetic-worktree-metadata')
        with self.assertRaises(LedgerError):
            Ledger(checkout/'private-data')

    def test_plea_receipt_survives_disclosure_interruption_and_retry(self):
        token = self.submitting()
        self.ledger.transition(TICKET,token,'confirm',step='plea',reference='trial-123',note='Trial request accepted')
        self.submitting('disclosure',token)
        self.ledger.transition(TICKET,token,'mark-uncertain',step='disclosure',note='Disclosure response lost')
        self.ledger.close()
        self.ledger = Ledger(self.directory)
        row = self.ledger.get(TICKET)
        self.assertEqual(row['completed_steps'],['plea'])
        self.assertEqual(row['steps']['plea']['portal_reference'],'trial-123')
        with self.assertRaises(LedgerError):
            self.submitting('plea',token)
        with self.assertRaises(LedgerError):
            self.ledger.resume(TICKET,'Cannot reset plea',str(self.consent),True,step='plea')
        self.ledger.resume(TICKET,'Disclosure portal and inbox confirm no submission',str(self.consent),True,step='disclosure')
        token = self.ledger.claim(TICKET,SUBMISSION)['claim_token']
        self.submitting('disclosure',token)
        self.ledger.transition(TICKET,token,'confirm',step='disclosure',reference='disclosure-123',note='Disclosure request accepted')
        self.assertEqual(self.ledger.get(TICKET)['status'],'completed')
        self.assertEqual(self.ledger.get(TICKET)['steps']['plea']['portal_reference'],'trial-123')

    def test_preexisting_disclosure_receipt_never_authorizes_a_repeat(self):
        token = self.ledger.claim(TICKET,SUBMISSION)['claim_token']
        self.ledger.transition(TICKET,token,'record-existing',step='disclosure',reference='crown-123',note='Matched existing Crown acknowledgement')
        self.assertEqual(self.ledger.get(TICKET)['status'],'partial')
        with self.assertRaises(LedgerError):
            self.submitting('disclosure',token)
        self.ledger.transition(TICKET,token,'hold',note='Trial appearance preference missing')
        self.assertEqual(self.ledger.get(TICKET)['status'],'held')

    def test_legacy_receipt_is_preserved_without_assuming_both_steps(self):
        claim = self.ledger.claim(TICKET,SUBMISSION)
        self.ledger.db.execute("UPDATE requests SET status='submitted',portal_reference='legacy-123' WHERE ticket=?",(TICKET,))
        self.assertEqual(self.ledger.get(TICKET)['status'],'legacy_submitted_needs_reconciliation')
        with self.assertRaises(LedgerError):
            self.ledger.claim(TICKET,SUBMISSION)
        self.ledger.transition(TICKET,claim['claim_token'],'record-existing',step='disclosure',reference='disclosure-123',note='Verified actual old disclosure receipt')
        self.assertEqual(self.ledger.get(TICKET)['steps']['plea']['status'],'uncertain')
        with self.assertRaises(LedgerError):
            self.submitting('plea',claim['claim_token'])
        self.ledger.transition(TICKET,claim['claim_token'],'record-existing',step='plea',reference='trial-123',note='Verified separate prior trial receipt')
        self.assertEqual(self.ledger.get(TICKET)['status'],'completed')
        self.assertEqual(self.ledger.get(TICKET)['portal_reference'],'legacy-123')

    def test_combined_action_requires_actual_combined_ui_attestation_and_evidence(self):
        token = self.ledger.claim(TICKET,SUBMISSION)['claim_token']
        with self.assertRaises(LedgerError):
            self.ledger.transition(TICKET,token,'mark-submitting',step='combined',consent_file=str(self.consent))
        self.ledger.transition(TICKET,token,'mark-submitting',step='combined',combined_observed=True,
            evidence=str(self.consent),consent_file=str(self.consent))
        self.ledger.transition(TICKET,token,'confirm',step='combined',reference='combined-123',note='Observed combined action confirms both')
        self.assertEqual(self.ledger.get(TICKET)['status'],'completed')


if __name__ == '__main__':
    unittest.main()
