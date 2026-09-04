"""Exercise paid-funnel checkout revocation and RPC access locally.

Run: python3 supabase/tests/test_paid_funnel_measurement_migration.py
Requires local initdb/pg_ctl/psql. It opens no network listener, reads no
Supabase credentials and uses synthetic opaque identifiers only.
"""
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = r"""
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema cron;
create function cron.schedule(text, text, text) returns bigint language sql as $$
  select 1::bigint
$$;
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

    with tempfile.TemporaryDirectory(prefix="fabsy-paid-funnel-pg-", dir="/tmp") as folder:
        temporary = Path(folder)
        cluster = temporary / "data"
        socket = temporary / "socket"
        socket.mkdir()
        bootstrap = temporary / "bootstrap.sql"
        bootstrap.write_text(BOOTSTRAP)
        base_source = (
            ROOT / "supabase/migrations/20260903170000_paid_funnel_measurement.sql"
        ).read_text()
        base_with_local_cron = temporary / "paid-funnel-base-with-local-cron.sql"
        base_with_local_cron.write_text(base_source.replace(
            "create extension if not exists pg_cron with schema pg_catalog;",
            "-- pg_cron is represented by the isolated test stub from bootstrap.sql",
        ))
        pre_fence = temporary / "paid-funnel-pre-fence.sql"
        pre_fence.write_text(r"""
insert into analytics_private.paid_funnel_checkouts (
  checkout_session_hash, session_id, consent_version, consented_at, revoked_at
) values (
  repeat('e', 64),
  '00000000-0000-4000-8000-0000000000e1',
  'fabsy-funnel-v1',
  clock_timestamp(),
  clock_timestamp()
);
""")
        command([
            binaries["initdb"], "-D", str(cluster), "-A", "trust",
            "-U", "fabsy_funnel_test", "--no-locale", "--encoding=UTF8",
        ])
        started = False
        try:
            command([
                binaries["pg_ctl"], "-D", str(cluster), "-l", str(temporary / "postgres.log"),
                "-o", shlex.join(["-k", str(socket), "-h", "", "-p", "55445"]), "-w", "start",
            ])
            started = True
            connection = [
                binaries["psql"], "-X", "-q", "-h", str(socket), "-p", "55445",
                "-U", "fabsy_funnel_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
            ]
            command([*connection, "-f", str(bootstrap)])
            command([*connection, "-f", str(base_with_local_cron)])
            command([*connection, "-f", str(pre_fence)])
            command([
                *connection,
                "-f",
                str(ROOT / "supabase/migrations/20260903183000_paid_funnel_checkout_withdrawal_fence.sql"),
            ])
            result = command([
                *connection,
                "-f",
                str(Path(__file__).with_name("paid-funnel-checkout-withdrawal.test.sql")),
            ])
            print(result.stdout.strip())
        finally:
            if started:
                command([binaries["pg_ctl"], "-D", str(cluster), "-m", "immediate", "-w", "stop"])


if __name__ == "__main__":
    run()
