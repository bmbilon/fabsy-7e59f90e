"""Exercise notification dispatch idempotency in an isolated PostgreSQL cluster.

Run: python3 supabase/tests/test_ticket_submission_notification_migration.py
No Supabase credentials or external provider APIs are used.
"""
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = r"""
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create table public.ticket_submissions (
  id uuid primary key,
  service_type text not null,
  status text not null
);
create table public.notification_concurrency_results (
  actor text primary key,
  result jsonb not null
);
grant insert, select on public.notification_concurrency_results to service_role;
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

    with tempfile.TemporaryDirectory(prefix="fabsy-notification-pg-", dir="/tmp") as folder:
        temporary = Path(folder)
        cluster = temporary / "data"
        socket = temporary / "socket"
        socket.mkdir()
        bootstrap = temporary / "bootstrap.sql"
        bootstrap.write_text(BOOTSTRAP)
        command([
            binaries["initdb"], "-D", str(cluster), "-A", "trust",
            "-U", "fabsy_notification_test", "--no-locale", "--encoding=UTF8",
        ])
        started = False
        try:
            command([
                binaries["pg_ctl"], "-D", str(cluster), "-l", str(temporary / "postgres.log"),
                "-o", shlex.join(["-k", str(socket), "-h", "", "-p", "55447"]), "-w", "start",
            ])
            started = True
            connection = [
                binaries["psql"], "-X", "-q", "-h", str(socket), "-p", "55447",
                "-U", "fabsy_notification_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
            ]
            command([*connection, "-f", str(bootstrap)])
            command([
                *connection,
                "-f",
                str(ROOT / "supabase/migrations/20260903193000_ticket_submission_notification_idempotency.sql"),
            ])
            # Exercise the real unique-index/transaction boundary with two
            # separate database sessions. One session deliberately holds its
            # transaction open after claiming so the other must wait on the
            # in-flight insert rather than observing a sequential fixture.
            concurrent_submission = "00000000-0000-4000-8000-000000000590"
            command([
                *connection,
                "-c",
                f"insert into public.ticket_submissions (id, service_type, status) values ('{concurrent_submission}', 'representation', 'awaiting_payment')",
            ])
            first_sql = (
                "begin; set role service_role; "
                "insert into public.notification_concurrency_results (actor, result) "
                "select 'first', public.claim_ticket_submission_notification("
                f"'{concurrent_submission}', '00000000-0000-4000-8000-000000000591'); "
                "select pg_sleep(0.75); commit;"
            )
            second_sql = (
                "set role service_role; "
                "insert into public.notification_concurrency_results (actor, result) "
                "select 'second', public.claim_ticket_submission_notification("
                f"'{concurrent_submission}', '00000000-0000-4000-8000-000000000592');"
            )
            quiet_connection = [*connection, "-A", "-t", "-c"]
            first = subprocess.Popen(
                [*quiet_connection, first_sql], text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            time.sleep(0.1)
            second = subprocess.Popen(
                [*quiet_connection, second_sql], text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            first_stdout, first_stderr = first.communicate(timeout=10)
            second_stdout, second_stderr = second.communicate(timeout=10)
            if first.returncode or second.returncode:
                raise RuntimeError(first_stderr or second_stderr or first_stdout or second_stdout)

            command([
                *connection,
                "-c",
                "do $$ begin "
                "if (select count(*) from public.notification_concurrency_results where (result ->> 'acquired')::boolean) <> 1 "
                "or (select count(*) from public.notification_concurrency_results where not (result ->> 'acquired')::boolean) <> 1 "
                "or (select count(*) from public.notification_concurrency_results where result ->> 'status' = 'sending') <> 2 "
                "or (select count(*) from public.ticket_submission_notification_dispatches where submission_id = '00000000-0000-4000-8000-000000000590') <> 1 "
                "then raise exception 'concurrent notification fence admitted an invalid result set'; end if; end $$;",
            ])
            result = command([
                *connection,
                "-f",
                str(Path(__file__).with_name("ticket-submission-notification-idempotency.test.sql")),
            ])
            print(result.stdout.strip())
        finally:
            if started:
                command([binaries["pg_ctl"], "-D", str(cluster), "-m", "immediate", "-w", "stop"])


if __name__ == "__main__":
    run()
