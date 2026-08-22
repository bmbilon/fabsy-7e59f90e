import { ArrowRight, Phone } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const PHONE_DISPLAY = "(825) 793-2279";
const PHONE_HREF = "tel:+18257932279";

/**
 * Sticky tap-to-call bar shown only on mobile, fixed to the bottom of the viewport
 * so the phone number is always one tap away.
 */
const CallBar = () => {
  const location = useLocation();
  if (location.pathname === TICKET_ASSESSMENT.intakePath || location.pathname === TICKET_ASSESSMENT.confirmationPath) {
    return null;
  }

  const showAssessmentCta = location.pathname === "/" || location.pathname === TICKET_ASSESSMENT.slug;

  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 z-40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-sm border-t border-muted shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      {showAssessmentCta ? (
        <Link
          to={TICKET_ASSESSMENT.intakePath}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-button py-3 font-semibold text-white shadow-glow transition-smooth hover:opacity-90"
          onClick={() => trackAssessmentEvent(
            "assessment_cta_click",
            { location: "mobile_sticky_bar", destination: "assessment_intake", value: TICKET_ASSESSMENT.priceCad },
            `mobile_sticky_bar:${location.pathname}`,
          )}
        >
          {TICKET_ASSESSMENT.cta}
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      ) : (
        <a
          href={PHONE_HREF}
          aria-label={`Call Fabsy at ${PHONE_DISPLAY}`}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-button py-3 font-semibold text-white shadow-glow transition-smooth hover:opacity-90"
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
          Call {PHONE_DISPLAY}
        </a>
      )}
    </div>
  );
};

export default CallBar;
