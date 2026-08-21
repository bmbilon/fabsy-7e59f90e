export const TICKET_ASSESSMENT = {
  slug: "/traffic-ticket-assessment",
  intakePath: "/traffic-ticket-assessment/start",
  confirmationPath: "/traffic-ticket-assessment/confirmation",
  name: "Traffic Ticket + Insurance Impact Assessment",
  shortName: "Ticket + Insurance Assessment",
  priceCad: 149,
  priceCents: 14_900,
  albertaGstCad: 7.45,
  albertaTotalCad: 156.45,
  currency: "CAD",
  priceIncludesApplicableTax: false,
  heroHeadline: "Got a traffic ticket and don't know what to do?",
  heroSubheadline:
    "For $149 CAD plus GST, Fabsy will review your Alberta ticket, explain your options, assess the likely insurance impact and tell you whether fighting it is actually worth the money.",
  cta: "Start My $149 Assessment",
  offerVariant: "baseline_149_v1",
  supportedJurisdictions: ["Alberta"] as const,
  deliveryExpectation:
    "A Fabsy team member will complete a human review and email your assessment. If a response deadline is close, contact us after submitting.",
  representationCredit: {
    enabled: false,
    amountCad: 149,
    publicCopy:
      "The assessment fee is not currently promised as a credit toward representation. If further help is worthwhile and your matter qualifies, Fabsy will explain the separate representation fee before you decide.",
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
