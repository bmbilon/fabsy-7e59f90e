#!/usr/bin/env python3
"""Private local receipt ledger. No network access; no claims expire automatically.

Claim a ticket once. Record plea and disclosure as independent portal steps,
marking each submitting BEFORE its final click. Completion requires both real
receipts. A crash or uncertain step blocks a retry; confirmed steps never reset.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import uuid
from datetime import datetime, timezone

DEFAULT_DATA_DIR = Path.home() / '.codex' / 'fabsy-disclosure'
REPO = Path(__file__).resolve().parents[2]


class LedgerError(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def ticket_key(value):
    key = re.sub(r'[^A-Z0-9]', '', value.upper())
    if not re.fullmatch(r'[A-Z][0-9]{8}[A-Z]', key):
        raise LedgerError('Ticket must be one letter, eight digits and one letter.')
    return key


def text_value(value, label, maximum=2000):
    value = (value or '').strip()
    if not value or len(value) > maximum:
        raise LedgerError(f'{label} must contain 1–{maximum} characters.')
    return value


def evidence_file(value):
    if not value:
        return None
    path = Path(value).expanduser()
    if not path.is_absolute() or not path.is_file():
        raise LedgerError('Evidence must be an existing absolute local file path.')
    return str(path.resolve())


class Ledger:
    def __init__(self, data_dir=DEFAULT_DATA_DIR):
        directory = Path(data_dir).expanduser().resolve()
        if directory == REPO or REPO in directory.parents or any(
                (parent/'.git').exists() for parent in (directory,*directory.parents)):
            raise LedgerError('Private ledger data must be stored outside the repository.')
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(directory, 0o700)
        path = directory / 'ledger.sqlite3'
        self.db = sqlite3.connect(path, timeout=10, isolation_level=None)
        os.chmod(path, 0o600)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS requests (
            ticket TEXT PRIMARY KEY, submission_id TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN
              ('claimed','submitting','submitted','uncertain','held','ready')),
            claim_token TEXT, attempt INTEGER NOT NULL DEFAULT 1,
            consent_path TEXT, consent_sha256 TEXT,
            portal_reference TEXT, evidence_path TEXT, note TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            submitting_at TEXT, submitted_at TEXT
          );
          CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY, ticket TEXT NOT NULL REFERENCES requests(ticket),
            at TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS steps (
            ticket TEXT NOT NULL REFERENCES requests(ticket),
            step TEXT NOT NULL CHECK(step IN ('plea','disclosure')),
            status TEXT NOT NULL CHECK(status IN ('ready','submitting','confirmed','uncertain')),
            operation_id TEXT, started_at TEXT, confirmed_at TEXT,
            portal_reference TEXT, evidence_path TEXT, note TEXT,
            consent_path TEXT, consent_sha256 TEXT,
            PRIMARY KEY(ticket,step)
          );
        ''')

    def close(self):
        self.db.close()

    def raw(self, ticket):
        row = self.db.execute('SELECT * FROM requests WHERE ticket=?', (ticket_key(ticket),)).fetchone()
        return dict(row) if row else None

    def get(self, ticket):
        row = self.raw(ticket)
        if not row:
            return None
        steps = {item['step']:dict(item) for item in self.db.execute(
            'SELECT * FROM steps WHERE ticket=? ORDER BY step',(row['ticket'],))}
        row['steps'] = steps
        row['completed_steps'] = [step for step,item in steps.items() if item['status']=='confirmed']
        if len(row['completed_steps'])==2:
            row['status'] = 'completed'
        elif row['status']=='submitted' and not steps:
            # Existing receipts predate separate-step tracking. Never infer that
            # both portal operations occurred, and never silently repeat either.
            row['status'] = 'legacy_submitted_needs_reconciliation'
        elif row['completed_steps'] and row['status']=='claimed':
            row['status'] = 'partial'
        return row

    def listing(self):
        return [self.get(row['ticket']) for row in self.db.execute('SELECT ticket FROM requests ORDER BY updated_at DESC')]

    def sync_status(self,ticket):
        steps = self.get(ticket)['steps']
        statuses = [step['status'] for step in steps.values()]
        status = 'uncertain' if 'uncertain' in statuses else 'submitting' if 'submitting' in statuses else (
            'submitted' if len(statuses)==2 and all(state=='confirmed' for state in statuses) else 'claimed')
        if status=='claimed' and self.raw(ticket)['status']=='held':
            status='held'
        self.db.execute('UPDATE requests SET status=?,updated_at=?,submitted_at=? WHERE ticket=?',
                        (status,now(),now() if status=='submitted' else None,ticket))

    @staticmethod
    def targets(step):
        if step not in ('plea','disclosure','combined'):
            raise LedgerError('Choose the actual portal step: plea or disclosure.')
        return ('plea','disclosure') if step=='combined' else (step,)

    def event(self, ticket, event, detail):
        self.db.execute('INSERT INTO events(ticket,at,event,detail) VALUES(?,?,?,?)',
                        (ticket, now(), event, json.dumps(detail, sort_keys=True)))

    def mutate(self, operation):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            result = operation()
            self.db.execute('COMMIT')
            return result
        except Exception:
            self.db.execute('ROLLBACK')
            raise

    def claim(self, ticket, submission_id):
        ticket = ticket_key(ticket)
        try:
            submission_id = str(uuid.UUID(submission_id))
        except (ValueError, TypeError):
            raise LedgerError('A valid submission UUID is required.') from None
        def operation():
            prior = self.get(ticket)
            if prior and (prior['status'] != 'ready' or prior['submission_id'] != submission_id):
                raise LedgerError(f"Ticket already reserved: {prior['status']}; reconcile before another attempt.")
            token, stamp = str(uuid.uuid4()), now()
            if prior:
                self.db.execute('''UPDATE requests SET status='claimed',claim_token=?,
                  attempt=attempt+1,updated_at=?,submitting_at=NULL,note=NULL
                  WHERE ticket=?''', (token,stamp,ticket))
            else:
                self.db.execute('''INSERT INTO requests(ticket,submission_id,status,claim_token,created_at,updated_at)
                  VALUES(?,?,'claimed',?,?,?)''', (ticket,submission_id,token,stamp,stamp))
            self.event(ticket,'claimed',{'claim_token':token,'submission_id':submission_id})
            return self.get(ticket)
        return self.mutate(operation)

    def transition(self, ticket, token, action, **values):
        ticket = ticket_key(ticket)
        def operation():
            row = self.raw(ticket)
            if not row or row['claim_token'] != token or not token:
                raise LedgerError('Claim token is missing or does not own this ticket.')
            steps = self.get(ticket)['steps']
            if action=='hold':
                if row['status']!='claimed':
                    raise LedgerError('Only a case without an unresolved final click can be held.')
                note = text_value(values.get('note'),'Reason')
                self.db.execute("UPDATE requests SET status='held',note=?,updated_at=? WHERE ticket=?",(note,now(),ticket))
                self.event(ticket,action,{'note':note})
                return self.get(ticket)
            targets = self.targets(values.get('step'))
            if any(steps.get(step,{}).get('status')=='confirmed' for step in targets):
                raise LedgerError('That step is already confirmed and must never be submitted again.')
            if action == 'mark-submitting':
                if row['status']!='claimed' or any(item['status'] in ('submitting','uncertain') for item in steps.values()):
                    raise LedgerError('An unresolved attempt or hold blocks another final click.')
                if len(targets)==2 and (values.get('combined_observed') is not True or not evidence_file(values.get('evidence'))):
                    raise LedgerError('A combined action requires an observed combined UI and its saved evidence.')
                path = evidence_file(values.get('consent_file'))
                if not path or Path(path).stat().st_size == 0:
                    raise LedgerError('A nonempty consent file is required before the final click.')
                hasher = hashlib.sha256()
                with open(path,'rb') as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024),b''):
                        hasher.update(chunk)
                digest = hasher.hexdigest()
                if steps and row['consent_sha256'] and digest!=row['consent_sha256']:
                    raise LedgerError('Consent changed between steps; reconcile case authority before continuing.')
                operation_id,stamp = str(uuid.uuid4()),now()
                for step in targets:
                    self.db.execute('''INSERT INTO steps(ticket,step,status,operation_id,started_at,consent_path,consent_sha256)
                      VALUES(?,?,'submitting',?,?,?,?) ON CONFLICT(ticket,step) DO UPDATE SET
                      status='submitting',operation_id=excluded.operation_id,started_at=excluded.started_at,
                      consent_path=excluded.consent_path,consent_sha256=excluded.consent_sha256,
                      confirmed_at=NULL,portal_reference=NULL,evidence_path=NULL,note=NULL''',
                      (ticket,step,operation_id,stamp,path,digest))
                self.db.execute('UPDATE requests SET consent_path=?,consent_sha256=?,submitting_at=? WHERE ticket=?',
                                (path,digest,stamp,ticket))
                changes = {'steps':targets,'operation_id':operation_id,'consent_path':path,'consent_sha256':digest,
                           'combined_ui_evidence':evidence_file(values.get('evidence'))}
            elif action in ('confirm','record-existing'):
                if action=='record-existing' and len(targets)!=1:
                    raise LedgerError('Reconcile each existing step receipt separately; never infer both.')
                if action=='confirm':
                    if any(steps.get(step,{}).get('status') not in ('submitting','uncertain') for step in targets):
                        raise LedgerError('This step has no recorded submitting attempt to confirm.')
                    if len(targets)==2 and len({steps[step]['operation_id'] for step in targets})!=1:
                        raise LedgerError('Separate portal operations require separate receipts.')
                reference = (values.get('reference') or '').strip()
                evidence = evidence_file(values.get('evidence'))
                if not reference and not evidence:
                    raise LedgerError('Actual portal reference or saved confirmation evidence is required.')
                if len(reference) > 500:
                    raise LedgerError('Portal reference exceeds 500 characters.')
                note = text_value(values.get('note'),'Confirmation description')
                # When adopting one receipt from the original ledger, the other
                # operation stays uncertain until its own evidence is checked.
                if action=='record-existing' and not steps and row['status'] in ('submitted','submitting','uncertain'):
                    other = 'disclosure' if targets[0]=='plea' else 'plea'
                    self.db.execute("INSERT INTO steps(ticket,step,status,note) VALUES(?,?,'uncertain',?)",
                        (ticket,other,'Legacy receipt does not establish whether this separate step occurred.'))
                for step in targets:
                    self.db.execute('''INSERT INTO steps(ticket,step,status,confirmed_at,portal_reference,evidence_path,note)
                      VALUES(?,?,'confirmed',?,?,?,?) ON CONFLICT(ticket,step) DO UPDATE SET
                      status='confirmed',confirmed_at=excluded.confirmed_at,portal_reference=excluded.portal_reference,
                      evidence_path=excluded.evidence_path,note=excluded.note''',(ticket,step,now(),reference or None,evidence,note))
                changes = {'steps':targets,'reference':reference or None,'evidence_path':evidence,'note':note}
            elif action=='mark-uncertain':
                if any(steps.get(step,{}).get('status') not in ('submitting','uncertain') for step in targets):
                    raise LedgerError('Only a recorded final-click attempt can become uncertain.')
                note = text_value(values.get('note'),'Reason')
                for step in targets:
                    self.db.execute("UPDATE steps SET status='uncertain',note=? WHERE ticket=? AND step=?",(note,ticket,step))
                changes = {'steps':targets,'note':note}
            else:
                raise LedgerError('Unknown ledger action.')
            self.sync_status(ticket)
            self.event(ticket,action,changes)
            return self.get(ticket)
        return self.mutate(operation)

    def resume(self, ticket, note, evidence, verified_not_submitted,step=None):
        ticket = ticket_key(ticket)
        if not verified_not_submitted:
            raise LedgerError('Manual reconciliation must verify that the named step was not submitted.')
        note, evidence = text_value(note,'Reconciliation reason'), evidence_file(evidence)
        if not evidence:
            raise LedgerError('Saved reconciliation evidence is required.')
        def operation():
            row = self.get(ticket)
            if not row or row['status'] not in {'claimed','partial','held','submitting','uncertain'}:
                raise LedgerError('Only an unresolved unsubmitted ticket can be manually resumed.')
            unresolved = {name for name,item in row['steps'].items() if item['status'] in ('submitting','uncertain')}
            if unresolved:
                targets = set(self.targets(step))
                if targets!=unresolved:
                    raise LedgerError('Name exactly the unresolved step(s); confirmed steps cannot be reset.')
                for name in targets:
                    self.event(ticket,'step_reconciled_not_submitted',{'step':name,'previous':row['steps'][name],
                        'note':note,'evidence_path':evidence})
                    self.db.execute("UPDATE steps SET status='ready',note=?,evidence_path=? WHERE ticket=? AND step=?",
                                    (note,evidence,ticket,name))
            elif step is not None:
                raise LedgerError('There is no uncertain named step to resume.')
            self.db.execute("UPDATE requests SET status='ready',claim_token=NULL,note=?,evidence_path=?,updated_at=? WHERE ticket=?",
                            (note,evidence,now(),ticket))
            self.event(ticket,'manually_reconciled_not_submitted',{'note':note,'evidence_path':evidence})
            return self.get(ticket)
        return self.mutate(operation)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir',default=str(DEFAULT_DATA_DIR))
    sub = parser.add_subparsers(dest='command',required=True)
    sub.add_parser('list')
    for name in ('status','claim','mark-submitting','confirm','record-existing','mark-uncertain','hold','resume'):
        item = sub.add_parser(name)
        item.add_argument('--ticket',required=True)
        if name == 'claim':
            item.add_argument('--submission-id',required=True)
        if name in ('mark-submitting','confirm','record-existing','mark-uncertain','hold'):
            item.add_argument('--claim-token',required=True)
        if name in ('mark-submitting','confirm','record-existing','mark-uncertain','resume'):
            item.add_argument('--step',choices=('plea','disclosure','combined'),required=name!='resume')
        if name == 'mark-submitting':
            item.add_argument('--consent-file',required=True)
            item.add_argument('--combined-observed',action='store_true')
        if name in ('mark-submitting','confirm','record-existing','resume'):
            item.add_argument('--evidence')
        if name in ('confirm','record-existing'):
            item.add_argument('--reference')
        if name in ('confirm','record-existing','mark-uncertain','hold','resume'):
            item.add_argument('--note',required=True)
        if name == 'resume':
            item.add_argument('--verified-not-submitted',action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    ledger = None
    try:
        ledger = Ledger(args.data_dir)
        if args.command == 'list':
            result = ledger.listing()
        elif args.command == 'status':
            result = ledger.get(args.ticket)
        elif args.command == 'claim':
            result = ledger.claim(args.ticket,args.submission_id)
        elif args.command == 'resume':
            result = ledger.resume(args.ticket,args.note,args.evidence,args.verified_not_submitted,args.step)
        else:
            result = ledger.transition(args.ticket,args.claim_token,args.command,
                **{key:getattr(args,key,None) for key in ('step','combined_observed','consent_file','reference','evidence','note')})
        print(json.dumps(result,indent=2,sort_keys=True))
    except (LedgerError,sqlite3.Error,OSError) as error:
        print(json.dumps({'error':str(error)}),file=sys.stderr)
        return 1
    finally:
        if ledger:
            ledger.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
