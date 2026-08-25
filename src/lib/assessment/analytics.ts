import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { readMarketingAttribution } from "@/lib/marketingAttribution";

type AssessmentEvent =
  | "assessment_offer_view"
  | "assessment_cta_click"
  | "assessment_start"
  | "ticket_upload_started"
  | "ticket_upload_completed"
  | "intake_completed"
  | "checkout_started"
  | "begin_checkout"
  | "assessment_purchase"
  | "purchase"
  | "checkout_abandoned"
  | "representation_cta_view"
  | "representation_cta_click"
  | "free_ticket_review_completed"
  | "representation_selected";

export function assessmentAttribution() {
  return readMarketingAttribution();
}

export function trackAssessmentEvent(
  event: AssessmentEvent,
  parameters: Record<string, unknown> = {},
  onceKey?: string,
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  const storageKey = onceKey ? `fabsy-assessment-event:${event}:${onceKey}` : null;
  if (storageKey) {
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
    } catch {
      // Analytics should continue when browser storage is unavailable.
    }
  }

  window.gtag("event", event, {
    page_path: window.location.pathname,
    offer_variant: TICKET_ASSESSMENT.offerVariant,
    currency: TICKET_ASSESSMENT.currency,
    ...readMarketingAttribution(),
    ...parameters,
  });

  if (storageKey) {
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // The event has already been sent; storage failure must not affect the flow.
    }
  }
}
