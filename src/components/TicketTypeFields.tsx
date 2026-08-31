import { useId } from "react";
import { PHOTO_RADAR_PRICE_LABEL } from "@/config/offers";
import { REGISTERED_OWNER_LABELS, type RegisteredOwnerAnswer, type TicketType, type TicketTypeSource } from "@/lib/ticket/ticketType";

interface TicketTypeFieldsProps {
  ticketType: TicketType;
  ticketTypeSource: TicketTypeSource;
  registeredOwnerOnOffenceDate: RegisteredOwnerAnswer;
  onTicketTypeChange: (value: TicketType) => void;
  onOwnerChange: (value: RegisteredOwnerAnswer) => void;
  disabled?: boolean;
}

export default function TicketTypeFields({ ticketType, ticketTypeSource, registeredOwnerOnOffenceDate, onTicketTypeChange, onOwnerChange, disabled = false }: TicketTypeFieldsProps) {
  const id = useId();
  const isPhotoRadar = ticketType === "photo_radar";
  return (
    <div className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
      <fieldset disabled={disabled} aria-describedby={`${id}-type-help`}>
        <legend className="font-semibold">What kind of ticket is this?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([
            ["officer_issued", "Officer-issued ticket", "Handed to the driver by an officer"],
            ["photo_radar", "Photo radar / red-light camera", "Automated notice mailed to the registered owner"],
          ] as const).map(([value, label, description]) => (
            <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${ticketType === value ? "border-primary bg-white" : "border-border bg-white/60"}`}>
              <input type="radio" name={`${id}-ticket-type`} value={value} checked={ticketType === value} onChange={() => onTicketTypeChange(value)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-700" />
              <span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span>
            </label>
          ))}
        </div>
        <p id={`${id}-type-help`} className="mt-3 text-xs text-muted-foreground" aria-live="polite">
          {ticketTypeSource === "upload" ? "The upload suggested this ticket type. Check it and change it if needed." : "We look for registered-owner wording, section 160(1) and the mailed notice format in your upload. You can correct the selection."}
        </p>
      </fieldset>
      {isPhotoRadar ? (
        <>
          <p className="text-sm leading-relaxed"><strong>No demerits. No insurance impact.</strong> Only the fine is on the table. {PHOTO_RADAR_PRICE_LABEL}; no success fee and no trial.</p>
          <fieldset disabled={disabled} aria-describedby={`${id}-owner-help`}>
            <legend className="text-sm font-semibold">Was this vehicle registered to you on the offence date? *</legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {(Object.entries(REGISTERED_OWNER_LABELS) as [Exclude<RegisteredOwnerAnswer, "">, string][]).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm">
                  <input type="radio" name={`${id}-registered-owner`} value={value} checked={registeredOwnerOnOffenceDate === value} onChange={() => onOwnerChange(value)} className="h-4 w-4 accent-emerald-700" />
                  {label}
                </label>
              ))}
            </div>
            <p id={`${id}-owner-help`} className="mt-3 text-xs text-muted-foreground">
              {registeredOwnerOnOffenceDate === "sold_before" || registeredOwnerOnOffenceDate === "stolen"
                ? "Fabsy will review the ownership issue and may ask for sale or theft records. This answer does not by itself guarantee a withdrawal."
                : "Answer for the date of the alleged offence, not the day the notice arrived."}
            </p>
          </fieldset>
        </>
      ) : null}
    </div>
  );
}
