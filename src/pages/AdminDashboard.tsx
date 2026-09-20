import CaseQueueSection from "@/components/admin/CaseQueueSection";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCheck,
  FileChartColumnIncreasing,
  FolderOpen,
  HandCoins,
  LogOut,
  MailCheck,
  MessageSquare,
  Newspaper,
  RefreshCw,
  SearchCheck,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import useSafeHead from "@/hooks/useSafeHead";
import { useDashboardAuth, useDashboardData } from "@/hooks/useAdminDashboard";
import DashboardQueue from "@/components/admin/DashboardQueue";
import DashboardLive from "@/components/admin/DashboardLive";
import DashboardPerformance from "@/components/admin/DashboardPerformance";
import {
  count,
  localClock,
  type DashboardDays,
  type QueueFilter,
  type QueueRange,
} from "@/lib/admin/dashboard";

const tools: Array<{ title: string; path: string; icon: LucideIcon }> = [
  { title: "SMS inquiries", path: "/admin/sms", icon: MessageSquare },
  {
    title: "Consent invitations",
    path: "/admin/consent-links",
    icon: MailCheck,
  },
  { title: "Case management", path: "/admin/cases", icon: FolderOpen },
  {
    title: "Insurance reports",
    path: "/admin/idr",
    icon: FileChartColumnIncreasing,
  },
  { title: "Referrals", path: "/admin/referrals", icon: HandCoins },
  { title: "Blog & content", path: "/admin/blog", icon: Newspaper },
  { title: "User access", path: "/admin/users", icon: Shield },
  { title: "AEO analytics", path: "/admin/aeo", icon: SearchCheck },
  { title: "Acquisition report", path: "/admin/acquisition", icon: BarChart3 },
];

export default function AdminDashboard() {
  useSafeHead({
    title: "Fabsy Admin",
    description: "Fabsy submissions, live activity and business performance.",
    robots: "noindex, nofollow",
  });
  const navigate = useNavigate();
  const auth = useDashboardAuth();
  const [days, setDays] = useState<DashboardDays>(7);
  const [filter, setFilter] = useState<QueueFilter>("attention");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [range, setRange] = useState<QueueRange>(null);
  const [logoutError, setLogoutError] = useState(false);
  const { overview, queue, live } = useDashboardData(
    auth.session?.user.id,
    auth.role.data,
    days,
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
    void overview.refetch();
    void queue.refetch();
    if (auth.role.data === "admin") void live.refetch();
  };
  const refreshing = overview.isFetching || queue.isFetching || live.isFetching;
  const todayFilter: QueueRange = overview.data
    ? {
        since: overview.data.today_since,
        until: overview.data.until,
        label: "Today · Edmonton",
        followToday: true,
      }
    : null;
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
    <div className="min-h-screen bg-[#f6f7f9] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Link
              to="/admin/dashboard"
              aria-label="Fabsy admin overview"
              className="text-2xl font-extrabold tracking-tight"
            >
              fabsy<span className="text-blue-600">.</span>
            </Link>
            <span className="h-6 w-px bg-slate-200" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-500">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">
              {overview.data
                ? `${localClock(overview.data.generated_at)} · Edmonton`
                : "Edmonton"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={refreshing}
              className="bg-white"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Refresh
            </Button>
            <span className="hidden text-xs capitalize text-slate-500 sm:inline">
              {auth.role.data.replace("_", " ")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const { error } = await supabase.auth.signOut();
                if (error) setLogoutError(true);
                else navigate("/admin");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <h1 className="sr-only">Fabsy admin</h1>
      <main className="mx-auto max-w-[1440px] space-y-8 px-4 py-7 sm:px-8 sm:py-9">
        {logoutError && (
          <p role="alert" className="text-sm text-red-700">
            Sign-out failed. Please try again.
          </p>
        )}
        <section
          aria-label="Today's activity and open work"
          className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-4"
        >
          {[
            {
              label: "Tickets uploaded today",
              value: overview.isError
                ? undefined
                : overview.data?.today.uploads,
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
                className="group min-w-0 border-b border-r border-slate-100 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-blue-600 disabled:cursor-wait sm:p-6 lg:border-b-0"
              >
                <span className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 sm:text-sm">
                  {item.label}
                  <Icon
                    className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">
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
              if (filter === "uploads" || filter === "paid") setFilter("attention");
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
        <CaseQueueSection userId={auth.session?.user.id} role={auth.role.data} trials />
        <DashboardPerformance
          data={overview.data}
          days={days}
          setDays={setDays}
          loading={overview.isPending}
          error={overview.isError}
          retry={() => void overview.refetch()}
          showSubmissions={() =>
            overview.data &&
            showQueue("submitted", {
              since: overview.data.since,
              until: overview.data.until,
              label: `Last ${days} days`,
            })
          }
        />
        <section
          aria-labelledby="tools-title"
          className="border-t border-slate-200 pt-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2
              id="tools-title"
              className="text-sm font-semibold text-slate-600"
            >
              More tools
            </h2>
            <Link
              to="/"
              className="inline-flex min-h-9 items-center gap-1 text-xs text-slate-500 hover:text-blue-700"
            >
              View website{" "}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {tools.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="group flex min-h-12 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700 focus-visible:outline-blue-600"
                >
                  <Icon
                    className="h-4 w-4 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                  <span className="flex-1">{item.title}</span>
                  <ArrowRight
                    className="h-3 w-3 text-slate-300 group-hover:text-blue-700"
                    aria-hidden="true"
                  />
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
