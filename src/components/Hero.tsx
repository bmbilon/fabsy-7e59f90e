import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  FileSearch,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const trustPoints = [
  { icon: ShieldCheck, label: "Secure digital intake" },
  { icon: FileSearch, label: "Disclosure requested and tracked" },
  { icon: Clock3, label: "48-hour Fabsy action commitment" },
  { icon: BellRing, label: "Updates as your file changes" },
] as const;

const includedHighlights = [
  "Ticket upload and digital authorization",
  "Disclosure request, tracking, and analysis",
  "Fact-specific prosecutor-review submission",
  "Plain-language Crown response comparison",
  "Client-directed acceptance of an available resolution",
] as const;

const Hero = () => (
  <section className="relative overflow-hidden bg-gradient-hero text-white">
    <div className="container relative z-10 mx-auto px-4 py-16 sm:py-20 lg:py-24">
      <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-14">
        <div>
          <div className="inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-4 py-1.5">
            <span className="text-xs font-bold tracking-wide text-primary-light">
              Rapid Resolution · Alberta traffic tickets
            </span>
          </div>

          <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Your ticket, handled through one fast, connected process.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-200 sm:text-xl">
            Upload your ticket and authorize Fabsy online. We request disclosure, analyze it,
            advance an authorized prosecutor review, and keep you informed along the way.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="min-h-12 bg-primary px-7 text-base font-bold text-white hover:bg-primary-dark"
            >
              <Link
                to={RAPID_RESOLUTION.intakePath}
                onClick={() =>
                  trackAssessmentEvent(
                    "assessment_cta_click",
                    {
                      location: "homepage_hero",
                      destination: "rapid_resolution_intake",
                      value: RAPID_RESOLUTION.priceCad,
                    },
                    "homepage_hero",
                  )
                }
              >
                Start Rapid Resolution
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-12 border-white/30 bg-transparent px-7 text-base font-bold text-white hover:bg-primary/20 hover:text-white"
            >
              <Link to={RAPID_RESOLUTION.slug}>View everything included</Link>
            </Button>
          </div>

          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-300">
            ${RAPID_RESOLUTION.priceCad} CAD plus applicable GST for eligible Alberta pre-trial
            matters. Trial representation is separate. No outcome is promised.
          </p>
        </div>

        <Card className="overflow-hidden border-white/15 bg-white text-slate-950 shadow-2xl">
          <div className="border-b bg-primary/5 p-7 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Rapid Resolution</p>
                <p className="mt-2 text-sm text-slate-600">One flat pre-trial service fee</p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold">${RAPID_RESOLUTION.priceCad}</p>
                <p className="text-xs text-slate-500">CAD + GST</p>
              </div>
            </div>
          </div>

          <div className="p-7 sm:p-8">
            <ul className="space-y-4 text-sm text-slate-700">
              {includedHighlights.map((label) => (
                <li key={label} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>

            <Button asChild className="mt-6 min-h-11 w-full font-bold">
              <Link to={RAPID_RESOLUTION.intakePath}>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                Upload your ticket
              </Link>
            </Button>

            <div className="my-6 border-t" />
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Add insurance planning</p>
            <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold">{RAPID_RESOLUTION_BUNDLE.shortName}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    Rapid Resolution plus the {INSURANCE_IMPACT_REPORT.shortName}.
                  </p>
                </div>
                <p className="shrink-0 text-xl font-bold text-primary">${RAPID_RESOLUTION_BUNDLE.priceCad}</p>
              </div>
              <Link to={INSURANCE_IMPACT_REPORT.slug} className="mt-3 inline-flex items-center text-xs font-bold text-primary hover:underline">
                Compare the ${INSURANCE_IMPACT_REPORT.priceCad} report
                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-4 sm:p-5">
        {trustPoints.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5 text-sm font-semibold text-slate-100">
            <Icon className="h-5 w-5 shrink-0 text-primary-light" aria-hidden="true" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Hero;
