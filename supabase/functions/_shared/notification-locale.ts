import { LOCALE_NAMES, parsePreferredLocale, type PreferredLocale } from "./locale-policy.ts";

export type NotificationTemplate =
  | "ticket_received"
  | "assessment_paid"
  | "assessment_result"
  | "report_access"
  | "report_ready"
  | "case_update"
  | "renewal_reminder"
  | "contact_received"
  | "lead_received";

export interface NotificationLocaleContext {
  preferredLocale: unknown;
  template: NotificationTemplate;
}

/**
 * Machine drafts are deliberately not imported here. The frontend service
 * release switch must never turn a draft notification into a client promise.
 * A future localized renderer must verify the shared source/bundle fingerprints
 * and native/legal review evidence before replacing this English-only policy.
 */
export function notificationLocale(context: NotificationLocaleContext) {
  const preferredLocale = parsePreferredLocale(context.preferredLocale);
  return {
    preferred_locale: preferredLocale,
    delivery_locale: "en" as const,
    template: context.template,
    source_version: "rapid-resolution-2026-08-30",
    fallback_reason: preferredLocale === "en" ? null : "translation_not_reviewed" as const,
  };
}

function englishFallbackNotice(locale: PreferredLocale): string {
  return locale === "en" ? "" : `You selected ${LOCALE_NAMES[locale]}. This update is in English because an approved translation is not yet available. Your language preference has been recorded.`;
}

export function prepareClientEmail<T extends { subject: string; html: string; headers?: Record<string, string> }>(
  english: T,
  context: NotificationLocaleContext,
): T & { headers: Record<string, string> } {
  const selected = notificationLocale(context);
  const notice = englishFallbackNotice(selected.preferred_locale);
  const banner = notice ? `<p lang="en" dir="ltr" style="padding:12px;background:#f1f5f9;color:#334155;font-family:Arial,sans-serif;font-size:14px">${notice}</p>` : "";
  // Preserve complete HTML documents; do not nest a doctype/html inside a div.
  const html = /<body\b[^>]*>/i.test(english.html)
    ? english.html.replace(/<html\b([^>]*)>/i, (_match, attributes: string) => {
      const preserved = attributes.replace(/\s+(?:lang|dir)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
      return `<html lang="en" dir="ltr"${preserved}>`;
    }).replace(/(<body\b[^>]*>)/i, `$1${banner}`)
    : `<div lang="en" dir="ltr">${banner}${english.html}</div>`;
  return {
    ...english,
    html,
    headers: {
      ...english.headers,
      "Content-Language": selected.delivery_locale,
      "X-Fabsy-Preferred-Locale": selected.preferred_locale,
      "X-Fabsy-Notification-Template": selected.template,
      "X-Fabsy-Notification-Version": selected.source_version,
      ...(selected.fallback_reason ? { "X-Fabsy-Language-Fallback": selected.fallback_reason } : {}),
    },
  };
}

export function prepareClientSms(english: string, context: NotificationLocaleContext): string {
  const selected = notificationLocale(context);
  if (!selected.fallback_reason) return english;
  return `${english} English update; your ${LOCALE_NAMES[selected.preferred_locale]} preference is recorded.`;
}
