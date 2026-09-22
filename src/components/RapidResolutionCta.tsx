import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export const RAPID_INTAKE_PATH = "/submit-ticket?ticket_type=officer_issued&lp=rapid-resolution-alt";

/** The router opens a fresh private document before any ticket file is chosen. */
export default function RapidResolutionCta({ position = "section", id, className = "" }: {
  position?: "hero" | "header" | "sticky" | "section" | "footer";
  id?: string;
  className?: string;
}) {
  return <Link id={id} to={RAPID_INTAKE_PATH} data-funnel-action="primary_cta" data-funnel-position={position}
    className={`rapid-upload-cta inline-flex min-h-14 items-center justify-center gap-3 rounded-lg px-6 py-3 text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${className}`}>
    Upload your ticket <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
  </Link>;
}
