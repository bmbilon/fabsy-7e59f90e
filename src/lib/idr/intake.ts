import type { AlbertaGridDataset } from "./types";

export type IdrTicketScenarioMode = "listed" | "projected";

export interface IdrClientIntake {
  schema_version: 1;
  ticket: {
    ticket_number?: string;
    offence: string;
    section?: string;
    occurrence_date?: string;
    issue_date?: string;
    location?: string;
    scenario_mode: IdrTicketScenarioMode;
  };
  policy_renewal_date: string;
  rating_inputs: {
    annual_premium_cents?: number;
    grid_step: number;
    territory_code: string;
    liability_limit_cents: number;
    criminal_convictions: number;
    at_fault_claims: number;
  };
  source_acknowledgement: true;
}

export interface IdrClientIntakeDraft {
  ticketNumber: string;
  offence: string;
  section: string;
  occurrenceDate: string;
  issueDate: string;
  location: string;
  scenarioMode: IdrTicketScenarioMode;
  policyRenewalDate: string;
  annualPremium: string;
  gridStep: string;
  territoryCode: string;
  liabilityLimitCents: string;
  criminalConvictions: string;
  atFaultClaims: string;
  sourceAcknowledgement: boolean;
}

export const EMPTY_IDR_CLIENT_INTAKE: IdrClientIntakeDraft = {
  ticketNumber: "",
  offence: "",
  section: "",
  occurrenceDate: "",
  issueDate: "",
  location: "",
  scenarioMode: "projected",
  policyRenewalDate: "",
  annualPremium: "",
  gridStep: "",
  territoryCode: "",
  liabilityLimitCents: "",
  criminalConvictions: "0",
  atFaultClaims: "0",
  sourceAcknowledgement: false,
};

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function optionalTrimmed(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function intakeDraftFromStored(value: IdrClientIntake | null | undefined): IdrClientIntakeDraft {
  if (!value || value.schema_version !== 1) return { ...EMPTY_IDR_CLIENT_INTAKE };
  return {
    ticketNumber: value.ticket.ticket_number || "",
    offence: value.ticket.offence || "",
    section: value.ticket.section || "",
    occurrenceDate: value.ticket.occurrence_date || "",
    issueDate: value.ticket.issue_date || "",
    location: value.ticket.location || "",
    scenarioMode: value.ticket.scenario_mode || "projected",
    policyRenewalDate: value.policy_renewal_date || "",
    annualPremium: value.rating_inputs.annual_premium_cents === undefined
      ? ""
      : (value.rating_inputs.annual_premium_cents / 100).toFixed(2),
    gridStep: String(value.rating_inputs.grid_step),
    territoryCode: value.rating_inputs.territory_code,
    liabilityLimitCents: String(value.rating_inputs.liability_limit_cents),
    criminalConvictions: String(value.rating_inputs.criminal_convictions),
    atFaultClaims: String(value.rating_inputs.at_fault_claims),
    sourceAcknowledgement: value.source_acknowledgement === true,
  };
}

export function buildIdrClientIntake(
  draft: IdrClientIntakeDraft,
  gridDataset: AlbertaGridDataset,
): { intake: IdrClientIntake | null; error: string | null } {
  const offence = draft.offence.trim();
  if (!offence) return { intake: null, error: "Enter the offence shown on the current ticket." };
  if (offence.length > 200) return { intake: null, error: "Keep the ticket offence under 200 characters." };
  if (!validIsoDate(draft.policyRenewalDate)) {
    return { intake: null, error: "Enter a valid policy renewal date." };
  }
  for (const [label, value] of [
    ["occurrence", draft.occurrenceDate],
    ["issue", draft.issueDate],
  ] as const) {
    if (value && !validIsoDate(value)) {
      return { intake: null, error: `Enter a valid ticket ${label} date.` };
    }
  }

  const annualPremiumDollars = draft.annualPremium.trim() ? Number(draft.annualPremium) : null;
  if (
    annualPremiumDollars !== null &&
    (!Number.isFinite(annualPremiumDollars) || annualPremiumDollars <= 0 || annualPremiumDollars > 1_000_000)
  ) {
    return { intake: null, error: "Enter a valid annual premium, or leave it blank." };
  }

  if (!draft.gridStep.trim()) {
    return { intake: null, error: "Enter the Alberta Grid step shown on the policy records." };
  }
  if (!draft.criminalConvictions.trim()) {
    return { intake: null, error: "Enter the criminal conviction count shown on the policy records." };
  }
  if (!draft.atFaultClaims.trim()) {
    return { intake: null, error: "Enter the at-fault claim count shown on the policy records." };
  }

  const gridStep = Number(draft.gridStep);
  const liabilityLimitCents = Number(draft.liabilityLimitCents);
  const criminalConvictions = Number(draft.criminalConvictions);
  const atFaultClaims = Number(draft.atFaultClaims);
  const gridStepIsSupported = Number.isInteger(gridStep) && (
    gridDataset.gridStepDifferentials.bands.some(
      (band) => gridStep >= band.minimum && gridStep <= band.maximum,
    ) || (
      gridDataset.gridStepDifferentials.overflow !== undefined &&
      gridStep >= gridDataset.gridStepDifferentials.overflow.from &&
      gridStep <= 100
    )
  );
  if (!gridStepIsSupported) {
    return { intake: null, error: "Enter a supported whole-number Alberta Grid step." };
  }
  if (!gridDataset.territoryDifferentials.some((row) => row.code === draft.territoryCode)) {
    return { intake: null, error: "Choose the Alberta Grid territory for the policy." };
  }
  if (!gridDataset.liabilityLimitDifferentials.some((row) => row.limitCents === liabilityLimitCents)) {
    return { intake: null, error: "Choose the policy's third-party liability limit." };
  }
  if (!Number.isInteger(criminalConvictions) || criminalConvictions < 0 || criminalConvictions > 99) {
    return { intake: null, error: "Enter a criminal conviction count from 0 to 99." };
  }
  if (!Number.isInteger(atFaultClaims) || atFaultClaims < 0 || atFaultClaims > 99) {
    return { intake: null, error: "Enter an at-fault claim count from 0 to 99." };
  }
  if (!draft.sourceAcknowledgement) {
    return { intake: null, error: "Confirm that these details came from your ticket and policy records." };
  }

  const optionalStrings = [draft.ticketNumber, draft.section, draft.location];
  if (optionalStrings.some((value) => value.trim().length > 200)) {
    return { intake: null, error: "Keep each ticket detail under 200 characters." };
  }

  return {
    error: null,
    intake: {
      schema_version: 1,
      ticket: {
        ...(optionalTrimmed(draft.ticketNumber) ? { ticket_number: optionalTrimmed(draft.ticketNumber) } : {}),
        offence,
        ...(optionalTrimmed(draft.section) ? { section: optionalTrimmed(draft.section) } : {}),
        ...(draft.occurrenceDate ? { occurrence_date: draft.occurrenceDate } : {}),
        ...(draft.issueDate ? { issue_date: draft.issueDate } : {}),
        ...(optionalTrimmed(draft.location) ? { location: optionalTrimmed(draft.location) } : {}),
        scenario_mode: draft.scenarioMode,
      },
      policy_renewal_date: draft.policyRenewalDate,
      rating_inputs: {
        ...(annualPremiumDollars === null
          ? {}
          : { annual_premium_cents: Math.round(annualPremiumDollars * 100) }),
        grid_step: gridStep,
        territory_code: draft.territoryCode,
        liability_limit_cents: liabilityLimitCents,
        criminal_convictions: criminalConvictions,
        at_fault_claims: atFaultClaims,
      },
      source_acknowledgement: true,
    },
  };
}
