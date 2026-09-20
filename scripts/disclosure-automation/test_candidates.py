"""Execute the real candidate SELECT in an isolated local PostgreSQL cluster."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

BIN = Path(os.environ.get('DISCLOSURE_TEST_PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
FIXTURE = '''
create table clients(id uuid primary key,first_name text,last_name text,email text);
create table ticket_submissions(
  id uuid primary key,client_id uuid,ticket_number text,created_at timestamptz default now(),
  service_type text default 'representation',status text default 'pending',case_outcome text,
  ticket_type text default 'officer_issued',intake_mode text,intake_review_status text,
  ticket_document_path text,consent_form_path text,defense_strategy text,intake_consent jsonb,
  representation_paid_at timestamptz,referral_refunded_at timestamptz,
  referral_disputed_at timestamptz,referral_payment_intent_id text
);
create table idr_checkout_intents(id uuid primary key,ticket_submission_id uuid,client_id uuid,
  status text,checkout_kind text,stripe_checkout_session_id text);
create table referral_payment_holds(payment_intent_id text,refunded_at timestamptz,disputed_at timestamptz);
create table idr_orders(ticket_submission_id uuid,stripe_payment_intent_id text);
create table disclosure_confirmations(id uuid,submission_id uuid,ticket_number text,status text,
  confirmed_at timestamptz,received_at timestamptz);
create table representation_consent_invites(id uuid,ticket_submission_id uuid,client_email text,
  ticket_numbers text[],ticket_number text,status text,signed_at timestamptz,signature_method text,
  pdf_path text,pdf_sha256 text,manual_scan_pdf_path text,manual_scan_review_status text,
  access_revoked_at timestamptz,signed_consent_text text);
create table representation_consent_manual_reviews(invite_id uuid,status text);
insert into clients values('10000000-0000-4000-8000-000000000001','Synthetic','Client','private@example.invalid');
insert into ticket_submissions(id,client_id,ticket_number,intake_mode,intake_consent,defense_strategy,referral_payment_intent_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','E12345678T','photo_only',
  '{"version":"photo-upload-consent-v3","accepted":true,"pleadNotGuilty":false}',E'not_guilty\\n\\nExplanation: Synthetic','pi_fixture'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','E12345679T','photo_only',
  '{"version":"photo-upload-consent-v3","accepted":true,"pleadNotGuilty":true}',null,null),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','E12345680T',null,
  null,E'not_guilty\\n\\nExplanation: Synthetic\\n\\nCircumstances: Synthetic',null);
insert into ticket_submissions(id,ticket_number,status) values
 ('20000000-0000-4000-8000-000000000004','e 1234-5678 t','completed');
insert into idr_checkout_intents values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','paid','ticket_only','cs_fixture');
insert into referral_payment_holds values('pi_fixture',now(),null);
insert into disclosure_confirmations values
 ('40000000-0000-4000-8000-000000000001',null,'E12345678T','needs_review',now()-interval '40 days',now()-interval '40 days');
insert into representation_consent_invites(id,client_email,ticket_numbers,status,signed_at,pdf_path,signed_consent_text) values
 ('50000000-0000-4000-8000-000000000001','private@example.invalid',array['E12345678T'],'completed',now(),'standalone/synthetic/consent.pdf',
  'AUTHORIZATION AND SCOPE Synthetic authorization. CLIENT ACKNOWLEDGEMENTS Private tail omitted.');
'''


@unittest.skipUnless((BIN/'initdb').is_file(),'Local PostgreSQL binaries unavailable')
class CandidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='fabsy-candidate-test-')
        cls.directory = Path(cls.tmp.name)
        cls.started = False
        try:
            cls.run_pg('initdb','-D',str(cls.directory/'data'),'-A','trust','--no-locale','-E','UTF8')
            cls.run_pg('pg_ctl','-D',str(cls.directory/'data'),'-l',str(cls.directory/'postgres.log'),
                       '-o',f"-k {cls.directory} -h '' -p 55479",'-w','start')
            cls.started = True
            cls.sql(FIXTURE)
            query = Path(__file__).with_name('candidates.sql').read_text().strip().rstrip(';')
            output = cls.sql('BEGIN READ ONLY; select row_to_json(q) from (\n'+query+'\n) q; ROLLBACK;')
            cls.rows = {row['ticket_number']:row for row in map(json.loads,output.splitlines())}
        except Exception:
            cls.tearDownClass()
            raise

    @classmethod
    def run_pg(cls,command,*args):
        result = subprocess.run([str(BIN/command),*args],capture_output=True,text=True,timeout=40)
        if result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result.stdout

    @classmethod
    def sql(cls,query):
        return cls.run_pg('psql','-h',str(cls.directory),'-p','55479','-d','postgres',
                          '-v','ON_ERROR_STOP=1','-qAt','-c',query)

    @classmethod
    def tearDownClass(cls):
        if cls.started:
            cls.run_pg('pg_ctl','-D',str(cls.directory/'data'),'-m','fast','-w','stop')
        cls.tmp.cleanup()

    def test_paid_intent_without_timestamp_is_recognized(self):
        row = self.rows['E12345678T']
        self.assertIsNone(row['representation_paid_at'])
        self.assertTrue(row['representation_payment_recorded'])
        self.assertEqual(row['payment_hold_evidence']['matching_payment_hold_count'],1)

    def test_prior_date_acknowledgement_and_normalized_duplicate_are_returned(self):
        row = self.rows['E12345678T']
        self.assertEqual(row['representation_records_for_ticket'],2)
        self.assertEqual(row['existing_confirmation_count'],1)
        self.assertEqual(row['disclosure_request_state'],'needs_reconciliation')
        self.assertEqual(row['existing_confirmations'][0]['status'],'needs_review')
        self.assertEqual(len(row['standalone_consent_evidence']),1)

    def test_acknowledged_disclosure_is_distinct_from_unsubmitted_plea(self):
        self.sql("update disclosure_confirmations set status='matched';")
        try:
            query = Path(__file__).with_name('candidates.sql').read_text().strip().rstrip(';')
            rows = list(map(json.loads,self.sql('select row_to_json(q) from (\n'+query+'\n) q;').splitlines()))
            row = next(row for row in rows if row['ticket_number']=='E12345678T')
            self.assertEqual(row['disclosure_request_state'],'already_acknowledged')
            self.assertNotIn('plea_confirmed',row)
            self.assertNotIn('workflow_completed',row)
        finally:
            self.sql("update disclosure_confirmations set status='needs_review';")

    def test_explicit_false_cannot_be_replaced_by_strategy(self):
        row = self.rows['E12345678T']
        self.assertFalse(row['explicit_quick_intake_not_guilty'])
        self.assertFalse(row['legacy_not_guilty_strategy_requires_origin_check'])
        self.assertTrue(self.rows['E12345679T']['explicit_quick_intake_not_guilty'])
        self.assertTrue(self.rows['E12345680T']['legacy_not_guilty_strategy_requires_origin_check'])
        self.assertTrue(self.rows['E12345680T']['has_detailed_intake_strategy_format'])

    def test_pagination_reports_remaining_rows_and_reaches_next_page(self):
        query = Path(__file__).with_name('candidates.sql').read_text().strip().rstrip(';')
        query = query.replace('/* automation_batch_limit */ 50::integer','/* automation_batch_limit */ 2::integer')
        first = list(map(json.loads,self.sql('select row_to_json(q) from (\n'+query+'\n) q;').splitlines()))
        query = query.replace('/* automation_batch_offset */ 0::integer','/* automation_batch_offset */ 2::integer')
        second = list(map(json.loads,self.sql('select row_to_json(q) from (\n'+query+'\n) q;').splitlines()))
        self.assertEqual(len(first),2)
        self.assertTrue(first[0]['page_has_more'])
        self.assertEqual(first[0]['active_representation_count'],3)
        self.assertEqual(len(second),1)
        self.assertFalse(second[0]['page_has_more'])
        self.assertNotIn(second[0]['submission_id'],[row['submission_id'] for row in first])

    def test_private_lookup_and_contact_values_are_not_returned(self):
        output = json.dumps(self.rows)
        self.assertNotIn('private@example.invalid',output)
        self.assertNotIn('Private tail omitted',output)
        self.assertNotIn('Explanation: Synthetic',output)
        for field in ('drivers_license','date_of_birth','disclosure_lookup_value'):
            self.assertNotIn(field,output)


if __name__ == '__main__':
    unittest.main()
