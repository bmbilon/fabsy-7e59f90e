export const TICKET_ASSESSMENT = {
  slug: "/traffic-ticket-assessment",
  intakePath: "/traffic-ticket-assessment/start",
  confirmationPath: "/traffic-ticket-assessment/confirmation",
  name: "Ticket Triage",
  descriptor: "Human-Reviewed Traffic Ticket + Insurance Impact Assessment",
  displayName: "Ticket Triage: Human-Reviewed Traffic Ticket + Insurance Impact Assessment",
  shortName: "Ticket Triage",
  internalName: "Ticket Triage",
  priceCad: 149,
  priceCents: 14_900,
  albertaSubtotalCad: 141.9,
  albertaGstCad: 7.1,
  albertaTotalCad: 149,
  currency: "CAD",
  priceIncludesApplicableTax: true,
  heroHeadline: "Got a traffic ticket and don't know what to do?",
  heroSubheadline:
    "For $149, Fabsy will review your ticket, explain your options, assess the likely insurance impact and tell you whether fighting it is actually worth the money.",
  cta: "Get Ticket Triage - $149",
  offerVariant: "ticket_triage_149_v3",
  supportedJurisdictions: ["Alberta"] as const,
  deliveryExpectation:
    "A Fabsy team member will complete a human review and email your assessment. If a response deadline is close, contact us after submitting.",
  representationCredit: {
    enabled: true,
    amountCad: 149,
    upgradeBalanceCad: 339,
    publicCopy:
      "If representation is worthwhile and the same matter is eligible, your $149 assessment payment can be applied to Fabsy's $488 base representation fee, leaving a $339 base-fee balance plus applicable tax. The 30% success fee on any fine reduction still applies.",
  },
  representationPriority: {
    enabled: true,
    publicCopy:
      "Assessment clients receive priority placement in Fabsy's representation queue if they upgrade and the matter is eligible. Priority placement does not extend a ticket deadline or promise a specific start date or outcome.",
  },
  insuranceDisclaimer:
    "Insurance treatment varies by insurer, driving history, jurisdiction, renewal timing and other underwriting factors. Fabsy's assessment estimates likely risk and financial significance; it is not a binding insurance quote and does not predict a specific premium change.",
  serviceDisclaimer:
    "Fabsy is an Alberta traffic ticket agent service, not a law firm. The assessment provides practical information and an agent-service recommendation; it does not promise a reduction, withdrawal, insurance saving or any other result.",
} as const;

export const ASSESSMENT_ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ASSESSMENT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
