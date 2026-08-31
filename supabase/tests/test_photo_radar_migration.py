"""Run ATE payment/workflow security checks in a disposable socket-only database.

No environment secrets, existing database, network listener, or real client records.
Run: python3 supabase/tests/test_photo_radar_migration.py
"""
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = """
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
grant usage on schema public,auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key);
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.is_idr_staff() returns boolean language sql stable as $$ select coalesce(auth.uid()='00000000-0000-4000-8000-000000000001'::uuid,false) $$;
create table public.clients(id uuid primary key,auth_user_id uuid references auth.users(id));
create table public.ticket_submissions(
  id uuid primary key,client_id uuid not null references public.clients(id),service_type text not null default 'representation',
  representation_includes_assessment boolean not null default false,insurance_company text,
  representation_credit_eligible boolean not null default false,assessment_payment_source text,assessment_intake jsonb,
  assessment_ticket_path text,assessment_access_token_hash text,status text not null default 'awaiting_payment',
  fine_amount text not null default '200.00',updated_at timestamptz not null default now(),case_outcome text,
  ticket_document_path text,consent_form_path text,preferred_locale text not null default 'en',ticket_number text,
  representation_access_token_hash text,referral_payment_intent_id text
);
create table public.idr_orders(id uuid primary key default gen_random_uuid(),ticket_submission_id uuid references public.ticket_submissions(id));
create table public.idr_checkout_intents(id uuid primary key,client_id uuid references public.clients(id),ticket_submission_id uuid references public.ticket_submissions(id),
  type text not null,checkout_kind text not null,expected_amount_cents integer not null,purchaser_email text not null default 'synthetic@example.invalid',
  stripe_checkout_session_id text unique,status text not null default 'creating',attempts integer not null default 1);
grant select on public.clients,public.ticket_submissions to authenticated;
grant all on all tables in schema public to service_role;
"""


def run():
    binaries = {name: shutil.which(name) for name in ('initdb', 'pg_ctl', 'psql')}
    if not all(binaries.values()):
        raise SystemExit('Local PostgreSQL is required; no remote fallback is used.')

    def command(args, **kwargs):
        result = subprocess.run(args, text=True, capture_output=True, **kwargs)
        if result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result

    with tempfile.TemporaryDirectory(prefix='fabsy-ate-pg-', dir='/tmp') as folder:
        temporary = Path(folder)
        cluster = temporary / 'data'
        socket = temporary / 'socket'
        socket.mkdir()
        bootstrap = temporary / 'bootstrap.sql'
        bootstrap.write_text(BOOTSTRAP)
        command([binaries['initdb'], '-D', str(cluster), '-A', 'trust', '-U', 'fabsy_ate_test', '--no-locale', '--encoding=UTF8'])
        started = False
        try:
            command([binaries['pg_ctl'], '-D', str(cluster), '-l', str(temporary / 'postgres.log'), '-o', shlex.join(['-k', str(socket), '-h', '', '-p', '55441']), '-w', 'start'])
            started = True
            connection = [binaries['psql'], '-X', '-q', '-h', str(socket), '-p', '55441', '-U', 'fabsy_ate_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
            command([*connection, '-f', str(bootstrap)])
            command([*connection, '-f', str(ROOT / 'supabase/migrations/20260831115000_photo_radar_product.sql')])
            result = command([*connection, '-f', str(Path(__file__).with_name('photo-radar.test.sql'))])
            print('ATE database assertions passed: product, privacy, replay, client approval, SLA, outbox and zero-outcome median.')
        finally:
            if started:
                command([binaries['pg_ctl'], '-D', str(cluster), '-m', 'immediate', '-w', 'stop'])


if __name__ == '__main__':
    run()
