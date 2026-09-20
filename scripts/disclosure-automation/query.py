#!/usr/bin/env python3
"""Run one read-only candidate page using existing Supabase CLI authentication.

Use --print-sql for local inspection without contacting Supabase. Every returned
row includes total count and page_has_more. Continue at offset + limit while
page_has_more is true, including when every row in this page is already held or
submitted. Do not change remote case state while enumerating pages.
"""
import argparse
from pathlib import Path
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]


def build_query(offset=0,limit=50):
    if type(offset) is not int or not 0 <= offset <= 1000000:
        raise ValueError('offset must be an integer between 0 and 1000000')
    if type(limit) is not int or not 1 <= limit <= 50:
        raise ValueError('limit must be an integer between 1 and 50')
    query = (HERE/'candidates.sql').read_text()
    for original,replacement in (
        ('/* automation_batch_limit */ 50::integer',f'/* automation_batch_limit */ {limit}::integer'),
        ('/* automation_batch_offset */ 0::integer',f'/* automation_batch_offset */ {offset}::integer'),
    ):
        if query.count(original) != 1:
            raise ValueError('Reviewed pagination template has changed; inspect before running.')
        query = query.replace(original,replacement)
    # The SELECT itself is reviewed, and the database also enforces read-only.
    return 'BEGIN READ ONLY;\n'+query+'\nCOMMIT;\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offset',type=int,default=0)
    parser.add_argument('--limit',type=int,default=50)
    parser.add_argument('--print-sql',action='store_true')
    args = parser.parse_args()
    try:
        query = build_query(args.offset,args.limit)
    except ValueError as error:
        parser.error(str(error))
    if args.print_sql:
        print(query,end='')
        return 0
    # Temporary file contains reviewed SQL only, never returned client records.
    try:
        with tempfile.TemporaryDirectory(prefix='fabsy-disclosure-query-') as directory:
            path = Path(directory)/'candidates.sql'
            path.write_text(query)
            return subprocess.run(['supabase','db','query','--linked',
                '--file',str(path),'--output','json','--log-level','error'],
                cwd=REPO,check=False).returncode
    except OSError as error:
        print(str(error),file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
