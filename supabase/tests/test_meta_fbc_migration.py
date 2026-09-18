"""Validate full Meta click-ID storage on an isolated local PostgreSQL cluster.

Run: python3 supabase/tests/test_meta_fbc_migration.py
Uses synthetic data and a private Unix socket; no remote database or credentials.
"""
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]


def run() -> None:
    binaries = {name: shutil.which(name) for name in ("initdb", "pg_ctl", "psql")}
    if not all(binaries.values()):
        raise SystemExit("Local PostgreSQL binaries are required; no remote database will be used.")

    def command(args: list[str]) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(args, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result

    with tempfile.TemporaryDirectory(prefix="fabsy-meta-fbc-pg-", dir="/tmp") as folder:
        temporary = Path(folder)
        cluster = temporary / "data"
        socket = temporary / "socket"
        socket.mkdir()
        bootstrap = temporary / "bootstrap.sql"
        bootstrap.write_text("""
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema cron;
create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
""")
        base = temporary / "meta-base.sql"
        base.write_text((ROOT / "supabase/migrations/20260902124500_meta_capi_purchase_outbox.sql").read_text().replace(
            "create extension if not exists pg_cron with schema pg_catalog;", "-- local cron stub"
        ))
        command([binaries["initdb"], "-D", str(cluster), "-A", "trust", "-U", "fabsy_meta_test", "--no-locale", "--encoding=UTF8"])
        started = False
        try:
            command([
                binaries["pg_ctl"], "-D", str(cluster), "-l", str(temporary / "postgres.log"),
                "-o", shlex.join(["-k", str(socket), "-h", "", "-p", "55447"]), "-w", "start",
            ])
            started = True
            connection = [
                binaries["psql"], "-X", "-q", "-h", str(socket), "-p", "55447",
                "-U", "fabsy_meta_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
            ]
            for source in [
                bootstrap, base,
                ROOT / "supabase/migrations/20260918160000_meta_fbc_click_id_length.sql",
                Path(__file__).with_name("meta-fbc-click-id-length.test.sql"),
            ]:
                result = command([*connection, "-f", str(source)])
            print(result.stdout.strip())
        finally:
            if started:
                command([binaries["pg_ctl"], "-D", str(cluster), "-m", "immediate", "-w", "stop"])


if __name__ == "__main__":
    run()
