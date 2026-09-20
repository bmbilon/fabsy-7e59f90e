import type { Metric, Metrics } from "./dashboard";

export const periods = {
  all_time: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "365d": "Last 12 months",
  ytd: "Year to date",
  last_year: "Last year",
  custom: "Custom dates",
} as const;
export type PerformancePeriod = keyof typeof periods;
export type Comparison = "none" | "previous" | "year";
export type Granularity = "auto" | "day" | "week" | "month";
export type ReportMetric = Metric | "net_cash_cents" | "average_order_cents";
export interface PerformanceSelection {
  period: PerformancePeriod;
  start?: string;
  end?: string;
  compare: Comparison;
  granularity: Granularity;
}
export type BucketMetrics = { [K in keyof Metrics]: number | null };
export interface PerformanceReport {
  generated_at: string;
  period: PerformancePeriod;
  days: number;
  since: string;
  until: string;
  start_day: string;
  end_day: string;
  granularity: Exclude<Granularity, "auto">;
  comparison: Comparison;
  previous_since: string | null;
  previous_until: string | null;
  coverage: {
    history_start: string;
    revenue_since: string | null;
    cash_since: string | null;
    visits_since: string | null;
    submissions_since: string | null;
    traffic_retention_days: number;
  };
  current: Metrics;
  previous: Metrics | null;
  series: Array<{
    day: string;
    end_day: string;
    current: BucketMetrics;
    previous: BucketMetrics | null;
  }>;
  services: Array<{
    product: string;
    paid_orders: number;
    revenue_cents: number;
    gross_cents: number;
  }>;
  sources: Array<{ source: string; sessions: number }>;
  funnel: Array<{ event_name: string; sessions: number }>;
}
export const defaultSelection: PerformanceSelection = {
  period: "all_time",
  compare: "previous",
  granularity: "auto",
};
export function selectionFromParams(
  params: URLSearchParams,
): PerformanceSelection {
  const period = params.get("period");
  const start = params.get("from") || undefined;
  const end = params.get("to") || undefined;
  const compare = params.get("compare");
  const granularity = params.get("group");
  const validCustom =
    start &&
    end &&
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(end) &&
    start <= end;
  return {
    period:
      period &&
      Object.prototype.hasOwnProperty.call(periods, period) &&
      (period !== "custom" || validCustom)
        ? (period as PerformancePeriod)
        : "all_time",
    ...(validCustom ? { start, end } : {}),
    compare: compare === "none" || compare === "year" ? compare : "previous",
    granularity:
      granularity === "day" || granularity === "week" || granularity === "month"
        ? granularity
        : "auto",
  };
}
export function selectionParams(
  selection: PerformanceSelection,
  existing: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(existing);
  params.set("period", selection.period);
  params.set("compare", selection.compare);
  params.set("group", selection.granularity);
  params.delete("from");
  params.delete("to");
  if (selection.period === "custom" && selection.start && selection.end) {
    params.set("from", selection.start);
    params.set("to", selection.end);
  }
  return params;
}
export const calendarDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const reportDate = (date: string, year = true) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: date.length === 10 ? "UTC" : "America/Edmonton",
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" as const } : {}),
  }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
export const rangeLabel = (report: PerformanceReport) =>
  `${reportDate(report.start_day)} – ${reportDate(report.end_day)}`;
export function metricValue(
  metrics: BucketMetrics | Metrics | null,
  key: ReportMetric,
): number | null {
  if (!metrics) return null;
  if (key === "net_cash_cents")
    return metrics.gross_cents === null || metrics.refunds_cents === null
      ? null
      : metrics.gross_cents - metrics.refunds_cents;
  if (key === "average_order_cents")
    return !metrics.paid_orders || metrics.revenue_cents === null
      ? null
      : metrics.revenue_cents / metrics.paid_orders;
  return metrics[key];
}
export function recordedSince(report: PerformanceReport, metric: ReportMetric) {
  return metric === "net_cash_cents"
    ? report.coverage.cash_since
    : metric === "tracked_visits"
      ? report.coverage.visits_since
      : metric === "submissions"
        ? report.coverage.submissions_since
        : report.coverage.revenue_since;
}
export function hasHistory(
  report: PerformanceReport,
  metric: ReportMetric,
  previous = false,
): boolean {
  const first = recordedSince(report, metric);
  const until = previous ? report.previous_until : report.until;
  return !!first && !!until && Date.parse(first) < Date.parse(until);
}
export function comparableHistory(
  report: PerformanceReport,
  metric: ReportMetric,
): boolean {
  const first = recordedSince(report, metric);
  return (
    !!first &&
    !!report.previous_since &&
    calendarDay(new Date(first)) <=
      calendarDay(new Date(report.previous_since)) &&
    calendarDay(new Date(first)) <= report.start_day
  );
}
export const productLabels: Record<string, string> = {
  rapid_resolution: "Rapid Resolution",
  rapid_resolution_bundle: "Rapid Resolution bundle",
  photo_radar: "Photo Radar",
};
export function performanceCsv(report: PerformanceReport): string {
  const cell = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows: unknown[][] = [
    ["Fabsy performance", rangeLabel(report)],
    ["Timezone", "America/Edmonton"],
    ["Currency", "CAD"],
    ["Generated at", report.generated_at],
    ["Granularity", report.granularity],
    [
      "Financial scope",
      "Verified ticket purchases; revenue before tax/refunds; net cash includes tax, not profit",
    ],
    ["First recorded payment", report.coverage.revenue_since],
    ["First retained traffic", report.coverage.visits_since],
    ["First recorded case", report.coverage.submissions_since],
    ["Traffic retention days", report.coverage.traffic_retention_days],
    ["Comparison", report.comparison],
    ["Comparison start", report.previous_since],
    ["Comparison end (exclusive)", report.previous_until],
    [
      "Session scope",
      "Distinct consented landing sessions per bucket; bucket counts are not additive across time",
    ],
    ["Blank values", "No recorded history or no denominator"],
    [],
    [
      "Bucket start",
      "Bucket end",
      "Revenue CAD",
      "Gross cash CAD",
      "Refunds CAD",
      "Net cash CAD",
      "Orders",
      "Average order CAD",
      "Tracked visits",
      "Cases",
      "Previous revenue CAD",
      "Previous gross cash CAD",
      "Previous refunds CAD",
      "Previous net cash CAD",
      "Previous orders",
      "Previous average order CAD",
      "Previous tracked visits",
      "Previous cases",
    ],
  ];
  const dollars = (n: number | null) =>
    n === null ? "" : (n / 100).toFixed(2);
  const values = (m: BucketMetrics | null) => [
    dollars(m?.revenue_cents ?? null),
    dollars(m?.gross_cents ?? null),
    dollars(m?.refunds_cents ?? null),
    dollars(metricValue(m, "net_cash_cents")),
    m?.paid_orders,
    dollars(metricValue(m, "average_order_cents")),
    m?.tracked_visits,
    m?.submissions,
  ];
  for (const row of report.series)
    rows.push([
      row.day,
      row.end_day,
      ...values(row.current),
      ...values(row.previous),
    ]);
  rows.push(
    [],
    [
      "Period totals (distinct visits)",
      "Revenue CAD",
      "Gross cash CAD",
      "Refunds CAD",
      "Net cash CAD",
      "Orders",
      "Average order CAD",
      "Tracked visits",
      "Cases",
    ],
  );
  const totalValues = (metrics: Metrics | null, previous = false) => {
    if (!metrics) return values(null);
    const visible: BucketMetrics = { ...metrics };
    if (!hasHistory(report, "revenue_cents", previous)) {
      visible.revenue_cents = null;
      visible.paid_orders = null;
    }
    if (!hasHistory(report, "net_cash_cents", previous)) {
      visible.gross_cents = null;
      visible.refunds_cents = null;
    }
    if (!hasHistory(report, "tracked_visits", previous))
      visible.tracked_visits = null;
    if (!hasHistory(report, "submissions", previous))
      visible.submissions = null;
    return values(visible);
  };
  rows.push(
    ["Current", ...totalValues(report.current)],
    ["Previous", ...totalValues(report.previous, true)],
  );
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
