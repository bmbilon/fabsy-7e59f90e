import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = mkdtempSync(join(tmpdir(), "fabsy-performance-"));
try {
  const outfile = join(directory, "performance.mjs");
  await build({
    entryPoints: ["src/lib/admin/performance.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const {
    metricValue,
    selectionFromParams,
    selectionParams,
    hasHistory,
    comparableHistory,
    performanceCsv,
  } = await import(pathToFileURL(outfile));
  const metrics = {
    revenue_cents: 30000,
    gross_cents: 31500,
    refunds_cents: 4200,
    paid_orders: 2,
    tracked_visits: 12,
    submissions: 3,
  };
  assert.equal(metricValue(metrics, "net_cash_cents"), 27300);
  assert.equal(metricValue(metrics, "average_order_cents"), 15000);
  assert.equal(
    metricValue({ ...metrics, paid_orders: 0 }, "average_order_cents"),
    null,
  );
  assert.equal(
    metricValue({ ...metrics, revenue_cents: null }, "average_order_cents"),
    null,
  );
  assert.equal(metricValue(null, "revenue_cents"), null);
  assert.equal(selectionFromParams(new URLSearchParams()).period, "all_time");
  assert.equal(
    selectionFromParams(
      new URLSearchParams("period=custom&from=2025-12-31&to=2025-01-01"),
    ).period,
    "all_time",
  );
  const selected = selectionFromParams(
    new URLSearchParams(
      "period=custom&from=2025-01-01&to=2025-12-31&compare=year&group=month",
    ),
  );
  assert.deepEqual(
    selectionFromParams(selectionParams(selected, new URLSearchParams())),
    selected,
  );
  const report = {
    generated_at: "2026-09-20T12:00:00Z",
    start_day: "2026-09-01",
    end_day: "2026-09-20",
    since: "2026-09-01T06:00:00Z",
    until: "2026-09-20T12:00:00Z",
    previous_since: "2026-08-12T06:00:00Z",
    previous_until: "2026-09-01T00:00:00Z",
    comparison: "previous",
    granularity: "day",
    coverage: {
      history_start: "2025-01-01",
      revenue_since: "2026-08-25T12:00:00Z",
      cash_since: "2026-08-25T12:00:00Z",
      visits_since: null,
      submissions_since: "2025-01-01T12:00:00Z",
      traffic_retention_days: 400,
    },
    current: metrics,
    previous: metrics,
    series: [
      {
        day: "2026-09-01",
        end_day: "2026-09-01",
        current: metrics,
        previous: { ...metrics, revenue_cents: null },
      },
    ],
  };
  assert.equal(hasHistory(report, "revenue_cents", true), true);
  assert.equal(
    comparableHistory(report, "revenue_cents"),
    false,
    "Partial baseline must not imply a growth rate",
  );
  assert.equal(comparableHistory(report, "submissions"), true);
  assert.equal(hasHistory(report, "tracked_visits"), false);
  const csv = performanceCsv(report);
  assert.match(csv, /America\/Edmonton/);
  assert.match(csv, /273\.00/);
  assert.match(csv, /150\.00/);
  assert.match(csv, /No recorded history/);
  assert.match(csv, /Previous revenue CAD/);
  console.log(
    "Performance calculations, coverage, range state and export tests passed",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
