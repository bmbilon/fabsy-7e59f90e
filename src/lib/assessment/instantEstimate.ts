import { PHOTO_RADAR, RAPID_RESOLUTION } from "@/config/offers";
import { detectTicketType, type TicketType } from "@/lib/ticket/ticketType";

// Illustrative upper scenarios restored from 40b99720a:ticketAssessmentData.ts.
// These are business assumptions, not observed results, insurer rates or caps.
// Unlike the old calculator, zero benefit is included and points never set rates.
export const ASSESSMENT_OFFENCES = {
  lowSpeeding: { label: "Speeding (under 30 km/h over)", fineReduction: 0.5, insuranceRate: 0.15 },
  highSpeeding: { label: "Speeding (30+ km/h over)", fineReduction: 0.25, insuranceRate: 0.25 },
  distractedDriving: { label: "Distracted driving", fineReduction: 0.3, insuranceRate: 0.25 },
  failToYield: { label: "Red light, stop sign or failing to yield", fineReduction: 0.4, insuranceRate: 0.15 },
  majorOffence: { label: "Careless driving", fineReduction: 0.1, insuranceRate: 0.4 },
  other: { label: "Other traffic offence", fineReduction: 0.3, insuranceRate: 0.15 },
} as const;

export type AssessmentOffence = keyof typeof ASSESSMENT_OFFENCES;
export const DEFAULT_ANNUAL_PREMIUM = 1800;
export const INSURANCE_SCENARIO_YEARS = 3;

export interface InstantEstimateInput {
  ticketType: TicketType;
  offence: AssessmentOffence;
  fineAmount: number;
  demerits: number | null;
  cleanRecord: boolean;
  annualPremium: number;
}

export interface MoneyRange { min: number; max: number }

export function calculateInstantEstimate(input: InstantEstimateInput) {
  if (!(input.ticketType === "officer_issued" || input.ticketType === "photo_radar")
    || !Object.prototype.hasOwnProperty.call(ASSESSMENT_OFFENCES, input.offence)
    || !Number.isFinite(input.fineAmount) || input.fineAmount <= 0 || input.fineAmount > 1_000_000
    || typeof input.cleanRecord !== "boolean"
    || !Number.isFinite(input.annualPremium) || input.annualPremium < 0 || input.annualPremium > 1_000_000
    || (input.demerits !== null && (!Number.isInteger(input.demerits) || input.demerits < 0 || input.demerits > 15))) {
    throw new Error("Check the ticket details before calculating an assessment.");
  }
  const camera = input.ticketType === "photo_radar";
  const scenario = ASSESSMENT_OFFENCES[input.offence];
  const fineCents = Math.round(input.fineAmount * 100);
  const premiumCents = Math.round(input.annualPremium * 100);
  const reductionRate = camera ? 0.1 : scenario.fineReduction * (input.cleanRecord ? 1 : 0.8);
  const fineReduction = { min: 0, max: Math.round(fineCents * reductionRate) };
  const insuranceImpact = {
    min: 0,
    max: camera ? 0 : Math.round(premiumCents * scenario.insuranceRate * INSURANCE_SCENARIO_YEARS),
  };
  const fee = (camera ? PHOTO_RADAR : RAPID_RESOLUTION).priceCents;
  const gst = Math.round(fee * PHOTO_RADAR.gstRate);
  const combinedValue = { min: fineReduction.min + insuranceImpact.min, max: fineReduction.max + insuranceImpact.max };
  const netSavings = { min: combinedValue.min - fee, max: combinedValue.max - fee };
  return {
    fineReduction, insuranceImpact, combinedValue, netSavings, fee, gst,
    netAfterGst: { min: netSavings.min - gst, max: netSavings.max - gst },
    reductionRate, insuranceRate: camera ? 0 : scenario.insuranceRate,
    annualPremium: premiumCents,
    demerits: camera ? 0 : input.demerits,
  };
}

export type InstantEstimate = ReturnType<typeof calculateInstantEstimate>;

export function formatEstimateMoney(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency", currency: "CAD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatEstimateRange(range: MoneyRange) {
  return range.min === range.max ? formatEstimateMoney(range.min)
    : `${formatEstimateMoney(range.min)} to ${formatEstimateMoney(range.max)}`;
}

/** Accept only a complete non-negative monetary value, never parse a prefix. */
export function extractedFine(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).trim().replace(/^\$\s*/, "").replace(/,/g, "");
  return /^\d+(?:\.\d{1,2})?$/.test(text) && Number(text) > 0 && Number(text) <= 1_000_000 ? text : "";
}

export function extractAssessmentBasics(data: Record<string, unknown>) {
  const description = [data.violation, data.offenceDescription, data.offenseDescription]
    .filter((value): value is string => typeof value === "string").join(" ").trim();
  let offence: AssessmentOffence | "" = "";
  if (/distracted/i.test(description)) offence = "distractedDriving";
  else if (/careless/i.test(description)) offence = "majorOffence";
  else if (/red light|stop sign|fail.*(?:stop|yield)/i.test(description)) offence = "failToYield";
  // An unqualified 'speeding' scan cannot tell us which speed band to use.
  else if (/speed/i.test(description)) {
    const band = /\b(\d+)\s*(?:[-–]\s*(\d+)|\+)?\s*(?:km\/?h)?\s*over/i.exec(description);
    if (band) offence = Number(band[2] || band[1]) >= 30 ? "highSpeeding" : "lowSpeeding";
  }
  const rawDemerits = data.demerits ?? data.demeritPoints;
  const demerits = (typeof rawDemerits === "number" || typeof rawDemerits === "string")
    && /^\d+$/.test(String(rawDemerits)) && Number(rawDemerits) <= 15 ? String(rawDemerits) : "";
  const ticketType = detectTicketType(data);
  if (ticketType === "photo_radar") {
    if (/red[ -]light/i.test(description)) offence = "failToYield";
    else if (/speed|photo[ -]radar/i.test(description)) offence = "lowSpeeding";
    else offence = "";
  }
  return { offence, description, fineAmount: extractedFine(data.fineAmount ?? data.fine), demerits, ticketType };
}
