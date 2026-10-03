#!/usr/bin/env bash
# One-command local check of the AnderHue practice files database layer.
#
#   scripts/test-practice-sql.sh
#
# Creates a throwaway PostgreSQL 16 cluster under /tmp on a private unix
# socket (no TCP listener, so it never collides with another server), loads
# the Supabase stubs and Fabsy prerequisites from scripts/sql-harness/, applies
# the LTB intake migration and the practice files migration, then runs
#   supabase/tests/ltb-intake.test.sql      (unchanged: LTB still works)
#   supabase/tests/practice-files.test.sql
# The catalog marker lines are also compared with practice-catalog.ts when
# Node can load TypeScript. The cluster is always stopped and deleted.
# Exits non-zero on any failure.
#
# PG_BIN overrides the server binaries directory. When run as root the server
# runs as the "postgres" OS user, because initdb refuses to run as root.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -z "${PG_BIN:-}" ]; then
  if [ -x /usr/lib/postgresql/16/bin/initdb ]; then
    PG_BIN=/usr/lib/postgresql/16/bin
  elif command -v pg_config >/dev/null 2>&1; then
    PG_BIN="$(pg_config --bindir)"
  else
    echo "FAIL: PostgreSQL server binaries not found (set PG_BIN)" >&2
    exit 1
  fi
fi
for tool in initdb pg_ctl; do
  if [ ! -x "$PG_BIN/$tool" ]; then
    echo "FAIL: $PG_BIN/$tool not found (set PG_BIN)" >&2
    exit 1
  fi
done
PSQL="$PG_BIN/psql"
[ -x "$PSQL" ] || PSQL="$(command -v psql)"

WORK="$(mktemp -d /tmp/fabsy-practice-sql.XXXXXX)"
PORT=5432
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  if ! id postgres >/dev/null 2>&1; then
    echo "FAIL: running as root needs a 'postgres' OS user for the server" >&2
    rm -rf "$WORK"
    exit 1
  fi
  chown postgres "$WORK"
  RUN_AS=(runuser -u postgres --)
fi

STARTED=0
cleanup() {
  local status=$?
  if [ "$STARTED" = 1 ]; then
    ${RUN_AS[@]+"${RUN_AS[@]}"} "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
  if [ "$status" = 0 ]; then
    echo "PASS: practice files SQL"
  else
    echo "FAIL: practice files SQL" >&2
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Runs one step quietly. Query results go nowhere; on failure the step's
# error output (or, failing that, its last output lines) is shown.
step() {
  local label=$1
  shift
  if "$@" >"$WORK/step.out" 2>"$WORK/step.err"; then
    echo "  ok    $label"
    grep -E '^(psql:[^ ]+ )?(NOTICE|WARNING):' "$WORK/step.err" | grep -v 'does not exist, skipping' \
      | sed 's/^/        /' || true
  else
    echo "  FAIL  $label" >&2
    if [ -s "$WORK/step.err" ]; then
      tail -n 20 "$WORK/step.err" | sed 's/^/        /' >&2
    else
      tail -n 20 "$WORK/step.out" | sed 's/^/        /' >&2
    fi
    if [ "$label" = "start server" ] && [ -s "$WORK/server.log" ]; then
      tail -n 10 "$WORK/server.log" | sed 's/^/        /' >&2
    fi
    exit 1
  fi
}

run_sql() {
  "$PSQL" -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d postgres "$@"
}

echo "practice files SQL harness (cluster in $WORK)"

# The catalog is TypeScript: use Node only if it can load it directly.
NODE_TS=()
if command -v node >/dev/null 2>&1; then
  for candidate in "node" "node --experimental-strip-types"; do
    if $candidate --input-type=module -e "await import('./supabase/functions/_shared/practice-catalog.ts')" >/dev/null 2>&1; then
      read -r -a NODE_TS <<<"$candidate"
      break
    fi
  done
fi
if [ "${#NODE_TS[@]}" -gt 0 ]; then
  step "catalog markers match practice-catalog.ts" "${NODE_TS[@]}" scripts/sql-harness/catalog-markers.mjs
else
  echo "  skip  catalog markers vs practice-catalog.ts (Node cannot load TypeScript here;" \
    "the SQL test still checks the markers against the SQL)"
fi

step "initdb" ${RUN_AS[@]+"${RUN_AS[@]}"} "$PG_BIN/initdb" -D "$WORK/data" -A trust -U postgres -E UTF8 --no-locale
STARTED=1
step "start server" ${RUN_AS[@]+"${RUN_AS[@]}"} "$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/server.log" -w \
  -o "-k $WORK -h '' -p $PORT -c timezone=UTC -c fsync=off -c full_page_writes=off -c synchronous_commit=off" start

step "Supabase stubs" run_sql -f scripts/sql-harness/supabase-stubs.sql
step "Fabsy prerequisites" run_sql -f scripts/sql-harness/fabsy-prerequisites.sql
step "migration 20260925150000_ltb_intake_pipeline" run_sql -f supabase/migrations/20260925150000_ltb_intake_pipeline.sql
step "migration 20261001150000_anderhue_practice_files" run_sql -f supabase/migrations/20261001150000_anderhue_practice_files.sql
step "supabase/tests/ltb-intake.test.sql" run_sql -f supabase/tests/ltb-intake.test.sql
step "supabase/tests/practice-files.test.sql" run_sql -v harness=1 -f supabase/tests/practice-files.test.sql
step "AnderHue LTB/traffic restriction and historical files" run_sql -f supabase/tests/anderhue-areas.test.sql
