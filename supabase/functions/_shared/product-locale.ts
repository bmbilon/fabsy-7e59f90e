import { LocaleRequestError, type PreferredLocale } from "./locale-policy.ts";

/**
 * This launch adds English terms for these products only. The general LIVE
 * locale allowlist still applies to ordinary officer/report services, and is
 * not approval of the new product terms. Call with the authorized stored locale
 * whenever an order already exists; browser overrides cannot release a product.
 */
export function requireEnglishProductLocale(
  locale: PreferredLocale,
  product: "pro_driver" | "photo_radar",
): void {
  if (locale === "en") return;
  const name = product === "pro_driver" ? "Pro Driver verification and discounts" : "Photo Radar Resolution";
  throw new LocaleRequestError(
    `${name} is currently available only through the English intake and terms. Return to the English form and review and sign those terms before continuing.`,
    409,
    "product_locale_not_released",
  );
}
