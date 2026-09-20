import { useState } from "react";
import { CalendarDays, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  calendarDay,
  periods,
  reportDate,
  type PerformanceSelection,
  type PerformanceReport,
  type Comparison,
} from "@/lib/admin/performance";

export default function PerformanceControls({
  selection,
  onChange,
  report,
  onExport,
}: {
  selection: PerformanceSelection;
  onChange: (selection: PerformanceSelection) => void;
  report?: PerformanceReport;
  onExport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(selection.start || "");
  const [end, setEnd] = useState(selection.end || calendarDay());
  const [error, setError] = useState("");
  const applyCustom = (selectedStart: string, selectedEnd: string) => {
    const start = selectedStart;
    const end = selectedEnd;
    if (
      !start ||
      !end ||
      start > end ||
      end > calendarDay() ||
      start < "1900-01-01"
    ) {
      setError("Choose a start date on or before the end date, through today.");
      return;
    }
    onChange({ ...selection, period: "custom", start, end });
    setError("");
    setOpen(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setStart(selection.start || report?.start_day || "");
            setEnd(selection.end || report?.end_day || calendarDay());
            setError("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-9 gap-2 bg-white text-xs shadow-sm"
            aria-label="Reporting date range"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {selection.period === "custom" && selection.start && selection.end
              ? `${reportDate(selection.start, selection.start.slice(0, 4) !== selection.end.slice(0, 4))} – ${reportDate(selection.end)}`
              : periods[selection.period]}
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(410px,calc(100vw-24px))] p-0"
        >
          <div className="grid grid-cols-2 gap-1 border-b p-3">
            {Object.entries(periods)
              .filter(([key]) => key !== "custom")
              .map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={selection.period === key}
                  onClick={() => {
                    onChange({
                      ...selection,
                      period: key as PerformanceSelection["period"],
                    });
                    setOpen(false);
                  }}
                  className={`rounded-md px-3 py-2 text-left text-sm focus-visible:outline-blue-600 ${selection.period === key ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {label}
                </button>
              ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const dates = new FormData(event.currentTarget);
              applyCustom(
                String(dates.get("start") || ""),
                String(dates.get("end") || ""),
              );
            }}
            className="space-y-3 p-4"
          >
            <div className="text-xs font-semibold text-slate-600">
              Custom dates · Edmonton
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-slate-500">
                From
                <input
                  aria-label="Report start date"
                  type="date"
                  required
                  min="1900-01-01"
                  name="start"
                  max={calendarDay()}
                  defaultValue={start}
                  onChange={(event) => setStart(event.target.value)}
                  className="block h-10 w-full min-w-0 rounded-md border p-2 text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                To
                <input
                  aria-label="Report end date"
                  type="date"
                  required
                  name="end"
                  min="1900-01-01"
                  max={calendarDay()}
                  defaultValue={end}
                  onChange={(event) => setEnd(event.target.value)}
                  className="block h-10 w-full min-w-0 rounded-md border p-2 text-slate-900"
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="text-xs text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" size="sm" className="w-full bg-slate-900">
              Apply dates
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <select
        aria-label="Compare performance"
        disabled={selection.period === "all_time"}
        value={selection.period === "all_time" ? "none" : selection.compare}
        onChange={(event) =>
          onChange({ ...selection, compare: event.target.value as Comparison })
        }
        className="h-9 max-w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 shadow-sm disabled:opacity-50"
      >
        <option value="none">No comparison</option>
        <option value="previous">Previous period</option>
        <option value="year">Previous year</option>
      </select>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-2 bg-white text-xs shadow-sm"
        onClick={onExport}
        disabled={!report}
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </Button>
    </div>
  );
}
