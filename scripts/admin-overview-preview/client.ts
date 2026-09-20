import {
  calendarDay,
  type PerformanceReport,
  type BucketMetrics,
} from "../../src/lib/admin/performance";
import {
  isCompletedStage,
  isTrialStage,
  type CaseStatus,
} from "../../src/lib/admin/caseStatus";
// Synthetic loopback preview only. This module is never imported by the app.
import type {
  DashboardOverview,
  QueueItem,
} from "../../src/lib/admin/dashboard";
export const fixture = { mode: "normal", role: "admin" };
const listeners = new Set<(event: string, session: unknown) => void>();
const session = {
  user: { id: "preview-staff", email: "staff@example.test" },
  access_token: "synthetic-preview-only",
};
function stamp() {
  return new Date().toISOString();
}
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60000).toISOString();
const dayStart = (day: string) => {
  const base = new Date(`${day}T07:00:00Z`);
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Edmonton",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(base),
  );
  return new Date(base.getTime() - hour * 3600000).toISOString();
};
const start = () => dayStart(calendarDay());
const names = [
  "Alex Morgan",
  "Taylor Chen",
  "Jordan Patel",
  "Sam Rivera",
  "Avery Wilson",
  "Casey Thompson",
  "Riley Martin",
  "Cameron Lee",
  "Reese Bell",
  "Jamie Woods",
  "Morgan Smith",
  "Drew Adams",
];
const workflow = new Map<string, CaseStatus>();
function items(): QueueItem[] {
  return names
    .map(
      (name, index) =>
        ({
          id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          kind: index < 2 || index === 4 ? "draft" : "submission",
          name,
          email: `${name.toLowerCase().replace(" ", ".")}@example.test`,
          phone: null,
          ticket_number: index < 2 ? null : `T-DEMO-${1000 + index}`,
          service_type: "representation",
          ticket_type: index % 3 === 0 ? "photo_radar" : "officer_issued",
          status: "active",
          case_stage: null,
          case_stage_version: 0,
          category:
            index < 2 || index === 4
              ? "partial"
              : index === 2
                ? "new"
                : index === 3
                  ? "payment"
                  : index === 11
                    ? "completed"
                    : "active",
          current_step: (index % 5) + 1,
          created_at: ago(index < 3 ? index * 10 + 3 : 1440 + index),
          updated_at: ago(index * 10 + 3),
          ticket_uploaded_at:
            index === 4 ? null : ago(index < 3 ? index * 10 + 3 : 1440 + index),
          paid_at: index === 2 || index === 5 ? ago(1) : null,
          follow_up_status: "open",
        }) as QueueItem,
    )
    .map((row) => {
      const state = workflow.get(row.id);
      if (state)
        return {
          ...row,
          case_stage: state.stage,
          case_stage_version: state.version,
          category: (state.stage === "partial"
            ? "partial"
            : isCompletedStage(state.stage)
              ? "completed"
              : isTrialStage(state.stage)
                ? "trial"
                : "active") as QueueItem["category"],
        };
      return row;
    });
}
function overview(days: number): DashboardOverview {
  const day = new Date(start());
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(day.getTime() - (days - 1 - i) * 86400000);
    return {
      day: date.toISOString().slice(0, 10),
      revenue_cents: [0, 39600, 19800, 7900, 47500, 19800, 19800][i % 7],
      tracked_visits: [26, 38, 22, 47, 54, 36, 18][i % 7],
      submissions: items().filter(
        (row) =>
          row.kind === "submission" &&
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Edmonton",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(row.created_at)) ===
            date.toISOString().slice(0, 10),
      ).length,
      paid_orders: [0, 2, 1, 1, 3, 1, 1][i % 7],
    };
  });
  if (fixture.mode === "empty")
    daily.forEach((day) =>
      Object.assign(day, {
        revenue_cents: 0,
        tracked_visits: 0,
        submissions: 0,
        paid_orders: 0,
      }),
    );
  const sum = (key: string) =>
    daily.reduce((total, day) => total + Number(day[key]), 0);
  const current = {
    revenue_cents: sum("revenue_cents"),
    tracked_visits: sum("tracked_visits"),
    submissions: sum("submissions"),
    paid_orders: sum("paid_orders"),
    gross_cents: Math.round(sum("revenue_cents") * 1.05),
    refunds_cents: fixture.mode === "empty" ? 0 : 8295,
  };
  return {
    generated_at: stamp(),
    days: days as 7 | 30,
    since: `${daily[0].day}T00:00:00-06:00`,
    until: stamp(),
    today_since: start(),
    previous_since: ago(days * 2880),
    previous_until: ago(days * 1440),
    today: {
      uploads: fixture.mode === "empty" ? 0 : 3,
      submissions: fixture.mode === "empty" ? 0 : 1,
      paid_clients: fixture.mode === "empty" ? 0 : 2,
    },
    current,
    previous: {
      ...current,
      revenue_cents: Math.round(current.revenue_cents * 0.7),
      tracked_visits: Math.round(current.tracked_visits * 0.82),
      submissions: Math.round(current.submissions * 0.8),
      paid_orders: Math.round(current.paid_orders * 0.75),
    },
    daily,
    funnel: [
      "landing_view",
      "intake_started",
      "ticket_uploaded",
      "checkout_started",
      "purchase",
    ].map((event_name, i) => ({
      event_name,
      sessions: Math.round(
        current.tracked_visits * [1, 0.32, 0.21, 0.09, 0.034][i],
      ),
    })),
    sources:
      fixture.mode === "empty"
        ? []
        : [
            {
              source: "google",
              sessions: Math.round(current.tracked_visits * 0.61),
            },
            {
              source: "meta",
              sessions: Math.round(current.tracked_visits * 0.22),
            },
            {
              source: "Direct / unknown",
              sessions: Math.round(current.tracked_visits * 0.17),
            },
          ],
  };
}
// Explicit synthetic history for interactive period/comparison verification.
function performance(args: Record<string, unknown>): PerformanceReport {
  const today = calendarDay();
  const add = (day: string, amount: number) =>
    new Date(Date.parse(`${day}T12:00:00Z`) + amount * 86400000)
      .toISOString()
      .slice(0, 10);
  const first = "2025-01-01";
  const period = String(
    args.p_period || "all_time",
  ) as PerformanceReport["period"];
  let start = first;
  let end = today;
  if (/^\d+d$/.test(period)) start = add(today, 1 - parseInt(period));
  if (period === "today") start = today;
  if (period === "ytd") start = today.slice(0, 4) + "-01-01";
  if (period === "last_year") {
    start = `${Number(today.slice(0, 4)) - 1}-01-01`;
    end = `${Number(today.slice(0, 4)) - 1}-12-31`;
  }
  if (period === "custom") {
    start = String(args.p_start);
    end = String(args.p_end);
  }
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const comparison =
    period === "all_time"
      ? "none"
      : (String(
          args.p_compare || "previous",
        ) as PerformanceReport["comparison"]);
  const prevStart =
    comparison === "year"
      ? `${Number(start.slice(0, 4)) - 1}${start.slice(4)}`
      : add(start, -days);
  const grain = (
    args.p_granularity === "auto" || !args.p_granularity
      ? days <= 90
        ? "day"
        : days <= 730
          ? "week"
          : "month"
      : args.p_granularity
  ) as PerformanceReport["granularity"];
  const zero = () => ({
    revenue_cents: 0,
    gross_cents: 0,
    refunds_cents: 0,
    paid_orders: 0,
    tracked_visits: 0,
    submissions: 0,
  });
  const totals = zero(),
    previous = zero();
  const data = new Map<
    string,
    {
      day: string;
      end_day: string;
      current: BucketMetrics;
      previous: BucketMetrics | null;
    }
  >();
  const keys = Object.keys(totals) as Array<keyof BucketMetrics>;
  const values = (day: string) => {
    const index = Math.round((Date.parse(day) - Date.parse(first)) / 86400000);
    const active = fixture.mode !== "empty" && index >= 0;
    const orders = active ? [0, 2, 1, 3, 4, 1, 2][Math.abs(index) % 7] : 0;
    const revenue = orders * 19800;
    return {
      revenue_cents: revenue,
      gross_cents: revenue * 1.05,
      refunds_cents: active && index % 19 === 0 ? 20790 : 0,
      paid_orders: orders,
      tracked_visits: active
        ? [32, 48, 36, 63, 85, 51, 44][Math.abs(index) % 7]
        : 0,
      submissions: active
        ? items().filter(
            (row) =>
              row.kind === "submission" &&
              calendarDay(new Date(row.created_at)) === day,
          ).length
        : 0,
    };
  };
  for (let i = 0; i < days; i++) {
    const day = add(start, i);
    const bucket =
      grain === "month"
        ? day.slice(0, 7) + "-01" < start
          ? start
          : day.slice(0, 7) + "-01"
        : grain === "week"
          ? add(start, Math.floor(i / 7) * 7)
          : day;
    if (!data.has(bucket))
      data.set(bucket, {
        day: bucket,
        end_day: day,
        current: zero(),
        previous: comparison === "none" ? null : zero(),
      });
    const row = data.get(bucket)!;
    row.end_day = day;
    const currentDay = values(day);
    const previousDay = values(add(prevStart, i));
    for (const key of keys) {
      totals[key] += currentDay[key];
      previous[key] += previousDay[key];
      row.current[key] = (row.current[key] || 0) + currentDay[key];
      if (row.previous)
        row.previous[key] = (row.previous[key] || 0) + previousDay[key];
    }
  }
  for (const row of data.values()) {
    if (row.end_day < first) for (const key of keys) row.current[key] = null;
    const offset = Math.round(
      (Date.parse(row.end_day) - Date.parse(start)) / 86400000,
    );
    if (row.previous && add(prevStart, offset) < first)
      for (const key of keys) row.previous[key] = null;
  }
  const all = overview(7);
  return {
    generated_at: stamp(),
    period,
    days,
    since: dayStart(start),
    until: end === today ? stamp() : dayStart(add(end, 1)),
    start_day: start,
    end_day: end,
    granularity: grain,
    comparison,
    previous_since: comparison === "none" ? null : dayStart(prevStart),
    previous_until:
      comparison === "none" ? null : dayStart(add(prevStart, days)),
    coverage: {
      history_start: first,
      revenue_since: first + "T12:00:00Z",
      cash_since: first + "T12:00:00Z",
      visits_since: first + "T12:00:00Z",
      submissions_since: first + "T12:00:00Z",
      traffic_retention_days: 400,
    },
    current: totals,
    previous: comparison === "none" ? null : previous,
    series: [...data.values()],
    services: totals.paid_orders
      ? [
          {
            product: "rapid_resolution",
            revenue_cents: totals.revenue_cents,
            gross_cents: totals.gross_cents,
            paid_orders: totals.paid_orders,
          },
        ]
      : [],
    funnel: all.funnel.map((row, i) => ({
      ...row,
      sessions: Math.round(
        totals.tracked_visits * [1, 0.31, 0.21, 0.09, 0.041][i],
      ),
    })),
    sources: totals.tracked_visits
      ? [
          {
            source: "google",
            sessions: Math.floor(totals.tracked_visits * 0.61),
          },
          {
            source: "meta",
            sessions: Math.floor(totals.tracked_visits * 0.22),
          },
          {
            source: "Direct / unknown",
            sessions:
              totals.tracked_visits -
              Math.floor(totals.tracked_visits * 0.61) -
              Math.floor(totals.tracked_visits * 0.22),
          },
        ]
      : [],
  };
}
function result(name: string, args: Record<string, unknown>) {
  if (name === "idr_staff_role") return fixture.role;
  if (fixture.mode === "error") throw new Error("Synthetic connection outage");
  if (name === "get_admin_ticket_case_status")
    return (
      workflow.get(String(args.p_ticket_id)) || {
        kind: args.p_kind,
        ticket_id: args.p_ticket_id,
        stage: null,
        version: 0,
      }
    );
  if (name === "set_admin_ticket_case_status") {
    if (fixture.mode === "save_error")
      throw new Error("Synthetic save failure");
    const old = workflow.get(String(args.p_ticket_id));
    if (fixture.mode === "conflict") {
      workflow.set(String(args.p_ticket_id), {
        kind: args.p_kind as CaseStatus["kind"],
        ticket_id: String(args.p_ticket_id),
        stage: "disclosure_requested",
        version: Number(args.p_expected_version) + 1,
      });
      throw new Error("CASE_STATUS_CHANGED");
    }
    if ((old?.version || 0) !== args.p_expected_version)
      throw new Error("CASE_STATUS_CHANGED");
    const next = {
      kind: args.p_kind,
      ticket_id: args.p_ticket_id,
      stage: args.p_stage,
      version: Number(args.p_expected_version) + 1,
    } as CaseStatus;
    workflow.set(next.ticket_id, next);
    return next;
  }
  if (name === "admin_dashboard_activity") return overview(7);
  if (name === "admin_performance_report") return performance(args);
  if (name === "admin_dashboard_overview")
    return overview(Number(args.p_days || 7));
  if (name === "admin_dashboard_queue") {
    const all = fixture.mode === "empty" ? [] : items();
    const matches = (row: QueueItem, filter: string) =>
      filter === "trial"
        ? isTrialStage(row.case_stage)
        : filter === "partial"
          ? row.category === "partial"
          : filter === "active"
            ? ["new", "active"].includes(row.category)
            : filter === "submitted"
              ? row.kind === "submission" || !!row.case_stage
              : filter === "completed"
                ? row.category === "completed"
                : filter === "paid"
                  ? !!row.paid_at
                  : filter === "uploads"
                    ? !!row.ticket_uploaded_at
                    : ["new", "payment", "partial"].includes(row.category);
    const rows = all.filter(
      (row) =>
        matches(row, String(args.p_filter || "attention")) &&
        (!args.p_search ||
          `${row.name} ${row.email} ${row.ticket_number}`
            .toLowerCase()
            .includes(String(args.p_search).toLowerCase())) &&
        (!args.p_since ||
          (Date.parse(
            args.p_filter === "uploads"
              ? row.ticket_uploaded_at!
              : args.p_filter === "paid"
                ? row.paid_at!
                : row.created_at,
          ) >= Date.parse(String(args.p_since)) &&
            Date.parse(
              args.p_filter === "uploads"
                ? row.ticket_uploaded_at!
                : args.p_filter === "paid"
                  ? row.paid_at!
                  : row.created_at,
            ) < Date.parse(String(args.p_until)))),
    );
    const offset = Number(args.p_offset || 0);
    return {
      generated_at: stamp(),
      total: rows.length,
      offset,
      page_size: 8,
      counts: Object.fromEntries(
        [
          "attention",
          "partial",
          "active",
          "submitted",
          "completed",
          "trial",
        ].map((filter) => [
          filter,
          all.filter((row) => matches(row, filter)).length,
        ]),
      ),
      items: rows.slice(offset, offset + 8),
    };
  }
  if (name === "admin_live_view")
    return {
      generated_at: stamp(),
      active: fixture.mode === "empty" ? 0 : 2,
      sessions_today: fixture.mode === "empty" ? 0 : 18,
      stages: {
        browsing: fixture.mode === "empty" ? 0 : 1,
        intake: fixture.mode === "empty" ? 0 : 1,
        review: 0,
      },
      visitors:
        fixture.mode === "empty"
          ? []
          : [
              {
                id: "visitor-a",
                city: "Calgary",
                region: "Alberta",
                country: "CA",
                page: "/rapid-resolution",
                source: "Google",
              },
              {
                id: "visitor-b",
                city: "Edmonton",
                region: "Alberta",
                country: "CA",
                page: "/submit-ticket",
                source: "Direct",
              },
            ],
    };
  throw new Error(`Unexpected preview RPC: ${name}`);
}
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: (fn: (event: string, session: unknown) => void) => {
      listeners.add(fn);
      return {
        data: { subscription: { unsubscribe: () => listeners.delete(fn) } },
      };
    },
    signOut: async () => {
      listeners.forEach((fn) => fn("SIGNED_OUT", null));
      return { error: null };
    },
  },
  rpc: (name: string, args: Record<string, unknown> = {}) => {
    const promise = new Promise((resolve) =>
      setTimeout(() => {
        try {
          resolve({ data: result(name, args), error: null });
        } catch (error) {
          resolve({ data: null, error });
        }
      }, 180),
    );
    return Object.assign(promise, { abortSignal: () => promise });
  },
};
