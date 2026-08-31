import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import {
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";
import { cn } from "@/lib/utils";

export const PRODUCT_LADDER_BRIDGE =
  "Choose the ticket service, the insurance-planning report, or both. Every price is visible before you begin.";

const tiers = [
  {
    name: RAPID_RESOLUTION.name,
    price: `$${RAPID_RESOLUTION.priceCad}`,
    priceNote: "CAD · plus GST",
    sub: "Eligible Alberta pre-trial ticket service",
    highlight: true,
    cta: { label: "Start Rapid Resolution", href: RAPID_RESOLUTION.intakePath },
    features: [
      "Secure intake and digital authorization",
      "Disclosure request, tracking and analysis",
      "Fact-specific prosecutor-review submission",
      "Complete disclosure advanced within 48 hours",
      "Immediate status and decision notifications",
      "Trial separately quoted",
    ],
  },
  {
    name: INSURANCE_IMPACT_REPORT.name,
    price: `$${INSURANCE_IMPACT_REPORT.priceCad}`,
    priceNote: "CAD · plus GST",
    sub: "Source-backed insurance impact and renewal planning",
    highlight: false,
    cta: { label: "Get the insurance report", href: INSURANCE_IMPACT_REPORT.checkoutPath },
    features: [
      "Potential conviction-impact scenarios",
      "Conviction-aging and renewal timeline",
      "Public insurance research sources",
      "Questions to take to a licensed broker",
      "Not an insurer quote or coverage recommendation",
    ],
  },
  {
    name: RAPID_RESOLUTION_BUNDLE.name,
    price: `$${RAPID_RESOLUTION_BUNDLE.priceCad}`,
    priceNote: "CAD · plus GST",
    sub: "Handle the ticket and prepare for renewal",
    highlight: false,
    cta: { label: "Choose both", href: RAPID_RESOLUTION.intakePath },
    features: [
      "Everything in Rapid Resolution",
      "Insurance Impact & Renewal Planning Report",
      "One secure connected intake",
      "One transparent bundle price",
      "Government fines and trial remain separate",
    ],
  },
] as const;

interface ProductLadderProps {
  compact?: boolean;
  className?: string;
}

export default function ProductLadder({ compact = false, className }: ProductLadderProps) {
  return (
    <section
      aria-labelledby="product-ladder-heading"
      className={cn("bg-background px-4", compact ? "py-10" : "py-16", className)}
    >
      <div className="container mx-auto max-w-6xl">
        <h2
          id="product-ladder-heading"
          className={cn(
            "text-center font-bold tracking-tight",
            compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl",
          )}
        >
          One ticket. Three clear choices.
        </h2>
        <p className="mx-auto mt-4 max-w-4xl text-center text-sm font-medium leading-relaxed text-foreground/80">
          {PRODUCT_LADDER_BRIDGE}
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to="/pro-drivers" className="font-semibold text-primary underline underline-offset-4">Class 1, 2 or 4 licence? 20% off</Link>
          <span className="mt-1 block text-xs text-muted-foreground">Verified Alberta licence. Officer-issued tickets only.</span>
        </p>
        <div className={cn("grid gap-6 md:grid-cols-3", compact ? "mt-7" : "mt-10")}>
          {tiers.map((tier) => (
            <article
              key={tier.name}
              className={cn(
                "flex flex-col rounded-2xl border bg-card p-6 text-card-foreground",
                tier.highlight ? "border-primary shadow-lg ring-1 ring-primary" : "border-border",
              )}
            >
              {tier.highlight ? (
                <span className="mb-2 self-start text-xs font-semibold uppercase tracking-wide text-primary">
                  Core ticket service
                </span>
              ) : null}
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className="max-w-52 text-sm text-muted-foreground">{tier.priceNote}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{tier.sub}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {tier.features.slice(0, compact ? 3 : tier.features.length).map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={tier.cta.href}
                className={cn(
                  "mt-6 inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2.5 text-center font-medium transition-colors",
                  tier.highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border bg-background hover:bg-muted",
                )}
              >
                {tier.cta.label}
              </Link>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-muted-foreground">
          {RAPID_RESOLUTION.speedDisclaimer} {RAPID_RESOLUTION.outcomeDisclaimer}
        </p>
      </div>
    </section>
  );
}
