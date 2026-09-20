export type DashboardDays = 7 | 30;
export type QueueFilter =
  | "trial"
  | "attention"
  | "partial"
  | "active"
  | "submitted"
  | "completed"
  | "paid"
  | "uploads";
export type Metric =
  | "revenue_cents"
  | "tracked_visits"
  | "submissions"
  | "paid_orders";
export type QueueRange = {
  since: string;
  until: string;
  label: string;
  followToday?: boolean;
} | null;
export interface Metrics {
  revenue_cents: number;
  gross_cents: number;
  refunds_cents: number;
  tracked_visits: number;
  submissions: number;
  paid_orders: number;
}
export interface DashboardOverview {
  generated_at: string;
  days: DashboardDays;
  since: string;
  until: string;
  today_since: string;
  previous_since: string;
  previous_until: string;
  today: { uploads: number; submissions: number; paid_clients: number };
  current: Metrics;
  previous: Metrics;
  daily: Array<{ day: string } & Pick<Metrics, Metric>>;
  funnel: Array<{ event_name: string; sessions: number }>;
  sources: Array<{ source: string; sessions: number }>;
}
export type DashboardActivity = Pick<DashboardOverview, 'generated_at' | 'until' | 'today_since' | 'today'>;
export interface QueueItem {
  id: string;
  kind: "draft" | "submission";
  name: string;
  email: string | null;
  phone: string | null;
  ticket_number: string | null;
  service_type: string;
  ticket_type: string;
  status: string;
  case_stage: import("./caseStatus").CaseStage | null;
  case_stage_version: number;
  category: "trial" | "partial" | "payment" | "new" | "active" | "completed";
  current_step: number | null;
  created_at: string;
  updated_at: string;
  ticket_uploaded_at: string | null;
  paid_at: string | null;
  follow_up_status: string | null;
}
export interface DashboardQueue {
  generated_at: string;
  total: number;
  offset: number;
  page_size: number;
  counts: Record<Exclude<QueueFilter, "uploads" | "paid">, number>;
  items: QueueItem[];
}
export const count = (value: number | undefined) =>
  value === undefined ? "—" : new Intl.NumberFormat("en-CA").format(value);
export const money = (cents: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const localClock = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
export const shortDay = (day: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
export function changeLabel(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "No change" : "No prior activity";
  const percent = Math.round(((current - previous) / previous) * 100);
  return percent === 0
    ? "No change"
    : `${percent > 0 ? "+" : ""}${percent}% vs previous period`;
}
export function itemHref(item: QueueItem): string {
  if (item.kind === "draft")
    return `/admin/cases?intake=${encodeURIComponent(item.id)}#intake-${item.id}`;
  return item.service_type === "ticket_insurance_assessment"
    ? `/admin/assessments/${item.id}`
    : `/admin/submissions/${item.id}`;
}
export const queueLabels: Record<QueueFilter, string> = {
  trial: "Trial matters",
  attention: "Needs attention",
  partial: "Partial intakes",
  active: "Active cases",
  submitted: "All submissions",
  completed: "Completed",
  uploads: "Uploaded tickets",
  paid: "Paid clients",
};
