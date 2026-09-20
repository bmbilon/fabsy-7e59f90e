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
const start = () =>
  new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}T00:00:00-06:00`,
  ).toISOString();
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
function items(): QueueItem[] {
  return names.map((name, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    kind: index < 2 || index === 4 ? "draft" : "submission",
    name,
    email: `${name.toLowerCase().replace(" ", ".")}@example.test`,
    phone: null,
    ticket_number: index < 2 ? null : `T-DEMO-${1000 + index}`,
    service_type: "representation",
    ticket_type: index % 3 === 0 ? "photo_radar" : "officer_issued",
    status: "active",
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
  }));
}
function overview(days: number): DashboardOverview {
  const day = new Date(start());
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(day.getTime() - (days - 1 - i) * 86400000);
    return {
      day: date.toISOString().slice(0, 10),
      revenue_cents: [0, 39600, 19800, 7900, 47500, 19800, 19800][i % 7],
      tracked_visits: [26, 38, 22, 47, 54, 36, 18][i % 7],
      submissions: items().filter(row => row.kind === 'submission' &&
        new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(row.created_at)) === date.toISOString().slice(0, 10)
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
function result(name: string, args: Record<string, unknown>) {
  if (name === "idr_staff_role") return fixture.role;
  if (fixture.mode === "error") throw new Error("Synthetic connection outage");
  if (name === "admin_dashboard_overview")
    return overview(Number(args.p_days || 7));
  if (name === "admin_dashboard_queue") {
    const all = fixture.mode === "empty" ? [] : items();
    const matches = (row: QueueItem, filter: string) =>
      filter === "partial"
        ? row.category === "partial"
        : filter === "active"
          ? ["new", "active"].includes(row.category)
          : filter === "submitted"
            ? row.kind === "submission"
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
        ["attention", "partial", "active", "submitted", "completed"].map(
          (filter) => [
            filter,
            all.filter((row) => matches(row, filter)).length,
          ],
        ),
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
