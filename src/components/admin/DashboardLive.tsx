import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Globe2 } from "lucide-react";
import { count, localClock } from "@/lib/admin/dashboard";
import { locationLabel, type LiveSnapshot } from "@/lib/live-view/core";
import { Button } from "@/components/ui/button";

export default function DashboardLive({
  data,
  error,
  isAdmin,
  retry,
}: {
  data?: LiveSnapshot;
  error: boolean;
  isAdmin: boolean;
  retry: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const stale = !!data && now - Date.parse(data.generated_at) > 45_000;
  const available = isAdmin && !!data && !error && !stale;
  return (
    <aside
      aria-labelledby="live-title"
      className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="live-title" className="text-lg font-semibold tracking-tight">
          Live traffic
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${available ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${available ? "bg-emerald-500" : "bg-slate-400"}`}
          />
          {!isAdmin
            ? "Admin only"
            : error || stale
              ? "Disconnected"
              : data
                ? "Live"
                : "Connecting"}
        </span>
      </div>
      {!isAdmin ? (
        <p className="my-10 text-sm leading-relaxed text-slate-500">
          Administrator access required.
        </p>
      ) : (
        <>
          <div
            className="mt-6 flex items-end gap-3"
            title="Opted-in visitors · last 90 seconds"
          >
            <span className="text-5xl font-semibold tracking-tighter tabular-nums">
              {available ? count(data.active) : "—"}
            </span>
            <span className="pb-1 text-sm text-slate-500">Active visitors</span>
          </div>
          {error || stale ? (
            <div
              role="alert"
              className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
            >
              Live traffic is unavailable.
              <Button
                variant="outline"
                size="sm"
                className="mt-2 block"
                onClick={retry}
              >
                Reconnect
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-3 divide-x rounded-xl bg-slate-50 py-3 text-center">
                {[
                  ["Browsing", data?.stages.browsing],
                  ["In intake", data?.stages.intake],
                  ["Reviewing", data?.stages.review],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-lg font-semibold tabular-nums">
                      {count(value as number | undefined)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Current visitors
                </h3>
                {data?.visitors.length ? (
                  <ul className="mt-2 divide-y divide-slate-100">
                    {data.visitors.slice(0, 4).map((visitor) => (
                      <li key={visitor.id}>
                        <Link
                          to="/admin/live"
                          className="flex min-h-16 items-center gap-3 py-3 hover:text-blue-700"
                        >
                          <Globe2
                            className="h-4 w-4 shrink-0 text-slate-400"
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {locationLabel(visitor)}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {visitor.page} · {visitor.source}
                            </p>
                          </div>
                          <ArrowUpRight
                            className="h-3.5 w-3.5 text-slate-400"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-8 text-sm text-slate-500">
                    {data ? "No active visitors" : "Connecting…"}
                  </p>
                )}
              </div>
            </>
          )}
          <div className="mt-auto border-t border-slate-100 pt-4">
            <div className="mb-3 flex justify-between text-sm">
              <span className="text-slate-500">Sessions today</span>
              <span className="font-semibold tabular-nums">
                {available ? count(data.sessions_today) : "—"}
              </span>
            </div>
            <Link
              to="/admin/live"
              className="flex min-h-11 items-center justify-between rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            >
              Live view <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <p className="mt-3 text-[11px] text-slate-500">
              {data ? `${localClock(data.generated_at)} · Edmonton` : "—"}
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
