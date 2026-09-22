import { useId } from "react";
import { PHOTO_RADAR, RAPID_RESOLUTION } from "@/config/offers";
import type { TicketType } from "@/lib/ticket/ticketType";

export default function TicketServiceOptions({ ticketType, onChange, disabled = false }: {
  ticketType: TicketType;
  onChange: (value: TicketType) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-semibold text-slate-700">How was the ticket issued?</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {([["officer_issued", "By an officer", RAPID_RESOLUTION.priceCad], ["photo_radar", "By a camera", PHOTO_RADAR.priceCad]] as const).map(([value, label, price]) => (
          <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-600 ${ticketType === value ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-300 text-slate-700"}`}>
            <input className="h-4 w-4 shrink-0 accent-blue-700" type="radio" name={`${id}-ticket-type`} value={value} checked={ticketType === value} onChange={() => onChange(value)} />
            <span className="font-semibold">{label}<span className="block text-xs font-normal">${price} + GST service</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
