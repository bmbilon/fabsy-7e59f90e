import type { FormData } from "@/components/TicketForm";

export const initialFormData: FormData = {
  // Unified intake handoff
  sourceAssessmentId: "",
  sourceAssessmentAccessToken: "",

  // Personal Information
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  albertaConfirmed: false,
  contactPermission: false,
  smsOptIn: false,
  address: "",
  city: "",
  province: "",
  postalCode: "",
  dateOfBirth: undefined,
  driversLicense: "",
  driversLicenseImage: null,
  licenceClass: "unknown",
  addressDifferentFromLicense: false,
  referral: null,

  // Ticket Details
  ticketType: "officer_issued",
  ticketTypeSource: "default",
  registeredOwnerOnOffenceDate: "",
  ticketNumber: "",
  plateNumber: "",
  issueDate: undefined,
  ticketDateManuallyEdited: false,
  location: "",
  officer: "",
  officerBadge: "",
  offenceSection: "",
  offenceSubSection: "",
  offenceDescription: "",
  violation: "",
  fineAmount: "",
  courtDate: undefined,
  courtJurisdiction: "",
  agentRepresentationPermitted: null,
  ticketImage: null,
  vehicleSeized: false,

  // Defense Information
  pleaType: "",
  explanation: "",
  circumstances: "",
  witnesses: false,
  witnessDetails: "",
  evidence: false,
  evidenceDetails: "",
  priorTickets: "none",

  // Consent Information
  consentGiven: false,
  digitalSignature: "",

  // Additional Info
  insuranceCompany: "",
  vehicleDetails: "",
  additionalNotes: ""
};
