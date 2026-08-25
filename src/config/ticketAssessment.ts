export const TICKET_ASSESSMENT = {
  slug: "/traffic-ticket-assessment",
  intakePath: "/traffic-ticket-assessment/start",
  confirmationPath: "/traffic-ticket-assessment/confirmation",
  name: "Priority Ticket Review",
  descriptor: "Fast Human-Reviewed Ticket, Insurance Impact + Dispute Plan",
  displayName: "Priority Ticket Review: Ticket, Insurance Impact + Initial Dispute Plan",
  shortName: "Priority Review",
  internalName: "Ticket Triage",
  priceCad: 149,
  priceCents: 14_900,
  albertaSubtotalCad: 141.9,
  albertaGstCad: 7.1,
  albertaTotalCad: 149,
  currency: "CAD",
  priceIncludesApplicableTax: true,
  heroHeadline: "Get a fast report on your ticket before you decide what to do",
  heroSubheadline:
    "For $149 CAD total, Fabsy reviews your ticket and policy documents, models likely insurance-cost scenarios, and delivers an initial dispute plan and recommended next step.",
  cta: "Get Priority Review - $149",
  offerVariant: "priority_ticket_review_149_v4",
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
  "image/heic",
  "image/heif",
] as const;

export const ASSESSMENT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
