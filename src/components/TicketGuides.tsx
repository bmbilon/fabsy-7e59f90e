import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const guides = [
  { path: "/content/speeding-ticket-alberta", title: "Fight a speeding ticket in Alberta", description: "Compare online response options, prepare your documents and decide whether to get agent help." },
  { path: "/content/speeding-ticket-calgary", title: "Calgary speeding tickets", description: "Local court information and response options for a Calgary ticket." },
  { path: "/content/speeding-ticket-edmonton", title: "Edmonton speeding tickets", description: "Find the right court information and review your next steps." },
  { path: "/content/fight-stop-sign-ticket-alberta", title: "Stop-sign tickets", description: "Understand the allegation, the evidence and your response options." },
  { path: "/content/photo-radar-ticket-alberta", title: "Photo radar and camera notices", description: "How a registered-owner notice differs from an officer-issued ticket." },
  { path: "/content/demerit-points-alberta", title: "Demerit points in Alberta", description: "Read about points, driving records and suspension thresholds." },
] as const;

export default function TicketGuides() {
  return (
    <section id="ticket-guides" aria-labelledby="ticket-guides-heading" className="border-t border-slate-200 bg-slate-50 py-12 sm:py-16">
      <div className="container mx-auto max-w-6xl px-5 sm:px-8">
        <p className="text-sm font-semibold text-blue-700">Understand your ticket</p>
        <h2 id="ticket-guides-heading" className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Alberta traffic ticket guides</h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700">
          Start with your ticket type or city. These guides explain what to check, where to find official information, and how to explore your options.
        </p>
        <Link to="/content/fight-traffic-ticket-alberta" className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900">
          How to fight a traffic ticket in Alberta <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
        <ul className="mt-6 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map(guide => (
            <li key={guide.path} className="border-t border-slate-200 py-5">
              <Link to={guide.path} className="inline-flex min-h-11 items-center gap-2 text-lg font-semibold text-slate-950 underline decoration-slate-300 underline-offset-4 hover:text-blue-700">
                {guide.title} <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{guide.description}</p>
            </li>
          ))}
        </ul>
        <Link to="/blog" className="mt-4 inline-flex min-h-11 items-center font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900">Browse all articles and guides</Link>
      </div>
    </section>
  );
}
