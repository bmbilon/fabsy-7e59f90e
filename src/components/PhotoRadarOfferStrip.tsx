import { Link } from "react-router-dom";
import { ArrowRight, Camera } from "lucide-react";
import { PHOTO_RADAR } from "@/config/offers";

export default function PhotoRadarOfferStrip() {
  return (
    <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-5 text-slate-900 sm:p-6">
      <Link to={PHOTO_RADAR.slug} className="flex flex-wrap items-center justify-between gap-4 font-semibold hover:text-violet-800">
        <span className="flex items-start gap-3">
          <Camera className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" aria-hidden="true" />
          <span>Photo radar or red-light camera notice? ${PHOTO_RADAR.priceCad} + GST, no success fee.</span>
        </span>
        <span className="inline-flex items-center gap-2 text-sm">Check eligibility <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
      </Link>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">The current demerit schedule assigns no points to an owner conviction under TSA s.160. Insurer treatment is not promised. You approve any deal.</p>
    </div>
  );
}
