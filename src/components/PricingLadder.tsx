import { Link } from "react-router-dom";
import { PHOTO_RADAR, RAPID_RESOLUTION, RAPID_RESOLUTION_BUNDLE } from "@/config/offers";

export default function PricingLadder() {
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm leading-relaxed" aria-label="Fabsy pricing ladder, paid prices in Canadian dollars plus GST">
      <Link to="/free-ticket-check" className="underline underline-offset-2">Free Ticket Check</Link>
      <span aria-hidden="true">/</span>
      <Link to={PHOTO_RADAR.slug} className="underline underline-offset-2">Photo Radar ${PHOTO_RADAR.priceCad}</Link>
      <span aria-hidden="true">/</span>
      <Link to={RAPID_RESOLUTION.slug} className="underline underline-offset-2">Rapid Resolution ${RAPID_RESOLUTION.priceCad}</Link>
      <span aria-hidden="true">/</span>
      <Link to={`${RAPID_RESOLUTION.intakePath}?bundle=1`} className="underline underline-offset-2">Bundle ${RAPID_RESOLUTION_BUNDLE.priceCad}</Link>
      <span aria-hidden="true">/</span>
      <Link to="/contact" className="underline underline-offset-2">Trial representation quoted</Link>
      </p>
      <p className="text-center text-sm leading-relaxed">
        <Link to="/pro-drivers" className="font-semibold underline underline-offset-2">Class 1, 2 or 4 licence? 20% off</Link>
        <span className="mt-1 block text-xs">Verified Alberta licence. Officer-issued tickets only.</span>
      </p>
    </div>
  );
}
