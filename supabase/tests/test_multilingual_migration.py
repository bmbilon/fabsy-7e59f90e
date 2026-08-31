"""Exercise the locale migration in a disposable, socket-only PostgreSQL cluster.

Run: python3 supabase/tests/test_multilingual_migration.py
Requires local initdb/pg_ctl/psql binaries. Never reads Supabase credentials or
uses an existing database. Fixtures contain synthetic text and identities only.
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
grant usage on schema public, auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key);
insert into auth.users values ('00000000-0000-4000-8000-000000000001');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
create function public.is_idr_staff() returns boolean language sql stable as $$
  select auth.uid() = '00000000-0000-4000-8000-000000000001'::uuid
$$;
create table public.ticket_submissions (
  id uuid primary key default gen_random_uuid(), additional_notes text,
  defense_strategy text, violation text
);
create table public.idr_orders (id uuid primary key default gen_random_uuid());
create table public.idr_checkout_intents (
  id uuid primary key default gen_random_uuid(), ticket_submission_id uuid, status text
);
insert into public.ticket_submissions (id, additional_notes)
values ('00000000-0000-4000-8000-000000000099', 'Synthetic historical note');
"""


def run() -> None:
    binaries = {name: shutil.which(name) for name in ("initdb", "pg_ctl", "psql")}
    if not all(binaries.values()):
        raise SystemExit("Local PostgreSQL binaries are required; no remote database will be used.")

    def command(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(args, text=True, capture_output=True, **kwargs)
        if result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result

    with tempfile.TemporaryDirectory(prefix="fabsy-locale-pg-", dir="/tmp") as folder:
        temporary = Path(folder)
        cluster = temporary / "data"
        socket = temporary / "socket"
        socket.mkdir()
        bootstrap = temporary / "bootstrap.sql"
        bootstrap.write_text(BOOTSTRAP)
        command([binaries["initdb"], "-D", str(cluster), "-A", "trust", "-U", "fabsy_locale_test", "--no-locale", "--encoding=UTF8"])
        started = False
        try:
            command([binaries["pg_ctl"], "-D", str(cluster), "-l", str(temporary / "postgres.log"), "-o", shlex.join(["-k", str(socket), "-h", "", "-p", "55439"]), "-w", "start"])
            started = True
            connection = [binaries["psql"], "-X", "-q", "-h", str(socket), "-p", "55439", "-U", "fabsy_locale_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
            command([*connection, "-f", str(bootstrap)])
            command([*connection, "-f", str(ROOT / "supabase/migrations/20260830160000_multilingual_intake.sql")])
            result = command([*connection, "-f", str(Path(__file__).with_name("multilingual-intake.test.sql"))])
            print(result.stdout.strip())
        finally:
            if started:
                command([binaries["pg_ctl"], "-D", str(cluster), "-m", "immediate", "-w", "stop"])


if __name__ == "__main__":
    run()
