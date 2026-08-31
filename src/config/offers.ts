import offerData from "./offers.json";

export const RAPID_RESOLUTION = offerData.rapidResolution;
export const INSURANCE_IMPACT_REPORT = offerData.insuranceReport;
export const RAPID_RESOLUTION_BUNDLE = offerData.bundle;
export const CANONICAL_OFFER_PRICING = offerData.canonicalPricingCopy;
export const PRO_DRIVER_PROMOTION = offerData.proDriverPromotion;
export const PRO_DRIVER_SAVINGS_CENTS = Math.round(RAPID_RESOLUTION.priceCents * PRO_DRIVER_PROMOTION.percentOff / 100);
export const PRO_DRIVER_PRICE_CENTS = RAPID_RESOLUTION.priceCents - PRO_DRIVER_SAVINGS_CENTS;
export const PRO_DRIVER_PRICE_CAD = PRO_DRIVER_PRICE_CENTS / 100;
export const PRO_DRIVER_BUNDLE_PRICE_CENTS = RAPID_RESOLUTION_BUNDLE.priceCents - Math.round(RAPID_RESOLUTION_BUNDLE.priceCents * PRO_DRIVER_PROMOTION.percentOff / 100);

export const RAPID_RESOLUTION_PRICE_LABEL = `$${RAPID_RESOLUTION.priceCad} CAD ${RAPID_RESOLUTION.taxTreatment}`;
export const INSURANCE_REPORT_PRICE_LABEL = `$${INSURANCE_IMPACT_REPORT.priceCad} CAD ${INSURANCE_IMPACT_REPORT.taxTreatment}`;
export const BUNDLE_PRICE_LABEL = `$${RAPID_RESOLUTION_BUNDLE.priceCad} CAD ${RAPID_RESOLUTION_BUNDLE.taxTreatment}`;
