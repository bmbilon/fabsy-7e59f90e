import offerData from "./offers.json";

export const PHOTO_RADAR = offerData.photoRadar;
export const RAPID_RESOLUTION = offerData.rapidResolution;
export const INSURANCE_IMPACT_REPORT = offerData.insuranceReport;
export const RAPID_RESOLUTION_BUNDLE = offerData.bundle;
export const CANONICAL_OFFER_PRICING = offerData.canonicalPricingCopy;
// Existing officer guides keep their reviewed officer-service wording.
export const OFFICER_OFFER_PRICING = `${RAPID_RESOLUTION.name} costs $${RAPID_RESOLUTION.priceCad} CAD plus applicable GST for eligible Alberta pre-trial matters. The ${INSURANCE_IMPACT_REPORT.name} costs $${INSURANCE_IMPACT_REPORT.priceCad} CAD plus applicable GST, or both products cost $${RAPID_RESOLUTION_BUNDLE.priceCad} CAD plus applicable GST. Trial representation, government fines and out-of-scope matters are separate.`;
export const PRO_DRIVER_PROMOTION = offerData.proDriverPromotion;
export const PRO_DRIVER_SAVINGS_CENTS = Math.round(RAPID_RESOLUTION.priceCents * PRO_DRIVER_PROMOTION.percentOff / 100);
export const PRO_DRIVER_PRICE_CENTS = RAPID_RESOLUTION.priceCents - PRO_DRIVER_SAVINGS_CENTS;
export const PRO_DRIVER_PRICE_CAD = PRO_DRIVER_PRICE_CENTS / 100;
export const PRO_DRIVER_BUNDLE_PRICE_CENTS = RAPID_RESOLUTION_BUNDLE.priceCents - Math.round(RAPID_RESOLUTION_BUNDLE.priceCents * PRO_DRIVER_PROMOTION.percentOff / 100);

export const PHOTO_RADAR_PRICE_LABEL = `$${PHOTO_RADAR.priceCad} + 5% GST ($${PHOTO_RADAR.totalCad.toFixed(2)} total)`;
export const PHOTO_RADAR_OFFER_PRICING = `${PHOTO_RADAR.name} costs $${PHOTO_RADAR.priceCad} CAD plus 5% GST ($${PHOTO_RADAR.totalCad.toFixed(2)} total). No trial. No success fee. Government fines are separate.`;
export const RAPID_RESOLUTION_PRICE_LABEL = `$${RAPID_RESOLUTION.priceCad} CAD ${RAPID_RESOLUTION.taxTreatment}`;
export const INSURANCE_REPORT_PRICE_LABEL = `$${INSURANCE_IMPACT_REPORT.priceCad} CAD ${INSURANCE_IMPACT_REPORT.taxTreatment}`;
export const BUNDLE_PRICE_LABEL = `$${RAPID_RESOLUTION_BUNDLE.priceCad} CAD ${RAPID_RESOLUTION_BUNDLE.taxTreatment}`;
