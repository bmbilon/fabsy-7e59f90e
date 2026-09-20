import CaseQueueSection from "@/components/admin/CaseQueueSection";
import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCheck,
  FolderOpen,
  HandCoins,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import useSafeHead from "@/hooks/useSafeHead";
import {
  useDashboardAuth,
  useDashboardData,
  usePerformanceReport,
} from "@/hooks/useAdminDashboard";
import DashboardQueue from "@/components/admin/DashboardQueue";
import DashboardLive from "@/components/admin/DashboardLive";
import DashboardPerformance from "@/components/admin/DashboardPerformance";
import {
  count,
  localClock,
  type QueueFilter,
  type QueueRange,
} from "@/lib/admin/dashboard";
import {
  rangeLabel,
  selectionFromParams,
  selectionParams,
  type PerformanceSelection,
} from "@/lib/admin/performance";

export default function AdminDashboard() {
  useSafeHead({
    title: "Fabsy Admin",
    description: "Fabsy submissions, live activity and business performance.",
    robots: "noindex, nofollow",
  });
  const navigate = useNavigate();
  const auth = useDashboardAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const selection = useMemo(() => selectionFromParams(params), [params]);
  const report = usePerformanceReport(
    auth.session?.user.id,
    auth.role.data,
    selection,
  );
  const setSelection = (next: PerformanceSelection) =>
    setParams(selectionParams(next, params), { replace: true });
  const [filter, setFilter] = useState<QueueFilter>("attention");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [range, setRange] = useState<QueueRange>(null);
  const { overview, queue, live } = useDashboardData(
    auth.session?.user.id,
    auth.role.data,
    filter,
    debouncedSearch,
    offset,
    range,
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (
      (auth.ready && !auth.session) ||
      (auth.role.isSuccess && !auth.role.data)
    )
      navigate("/admin", { replace: true });
  }, [auth.ready, auth.session, auth.role.isSuccess, auth.role.data, navigate]);
  const changeFilter = (value: QueueFilter) => {
    setFilter(value);
    setOffset(0);
    setRange(null);
  };
  const showQueue = (value: QueueFilter, nextRange: QueueRange = null) => {
    setFilter(value);
    setRange(nextRange);
    setOffset(0);
    setSearch("");
    setDebouncedSearch("");
    document.getElementById("submission-queue")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  };
  const refresh = () => {
    void report.refetch();
    void overview.refetch();
    void queue.refetch();
    if (auth.role.data === "admin") void live.refetch();
  };
  const refreshing =
    report.isFetching ||
    overview.isFetching ||
    queue.isFetching ||
    live.isFetching;
  const todayFilter: QueueRange = overview.data
    ? {
        since: overview.data.today_since,
        until: overview.data.until,
        label: "Today · Edmonton",
        followToday: true,
      }
    : null;
  useEffect(() => {
    if (!location.hash || !auth.role.data) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(location.hash.slice(1))
        ?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [location.hash, auth.role.data]);
  if (auth.role.isError)
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <h1 className="text-2xl font-semibold">Admin overview unavailable</h1>
        <p className="my-4 text-slate-500">
          Your staff access could not be verified.
        </p>
        <Button onClick={() => void auth.role.refetch()}>Try again</Button>
      </main>
    );
  if (!auth.ready || !auth.session || !auth.role.data)
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center text-sm text-slate-500"
      >
        Loading…
      </div>
    );
  return (
    <main className="mx-auto max-w-[1760px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-xs text-slate-500">
            {report.data
              ? `Updated ${localClock(report.data.generated_at)} · Edmonton`
              : "Edmonton"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
            className="h-9 bg-white text-xs"
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button asChild size="sm" className="h-9 bg-slate-900 text-xs">
            <Link to="/admin/cases">
              <FolderOpen className="mr-2 h-3.5 w-3.5" />
              Case board
            </Link>
          </Button>
        </div>
      </div>
      <section
        aria-label="Today's activity and open work"
        className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-4"
      >
        {[
          {
            label: "Tickets uploaded today",
            value: overview.isError ? undefined : overview.data?.today.uploads,
            icon: ArrowDownToLine,
            action: () => showQueue("uploads", todayFilter),
            enabled: !!todayFilter,
          },
          {
            label: "Clients paid today",
            value: overview.isError
              ? undefined
              : overview.data?.today.paid_clients,
            icon: HandCoins,
            action: () => showQueue("paid", todayFilter),
            enabled: !!todayFilter,
          },
          {
            label: "Partial intakes",
            value: queue.isError ? undefined : queue.data?.counts.partial,
            icon: FolderOpen,
            action: () => showQueue("partial"),
            enabled: true,
          },
          {
            label: "Active cases",
            value: queue.isError ? undefined : queue.data?.counts.active,
            icon: CheckCheck,
            action: () => showQueue("active"),
            enabled: true,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              disabled={!item.enabled}
              onClick={item.action}
              className="group min-w-0 border-b border-r border-slate-100 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-blue-600 disabled:cursor-wait sm:p-4 lg:border-b-0"
            >
              <span className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 sm:text-sm">
                {item.label}
                <Icon
                  className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block"
                  aria-hidden="true"
                />
              </span>
              <span className="mt-3 flex items-center justify-between gap-2">
                <span className="text-2xl font-semibold tracking-tight tabular-nums">
                  {count(item.value)}
                </span>
                <ArrowUpRight
                  className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-blue-700"
                  aria-hidden="true"
                />
              </span>
            </button>
          );
        })}
      </section>
      <DashboardPerformance
        data={report.data}
        selection={selection}
        onChange={setSelection}
        loading={report.isPending}
        fetching={report.isFetching}
        error={report.isError}
        retry={() => void report.refetch()}
        showSubmissions={() =>
          report.data &&
          showQueue("submitted", {
            since: report.data.since,
            until: report.data.until,
            label: rangeLabel(report.data),
          })
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
        <h2 className="text-lg font-semibold tracking-tight">Operations</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => showQueue("attention")}
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800"
          >
            {count(queue.isError ? undefined : queue.data?.counts.attention)}{" "}
            need attention
          </button>
          <a
            href="#trial-matters"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
          >
            Trial matters
          </a>
        </div>
      </div>
      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
        <DashboardQueue
          data={queue.data}
          loading={queue.isPending || search !== debouncedSearch}
          error={queue.isError}
          filter={filter}
          setFilter={changeFilter}
          search={search}
          setSearch={setSearch}
          offset={offset}
          setOffset={setOffset}
          range={range}
          clearRange={() => {
            setRange(null);
            setOffset(0);
            if (filter === "uploads" || filter === "paid")
              setFilter("attention");
          }}
          retry={() => void queue.refetch()}
        />
        <DashboardLive
          data={live.data}
          error={live.isError}
          isAdmin={auth.role.data === "admin"}
          retry={() => void live.refetch()}
        />
      </div>
      <CaseQueueSection
        userId={auth.session?.user.id}
        role={auth.role.data}
        trials
      />
    </main>
  );
}
