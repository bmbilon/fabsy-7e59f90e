import source from "./proReferralContent.json";
import { RAPID_RESOLUTION, RAPID_RESOLUTION_BUNDLE } from "./offers";
import { PRO_DRIVER_BUNDLE_CENTS, PRO_DRIVER_DISCOUNT_PERCENT, PRO_DRIVER_RAPID_CENTS } from "./pro-drivers";

const values: Record<string, string> = {
  discountPercent: String(PRO_DRIVER_DISCOUNT_PERCENT),
  rapidPrice: (PRO_DRIVER_RAPID_CENTS / 100).toFixed(2),
  bundlePrice: (PRO_DRIVER_BUNDLE_CENTS / 100).toFixed(2),
  regularRapidPrice: String(RAPID_RESOLUTION.priceCad),
  regularBundlePrice: String(RAPID_RESOLUTION_BUNDLE.priceCad),
};

function interpolate<T>(value: T): T {
  if (typeof value === "string") return value.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => values[key] ?? `{${key}}`) as T;
  if (Array.isArray(value)) return value.map(interpolate) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, interpolate(child)])) as T;
  return value;
}

export const PRO_DRIVER_PUBLIC_CONTENT = interpolate(source.pro);
export const REFERRAL_PUBLIC_CONTENT = source.referral;
