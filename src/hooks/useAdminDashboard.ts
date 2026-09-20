import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getIdrStaffRole } from "@/hooks/useIdrAuth";
import type {
  DashboardActivity,
  DashboardQueue,
  QueueFilter,
  QueueRange,
} from "@/lib/admin/dashboard";
import type { LiveSnapshot } from "@/lib/live-view/core";
import type {
  PerformanceReport,
  PerformanceSelection,
} from "@/lib/admin/performance";

export function usePerformanceReport(
  userId: string | undefined,
  role: string | null | undefined,
  selection: PerformanceSelection,
) {
  return useQuery({
    queryKey: ["admin-performance", userId, selection],
    enabled: !!userId && (role === "admin" || role === "case_manager"),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("admin_performance_report", {
          p_period: selection.period,
          p_compare: selection.compare,
          p_granularity: selection.granularity,
          ...(selection.period === "custom"
            ? { p_start: selection.start, p_end: selection.end }
            : {}),
        })
        .abortSignal(signal);
      if (error || !data || typeof data !== "object" || !("series" in data))
        throw new Error("Performance report unavailable.");
      return data as unknown as PerformanceReport;
    },
    staleTime: 30_000,
    gcTime: 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

export function useDashboardAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setSession(null);
          setReady(true);
        }
      });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const role = useQuery({
    queryKey: ["admin-dashboard-role", session?.user.id],
    enabled: !!session,
    queryFn: getIdrStaffRole,
    retry: false,
    gcTime: 0,
  });
  return { session, ready, role };
}

export function useDashboardData(
  userId: string | undefined,
  role: string | null | undefined,
  filter: QueueFilter,
  search: string,
  offset: number,
  range: QueueRange,
) {
  const enabled = !!userId && (role === "admin" || role === "case_manager");
  const overview = useQuery({
    queryKey: ["admin-dashboard", userId],
    enabled,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("admin_dashboard_activity")
        .abortSignal(signal);
      if (error || !data || typeof data !== "object" || !("today" in data))
        throw new Error("Performance data could not be loaded.");
      return data as unknown as DashboardActivity;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
    gcTime: 0,
  });
  // Today's drilldowns follow the refreshed header, including across midnight.
  // Explicit performance windows remain fixed to the snapshot clicked.
  const queueRange =
    range?.followToday && overview.data
      ? {
          ...range,
          since: overview.data.today_since,
          until: overview.data.until,
        }
      : range;
  const queue = useQuery({
    queryKey: [
      "admin-dashboard-queue",
      userId,
      filter,
      search,
      offset,
      queueRange?.since,
      queueRange?.until,
    ],
    enabled,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("admin_dashboard_queue", {
          p_filter: filter,
          p_search: search,
          p_offset: offset,
          ...(queueRange
            ? { p_since: queueRange.since, p_until: queueRange.until }
            : {}),
        })
        .abortSignal(signal);
      if (error || !data || typeof data !== "object" || !("items" in data))
        throw new Error("The submission queue could not be loaded.");
      return data as unknown as DashboardQueue;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
    gcTime: 0,
  });
  const live = useQuery({
    queryKey: ["admin-dashboard-live", userId],
    enabled: enabled && role === "admin",
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("admin_live_view")
        .abortSignal(signal);
      if (error || !data || typeof data !== "object" || !("active" in data))
        throw new Error("Live traffic could not be loaded.");
      return data as unknown as LiveSnapshot;
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: false,
    gcTime: 0,
  });
  return { overview, queue, live };
}
