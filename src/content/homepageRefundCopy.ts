import { FEE_REFUND } from "@/config/feeRefund";

// Homepage presentation of the published policy; eligibility and timing stay in FEE_REFUND.
export const HOMEPAGE_REFUND_COPY = {
  headline: FEE_REFUND.headline,
  heroSupport: "Fabsy negotiates for a lower fine, fewer demerits or withdrawal. No legal outcome is guaranteed.",
  outcomeQualification: "We can’t guarantee a court outcome. Our guarantee covers the service fee you paid.",
  refundCondition: FEE_REFUND.condition,
  successDefinition: "A reduction in the fine, the number of demerits, or both counts as an improvement over the original ticket. A withdrawal or dismissal also improves the original penalty. No minimum reduction is required.",
  declinedOfferDisclaimer: FEE_REFUND.declinedOfferText,
  paymentTiming: FEE_REFUND.payment,
  refundScope: `${FEE_REFUND.scope} The refund includes the corresponding GST. Any amount already refunded is deducted to avoid refunding the same payment twice. A standalone insurance report is not covered by this outcome-based guarantee. Trial representation, court charges and third-party costs are separate.`,
  termsPath: FEE_REFUND.termsPath,
} as const;
