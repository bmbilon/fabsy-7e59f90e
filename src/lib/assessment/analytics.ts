import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";

type AssessmentEvent =
  | "assessment_offer_view"
  | "assessment_start"
  | "ticket_upload_started"
  | "ticket_upload_completed"
  | "intake_completed"
  | "checkout_started"
  | "assessment_purchase"
  | "checkout_abandoned"
  | "representation_cta_view"
  | "representation_cta_click";

const ATTRIBUTION_KEYS = [
  "gclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

function storedAttribution(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(window.localStorage.getItem("fabsy_marketing") || "{}") as Record<string, unknown>;
    return ATTRIBUTION_KEYS.reduce<Record<string, string>>((safe, key) => {
      if (typeof stored[key] === "string" && stored[key]) safe[key] = stored[key] as string;
      return safe;
    }, {});
  } catch {
    return {};
  }
}

export function assessmentAttribution() {
  return storedAttribution();
}

export function trackAssessmentEvent(
  event: AssessmentEvent,
  parameters: Record<string, string | number | boolean | undefined> = {},
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", event, {
    page_path: window.location.pathname,
    offer_variant: TICKET_ASSESSMENT.offerVariant,
    currency: TICKET_ASSESSMENT.currency,
    ...storedAttribution(),
    ...parameters,
  });
}
