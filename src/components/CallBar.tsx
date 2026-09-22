import { useEffect, useState } from "react";
import RapidResolutionCta from "./RapidResolutionCta";
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
  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    if (location.pathname !== "/rapid-resolution-alt") return;
    const hero = document.getElementById("rapid-hero-cta");
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting));
    observer.observe(hero);
    return () => observer.disconnect();
  }, [location.pathname]);
  if (location.pathname === "/rapid-resolution-alt" && heroVisible) return null;
  // A translated page does not imply phone staffing in that language.
  if (locale !== "en" || /^\/admin(?:\/|$)/.test(location.pathname)) return null;
  if (location.pathname === "/complete-ticket" || location.pathname.replace(/\/$/, "") === "/disclosure-approval" || location.pathname.startsWith("/pay/")) return null;
  if (location.pathname === RAPID_RESOLUTION.intakePath || location.pathname === "/traffic-ticket-assessment/confirmation") {
    return null;
  }

  const photoContext = location.pathname === PHOTO_RADAR.slug;
  const activeOffer = photoContext ? PHOTO_RADAR : RAPID_RESOLUTION;
  const showAssessmentCta = location.pathname === "/" || location.pathname === RAPID_RESOLUTION.slug || photoContext;
  const priceLabel = `$${activeOffer.priceCad} CAD + GST`;

  return (
    <div data-mobile-call-bar className="md:hidden fixed inset-x-0 bottom-0 z-40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-sm border-t border-muted shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      {location.pathname === "/rapid-resolution-alt" ? <RapidResolutionCta position="sticky" className="w-full" /> : location.pathname === "/" ? (
        <a
          href="#ticket-form-container"
          data-funnel-action="primary_cta"
          data-funnel-position="sticky"
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-3 text-base font-bold text-white shadow-glow transition-colors hover:bg-blue-800 hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          onClick={() => trackAssessmentEvent("assessment_cta_click", { location: "mobile_sticky_bar", destination: "homepage_ticket_intake" })}
        >
          Upload your ticket
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : showAssessmentCta ? (
        <Link
          to={activeOffer.intakePath}
          data-funnel-action="primary_cta"
          data-funnel-position="sticky"
          aria-label={`Start online for ${priceLabel}`}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-gradient-button px-3 py-2.5 text-center text-sm font-bold text-white shadow-glow transition-smooth hover:opacity-90"
          onClick={() => trackAssessmentEvent(
            "assessment_cta_click",
            { location: "mobile_sticky_bar", destination: photoContext ? "photo_radar_intake" : "rapid_resolution_intake", value: activeOffer.priceCad },
            `mobile_sticky_bar:${location.pathname}`,
          )}
        >
          Start online · {priceLabel}
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      ) : (
        <a
          href={PHONE_HREF}
          data-funnel-action="phone"
          data-funnel-position="sticky"
          aria-label={`Call Fabsy at ${PHONE_DISPLAY}`}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-gradient-button px-3 py-2.5 font-semibold text-white shadow-glow transition-smooth hover:opacity-90"
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
          Call {PHONE_DISPLAY}
        </a>
      )}
    </div>
  );
};

export default CallBar;
