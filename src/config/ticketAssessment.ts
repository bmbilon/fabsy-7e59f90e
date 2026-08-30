export const TICKET_ASSESSMENT = {
  slug: "/traffic-ticket-assessment",
  intakePath: "/traffic-ticket-assessment/start",
  confirmationPath: "/traffic-ticket-assessment/confirmation",
  name: "Priority Ticket Review",
  descriptor: "Legacy Human-Reviewed Ticket Assessment",
  displayName: "Legacy Priority Ticket Review",
  shortName: "Legacy Priority Review",
  internalName: "Ticket Triage",
  priceCad: 149,
  priceCents: 14_900,
  albertaSubtotalCad: 141.9,
  albertaGstCad: 7.1,
  albertaTotalCad: 149,
  currency: "CAD",
  priceIncludesApplicableTax: true,
  heroHeadline: "Legacy Ticket Triage order",
  heroSubheadline:
    "This retired $149 CAD product is retained only to support historical receipts and assessment records. New ticket matters use Rapid Resolution.",
  cta: "View legacy order",
  offerVariant: "legacy_ticket_review_149",
  supportedJurisdictions: ["Alberta"] as const,
  deliveryExpectation:
    "A Fabsy team member will complete a human review and email your assessment. If a response deadline is close, contact us after submitting.",
  representationCredit: {
    enabled: false,
    amountCad: 0,
    upgradeBalanceCad: 198,
    publicCopy:
      "Historical credit metadata is retained for recordkeeping only and does not create an automatic credit toward Rapid Resolution.",
  },
  representationPriority: {
    enabled: true,
    publicCopy:
      "Historical priority metadata does not extend a ticket deadline or promise acceptance, timing, or an outcome.",
  },
  insuranceDisclaimer:
    "Insurance treatment varies by insurer, driving history, jurisdiction, renewal timing and other underwriting factors. This legacy assessment is not an insurer quote and does not predict a specific premium change.",
  serviceDisclaimer:
    "Fabsy is an Alberta traffic ticket agent service, not a law firm. This retired assessment product does not promise a reduction, withdrawal, insurance saving or any other result.",
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
