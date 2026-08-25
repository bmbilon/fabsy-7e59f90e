import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";
import { cn } from "@/lib/utils";

export const PRODUCT_LADDER_BRIDGE =
  "Start by uploading or photographing the ticket once. The same private intake carries into a $149 priority report or $488 full representation, so documents and details do not get lost between services.";

const tiers = [
  {
    name: "Free Ticket Review",
    price: "$0",
    sub: "Capture the ticket and check the extracted details",
    highlight: false,
    type: "free",
    cta: { label: "Upload or take a photo", href: TICKET_ASSESSMENT.intakePath },
    features: [
      "Ticket photo or PDF capture",
      "OCR-assisted ticket details",
      "Clear next-step service choice",
    ],
  },
  {
    name: TICKET_ASSESSMENT.name,
    price: "$149",
    priceNote: "CAD total · GST included",
    sub: "Fast report, insurance scenarios and dispute plan",
    highlight: true,
    type: "assessment",
    cta: { label: TICKET_ASSESSMENT.cta, href: "/traffic-ticket-assessment/start" },
    features: [
      "Everything in the Free Ticket Review",
      "Fine, demerit and conviction breakdown",
      "Insurance-risk assessment using your policy, insurer and renewal details",
      "Required private policy-document review",
      "Representation break-even analysis",
      "Written, human-reviewed recommendation by email",
      "$149 can be applied to eligible representation when worthwhile",
      "Priority placement if you later upgrade",
    ],
  },
  {
    name: "Full Representation",
    price: "$488",
    priceNote: "base fee + 30% of any fine reduction",
    sub: "Everything in the $149 review, handled end-to-end",
    highlight: false,
    type: "representation",
    cta: { label: "Start connected intake", href: TICKET_ASSESSMENT.intakePath },
    features: [
      "Everything in the $149 Priority Review included",
      "Agent representation where permitted",
      "Disclosure request and review",
      "Court process handled for you",
      "No reduction, no success fee",
      "One connected ticket, policy and consent record",
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
        <h2 id="product-ladder-heading" className={cn("text-center font-bold tracking-tight", compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl")}>
          Three ways to deal with your ticket
        </h2>
        <p className="mt-2 text-center text-muted-foreground">
          Upload once. Choose a priority report or full representation when you are ready.
        </p>
        <p className="mx-auto mt-4 max-w-4xl text-center text-sm font-medium leading-relaxed text-foreground/80">
          {PRODUCT_LADDER_BRIDGE}
        </p>
        <div className={cn("grid gap-6 md:grid-cols-3", compact ? "mt-7" : "mt-10")}>
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "flex flex-col rounded-2xl border bg-card p-6 text-card-foreground",
                tier.highlight ? "border-primary shadow-lg ring-1 ring-primary" : "border-border",
              )}
            >
              {tier.highlight ? (
                <span className="mb-2 self-start text-xs font-semibold uppercase tracking-wide text-primary">
                  Most useful first step
                </span>
              ) : null}
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-4xl font-bold">{tier.price}</span>
                {"priceNote" in tier ? (
                  <span className="max-w-52 text-sm text-muted-foreground">{tier.priceNote}</span>
                ) : null}
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
                onClick={() => {
                  if (tier.type === "assessment") {
                    trackAssessmentEvent(
                      "assessment_cta_click",
                      { location: "product_ladder", destination: "assessment_intake", value: TICKET_ASSESSMENT.priceCad },
                      `product_ladder:${window.location.pathname}`,
                    );
                  }
                  if (tier.type === "representation") {
                    trackAssessmentEvent(
                      "representation_cta_click",
                      { location: "product_ladder", destination: "representation_intake" },
                      `product_ladder:${window.location.pathname}`,
                    );
                  }
                }}
                className={cn(
                  "mt-6 inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2.5 text-center font-medium transition-colors",
                  tier.highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border bg-background hover:bg-muted",
                )}
              >
                {tier.cta.label}
              </Link>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
          The assessment is a commercial decision aid, not legal advice, and never obligates you to
          hire Fabsy. If representation is worthwhile and the same matter is eligible, the $149 can
          be applied to the $488 base representation fee, leaving a $339 base-fee balance plus
          applicable tax. The 30% success fee still applies to any fine reduction.
        </p>
      </div>
    </section>
  );
}
