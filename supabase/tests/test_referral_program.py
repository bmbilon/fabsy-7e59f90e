#!/usr/bin/env python3
"""Run the real referral migration/rules in an isolated, disposable PostgreSQL.

Never uses project secrets, Supabase credentials, inherited PG connection settings,
or an existing database. Requires local initdb, pg_ctl, and psql binaries.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = """
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin nologin;
create schema auth;
create function auth.role() returns text language sql stable as
$$ select current_setting('request.jwt.claim.role',true) $$;
grant usage on schema auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
create type public.app_role as enum('admin','case_manager','user');
create table public.user_roles(user_id uuid,role public.app_role);
create function public.has_role(user_id uuid,required_role public.app_role) returns boolean language sql stable security definer as
$$ select exists(select 1 from public.user_roles r where r.user_id = $1 and r.role = $2) $$;
create table public.clients(id uuid primary key default gen_random_uuid(),auth_user_id uuid references auth.users(id),
  email text not null,phone text not null,address text,city text,postal_code text,created_at timestamptz not null default now());
create table public.ticket_submissions(id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients(id),
  service_type text not null default 'representation',ticket_type text not null default 'officer_issued',
  status text not null default 'awaiting_payment',updated_at timestamptz default now());
create table public.idr_checkout_intents(id uuid primary key default gen_random_uuid(),ticket_submission_id uuid references public.ticket_submissions(id),
  client_id uuid references public.clients(id),checkout_kind text,status text);
grant all on all tables in schema public to service_role;
grant select,insert,update on public.ticket_submissions to authenticated;
"""


def main():
    pg_config = shutil.which("pg_config")
    if not pg_config:
        raise SystemExit("Local PostgreSQL is required; no remote database will be used.")
    bindir = Path(subprocess.check_output([pg_config, "--bindir"], text=True).strip())
    commands = {name: str(bindir / name) for name in ("initdb", "pg_ctl", "psql")}
    if not all(Path(command).exists() for command in commands.values()):
        raise SystemExit("Local PostgreSQL server tools are required; no remote database will be used.")
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    with tempfile.TemporaryDirectory(prefix="fabsy-referral-test-") as temporary:
        base = Path(temporary)
        data = base / "data"
        sock = base / "socket"
        sock.mkdir()
        # No TCP listener. A unique local Unix socket rules out production access.
        subprocess.run([commands["initdb"], "-D", str(data), "-U", "postgres", "--auth=trust", "--no-locale"],
                       env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        subprocess.run([commands["pg_ctl"], "-D", str(data), "-l", str(base / "postgres.log"),
                        "-o", f"-F -c listen_addresses='' -k {sock} -p 55482", "-w", "start"],
                       env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        psql = [commands["psql"], "--no-psqlrc", "-h", str(sock), "-p", "55482", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"]

        def run(sql=None, file=None, check=True):
            result = subprocess.run(psql + (["-f", str(file)] if file else []), input=sql, text=True, env=env, capture_output=True)
            if check and result.returncode:
                raise RuntimeError(result.stderr)
            return result

        try:
            run(sql=BOOTSTRAP)
            run(file=ROOT / "supabase/migrations/20260831121000_referral_program.sql")
            run(file=ROOT / "supabase/tests/referral-program.test.sql")
            # Two different referred orders race for the same referrer's first
            # payout. The advisory lock must permit exactly one without a profile.
            def race(index):
                return run(sql=f"""
set request.jwt.claim.role = 'service_role';
select public.referral_mark_paid('10000000-0000-4000-8000-000000000001',
  (select id from public.referrals where order_id = '90000000-0000-4000-8000-00000000000{index}'), 'RACE-{index}');
""", check=False)

            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(race, [1, 2]))
            if sum(result.returncode == 0 for result in results) != 1:
                raise AssertionError("Concurrent payouts must allow exactly one first payout: " + "\n".join(result.stderr for result in results))
            run(sql="""
do $$ begin
  if (select count(*) from public.referral_payouts p join public.referral_codes c on c.id = p.referrer_id where c.code = 'CONCURRENT') <> 1 then
    raise exception 'Concurrent payout count is incorrect'; end if;
end $$;
""")
            # Keep an uncommitted refund event open after it has searched for the
            # not-yet-linked order. The checkout must wait, then see that hold.
            holding = subprocess.Popen(psql + ["-A", "-t"], env=env, text=True,
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            holding.stdin.write("""
set request.jwt.claim.role = 'service_role';
begin;
select public.referral_record_payment_hold('pi_linkrace',now(),null,'evt_linkrace');
\\echo HOLD_READY
select pg_sleep(0.2);
commit;
\\q
""")
            holding.stdin.flush()
            while True:
                line = holding.stdout.readline()
                if line.strip() == "HOLD_READY":
                    break
                if not line:
                    raise RuntimeError("Refund race setup failed: " + holding.stderr.read())
            run(sql="""
set request.jwt.claim.role = 'service_role';
select public.referral_record_checkout_payment('91000000-0000-4000-8000-000000000001','pi_linkrace');
""")
            _, holding_error = holding.communicate(timeout=5)
            if holding.returncode:
                raise RuntimeError(holding_error)
            run(sql="""
do $$ begin
  if not exists(select 1 from public.referrals r join public.ticket_submissions t on t.id = r.order_id
    where t.id = '91000000-0000-4000-8000-000000000001' and t.referral_refunded_at is not null and r.status = 'void' and r.hold_reason = 'refund')
    then raise exception 'Concurrent refund and checkout linkage lost the hold'; end if;
end $$;
""")
            print("Referral SQL: migration, permissions, attribution, fraud, settlement, refunds, payout/tax rules, and concurrent payout checks passed.")
        finally:
            subprocess.run([commands["pg_ctl"], "-D", str(data), "-m", "fast", "-w", "stop"], env=env,
                           check=False, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


if __name__ == "__main__":
    main()
