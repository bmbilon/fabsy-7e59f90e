import { INSURANCE_IMPACT_REPORT, RAPID_RESOLUTION_BUNDLE } from "@/config/offers";

export const IDR_PRICE_STANDALONE = INSURANCE_IMPACT_REPORT.priceCad;
export const IDR_PRICE_ADDON = RAPID_RESOLUTION_BUNDLE.reportAddOnCad;
export const ABSTRACT_SELF_ORDER = true as const;

export const IDR_REPORT_VERSION = "1.0.0" as const;
export const IDR_CONVICTION_AGING_YEARS = 3 as const;
export const IDR_MIN_CARRIERS_TO_CALL = 3 as const;
export const IDR_MAX_CARRIERS_TO_CALL = 5 as const;
export const IDR_INSURER_RULE_MAX_AGE_DAYS = 365 as const;

export const IDR_DISCLAIMER =
  INSURANCE_IMPACT_REPORT.disclaimer;
