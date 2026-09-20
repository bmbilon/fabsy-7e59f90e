import CaseStatusSelect from "./CaseStatusSelect";
import { caseStageLabel } from "@/lib/admin/caseStatus";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  count,
  itemHref,
  queueLabels,
  type DashboardQueue as QueueData,
  type QueueFilter,
  type QueueRange,
} from "@/lib/admin/dashboard";

const filters: QueueFilter[] = [
  "attention",
  "partial",
  "active",
  "submitted",
  "completed",
];
const states = {
  trial: { label: "Trial matter", style: "bg-violet-50 text-violet-800 ring-violet-200" },
  partial: {
    label: "Partial intake",
    style: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  payment: {
    label: "Awaiting payment",
    style: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  new: {
    label: "Ready for review",
    style: "bg-blue-50 text-blue-800 ring-blue-200",
  },
  active: {
    label: "In progress",
    style: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  },
  completed: {
    label: "Completed",
    style: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
};
export default function DashboardQueue({
  data,
  loading,
  error,
  filter,
  setFilter,
  search,
  setSearch,
  offset,
  setOffset,
  range,
  clearRange,
  retry,
  trials = false,
}: {
  trials?: boolean;
  data?: QueueData;
  loading: boolean;
  error: boolean;
  filter: QueueFilter;
  setFilter: (value: QueueFilter) => void;
  search: string;
  setSearch: (value: string) => void;
  offset: number;
  setOffset: (value: number) => void;
  range: QueueRange;
  clearRange: () => void;
  retry: () => void;
}) {
  return (
    <section
      id={trials ? "trial-matters" : "submission-queue"}
      aria-labelledby={trials ? "trial-title" : "queue-title"}
      className="min-w-0 scroll-mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <h2 id={trials ? "trial-title" : "queue-title"} className="text-lg font-semibold tracking-tight">
          <Link
            to="/admin/cases"
            className="inline-flex min-h-10 items-center gap-2 hover:text-blue-700"
          >
            {trials ? "Trial matters" : "Case management"}{" "}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </h2>
      </div>
      {!trials && <div
        className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-b px-5 sm:px-6"
        aria-label="Submission queue filters"
      >
        {filters.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-11 border-b-2 pb-2 pt-1 text-sm font-medium transition-colors focus-visible:outline-blue-600 ${filter === value ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}
          >
            {queueLabels[value]}{" "}
            <span
              className={`ml-1 rounded-md px-1.5 py-0.5 text-xs tabular-nums ${filter === value ? "bg-blue-50" : "bg-slate-100"}`}
            >
              {count(data?.counts[value as keyof QueueData["counts"]])}
            </span>
          </button>
        ))}
      </div>}
      <div className="px-5 py-4 sm:px-6">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            aria-label={trials ? "Search trial matters" : "Search submissions"}
            placeholder="Search name, ticket, email or phone…"
            maxLength={120}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        {range && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
            <span>
              {queueLabels[filter]} · {range.label}
            </span>
            <button
              type="button"
              onClick={clearRange}
              aria-label="Clear date filter"
              className="p-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {error ? (
        <div
          role="alert"
          className="mx-5 mb-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p>Cases unavailable · counts may be stale.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
            Retry queue
          </Button>
        </div>
      ) : loading ? (
        <div
          role="status"
          className="px-6 py-16 text-center text-sm text-slate-500"
        >
          Loading submissions…
        </div>
      ) : !data?.items.length ? (
        <div role="status" className="px-6 py-16 text-center">
          <p className="font-medium text-slate-700">
            {search || range ? "No matching tickets" : "No cases"}
          </p>
        </div>
      ) : (
        <div
          className="divide-y divide-slate-100"
          aria-label={queueLabels[filter]}
        >
          {data.items.map((item) => {
            const state =
              !item.case_stage && item.kind === "draft" &&
              (item.follow_up_status === "dismissed" ||
                item.status === "expired")
                ? {
                    label:
                      item.follow_up_status === "dismissed"
                        ? "Dismissed intake"
                        : "Expired intake",
                    style: "bg-slate-100 text-slate-600 ring-slate-200",
                  }
                : states[item.category];
            return (
              <div key={`${item.kind}-${item.id}`} className="flex min-w-0 flex-col gap-3 px-5 py-4 hover:bg-slate-50 sm:px-6 xl:flex-row xl:items-center">
              <Link to={itemHref(item)} className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-blue-600 sm:gap-4">
                <div
                  className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold sm:flex ${item.category === "partial" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                >
                  {item.name
                    .split(" ")
                    .slice(0, 2)
                    .map((word) => word[0])
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {item.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {item.ticket_number ||
                        (item.kind === "draft" && !item.case_stage
                          ? "Intake in progress"
                          : "Ticket details pending")}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {item.email ||
                      item.phone ||
                      (item.ticket_type === "photo_radar"
                        ? "Photo Radar"
                        : "Rapid Resolution")}
                    {item.kind === "draft" && !item.case_stage
                      ? ` · Step ${item.current_step} of 6`
                      : ""}
                  </p>
                  {item.kind === "draft" && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <ArrowDownToLine className="h-3 w-3" aria-hidden="true" />
                      {item.ticket_uploaded_at
                        ? "Ticket uploaded"
                        : "Contact saved · awaiting upload"}
                      {item.follow_up_status === "contacted"
                        ? " · Contacted"
                        : ""}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`inline-block max-w-40 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${state.style}`}
                  >
                    {caseStageLabel(item.case_stage) || state.label}
                  </span>
                  <p
                    className="mt-2 text-[11px] text-slate-500"
                    title={new Date(item.updated_at).toLocaleString("en-CA", {
                      timeZone: "America/Edmonton",
                    })}
                  >
                    {formatDistanceToNow(new Date(item.updated_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <ArrowUpRight
                  className="hidden h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-700 sm:block"
                  aria-hidden="true"
                />
              </Link>
              <CaseStatusSelect kind={item.kind} ticketId={item.id} label={item.name}
                initial={{ kind: item.kind, ticket_id: item.id, stage: item.case_stage || null, version: item.case_stage_version || 0 }}
                fallback={state.label} />
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:px-6">
        <span aria-live="polite" className="text-xs text-slate-500">
          {data && !error
            ? `${data.total ? offset + 1 : 0}–${Math.min(offset + data.page_size, data.total)} of ${count(data.total)}`
            : "Queue totals unavailable"}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={trials ? "Previous trial matters" : "Previous submissions"}
            disabled={loading || error || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 8))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={trials ? "Next trial matters" : "Next submissions"}
            disabled={
              loading || error || !data || offset + data.page_size >= data.total
            }
            onClick={() => setOffset(offset + 8)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
