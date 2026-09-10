import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import useSafeHead from "@/hooks/useSafeHead";
import VisitorGlobe from "@/components/live-view/VisitorGlobe";
import {
  locationLabel,
  type LiveSnapshot,
  type VisitorStage,
} from "@/lib/live-view/core";

const number = new Intl.NumberFormat("en-CA");
const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Edmonton",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});
const stages: Record<VisitorStage, string> = {
  browsing: "Browsing",
  intake: "Starting a ticket",
  review: "Review & consent",
};

function SessionChart({ timeline }: { timeline: LiveSnapshot["timeline"] }) {
  const max = Math.max(1, ...timeline.map((point) => point.sessions));
  const total = timeline.reduce((sum, point) => sum + point.sessions, 0);
  return (
    <div>
      <div className="mb-5 flex items-center justify-between text-sm">
        <span className="text-slate-500">New sessions · last 30 minutes</span>
        <span className="font-semibold text-slate-900">
          {number.format(total)}
        </span>
      </div>
      <svg
        viewBox="0 0 420 100"
        className="h-24 w-full"
        role="img"
        aria-label={`${total} sessions started in the last 30 minutes`}
      >
        <path
          d="M0 95 H420 M0 48 H420"
          stroke="#e2e8f0"
          strokeDasharray="3 4"
        />
        {timeline.map((point, index) => (
          <rect
            key={point.minute}
            x={index * 14 + 2}
            y={95 - (point.sessions / max) * 85}
            width="8"
            height={Math.max(1, (point.sessions / max) * 85)}
            rx="3"
            fill={point.sessions ? "#45a996" : "#dbe5e1"}
          >
            <title>
              {clock.format(new Date(point.minute))}: {point.sessions} sessions
            </title>
          </rect>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>30 min ago</span>
        <span>Now</span>
      </div>
    </div>
  );
}

export default function AdminLiveView() {
  useSafeHead({
    title: "Live View | Fabsy Admin",
    description: "Live website activity for Fabsy administrators.",
    robots: "noindex, nofollow",
  });
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setAuthReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
      data.subscription.unsubscribe();
    };
  }, []);
  const query = useQuery({
    queryKey: ["admin-live-view", session?.user.id],
    enabled: !!session,
    queryFn: async ({ signal }): Promise<LiveSnapshot> => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Please sign in again.");
      const response = await fetch("/api/live-view", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        signal,
      });
      if (!response.ok)
        throw new Error(
          [401, 403].includes(response.status)
            ? "Administrator access is required. Sign in with an admin account."
            : "Could not reach Live View. Check the connection and try again.",
        );
      return response.json();
    },
    refetchInterval: paused ? false : 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: !paused,
    retry: false,
    gcTime: 0,
  });
  const data = query.data;
  const stale =
    !!data &&
    !paused &&
    (query.isError || now - Date.parse(data.generated_at) > 45_000);
  const live = !!data && !stale && !paused;
  const visitors =
    data?.visitors.filter((visitor) =>
      `${visitor.page} ${locationLabel(visitor)} ${visitor.source} ${visitor.device}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) || [];
  const status = paused
    ? "Paused"
    : query.isError || stale
      ? "Connection interrupted"
      : data
        ? "Live"
        : "Connecting";
  const metrics = [
    {
      label: "Visitors right now",
      value: data?.active,
      hint: "Seen in the last 90 seconds",
      icon: Users,
    },
    {
      label: "Sessions today",
      value: data?.sessions_today,
      hint: "Browser sessions started today",
      icon: Activity,
    },
    {
      label: "Submissions today",
      value: data?.submissions_today,
      hint: "Saved ticket submissions",
      icon: FileText,
    },
    {
      label: "Paid cases today",
      value: data?.paid_cases_today,
      hint: "Cases with a confirmed payment",
      icon: CheckCircle2,
    },
  ];
  if (!authReady)
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
      >
        Loading Live View…
      </div>
    );
  if (!session)
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <h1 className="text-2xl font-semibold">Live View</h1>
        <p className="my-4 text-muted-foreground">
          Sign in with your administrator account to see website activity.
        </p>
        <Button asChild>
          <Link to="/admin">Sign in</Link>
        </Button>
      </main>
    );

  return (
    <div className="min-h-screen bg-[#f6f7f6] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-7">
          <div className="flex items-center gap-4">
            <Button
              asChild
              variant="outline"
              size="icon"
              className="rounded-full"
            >
              <Link to="/admin/dashboard" aria-label="Back to admin dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                Fabsy / site activity
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                Live View
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              role="status"
              className={`mr-1 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${live ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500 motion-safe:animate-pulse" : "bg-slate-400"}`}
              />
              {status}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? (
                <Play className="mr-2 h-3.5 w-3.5" />
              ) : (
                <Pause className="mr-2 h-3.5 w-3.5" />
              )}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label="Refresh Live View"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw
                className={`h-4 w-4 ${query.isFetching ? "motion-safe:animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-7 sm:py-8">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <p>A little window into what’s happening on Fabsy.</p>
          <p>
            Today · Edmonton time
            {data
              ? ` · Updated ${clock.format(new Date(data.generated_at))}`
              : ""}
          </p>
        </div>
        {query.isError || stale ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            {query.error?.message || "Live updates have stopped."}{" "}
            {data
              ? "Showing the last successful snapshot; these counts may be out of date."
              : "Visitor counts will appear when the service connects."}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(({ label, value, hint, icon: Icon }) => (
            <Card
              key={label}
              className="rounded-xl border-slate-200/80 shadow-sm"
            >
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-slate-600 sm:text-sm">
                    {label}
                  </p>
                  <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                </div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                  {value === undefined ? "—" : number.format(value)}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {hint}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
          <VisitorGlobe locations={data?.locations || []} live={live} />
          <div className="space-y-5">
            <Card className="rounded-xl border-slate-200/80 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">
                  Visitor activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data ? (
                  <SessionChart timeline={data.timeline} />
                ) : (
                  <p className="py-9 text-center text-sm text-slate-500">
                    {query.isError
                      ? "Activity is unavailable."
                      : "Waiting for site activity…"}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-xl border-slate-200/80 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">
                  On the site right now
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  {(
                    Object.entries(stages) as Array<[VisitorStage, string]>
                  ).map(([stage, label]) => (
                    <div key={stage} className="px-2 first:pl-0">
                      <p className="min-h-8 text-[11px] leading-tight text-slate-500">
                        {label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums">
                        {data ? data.stages[stage] : "—"}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-[11px] leading-relaxed text-slate-500">
                  Stages reflect the page or intake step open on Fabsy. Paid
                  cases above come from confirmed payment records.
                </p>
              </CardContent>
            </Card>
            {data?.active === 0 ? (
              <p className="px-1 text-sm leading-relaxed text-slate-500">
                It’s quiet right now. New visitors will appear here
                automatically.
              </p>
            ) : null}
          </div>
        </div>
        <Card className="overflow-hidden rounded-xl border-slate-200/80 shadow-sm">
          <CardHeader className="flex flex-col justify-between gap-4 pb-5 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="text-base font-semibold">
                Visitors on your site
              </CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                Anonymous browser sessions
                {data?.visitors_truncated
                  ? " · Showing the 200 most recently active"
                  : ""}
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                aria-label="Filter visitors by page, location, source or device"
                placeholder="Filter visitors…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="bg-slate-50 pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-slate-100 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    {[
                      "Visitor / location",
                      "Current page",
                      "Source",
                      "Stage",
                    ].map((label) => (
                      <th key={label} className="px-5 py-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visitors.map((visitor) => {
                    const Device =
                      visitor.device === "mobile"
                        ? Smartphone
                        : visitor.device === "tablet"
                          ? Tablet
                          : Monitor;
                    return (
                      <tr
                        key={visitor.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <Device
                              className="h-4 w-4 shrink-0 text-slate-400"
                              aria-label={visitor.device}
                            />
                            <div>
                              <p className="whitespace-nowrap text-xs font-medium">
                                Visitor {visitor.id.slice(0, 8)}
                              </p>
                              <p className="mt-1 min-w-32 text-xs text-slate-500">
                                {locationLabel(visitor)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[260px] break-words px-5 py-4 text-xs text-slate-600">
                          {visitor.page}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-600">
                          {visitor.source}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] ${visitor.stage === "browsing" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-800"}`}
                          >
                            {stages[visitor.stage]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-100 md:hidden">
              {visitors.map((visitor) => (
                <div key={visitor.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">
                      Visitor {visitor.id.slice(0, 8)}
                    </p>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                      {stages[visitor.stage]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {locationLabel(visitor)}
                  </p>
                  <p className="break-all text-xs text-slate-600">
                    {visitor.page}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {visitor.source} · {visitor.device}
                  </p>
                </div>
              ))}
            </div>
            {!visitors.length ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                {!data
                  ? "No snapshot available yet."
                  : filter
                    ? "No visitors match this filter."
                    : "No active visitors in the last 90 seconds."}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <div className="grid gap-5 md:grid-cols-2">
          {[
            {
              title: "Pages being viewed",
              rows: data?.pages.map((row) => ({
                label: row.page,
                count: row.count,
              })),
            },
            {
              title: "Where visitors came from",
              rows: data?.sources.map((row) => ({
                label: row.source,
                count: row.count,
              })),
            },
          ].map((group) => (
            <Card
              key={group.title}
              className="rounded-xl border-slate-200/80 shadow-sm"
            >
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">
                  {group.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {group.rows?.map((row) => (
                    <div key={row.label} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-4 text-xs">
                        <span className="break-all text-slate-600">
                          {row.label}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {row.count}
                        </span>
                      </div>
                      <svg
                        viewBox="0 0 100 1"
                        preserveAspectRatio="none"
                        className="h-1 w-full overflow-hidden rounded-full bg-slate-100"
                        aria-hidden="true"
                      >
                        <rect
                          width={
                            (row.count / Math.max(1, data?.active || 0)) * 100
                          }
                          height="1"
                          fill="#34d399"
                        />
                      </svg>
                    </div>
                  ))}
                </div>
                {!group.rows?.length ? (
                  <p className="py-3 text-xs text-slate-500">
                    {data
                      ? "Waiting for visitors."
                      : "No snapshot available yet."}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
        <footer className="flex flex-wrap items-start justify-between gap-4 border-t border-slate-200 pt-5 text-[11px] leading-relaxed text-slate-500">
          <p className="max-w-2xl">
            Consented, anonymous activity updates every 15 seconds. Locations are
            approximate. Privacy settings, blockers and inactive tabs can affect
            counts. Sessions from other devices are separate.
            {data
              ? ` Collection began ${new Date(data.collection_started_at).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" })}; earlier sessions are not included.`
              : ""}
          </p>
          <Link
            to="/admin/cases"
            className="inline-flex shrink-0 items-center gap-1 font-medium text-emerald-800"
          >
            Open case management <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </footer>
      </main>
    </div>
  );
}
