import { ArrowRight, Phone } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { PHOTO_RADAR, RAPID_RESOLUTION } from "@/config/offers";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";
import { useLocale } from "@/i18n/locale-context";

const PHONE_DISPLAY = "(825) 793-2279";
const PHONE_HREF = "tel:+18257932279";

/**
 * Sticky tap-to-call bar shown only on mobile, fixed to the bottom of the viewport
 * so the phone number is always one tap away.
 */
const CallBar = () => {
  const location = useLocation();
  const { locale } = useLocale();
  // A translated page does not imply phone staffing in that language.
  if (locale !== "en") return null;
  if (location.pathname === RAPID_RESOLUTION.intakePath || location.pathname === "/traffic-ticket-assessment/confirmation") {
    return null;
  }

  const photoContext = location.pathname === PHOTO_RADAR.slug;
  const activeOffer = photoContext ? PHOTO_RADAR : RAPID_RESOLUTION;
  const showAssessmentCta = location.pathname === "/" || location.pathname === RAPID_RESOLUTION.slug || photoContext;

  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 z-40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-sm border-t border-muted shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      {showAssessmentCta ? (
        <Link
          to={activeOffer.intakePath}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-button py-3 font-semibold text-white shadow-glow transition-smooth hover:opacity-90"
          onClick={() => trackAssessmentEvent(
            "assessment_cta_click",
            { location: "mobile_sticky_bar", destination: photoContext ? "photo_radar_intake" : "rapid_resolution_intake", value: activeOffer.priceCad },
            `mobile_sticky_bar:${location.pathname}`,
          )}
        >
          Start {photoContext ? 'Photo Radar' : 'Rapid Resolution'} · ${activeOffer.priceCad}{photoContext ? ' + GST' : ''}
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
