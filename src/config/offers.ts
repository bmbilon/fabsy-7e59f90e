import offerData from "./offers.json";

export const RAPID_RESOLUTION = offerData.rapidResolution;
export const INSURANCE_IMPACT_REPORT = offerData.insuranceReport;
export const RAPID_RESOLUTION_BUNDLE = offerData.bundle;
export const CANONICAL_OFFER_PRICING = offerData.canonicalPricingCopy;

export const RAPID_RESOLUTION_PRICE_LABEL = `$${RAPID_RESOLUTION.priceCad} CAD ${RAPID_RESOLUTION.taxTreatment}`;
export const INSURANCE_REPORT_PRICE_LABEL = `$${INSURANCE_IMPACT_REPORT.priceCad} CAD ${INSURANCE_IMPACT_REPORT.taxTreatment}`;
export const BUNDLE_PRICE_LABEL = `$${RAPID_RESOLUTION_BUNDLE.priceCad} CAD ${RAPID_RESOLUTION_BUNDLE.taxTreatment}`;
