#!/usr/bin/env python3
"""Run migration regressions in an exclusively local, disposable PostgreSQL 14."""

import argparse
import os
import pwd
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
MIGRATIONS = HERE.parents[1] / "migrations"
LEGACY = MIGRATIONS / "20260901173000_whatsapp_vapi_bridge.sql"
QUEUE = MIGRATIONS / "20260911213000_chatwoot_vapi_queue.sql"
DATABASE = "fabsy_chatwoot_queue_test"
# Remove libpq connection/options/service settings inherited from the developer.
ENV = {key: value for key, value in os.environ.items() if not key.startswith("PG")}


def command(argv, *, sql=None):
    result = subprocess.run(
        [str(arg) for arg in argv], input=sql, text=True, capture_output=True,
        env=ENV, timeout=60, check=False,
    )
    if result.returncode:
        raise RuntimeError(f"{Path(str(argv[0])).name} failed:\n{result.stderr.strip()}")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bindir", type=Path, help="PostgreSQL 14 bin directory; defaults to pg_config --bindir")
    args = parser.parse_args()
    if os.geteuid() == 0:
        parser.error("Run as a normal user; PostgreSQL refuses to initialize as root.")
    if args.pg_bindir:
        bindir = args.pg_bindir.resolve()
    else:
        config = shutil.which("pg_config")
        if not config:
            parser.error("Install PostgreSQL 14 or pass --pg-bindir /path/to/postgresql14/bin")
        bindir = Path(command([config, "--bindir"]).stdout.strip())
    for name in ("initdb", "pg_ctl", "psql"):
        if not (bindir / name).is_file():
            parser.error(f"Missing {bindir / name}")
    version = command([bindir / "pg_ctl", "--version"]).stdout.strip()
    if not re.search(r"PostgreSQL\) 14\.", version):
        parser.error(f"These regressions require PostgreSQL 14; found {version}")

    # A short private socket path avoids platform Unix-socket path limits. The
    # harness has no connection string or host option and never uses a saved DB.
    temp_parent = "/private/tmp" if Path("/private/tmp").is_dir() else "/tmp"
    with tempfile.TemporaryDirectory(prefix="fabsy-cw-tests-", dir=temp_parent) as temporary:
        root = Path(temporary).resolve()
        data = root / "data"
        socket = root / "socket"
        socket.mkdir(mode=0o700)
        command([bindir / "initdb", "-D", data, "--auth=trust", "--no-locale"])
        options = shlex.join([
            "-c", "listen_addresses=", "-c", "fabsy.queue_test=disposable-local",
            "-c", "plpgsql.check_asserts=on", "-k", str(socket), "-p", "65439",
        ])
        started = False
        try:
            started = True  # Also clean up if startup times out after launching.
            command([bindir / "pg_ctl", "-D", data, "-l", root / "server.log", "-o", options, "-w", "start"])
            # Every psql invocation pins the private socket, port, user and DB;
            # -X ignores ~/.psqlrc and no inherited PG* settings survive.
            psql = [bindir / "psql", "-X", "-h", socket, "-p", "65439", "-U", pwd.getpwuid(os.getuid()).pw_name,
                    "-v", "ON_ERROR_STOP=1"]
            command(psql + ["-d", "postgres"], sql=f"create database {DATABASE};")
            psql += ["-d", DATABASE]
            command(psql + ["-f", HERE / "fixtures.sql"])
            legacy = LEGACY.read_text()
            extension_statement = "create extension if not exists pg_cron with schema pg_catalog;"
            if legacy.count(extension_statement) != 1:
                raise RuntimeError("Legacy pg_cron setup changed; review the inert-fixture substitution.")
            legacy = legacy.replace(extension_statement, "-- pg_cron is replaced by the inert local fixture.", 1)
            command(psql, sql=legacy)
            print("PASS: full legacy migration and embedded assertions (inert cron fixture)")
            command(psql + ["-f", QUEUE])
            print("PASS: new queue migration, unchanged")
            for name in ("queue.test.sql", "control.test.sql", "send-races.test.sql", "scheduler.test.sql"):
                command(psql + ["-f", HERE / name])
                print(f"PASS: {name}")
        finally:
            if started and (data / "postmaster.pid").exists():
                command([bindir / "pg_ctl", "-D", data, "-m", "fast", "-w", "stop"])
    print("PASS: local cluster stopped and temporary files removed")


if __name__ == "__main__":
    main()
