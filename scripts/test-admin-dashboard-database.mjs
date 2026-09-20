import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const bin =
  process.env.DASHBOARD_TEST_PG_BIN || "/opt/homebrew/opt/postgresql@17/bin";
const dir = mkdtempSync(join(tmpdir(), "fabsy-dashboard-pg-"));
function run(command, args) {
  const result = spawnSync(join(bin, command), args, { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || command);
  return result.stdout;
}
let started = false;
try {
  run("initdb", ["-D", join(dir, "data"), "-A", "trust", "--no-locale"]);
  run("pg_ctl", [
    "-D",
    join(dir, "data"),
    "-l",
    join(dir, "postgres.log"),
    "-o",
    `-k ${dir} -h '' -p 55448`,
    "-w",
    "start",
  ]);
  started = true;
  for (const file of [
    "supabase/tests/admin-dashboard.fixture.sql",
    "supabase/migrations/20260920100000_admin_dashboard_overview.sql",
    "supabase/tests/admin-dashboard.test.sql",
    "supabase/tests/admin-case-status.fixture.sql",
    "supabase/migrations/20260920210000_admin_ticket_case_status.sql",
    "supabase/tests/admin-case-status.test.sql",
    "supabase/migrations/20260920220000_admin_ticket_lapsed_status.sql",
    "supabase/tests/admin-lapsed-status.test.sql",
  ]) {
    run("psql", [
      "-h",
      dir,
      "-p",
      "55448",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      file,
    ]);
    console.log(`${file}: passed`);
  }
} finally {
  if (started)
    run("pg_ctl", ["-D", join(dir, "data"), "-m", "fast", "-w", "stop"]);
  rmSync(dir, { recursive: true, force: true });
}
