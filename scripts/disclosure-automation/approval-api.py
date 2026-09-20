#!/usr/bin/env python3
"""Call staff-side disclosure approval actions without exposing service keys.

The signed decision can only be made by Brett through the phone approval link.
This helper can create, inspect, consume or revoke a request, never approve it.
No automatic retries: a network interruption can leave the result uncertain.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

REPO = Path(__file__).resolve().parents[2]
MAX_REQUEST_BYTES = 200000
ACTION_FIELDS = {
    'create': {'action','submission_id','ticket_number','portal_session_id','terms_url',
               'terms_text','terms_version','consent_sha256','portal_terms_unchecked',
               'case_documents_verified'},
    'status': {'action','id'},
    'consume': {'action','id','submission_id','portal_session_id','case_fingerprint',
                'consent_sha256','terms_sha256'},
    'revoke': {'action','id'},
}
SAFE_RESPONSE_FIELDS = {'id','status','case_fingerprint','terms_sha256','consent_sha256',
    'portal_session_id','expires_at','approved_at','consumed_at','revoked_at','submission_id',
    'ticket_number','decided_at','consumed','revoked'}


class ApprovalError(Exception):
    """Messages here are deliberately safe to print; raw provider errors are not."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        # A key for the fixed Supabase project must never follow a redirect.
        return None


def validate_request(payload):
    if not isinstance(payload,dict) or not isinstance(payload.get('action'),str) or payload['action'] not in ACTION_FIELDS:
        raise ApprovalError('Only create, status, consume and revoke actions are allowed.')
    optional = {'legacy_plea_origin_verified'} if payload['action']=='create' else set()
    if not ACTION_FIELDS[payload['action']] <= set(payload) or set(payload)-ACTION_FIELDS[payload['action']]-optional:
        raise ApprovalError('Request contains missing or unsupported fields.')
    for field in ('id','submission_id','portal_session_id'):
        if field in payload:
            try:
                value = uuid.UUID(payload[field])
                if str(value) != payload[field].lower():
                    raise ValueError()
            except (ValueError,AttributeError,TypeError):
                raise ApprovalError('Request UUID field is invalid.') from None
    for field in ('case_fingerprint','consent_sha256','terms_sha256'):
        if field in payload and (not isinstance(payload[field],str)
                                  or not re.fullmatch(r'[a-f0-9]{64}',payload[field])):
            raise ApprovalError('Request fingerprint field is invalid.')
    if payload['action']=='create':
        if payload['portal_terms_unchecked'] is not True or payload['case_documents_verified'] is not True:
            raise ApprovalError('The live terms step must remain unchecked and case documents must be verified.')
        if 'legacy_plea_origin_verified' in payload and payload['legacy_plea_origin_verified'] is not True:
            raise ApprovalError('Legacy origin attestation, when supplied, must confirm actual verification.')
        if not isinstance(payload['ticket_number'],str) or not re.fullmatch(r'[A-Z][0-9]{8}[A-Z]',payload['ticket_number']):
            raise ApprovalError('A normalized ticket number is required.')
        for field,minimum,limit in (('terms_text',40,60000),('terms_version',1,200)):
            if not isinstance(payload[field],str) or not minimum <= len(payload[field].strip()) <= limit:
                raise ApprovalError('Captured terms text or version is invalid.')
        try:
            url = urllib.parse.urlsplit(payload['terms_url'])
            if url.scheme!='https' or url.hostname!='traffictickets.alberta.ca' or url.port or url.username or url.password:
                raise ValueError()
        except (ValueError,TypeError,AttributeError):
            raise ApprovalError('Captured terms URL must use the exact Alberta traffic portal HTTPS host without credentials or port.') from None
    return payload


def read_request(path):
    path = Path(path).expanduser().resolve()
    if path == REPO or REPO in path.parents:
        raise ApprovalError('Store private request JSON outside the repository.')
    try:
        if path.stat().st_size > MAX_REQUEST_BYTES:
            raise ApprovalError('Request file is too large.')
        raw = path.read_bytes()
    except OSError:
        raise ApprovalError('Private request file could not be read.') from None
    try:
        payload = json.loads(raw)
    except (ValueError,UnicodeError):
        raise ApprovalError('Request file must contain valid JSON.') from None
    return validate_request(payload)


def project_ref():
    try:
        value = (REPO/'supabase'/'.temp'/'project-ref').read_text().strip()
    except OSError:
        raise ApprovalError('Linked Supabase project reference is unavailable.') from None
    if not re.fullmatch(r'[a-z0-9]{10,40}',value):
        raise ApprovalError('Linked Supabase project reference is invalid.')
    return value


def service_key(ref):
    try:
        result = subprocess.run(['supabase','projects','api-keys','--project-ref',ref,
            '--output','json','--log-level','error'],capture_output=True,text=True,timeout=40,check=False)
    except (OSError,subprocess.SubprocessError,UnicodeError):
        raise ApprovalError('Existing Supabase CLI authentication could not be used.') from None
    if result.returncode != 0:
        raise ApprovalError('Supabase CLI could not retrieve the required project key.')
    try:
        rows = json.loads(result.stdout)
        if isinstance(rows,dict):
            rows = rows.get('api_keys')
        if not isinstance(rows,list):
            raise ValueError()
        keys = [row.get('api_key') for row in rows if isinstance(row,dict) and row.get('name')=='service_role']
        if len(keys)!=1 or not isinstance(keys[0],str) or not re.fullmatch(r'[A-Za-z0-9._-]{16,8192}',keys[0]):
            raise ValueError()
        return keys[0]
    except (ValueError,TypeError):
        raise ApprovalError('Supabase CLI returned an unexpected key response.') from None


def safe_response(payload,action='status'):
    if not isinstance(payload,dict):
        raise ApprovalError('Approval API returned an unexpected response; reconcile before retrying.')
    result = {key:value for key,value in payload.items() if key in SAFE_RESPONSE_FIELDS}
    valid = (action in ('create','status') and isinstance(result.get('status'),str) and result.get('status') in
             {'creating','pending','approved','rejected','expired','revoked','consumed','delivery_failed'}
             and isinstance(result.get('id'),str)) or (
             action=='consume' and result.get('consumed') is True
             and all(isinstance(result.get(field),str) for field in ('id','submission_id','portal_session_id'))) or (
             action=='revoke' and isinstance(result.get('revoked'),bool))
    if not valid:
        raise ApprovalError('Approval API returned an unexpected response; reconcile before retrying.')
    # Never let nested or unexpected provider data pass through a known field.
    if any(value is not None and not isinstance(value,(str,bool,int)) for value in result.values()):
        raise ApprovalError('Approval API returned an unexpected response; reconcile before retrying.')
    for field in ('id','submission_id','portal_session_id'):
        if result.get(field) is not None:
            try:
                uuid.UUID(result[field])
            except (ValueError,AttributeError,TypeError):
                raise ApprovalError('Approval API returned invalid receipt identifiers.') from None
    for field in ('case_fingerprint','consent_sha256','terms_sha256'):
        if result.get(field) is not None and (not isinstance(result[field],str)
                                               or not re.fullmatch(r'[a-f0-9]{64}',result[field])):
            raise ApprovalError('Approval API returned invalid receipt fingerprints.')
    return result


def call_api(payload):
    payload = validate_request(payload)
    ref = project_ref()
    key = service_key(ref)
    request = urllib.request.Request(f'https://{ref}.supabase.co/functions/v1/disclosure-approval',
        data=json.dumps(payload).encode(),headers={'Content-Type':'application/json',
        'Authorization':f'Bearer {key}','apikey':key},method='POST')
    try:
        with urllib.request.build_opener(NoRedirect()).open(request,timeout=40) as response:
            raw = response.read(MAX_REQUEST_BYTES+1)
    except urllib.error.HTTPError as error:
        raise ApprovalError(f'Approval API request failed (HTTP {error.code}); reconcile before retrying.') from None
    except (urllib.error.URLError,OSError,TimeoutError):
        raise ApprovalError('Approval API result is uncertain; reconcile before retrying.') from None
    if len(raw)>MAX_REQUEST_BYTES:
        raise ApprovalError('Approval API returned an oversized response; reconcile before retrying.')
    try:
        response = json.loads(raw)
    except (ValueError,UnicodeError):
        raise ApprovalError('Approval API returned invalid JSON; reconcile before retrying.') from None
    return safe_response(response,payload['action'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request-file',required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(call_api(read_request(args.request_file)),indent=2,sort_keys=True))
    except ApprovalError as error:
        print(json.dumps({'error':str(error)}),file=sys.stderr)
        return 1
    return 0


if __name__=='__main__':
    sys.exit(main())
