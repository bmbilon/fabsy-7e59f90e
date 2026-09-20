import { useId, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChartNoAxesCombined,
  FileText,
  ShoppingBag,
  Wallet,
  Receipt,
  Info,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PerformanceControls from "./PerformanceControls";
import { count, money } from "@/lib/admin/dashboard";
import {
  comparableHistory,
  hasHistory,
  metricValue,
  performanceCsv,
  productLabels,
  rangeLabel,
  recordedSince,
  reportDate,
  type Granularity,
  type PerformanceReport,
  type PerformanceSelection,
  type ReportMetric,
} from "@/lib/admin/performance";

const metrics = [
  {
    key: "revenue_cents",
    label: "Service revenue",
    icon: Banknote,
    note: "Verified ticket revenue before tax and refunds.",
  },
  {
    key: "net_cash_cents",
    label: "Net cash",
    icon: Wallet,
    note: "Gross ticket payments less successful refunds observed in this period. Includes tax; not profit.",
  },
  {
    key: "paid_orders",
    label: "Paid orders",
    icon: ShoppingBag,
    note: "Verified CAD ticket purchases. Not unique customers.",
  },
  {
    key: "average_order_cents",
    label: "Average order",
    icon: Receipt,
    note: "Service revenue divided by verified paid orders, before tax and refunds.",
  },
  {
    key: "tracked_visits",
    label: "Tracked visits",
    icon: ChartNoAxesCombined,
    note: "Distinct consented landing sessions. Test traffic excluded. Bucket counts can overlap across dates.",
  },
  {
    key: "submissions",
    label: "Submitted cases",
    icon: FileText,
    note: "Nondeleted saved cases created in the selected period, at any payment status.",
  },
] as const;
const stages = [
  ["landing_view", "Visited"],
  ["intake_started", "Started intake"],
  ["ticket_uploaded", "Uploaded"],
  ["checkout_started", "Checkout"],
  ["purchase", "Purchased"],
];
const isMoney = (metric: ReportMetric) => metric.endsWith("_cents");
const valueLabel = (value: number | null | undefined, metric: ReportMetric) =>
  value == null ? "—" : isMoney(metric) ? money(value) : count(value);
const card = "min-w-0 rounded-xl border border-slate-200/80 bg-white shadow-sm";

export default function DashboardPerformance({
  data,
  selection,
  onChange,
  loading,
  fetching,
  error,
  retry,
  showSubmissions,
}: {
  data?: PerformanceReport;
  selection: PerformanceSelection;
  onChange: (selection: PerformanceSelection) => void;
  loading: boolean;
  fetching: boolean;
  error: boolean;
  retry: () => void;
  showSubmissions: () => void;
}) {
  const [metric, setMetric] = useState<ReportMetric>("revenue_cents");
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [showData, setShowData] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const gradientId = useId().replaceAll(":", "");
  const selected = metrics.find((item) => item.key === metric)!;
  const chartData = useMemo(
    () =>
      data?.series.map((row) => ({
        day: row.day,
        end: row.end_day,
        current: metricValue(row.current, metric),
        previous: metricValue(row.previous, metric),
      })) || [],
    [data, metric],
  );
  const comparisonLabel =
    data?.comparison === "year" ? "Previous year" : "Previous period";
  const hasComparison =
    !!data && data.comparison !== "none" && hasHistory(data, metric, true);
  const exportCsv = () => {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([performanceCsv(data)], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `fabsy-performance-${data.start_day}-${data.end_day}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const first = data && recordedSince(data, metric);
  const partialHistory =
    !!data &&
    first &&
    reportDate(first) !== reportDate(data.since) &&
    Date.parse(first) > Date.parse(data.since);
  const maxStage = Math.max(
    1,
    ...(data?.funnel.map((row) => row.sessions) || []),
  );
  return (
    <section
      id="performance"
      aria-labelledby="performance-title"
      className="min-w-0 scroll-mt-24 space-y-4"
      aria-busy={fetching}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="performance-title"
            className="text-lg font-semibold tracking-tight"
          >
            Performance
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {data
              ? rangeLabel(data)
              : error
                ? "Report unavailable"
                : "Loading report…"}{" "}
            · Edmonton
          </p>
        </div>
        <PerformanceControls
          selection={selection}
          onChange={onChange}
          report={data}
          onExport={exportCsv}
        />
      </div>
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <span>
            {data
              ? "Refresh failed · showing the last report."
              : "Performance unavailable."}
          </span>
          <Button size="sm" variant="outline" onClick={retry}>
            Retry performance
          </Button>
        </div>
      )}
      <div className={`${card} overflow-hidden`}>
        <div
          className="grid grid-cols-2 border-b border-slate-200 md:grid-cols-3 min-[1600px]:grid-cols-6"
          aria-label="Chart metric"
        >
          {metrics.map((item) => {
            const current =
              data && hasHistory(data, item.key)
                ? metricValue(data.current, item.key)
                : null;
            const previous =
              data && hasHistory(data, item.key, true)
                ? metricValue(data.previous, item.key)
                : null;
            const delta =
              data &&
              comparableHistory(data, item.key) &&
              current !== null &&
              previous !== null &&
              previous !== 0
                ? ((current - previous) / Math.abs(previous)) * 100
                : null;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                title={item.note}
                aria-pressed={metric === item.key}
                onClick={() => setMetric(item.key)}
                className={`relative min-w-0 border-b-2 border-r border-slate-100 px-4 py-4 text-left transition-colors focus-visible:z-10 focus-visible:outline-blue-600 sm:px-5 ${metric === item.key ? "border-b-blue-600 bg-blue-50/50" : "border-b-transparent hover:bg-slate-50"}`}
              >
                <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </span>
                <span
                  className="mt-2 block truncate text-2xl font-semibold tracking-tight tabular-nums"
                  title={valueLabel(current, item.key)}
                >
                  {valueLabel(current, item.key)}
                </span>
                <span
                  className={`mt-2 flex min-h-4 items-center gap-1 text-[11px] ${delta !== null && delta > 0 ? "text-emerald-700" : delta !== null && delta < 0 ? "text-rose-700" : "text-slate-500"}`}
                >
                  {delta !== null ? (
                    <>
                      {delta >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(delta).toFixed(1)}%{" "}
                      <span className="text-slate-400">vs prior</span>
                    </>
                  ) : loading ? (
                    "Loading…"
                  ) : !data ? (
                    "Unavailable"
                  ) : data.comparison === "none" ? (
                    item.key === "revenue_cents" ? (
                      "CAD · before tax/refunds"
                    ) : (
                      "All recorded history"
                    )
                  ) : data &&
                    hasHistory(data, item.key, true) &&
                    !comparableHistory(data, item.key) ? (
                    "Partial baseline"
                  ) : previous === 0 ? (
                    "No prior activity"
                  ) : (
                    "No recorded baseline"
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="space-y-4 px-4 py-5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{selected.label}</h3>
              <span
                title={selected.note}
                tabIndex={0}
                aria-label={selected.note}
              >
                <Info className="h-3.5 w-3.5 text-slate-400" />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {metric === "submissions" && (
                <button
                  type="button"
                  onClick={showSubmissions}
                  disabled={!data}
                  className="mr-2 text-xs font-medium text-blue-700 hover:underline"
                >
                  View cases ↗
                </button>
              )}
              <select
                aria-label="Chart interval"
                value={selection.granularity}
                onChange={(event) =>
                  onChange({
                    ...selection,
                    granularity: event.target.value as Granularity,
                  })
                }
                className="h-8 rounded-md border bg-white px-2 text-xs text-slate-600"
              >
                <option value="auto">
                  Auto · {data?.granularity || "interval"}
                </option>
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>
              <div
                className="flex rounded-md border bg-slate-50 p-0.5"
                aria-label="Chart style"
              >
                {(["line", "bar"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setChartType(value)}
                    aria-pressed={chartType === value}
                    className={`rounded px-2 py-1 text-xs capitalize ${chartType === value ? "bg-white font-medium shadow-sm" : "text-slate-500"}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              {data ? rangeLabel(data) : "Selected period"}
            </span>
            {hasComparison && data?.previous_since && data.previous_until && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-slate-400" />
                {comparisonLabel}: {reportDate(data.previous_since)} –{" "}
                {reportDate(
                  new Date(Date.parse(data.previous_until) - 1).toISOString(),
                )}
              </span>
            )}
            {hasComparison && data && !comparableHistory(data, metric) && (
              <span className="text-amber-700">Partial comparison history</span>
            )}
            {fetching && !loading && <span role="status">Updating…</span>}
          </div>
          <div
            className="h-64 min-w-0 sm:h-72"
            aria-label={`${selected.label} ${data?.granularity || ""} chart`}
          >
            {data && hasHistory(data, metric) ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
                  accessibilityLayer
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop
                        offset="100%"
                        stopColor="#3b82f6"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="#e8edf3"
                    strokeDasharray="3 4"
                  />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(date) =>
                      reportDate(String(date), data.days > 365)
                    }
                    tickLine={false}
                    axisLine={false}
                    minTickGap={48}
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    dy={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickFormatter={(value) =>
                      isMoney(metric)
                        ? new Intl.NumberFormat("en-CA", {
                            style: "currency",
                            currency: "CAD",
                            notation: "compact",
                            maximumFractionDigits: 1,
                          }).format(Number(value) / 100)
                        : new Intl.NumberFormat("en-CA", {
                            notation: "compact",
                          }).format(Number(value))
                    }
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      valueLabel(value, metric),
                      name === "previous" ? comparisonLabel : selected.label,
                    ]}
                    labelFormatter={(day, payload) => {
                      const end = payload?.[0]?.payload?.end;
                      return `${reportDate(String(day))}${end && end !== day ? ` – ${reportDate(end)}` : ""}`;
                    }}
                    contentStyle={{
                      borderRadius: 8,
                      borderColor: "#e2e8f0",
                      fontSize: 12,
                    }}
                  />
                  {hasComparison && (
                    <Line
                      dataKey="previous"
                      type="linear"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  )}
                  {chartType === "line" ? (
                    <Area
                      dataKey="current"
                      type="linear"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fill={`url(#${gradientId})`}
                      isAnimationActive={false}
                      connectNulls={false}
                      dot={chartData.length === 1 ? { r: 4 } : false}
                      activeDot={{ r: 4 }}
                    />
                  ) : (
                    <Bar
                      dataKey="current"
                      fill="#3b82f6"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={40}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div
                role="status"
                className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500"
              >
                {loading
                  ? "Loading performance…"
                  : data
                    ? "No recorded data for this period"
                    : "Chart unavailable"}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>
              {partialHistory
                ? `First recorded ${metric === "tracked_visits" ? "traffic" : metric === "submissions" ? "case" : "payment"}: ${reportDate(first!)} · earlier values unavailable`
                : isMoney(metric)
                  ? selected.note
                  : metric === "tracked_visits"
                    ? "Consented sessions · distinct within each interval"
                    : ""}
            </span>
            <button
              type="button"
              onClick={() => setShowData(!showData)}
              aria-expanded={showData}
              aria-controls="performance-data"
              className="inline-flex min-h-8 items-center gap-1.5 font-medium text-blue-700"
            >
              <Table2 className="h-3.5 w-3.5" />
              {showData ? "Hide data" : "View data"}
            </button>
          </div>
          {showData && data && (
            <div
              id="performance-data"
              className="max-h-72 overflow-auto rounded-lg border"
            >
              <table className="w-full text-left text-xs">
                <caption className="sr-only">
                  {selected.label} for {rangeLabel(data)}
                </caption>
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3 text-right">{selected.label}</th>
                    {data.comparison !== "none" && (
                      <th className="px-4 py-3 text-right">
                        {comparisonLabel}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row) => (
                    <tr key={row.day} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {reportDate(row.day)}
                        {row.end !== row.day ? ` – ${reportDate(row.end)}` : ""}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {valueLabel(row.current, metric)}
                      </td>
                      {data.comparison !== "none" && (
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {valueLabel(row.previous, metric)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className={`${card} p-5`} aria-labelledby="cash-title">
          <h3 id="cash-title" className="text-sm font-semibold">
            Cash summary{" "}
            <span className="font-normal text-slate-400">· CAD</span>
          </h3>
          <dl className="mt-4 space-y-3 text-xs">
            {(
              [
                ["Service revenue", data?.current.revenue_cents],
                [
                  "Tax collected",
                  data
                    ? data.current.gross_cents - data.current.revenue_cents
                    : undefined,
                ],
                ["Gross payments", data?.current.gross_cents],
                [
                  "Refunds issued",
                  data
                    ? data.current.refunds_cents
                      ? -data.current.refunds_cents
                      : 0
                    : undefined,
                ],
              ] as const
            ).map(([label, amount]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium tabular-nums">
                  {data && hasHistory(data, "revenue_cents")
                    ? money(Number(amount))
                    : "—"}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <dt className="font-semibold">
                Net cash{" "}
                <span className="font-normal text-slate-400">incl. tax</span>
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {data && hasHistory(data, "net_cash_cents")
                  ? valueLabel(
                      metricValue(data.current, "net_cash_cents"),
                      "net_cash_cents",
                    )
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
        <section className={`${card} p-5`} aria-labelledby="services-title">
          <h3 id="services-title" className="text-sm font-semibold">
            Revenue by service
          </h3>
          <div className="mt-4 space-y-4">
            {data?.services.length ? (
              data.services.map((service) => (
                <div key={service.product}>
                  <div className="mb-2 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-700">
                        {productLabels[service.product] || service.product}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {count(service.paid_orders)} orders ·{" "}
                        {money(service.revenue_cents / service.paid_orders)}{" "}
                        average
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">
                      {money(service.revenue_cents)}
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 100 6"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="h-1.5 w-full"
                  >
                    <rect width="100" height="6" rx="3" fill="#f1f5f9" />
                    <rect
                      width={
                        data.current.revenue_cents
                          ? (service.revenue_cents /
                              data.current.revenue_cents) *
                            100
                          : 0
                      }
                      height="6"
                      rx="3"
                      fill="#3b82f6"
                    />
                  </svg>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-xs text-slate-500">
                {data
                  ? "No recorded purchases in this period"
                  : "Revenue breakdown unavailable"}
              </p>
            )}
          </div>
        </section>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className={`${card} p-5`} aria-labelledby="funnel-title">
          <div className="flex items-center justify-between gap-2">
            <h3 id="funnel-title" className="text-sm font-semibold">
              Acquisition funnel
            </h3>
            <span
              className="text-[11px] text-slate-400"
              title="Independent distinct consented sessions at each stage during this period; not an ordered conversion cohort."
            >
              Measured sessions
            </span>
          </div>
          <div className="mt-5 grid grid-cols-5 gap-2">
            {stages.map(([event, label], index) => {
              const value =
                data?.funnel.find((row) => row.event_name === event)
                  ?.sessions || 0;
              return (
                <div key={event} className="min-w-0">
                  <div className="text-[10px] text-slate-400">0{index + 1}</div>
                  <div
                    className="mt-2 text-xl font-semibold tabular-nums"
                    title={count(value)}
                  >
                    {data && hasHistory(data, "tracked_visits")
                      ? new Intl.NumberFormat("en-CA", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(value)
                      : "—"}
                  </div>
                  <div className="mt-1 min-h-8 text-[10px] leading-tight text-slate-500 sm:text-xs">
                    {label}
                  </div>
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="mt-2 h-12 w-full rounded bg-slate-50"
                  >
                    <rect
                      width="100"
                      y={100 - (value / maxStage) * 100}
                      height={(value / maxStage) * 100}
                      fill="#60a5fa"
                      rx="3"
                    />
                  </svg>
                </div>
              );
            })}
          </div>
        </section>
        <section className={`${card} p-5`} aria-labelledby="sources-title">
          <div className="flex items-center justify-between">
            <h3 id="sources-title" className="text-sm font-semibold">
              Traffic sources
            </h3>
            <span className="text-[11px] text-slate-400">First landing</span>
          </div>
          <div className="mt-4 space-y-3">
            {data?.sources.length ? (
              data.sources
                .slice(0, showSources ? undefined : 5)
                .map((source) => (
                  <div key={source.source}>
                    <div className="mb-1.5 flex justify-between gap-3 text-xs">
                      <span
                        className="truncate font-medium capitalize text-slate-600"
                        title={source.source}
                      >
                        {source.source}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {count(source.sessions)}{" "}
                        <span className="ml-2 text-slate-400">
                          {data.current.tracked_visits
                            ? (
                                (source.sessions /
                                  data.current.tracked_visits) *
                                100
                              ).toFixed(0)
                            : 0}
                          %
                        </span>
                      </span>
                    </div>
                    <svg
                      viewBox="0 0 100 4"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                      className="h-1 w-full"
                    >
                      <rect width="100" height="4" rx="2" fill="#f1f5f9" />
                      <rect
                        width={
                          data.current.tracked_visits
                            ? (source.sessions / data.current.tracked_visits) *
                              100
                            : 0
                        }
                        height="4"
                        rx="2"
                        fill="#818cf8"
                      />
                    </svg>
                  </div>
                ))
            ) : (
              <p className="py-5 text-center text-xs text-slate-500">
                {data
                  ? "No recorded visits in this period"
                  : "Traffic sources unavailable"}
              </p>
            )}
          </div>
          {data && data.sources.length > 5 && (
            <button
              type="button"
              onClick={() => setShowSources(!showSources)}
              className="mt-3 text-xs font-medium text-blue-700"
            >
              {showSources ? "Show top 5" : `Show all ${data.sources.length}`}
            </button>
          )}
        </section>
      </div>
      {data && (
        <details className="text-xs text-slate-500">
          <summary className="w-fit cursor-pointer py-2 font-medium">
            Data coverage & definitions
          </summary>
          <div className="mt-1 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <p>
              Cases:{" "}
              {data.coverage.submissions_since
                ? `first recorded ${reportDate(data.coverage.submissions_since)}`
                : "no recorded cases"}
              . Deleted cases excluded.
            </p>
            <p>
              Ticket payments:{" "}
              {data.coverage.revenue_since
                ? `first recorded ${reportDate(data.coverage.revenue_since)}`
                : "no recorded payments"}
              . Verified CAD ticket orders only. Older revenue is unavailable.
            </p>
            <p>
              Traffic:{" "}
              {data.coverage.visits_since
                ? `first retained ${reportDate(data.coverage.visits_since)}`
                : "no recorded visits"}
              . Consented sessions; {data.coverage.traffic_retention_days}-day
              retention. Sources use each session’s first landing in this
              period.
            </p>
          </div>
        </details>
      )}
    </section>
  );
}
