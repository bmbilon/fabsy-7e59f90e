import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  ChartNoAxesCombined,
  FileText,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  changeLabel,
  count,
  money,
  shortDay,
  type DashboardDays,
  type DashboardOverview,
  type Metric,
} from "@/lib/admin/dashboard";

const metrics = [
  {
    key: "revenue_cents",
    label: "Service revenue",
    note: "CAD · before tax & refunds",
    icon: Banknote,
  },
  {
    key: "tracked_visits",
    label: "Tracked visits",
    note: "Consented landing sessions",
    icon: ChartNoAxesCombined,
  },
  {
    key: "submissions",
    label: "Submitted cases",
    note: "Saved intakes · any payment status",
    icon: FileText,
  },
  {
    key: "paid_orders",
    label: "Paid ticket orders",
    note: "Verified ticket purchases",
    icon: ShoppingBag,
  },
] as const;
const funnelStages = [
  {
    event: "landing_view",
    label: "Visited",
  },
  {
    event: "intake_started",
    label: "Started intake",
  },
  {
    event: "ticket_uploaded",
    label: "Uploaded",
  },
  {
    event: "checkout_started",
    label: "Checkout",
  },
  {
    event: "purchase",
    label: "Purchased",
  },
];

export default function DashboardPerformance({
  data,
  days,
  setDays,
  loading,
  error,
  retry,
  showSubmissions,
}: {
  data?: DashboardOverview;
  days: DashboardDays;
  setDays: (value: DashboardDays) => void;
  loading: boolean;
  error: boolean;
  retry: () => void;
  showSubmissions: () => void;
}) {
  const [metric, setMetric] = useState<Metric>("revenue_cents");
  const [stage, setStage] = useState("landing_view");
  const [showDaily, setShowDaily] = useState(false);
  const selected = metrics.find((item) => item.key === metric)!;
  const stageDefinition = funnelStages.find((item) => item.event === stage)!;
  const maxStage = Math.max(
    1,
    ...(data?.funnel.map((item) => item.sessions) || []),
  );
  const selectedStageCount =
    data?.funnel.find((item) => item.event_name === stage)?.sessions || 0;
  const selectedValue = (value: number) =>
    metric === "revenue_cents" ? money(value) : count(value);
  return (
    <section
      id="performance"
      aria-labelledby="performance-title"
      className="scroll-mt-6 space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="performance-title"
            className="text-2xl font-semibold tracking-tight"
          >
            Performance
          </h2>
          <p className="mt-1 text-sm text-slate-500">{days} days · Edmonton</p>
        </div>
        <div
          className="inline-flex rounded-lg border border-slate-200 bg-white p-1"
          aria-label="Performance period"
        >
          {([7, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => setDays(value)}
              className={`min-h-10 rounded-md px-5 text-sm font-medium transition-colors focus-visible:outline-blue-600 ${days === value ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
            >
              {value === 7 ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p>
            {data
              ? "Performance refresh failed · showing last snapshot."
              : "Performance unavailable."}
          </p>
          <Button variant="outline" size="sm" onClick={retry}>
            Retry performance
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className="grid grid-cols-2 divide-x divide-slate-100 lg:grid-cols-4"
          aria-label="Chart metric"
        >
          {metrics.map((item) => {
            const Icon = item.icon;
            const current = data?.current[item.key];
            const previous = data?.previous[item.key];
            return (
              <button
                type="button"
                key={item.key}
                aria-pressed={metric === item.key}
                title={item.note}
                onClick={() => setMetric(item.key)}
                className={`relative min-w-0 border-b p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-blue-600 sm:p-6 ${metric === item.key ? "border-b-blue-600 bg-blue-50/40" : "border-b-slate-100"}`}
              >
                <span className="flex items-center gap-2 text-xs font-medium text-slate-600 sm:text-sm">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </span>
                <span className="mt-3 block text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                  {current === undefined
                    ? "—"
                    : item.key === "revenue_cents"
                      ? money(current)
                      : count(current)}
                </span>
                {item.key === "revenue_cents" && (
                  <span className="mt-2 block text-[11px] text-slate-500 sm:text-xs">
                    CAD · before tax/refunds
                  </span>
                )}
                <span
                  className={`mt-3 block text-[11px] font-medium sm:text-xs ${current !== undefined && previous !== undefined && current > previous ? "text-emerald-700" : "text-slate-500"}`}
                >
                  {current !== undefined && previous !== undefined
                    ? changeLabel(current, previous)
                    : loading
                      ? "Loading…"
                      : "Unavailable"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-6 sm:px-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{selected.label}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {data
                  ? `${shortDay(data.daily[0].day)} – ${shortDay(data.daily[data.daily.length - 1].day)}`
                  : "Daily trend"}
              </p>
            </div>
            {metric === "submissions" ? (
              <button
                type="button"
                disabled={!data}
                onClick={showSubmissions}
                className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-blue-700 hover:underline disabled:text-slate-400"
              >
                Submissions{" "}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <Link
                to={`/admin/acquisition?days=${days}`}
                className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
              >
                Detailed report{" "}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
          <div
            className="h-56 w-full min-w-0"
            aria-label={`${selected.label} daily chart`}
          >
            {data ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.daily}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="#e2e8f0"
                    strokeDasharray="3 4"
                  />
                  <XAxis
                    dataKey="day"
                    tickFormatter={shortDay}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    dy={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={55}
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickFormatter={(value) =>
                      metric === "revenue_cents"
                        ? `$${Number(value) / 100}`
                        : count(value)
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      selectedValue(value),
                      selected.label,
                    ]}
                    labelFormatter={(value) => shortDay(String(value))}
                    contentStyle={{
                      borderRadius: 10,
                      borderColor: "#e2e8f0",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="linear"
                    dataKey={metric}
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fill="#dbeafe"
                    fillOpacity={0.65}
                    isAnimationActive={false}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div
                role="status"
                className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500"
              >
                {loading ? "Loading…" : "Daily trend unavailable"}
              </div>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {metric === "revenue_cents" && data
                ? `Gross ${money(data.current.gross_cents)} · Refunds ${money(data.current.refunds_cents)} (incl. tax)`
                : null}
            </span>
            <button
              type="button"
              aria-expanded={showDaily}
              aria-controls="daily-values"
              onClick={() => setShowDaily(!showDaily)}
              className="min-h-9 font-medium text-blue-700 hover:underline"
            >
              {showDaily ? "Hide daily values" : "Show daily values"}
            </button>
          </div>
          {showDaily && data && (
            <div
              id="daily-values"
              className="mt-3 max-h-64 overflow-auto rounded-lg border"
            >
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Daily {selected.label.toLowerCase()} for this period
                </caption>
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2 text-right">{selected.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((day) => (
                    <tr key={day.day} className="border-t">
                      <td className="px-4 py-2">{shortDay(day.day)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {selectedValue(day[metric])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3
                className="font-semibold"
                title="Consented sessions · tagged test traffic excluded"
              >
                Funnel
              </h3>
            </div>
            <Link
              to={`/admin/acquisition?days=${days}`}
              className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
            >
              Full funnel <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div
            className="mt-5 grid grid-cols-3 gap-2 min-[360px]:grid-cols-5 min-[360px]:gap-1 sm:gap-3"
            aria-label="Measured funnel stages"
          >
            {funnelStages.map((item, index) => {
              const value =
                data?.funnel.find((row) => row.event_name === item.event)
                  ?.sessions || 0;
              return (
                <button
                  type="button"
                  key={item.event}
                  aria-label={`${item.label}: ${data ? count(value) : "unavailable"} sessions`}
                  aria-pressed={stage === item.event}
                  onClick={() => setStage(item.event)}
                  className={`min-w-0 rounded-lg p-1.5 text-left focus-visible:outline-blue-600 sm:p-3 ${stage === item.event ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"}`}
                >
                  <span className="flex items-center justify-between gap-1 text-[10px] text-slate-500 sm:text-xs">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {index < 4 && (
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className="mt-3 block text-lg font-semibold tabular-nums sm:text-2xl"
                    aria-hidden="true"
                  >
                    <span className="sm:hidden">
                      {data
                        ? new Intl.NumberFormat("en-CA", {
                            notation: "compact",
                            maximumFractionDigits: 0,
                          }).format(value)
                        : "—"}
                    </span>
                    <span className="hidden sm:inline">
                      {data ? count(value) : "—"}
                    </span>
                  </span>
                  <span className="mt-1 block min-h-8 text-[10px] font-medium text-slate-600 sm:text-xs">
                    {item.label}
                  </span>
                  <svg
                    viewBox="0 0 100 6"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="mt-3 h-1.5 w-full"
                  >
                    <rect
                      width="100"
                      height="6"
                      rx="3"
                      className="fill-slate-100"
                    />
                    <rect
                      width={(value / maxStage) * 100}
                      height="6"
                      rx="3"
                      className="fill-blue-600"
                    />
                  </svg>
                </button>
              );
            })}
          </div>
          <div
            aria-live="polite"
            className="mt-5 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600"
          >
            <span className="font-semibold text-slate-800">
              {stageDefinition.label}
              {data ? ` · ${count(selectedStageCount)} sessions` : ""}
            </span>
          </div>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="font-semibold" title="Consented landing sessions">
            Traffic sources
          </h3>
          <div className="mt-5 space-y-4">
            {data?.sources.length ? (
              data.sources.slice(0, 5).map((source) => (
                <div key={source.source}>
                  <div className="mb-2 flex justify-between gap-3 text-sm">
                    <span className="truncate capitalize text-slate-600">
                      {source.source}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {count(source.sessions)}
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 100 6"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="h-1.5 w-full"
                  >
                    <rect
                      width="100"
                      height="6"
                      rx="3"
                      className="fill-slate-100"
                    />
                    <rect
                      width={
                        (source.sessions /
                          Math.max(
                            1,
                            ...data.sources.map((item) => item.sessions),
                          )) *
                        100
                      }
                      height="6"
                      rx="3"
                      className="fill-slate-400"
                    />
                  </svg>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-slate-500">
                {data ? "No tracked visits" : "Traffic sources unavailable"}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
