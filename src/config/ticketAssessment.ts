export const TICKET_ASSESSMENT = {
  slug: "/traffic-ticket-assessment",
  intakePath: "/traffic-ticket-assessment/start",
  confirmationPath: "/traffic-ticket-assessment/confirmation",
  name: "Ticket Triage",
  shortName: "Ticket Triage",
  priceCad: 149,
  priceCents: 14_900,
  albertaGstCad: 7.45,
  albertaTotalCad: 156.45,
  currency: "CAD",
  priceIncludesApplicableTax: false,
  heroHeadline: "Got a traffic ticket and don't know what to do?",
  heroSubheadline:
    "For $149 CAD plus GST, Ticket Triage gives you a human-reviewed Alberta ticket and insurance assessment, priority placement in our representation queue, and a $149 credit if you upgrade.",
  cta: "Start My Ticket Triage",
  offerVariant: "ticket_triage_149_v1",
  supportedJurisdictions: ["Alberta"] as const,
  deliveryExpectation:
    "A Fabsy team member will complete a human review and email your assessment. If a response deadline is close, contact us after submitting.",
  representationCredit: {
    enabled: true,
    amountCad: 149,
    upgradeBalanceCad: 339,
    publicCopy:
      "If you upgrade the same eligible matter to Fabsy's $488 representation service, your $149 Ticket Triage fee is applied to the flat fee, leaving a $339 base-fee balance plus GST. The 30% success fee on any fine reduction still applies.",
  },
  representationPriority: {
    enabled: true,
    publicCopy:
      "Ticket Triage clients receive priority placement in Fabsy's representation queue if they upgrade and the matter is eligible for Fabsy representation. Priority placement does not extend a ticket deadline or guarantee a specific start date or outcome.",
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
