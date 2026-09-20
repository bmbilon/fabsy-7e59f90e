import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock,patch

spec = importlib.util.spec_from_file_location('approval_api',Path(__file__).with_name('approval-api.py'))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
ID = '10000000-0000-4000-8000-000000000001'
SECRET = 'synthetic-service-key-never-print'


class ApprovalApiTests(unittest.TestCase):
    def test_only_admin_actions_can_be_requested(self):
        for action in ('approve','decide','preview','decision','reject','unknown',[]):
            with self.assertRaises(api.ApprovalError):
                api.validate_request({'action':action,'id':ID})
        for action in ('status','revoke'):
            self.assertEqual(api.validate_request({'action':action,'id':ID})['action'],action)
        with self.assertRaises(api.ApprovalError):
            api.validate_request({'action':'status','id':ID,'approved':True})

    def test_creation_requires_exact_terms_session_and_consent_binding(self):
        payload = {'action':'create','submission_id':ID,'ticket_number':'E12345678T',
                   'portal_session_id':ID,'terms_url':'https://traffictickets.alberta.ca/terms',
                   'terms_text':'Actual captured synthetic terms text for a fixture only.','terms_version':'fixture-v1',
                   'consent_sha256':'a'*64,'portal_terms_unchecked':True,'case_documents_verified':True}
        self.assertEqual(api.validate_request(payload),payload)
        for field in ('terms_text','portal_session_id','consent_sha256'):
            with self.assertRaises(api.ApprovalError):
                api.validate_request({**payload,field:''})
        for url in ('https://example.invalid/terms','https://traffictickets.alberta.ca:444/terms',
                    'https://other@traffictickets.alberta.ca/terms'):
            with self.assertRaises(api.ApprovalError):
                api.validate_request({**payload,'terms_url':url})
        for field in ('portal_terms_unchecked','case_documents_verified'):
            with self.assertRaises(api.ApprovalError):
                api.validate_request({**payload,field:False})

    def test_key_is_captured_without_printing_or_command_line_exposure(self):
        result = subprocess.CompletedProcess([],0,json.dumps([{'name':'service_role','api_key':SECRET}]),'')
        with patch.object(api.subprocess,'run',return_value=result) as run:
            output = io.StringIO()
            with contextlib.redirect_stdout(output),contextlib.redirect_stderr(output):
                self.assertEqual(api.service_key('syntheticprojectref'),SECRET)
            self.assertEqual(output.getvalue(),'')
            self.assertNotIn(SECRET,repr(run.call_args))
            self.assertTrue(run.call_args.kwargs['capture_output'])

    def test_cli_failure_does_not_echo_secret_bearing_output(self):
        result = subprocess.CompletedProcess([],1,SECRET,SECRET)
        with patch.object(api.subprocess,'run',return_value=result):
            with self.assertRaises(api.ApprovalError) as failure:
                api.service_key('syntheticprojectref')
            self.assertNotIn(SECRET,str(failure.exception))

    def test_response_allowlist_removes_tokens_and_links(self):
        response = api.safe_response({'id':ID,'status':'pending','approval_token':SECRET,
                                     'approval_url':'https://example.invalid/'+SECRET})
        self.assertEqual(response,{'id':ID,'status':'pending'})
        with self.assertRaises(api.ApprovalError):
            api.safe_response({'status':{'approval_token':SECRET}})

    def test_redirects_cannot_forward_the_service_key(self):
        handler = api.NoRedirect()
        self.assertIsNone(handler.redirect_request(None,None,302,'redirect',{},'https://other.invalid'))

    def test_consume_and_revoke_responses_preserve_safe_receipts(self):
        response = {'consumed':True,'id':ID,'submission_id':ID,'portal_session_id':ID}
        self.assertEqual(api.safe_response(response,'consume'),response)
        self.assertEqual(api.safe_response({'revoked':False},'revoke'),{'revoked':False})

    def test_http_failure_does_not_echo_secret_bearing_body_or_exception(self):
        opener = Mock()
        opener.open.side_effect = api.urllib.error.HTTPError('https://synthetic.invalid',502,
            SECRET,{},io.BytesIO(SECRET.encode()))
        with patch.object(api,'project_ref',return_value='syntheticprojectref'), \
             patch.object(api,'service_key',return_value=SECRET), \
             patch.object(api.urllib.request,'build_opener',return_value=opener):
            with self.assertRaises(api.ApprovalError) as failure:
                api.call_api({'action':'status','id':ID})
        self.assertNotIn(SECRET,str(failure.exception))
        self.assertIn('502',str(failure.exception))


if __name__=='__main__':
    unittest.main()
