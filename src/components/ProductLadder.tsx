import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export const PRODUCT_LADDER_BRIDGE =
  "Start with a free ticket check. Choose $149 Ticket Triage for the insurance math, a priority place in our representation queue, and a full $149 credit if you upgrade. If representation is worth it, only $339 of the $488 flat fee remains, plus GST.";

const tiers = [
  {
    name: "Free Ticket Check",
    price: "$0",
    sub: "Find out if it's worth a conversation",
    highlight: false,
    cta: { label: "Get a free ticket check", href: "/submit-ticket" },
    features: [
      "Charge and court location confirmed",
      "Representation availability check",
      "Quote for representation",
    ],
  },
  {
    name: "Ticket Triage",
    price: "$149",
    priceNote: "+ GST, one-time",
    sub: "Know the smart move before spending more",
    highlight: true,
    cta: { label: "Start My Ticket Triage", href: "/traffic-ticket-assessment/start" },
    features: [
      "Everything in the Free Ticket Check",
      "Priority placement in our representation queue",
      "$149 credited toward the $488 flat representation fee",
      "Fine, demerit and conviction breakdown",
      "Insurance-risk assessment using your policy, insurer and renewal details",
      "Representation break-even analysis",
      "Written, human-reviewed recommendation by email",
    ],
  },
  {
    name: "Representation",
    price: "$488",
    priceNote: "flat + 30% of any fine reduction",
    sub: "We handle it as your agent",
    highlight: false,
    cta: { label: "Hire Fabsy to fight it", href: "/submit-ticket" },
    features: [
      "Agent representation where permitted",
      "Disclosure request and review",
      "Court process handled for you",
      "No reduction, no success fee",
      "$339 flat-fee balance after a Ticket Triage credit",
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
          Start free. Pay for depth only if you need it. Hire us only if it's worth it.
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
          Ticket Triage is a commercial decision aid, not legal advice, and never obligates you to
          hire Fabsy. The $149 credit applies to the same eligible matter; the $339 balance is plus
          GST, and the 30% success fee still applies to any fine reduction.
        </p>
      </div>
    </section>
  );
}
