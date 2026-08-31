/** Stable API locale identifiers. A preference is not a claim about the language of free text. */
export const SUPPORTED_LOCALES = ["en", "pa", "tl", "zh-hans", "zh-hant", "ar", "hi", "es"] as const;
export type PreferredLocale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_NAMES: Record<PreferredLocale, string> = {
  en: "English",
  pa: "Punjabi",
  tl: "Tagalog",
  "zh-hans": "Simplified Chinese",
  "zh-hant": "Traditional Chinese",
  ar: "Arabic",
  hi: "Hindi",
  es: "Spanish",
};

export class LocaleRequestError extends Error {
  constructor(message: string, public status = 400, public code = "invalid_preferred_locale") {
    super(message);
    this.name = "LocaleRequestError";
  }
}

export function parsePreferredLocale(value: unknown): PreferredLocale {
  // Older clients omit this property. Null, aliases and arbitrary browser tags
  // are not accepted as an implicit language selection.
  if (value === undefined) return "en";
  if (typeof value === "string" && SUPPORTED_LOCALES.some((locale) => locale === value)) {
    return value as PreferredLocale;
  }
  throw new LocaleRequestError("preferred_locale must be one of en, pa, tl, zh-hans, zh-hant, ar, hi or es.");
}

/**
 * FABSY_LIVE_SERVICE_LOCALES is an operator-controlled release allowlist, not
 * evidence of human translation review or a staffed native-language channel.
 * The legacy reviewed-locale flag is used only when the live flag is absent.
 * An explicitly empty live flag closes non-English intake even if the legacy
 * flag still contains codes. Neither flag approves outgoing translations.
 */
export function requireReleasedServiceLocale(
  locale: PreferredLocale,
  liveLocales: string | undefined,
  legacyReviewedLocales?: string,
): void {
  if (locale === "en") return;
  const released = (liveLocales ?? legacyReviewedLocales ?? "").split(",").map((value) => value.trim());
  if (released.includes(locale)) return;
  throw new LocaleRequestError(
    `${LOCALE_NAMES[locale]} intake is not currently enabled. Please use the English form or contact Fabsy.`,
    409,
    "locale_not_released",
  );
}

/** Only call for public surfaces that actually have a localized route. */
export function localizedPublicPath(locale: PreferredLocale, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) {
    throw new Error("A local absolute route is required.");
  }
  return locale === "en" ? path : `/${locale}${path}`;
}
