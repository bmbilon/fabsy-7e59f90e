import { useEffect, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, RotateCcw, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import TicketCapture, { type TicketOcrData } from "@/components/TicketCapture";
import type { FormData } from "@/components/TicketForm";
import { PHOTO_RADAR, RAPID_RESOLUTION } from "@/config/offers";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";
import {
  ASSESSMENT_OFFENCES, DEFAULT_ANNUAL_PREMIUM, INSURANCE_SCENARIO_YEARS,
  calculateInstantEstimate, extractAssessmentBasics, formatEstimateMoney, formatEstimateRange,
  type AssessmentOffence, type InstantEstimate,
} from "@/lib/assessment/instantEstimate";
import type { TicketCaptureState } from "@/lib/ticket/ticketCapture";
import { ticketDateAsLocalDate, ticketDateFromExtraction, type TicketType } from "@/lib/ticket/ticketType";

const control = "mt-1.5 h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-100";
const labelClass = "block text-sm font-semibold text-slate-700";

export default function InstantTicketAssessment() {
  const location = useLocation();
  const navigate = useNavigate();
  // Unknown query parameters are private under every existing provider policy.
  // Enter that fresh, untagged document before accepting ticket information.
  const privateAssessment = new URLSearchParams(location.search).get("assessment") === "1";
  const [ticketType, setTicketType] = useState<TicketType>("officer_issued");
  const [offence, setOffence] = useState<AssessmentOffence | "">("");
  const [fine, setFine] = useState("");
  const [demerits, setDemerits] = useState("");
  const [cleanRecord, setCleanRecord] = useState("");
  const [premium, setPremium] = useState(String(DEFAULT_ANNUAL_PREMIUM));
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<TicketOcrData | null>(null);
  const [captureState, setCaptureState] = useState<TicketCaptureState>("empty");
  const [result, setResult] = useState<InstantEstimate | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const camera = ticketType === "photo_radar";
  const offer = camera ? PHOTO_RADAR : RAPID_RESOLUTION;
  const scanning = captureState === "processing";

  useEffect(() => { if (result) resultHeading.current?.focus(); }, [result]);

  useEffect(() => {
    if (!privateAssessment) return;
    const target = location.hash.slice(1);
    if (!/^assessment-(?:offence|fine|demerits|record|premium|upload)$/.test(target)) return;
    const element = document.getElementById(target);
    if (target === "assessment-upload") element?.closest("details")?.setAttribute("open", "");
    document.getElementById("instant-ticket-assessment")?.scrollIntoView?.({ block: "start" });
    element?.focus({ preventScroll: true });
  }, [privateAssessment, location.hash]);

  function enterPrivateAssessment(event: SyntheticEvent<HTMLElement>) {
    if (privateAssessment) return;
    event.preventDefault();
    event.stopPropagation();
    const element = (event.target as HTMLElement).closest<HTMLElement>("[id^='assessment-']");
    const target = element && /^assessment-(?:offence|fine|demerits|record|premium|upload)$/.test(element.id)
      ? element.id : "assessment-offence";
    navigate(`/?assessment=1#${target}`);
  }

  function changeFile(next: File | null) {
    setFile(next);
    setExtraction(null);
    setOffence("");
    setFine("");
    setDemerits("");
    setTicketType("officer_issued");
    setCaptureState(next ? "processing" : "empty");
    setResult(null);
  }

  function applyScan(data: TicketOcrData | null) {
    if (!data) return;
    const basics = extractAssessmentBasics(data);
    setExtraction(data);
    setOffence(basics.offence);
    setFine(basics.fineAmount);
    setDemerits(basics.demerits);
    if (basics.ticketType) setTicketType(basics.ticketType);
  }

  function assess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!privateAssessment) { enterPrivateAssessment(event); return; }
    if (!offence || scanning) return;
    setResult(calculateInstantEstimate({
      ticketType, offence, fineAmount: Number(fine), demerits: camera || demerits === "unknown" ? null : Number(demerits),
      cleanRecord: camera || cleanRecord === "yes", annualPremium: camera ? 0 : Number(premium),
    }));
    trackAssessmentEvent("free_ticket_review_completed", { location: "homepage_instant_assessment" });
  }

  // Reuse the existing in-memory intake handoff. Do not cache files or details.
  const scannedBasics = extraction ? extractAssessmentBasics(extraction) : null;
  const selectedDescription = offence ? camera
    ? ({ lowSpeeding: "Speeding / photo radar", failToYield: "Red-light camera" }[offence] || "Other camera notice")
    : ASSESSMENT_OFFENCES[offence].label : "";
  const offenceDescription = scannedBasics?.offence === offence && scannedBasics.description
    ? scannedBasics.description : selectedDescription;
  const prefill: Partial<FormData> = {
    ticketType, ticketTypeSource: "manual", fineAmount: fine,
    offenceDescription,
    violation: offenceDescription,
    priorTickets: camera ? "" : cleanRecord === "yes" ? "none" : "",
    issueDate: ticketDateAsLocalDate(ticketDateFromExtraction(extraction, ticketType)),
    ticketDateManuallyEdited: true,
    courtDate: ticketDateAsLocalDate(extraction?.courtDate),
  };
  for (const key of ["ticketNumber", "location", "officer", "officerBadge", "offenceSection", "offenceSubSection", "courtJurisdiction"] as const) {
    if (typeof extraction?.[key] === "string") prefill[key] = extraction[key];
  }

  return (
    <div id="instant-ticket-assessment" className="min-w-0 scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-xl sm:p-7">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-700">
        <Sparkles className="h-4 w-4" aria-hidden="true" /> Free ticket assessment
      </div>
      {result ? (
        <div>
          <h2 ref={resultHeading} tabIndex={-1} className="mt-2 rounded-sm text-2xl font-bold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Your possible savings, at a glance.</h2>
          <p className="mt-2 text-sm text-slate-600">{camera ? "Camera ticket" : "Officer-issued ticket"} · {formatEstimateMoney(Math.round(Number(fine) * 100))} fine</p>
          <p className="mt-1 text-xs text-slate-500">{result.demerits === null ? "Demerits not confirmed" : `${result.demerits} demerit points`}{!camera && ` · ${cleanRecord === "yes" ? "Clean record" : "Previous convictions"}`}</p>
          <dl className="mt-6 divide-y divide-slate-200">
            <div className="py-4 first:pt-0">
              <dt className="text-sm font-medium text-slate-700">Possible fine reduction range</dt>
              <dd className="mt-1 text-2xl font-bold text-slate-950">{formatEstimateRange(result.fineReduction)}</dd>
            </div>
            <div className="py-4">
              <dt className="text-sm font-medium text-slate-700">Possible insurance impact range <span className="font-normal">· {INSURANCE_SCENARIO_YEARS} years</span></dt>
              <dd className="mt-1 text-2xl font-bold text-slate-950">{formatEstimateRange(result.insuranceImpact)}</dd>
              <dd className="mt-1 text-xs leading-relaxed text-slate-600">{camera
                ? "Registered-owner camera tickets have no insurance impact or demerits."
                : `Potential extra premiums that could be avoided if the outcome avoids a rated conviction. Based on ${formatEstimateMoney(result.annualPremium)}/year.`}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm">
              <dt>{camera ? "Camera" : "Officer"} ticket service fee</dt>
              <dd className="font-bold">{formatEstimateMoney(result.fee)}</dd>
            </div>
          </dl>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-5" aria-label="Combined savings calculation">
            <p className="text-sm font-semibold text-blue-900">Estimated savings</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-blue-900 sm:text-4xl">Up to {formatEstimateMoney(result.maxEstimatedSavings)}</p>
            <p className="mt-3 text-base font-semibold text-blue-900">Expected range: {formatEstimateRange(result.expectedSavings)}</p>
            <p className="mt-2 text-xs leading-relaxed text-blue-900">Fine reduction and insurance impact avoided, after our {formatEstimateMoney(result.fee)} service fee.</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">Before GST. Service-fee GST: {formatEstimateMoney(result.gst)}.</p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">Illustrative scenarios, not a prediction or insurer quote. No savings are guaranteed. {camera ? "A withdrawal could save more than the reduction scenario shown." : "A lower fine or fewer demerits alone may not lower insurance premiums."}</p>
          <details className="mt-3 text-xs text-slate-600">
            <summary className="cursor-pointer rounded-sm py-2 font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">How we estimated this</summary>
            <p className="mt-2 leading-relaxed">The fine scenario uses 0–{Math.round(result.reductionRate * 100)}% of your fine{camera ? "" : `, with ${cleanRecord === "yes" ? "a clean-record" : "a prior-conviction"} assumption`}. {camera ? "Any refund is subject to the published service-fee refund terms." : `Insurance uses 0–${Math.round(result.insuranceRate * 100)}% of your annual premium for ${INSURANCE_SCENARIO_YEARS} years. Demerit points do not set the insurance rate.`} These are Fabsy’s planning assumptions from its earlier calculator, not measured case outcomes or maximum possible changes. The combined estimate assumes the fine and insurance benefits can both be achieved. The fee is subtracted once, before any applicable refund.</p>
            <p className="mt-2 leading-relaxed">The expected range is an illustrative planning range: 30% below your ticket’s face value to 20% below the maximum estimated savings. For smaller estimates, the starting amount is limited to the upper amount. Savings are displayed from $0 when the estimated benefits do not cover the service fee.</p>
          </details>
          <Button asChild className="mt-4 h-auto min-h-14 w-full whitespace-normal rounded-xl bg-blue-700 px-4 py-4 text-base font-bold text-white hover:bg-blue-800 hover:text-white focus-visible:text-white">
            <Link to={offer.intakePath} data-funnel-action="primary_cta" data-funnel-position="assessment_result" state={{ ticketImage: file, prefillTicketData: prefill, startAtStep: 1 }} onClick={() => trackAssessmentEvent("assessment_cta_click", { location: "homepage_instant_assessment", destination: "ticket_intake", value: offer.priceCad })}>
              Get help with my ticket · ${offer.priceCad} + GST <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-slate-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" onClick={() => setResult(null)}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Edit ticket details</button>
        </div>
      ) : (
        <form onSubmit={assess} onPointerDownCapture={enterPrivateAssessment} onFocusCapture={enterPrivateAssessment} onClickCapture={enterPrivateAssessment} onChangeCapture={enterPrivateAssessment} autoComplete="off">
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-[1.75rem]">See what you could save.</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Add your ticket or enter the basics. Get your estimate instantly.</p>
          <details className="group mt-5 rounded-xl border border-slate-200 bg-slate-50">
            <summary id="assessment-upload" className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 [&::-webkit-details-marker]:hidden">
              <Upload className="h-5 w-5" aria-hidden="true" /> {file ? "Review uploaded ticket" : "Upload a ticket"}
              <span className="ml-auto text-xs font-normal text-slate-500">Photo or PDF</span><ChevronDown className="h-4 w-4 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="border-t border-slate-200 p-3">{privateAssessment
              ? <TicketCapture file={file} onFileChange={changeFile} onOcrData={applyScan} onCaptureStateChange={setCaptureState} skipInitialScan={captureState === "complete" || captureState === "manual"} compact label="Upload to fill in the basics" />
              : <p className="text-sm text-slate-600">Choose a photo or PDF to fill in the basics.</p>}</div>
          </details>
          {file && <p className="mt-2 text-xs text-slate-600" role="status">{scanning ? "Reading your ticket…" : "Check the details below and complete anything the scan missed."}</p>}
          <fieldset disabled={scanning} className="mt-5 space-y-4">
            <legend className="sr-only">Ticket basics</legend>
            <fieldset>
              <legend className={labelClass}>How was the ticket issued?</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([["officer_issued", "By an officer", RAPID_RESOLUTION.priceCad], ["photo_radar", "By a camera", PHOTO_RADAR.priceCad]] as const).map(([value, label, price]) => (
                  <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-600 ${ticketType === value ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-300 text-slate-700"}`}>
                    <input className="h-4 w-4 accent-blue-700" type="radio" name="assessment-ticket-type" value={value} checked={ticketType === value} onChange={() => { setTicketType(value); setOffence(""); setDemerits(""); }} />
                    <span className="font-semibold">{label}<span className="block text-xs font-normal">${price} + GST service</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className={labelClass} htmlFor="assessment-offence">Offence
              <select id="assessment-offence" className={control} required value={offence} onChange={event => setOffence(event.target.value as AssessmentOffence)}>
                <option value="" disabled>Select your offence</option>
                {camera ? <><option value="lowSpeeding">Speeding / photo radar</option><option value="failToYield">Red-light camera</option><option value="other">Other camera notice</option></> : Object.entries(ASSESSMENT_OFFENCES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass} htmlFor="assessment-fine">Fine amount (CAD)
                <input id="assessment-fine" className={control} required readOnly={!privateAssessment} type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" placeholder="e.g. 300" value={fine} onChange={event => setFine(event.target.value)} />
              </label>
              <label className={labelClass} htmlFor="assessment-demerits">Demerit points
                <select id="assessment-demerits" className={control} required={!camera} disabled={camera} value={camera ? "0" : demerits} onChange={event => setDemerits(event.target.value)}>
                  <option value="" disabled>Select</option><option value="unknown">Not sure</option>
                  {Array.from({ length: 16 }, (_, value) => <option key={value} value={String(value)}>{value}</option>)}
                </select>
              </label>
            </div>
            {camera ? <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">Camera tickets issued to the registered owner carry no demerits or insurance impact. Your estimate focuses on the fine.</p> : <>
              <label className={labelClass} htmlFor="assessment-record">Clean driving record?
                <select id="assessment-record" className={control} required value={cleanRecord} onChange={event => setCleanRecord(event.target.value)}>
                  <option value="" disabled>Select your record</option><option value="yes">Yes — no convictions in the last 3 years</option><option value="no">No — I have previous convictions</option>
                </select>
              </label>
              <details open={premiumOpen} onToggle={event => setPremiumOpen(event.currentTarget.open)} className="text-xs text-slate-600">
                <summary className="cursor-pointer rounded-sm py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Insurance estimate uses {formatEstimateMoney(Math.round((Number(premium) || 0) * 100))}/year · change</summary>
                <label htmlFor="assessment-premium" className={`${labelClass} mt-2`}>Your annual insurance premium (CAD)
                  <input id="assessment-premium" className={control} type="number" inputMode="decimal" required readOnly={!privateAssessment} min="0" max="1000000" step="0.01" value={premium} onInvalid={() => setPremiumOpen(true)} onChange={event => setPremium(event.target.value)} />
                </label>
                <p className="mt-2">Use your premium for a closer estimate. The $1,800 default is an illustrative baseline.</p>
              </details>
            </>}
          </fieldset>
          <Button type="submit" data-funnel-action="primary_cta" data-funnel-position="hero" disabled={scanning} className="mt-5 h-auto min-h-[72px] w-full whitespace-normal rounded-xl bg-blue-700 px-4 py-5 text-lg font-bold text-white shadow-lg shadow-blue-700/15 hover:bg-blue-800 sm:text-xl">
            Instant Ticket Assessment <ArrowRight className="!h-6 !w-6" aria-hidden="true" />
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Free · No email or payment required</p>
        </form>
      )}
    </div>
  );
}
