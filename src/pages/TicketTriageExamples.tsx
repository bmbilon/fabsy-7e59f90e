import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Gauge,
  Route,
  Scale,
  ShieldCheck,
} from "lucide-react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import StaticJsonLd from "@/components/StaticJsonLd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import useSafeHead from "@/hooks/useSafeHead";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const examples = [
  {
    label: "Example 1",
    title: "The economical answer may be to handle it directly",
    situation:
      "A straightforward owner notice, no urgent licence issue identified, and limited practical value in paying for full representation.",
    review: [
      "Confirm the ticket type and printed response deadline",
      "Separate the fine from driver-record and insurance questions",
      "Compare likely downside with the cost of paid representation",
    ],
    recommendation:
      "Use the available direct response process unless the evidence reveals a material issue. Do not pay for representation only because representation is available.",
  },
  {
    label: "Example 2",
    title: "A moving conviction may justify a representation review",
    situation:
      "An officer-issued moving ticket where the driver reports a recent conviction and is concerned about record and renewal consequences.",
    review: [
      "Review the allegation, available disclosure, and driving-record context",
      "Explain the difference between the fine, demerits, conviction, and possible insurance treatment",
      "Test whether the practical value of a better outcome may exceed the representation cost",
    ],
    recommendation:
      "Seek a representation quote if the evidence and economics support it. If the same matter is eligible, the Ticket Triage payment can be applied to Fabsy's base representation fee.",
  },
  {
    label: "Example 3",
    title: "Licence-risk context can change the priority",
    situation:
      "A driver with a GDL or an existing demerit balance submits a new officer-issued ticket close to its response deadline.",
    review: [
      "Confirm the current record rather than relying on memory",
      "Identify the printed deadline and any attendance instruction",
      "Escalate uncertainty when the available information could affect licence status",
    ],
    recommendation:
      "Treat the matter as time-sensitive, verify the record through the appropriate official source, and decide on representation only after the full context is reviewed.",
  },
] as const;

const reportSections = [
  { icon: FileSearch, title: "Ticket summary", text: "Charge, ticket type, important instructions, printed deadline, and obvious information gaps." },
  { icon: Scale, title: "Consequences", text: "Fine, demerit, conviction, and possible insurance significance kept distinct." },
  { icon: Route, title: "Available paths", text: "Pay, seek an available resolution, dispute, obtain representation, or use another applicable process." },
  { icon: Gauge, title: "Economics", text: "A practical comparison between likely downside and the cost and value of representation." },
  { icon: CheckCircle2, title: "Recommendation", text: "A direct next step, including when Fabsy believes paid representation is not economically sensible." },
] as const;

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Ticket Triage examples",
  url: "https://fabsy.ca/traffic-ticket-assessment/examples",
  description: "Illustrative Ticket Triage scenarios showing how Fabsy reviews Alberta traffic-ticket consequences, options, representation economics, and next steps.",
  isPartOf: {
    "@type": "WebSite",
    name: "Fabsy Traffic Ticket Services",
    url: "https://fabsy.ca",
  },
  about: {
    "@type": "Service",
    name: TICKET_ASSESSMENT.name,
    url: `https://fabsy.ca${TICKET_ASSESSMENT.slug}`,
  },
} as const;

const examplesSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Illustrative Ticket Triage scenarios",
  numberOfItems: examples.length,
  itemListElement: examples.map((example, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: {
      "@type": "CreativeWork",
      name: example.title,
      abstract: example.situation,
    },
  })),
} as const;

export default function TicketTriageExamples() {
  useSafeHead({
    title: "Ticket Triage Examples | Alberta Ticket Assessment",
    description:
      "See illustrative Ticket Triage scenarios and the human-reviewed decision framework included in Fabsy's $149 CAD total Alberta ticket assessment.",
    canonical: "https://fabsy.ca/traffic-ticket-assessment/examples",
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <StaticJsonLd schema={pageSchema} dataAttr="ticket-triage-examples-page" />
      <StaticJsonLd schema={examplesSchema} dataAttr="ticket-triage-examples-list" />
      <Header />
      <main>
        <section className="bg-slate-950 px-4 py-16 text-white sm:py-20">
          <div className="container mx-auto max-w-5xl">
            <Badge className="border-violet-300/30 bg-violet-300/10 text-violet-100">
              Illustrative examples · Alberta · Human reviewed
            </Badge>
            <h1 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
              What a Ticket Triage recommendation actually looks like
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-200 sm:text-xl">
              Ticket Triage is not a generic ticket summary. It turns the ticket, record context, possible insurance significance, and representation economics into one direct next-step recommendation.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 bg-violet-600 px-7 hover:bg-violet-500">
                <Link
                  to={TICKET_ASSESSMENT.intakePath}
                  onClick={() => trackAssessmentEvent(
                    "assessment_cta_click",
                    { location: "assessment_examples_hero", destination: "assessment_intake", value: TICKET_ASSESSMENT.priceCad },
                    "assessment_examples_hero",
                  )}
                >
                  {TICKET_ASSESSMENT.cta}
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 border-slate-500 bg-slate-900 text-white hover:bg-slate-800 hover:text-white">
                <Link to={TICKET_ASSESSMENT.slug}>See everything included</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16" aria-labelledby="important-note-heading">
          <div className="container mx-auto max-w-5xl">
            <Card className="border-amber-200 bg-amber-50 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <ShieldCheck className="mt-0.5 h-7 w-7 shrink-0 text-amber-800" aria-hidden="true" />
                <div>
                  <h2 id="important-note-heading" className="text-xl font-bold text-amber-950">These are composite examples, not customer results</h2>
                  <p className="mt-2 leading-relaxed text-amber-950/80">
                    The scenarios below are fictional and illustrate the reasoning structure only. They do not promise a withdrawal, reduction, demerit outcome, insurance result, or recommendation in any real matter.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="bg-white px-4 py-14 sm:py-16" aria-labelledby="examples-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-violet-700">Three different decisions</p>
              <h2 id="examples-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">The answer should fit the economics of the ticket</h2>
              <p className="mt-4 text-lg text-muted-foreground">A useful assessment can recommend direct action, further review, or representation. It should not force every customer into the same funnel.</p>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {examples.map((example) => (
                <Card key={example.label} className="flex h-full flex-col overflow-hidden shadow-fab">
                  <div className="border-b bg-slate-950 p-6 text-white">
                    <p className="text-sm font-bold uppercase tracking-[0.13em] text-violet-300">{example.label}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{example.title}</h3>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <p className="leading-relaxed text-slate-700">{example.situation}</p>
                    <p className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">What gets reviewed</p>
                    <ul className="mt-3 space-y-3">
                      {example.review.map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-violet-800">Illustrative recommendation</p>
                      <p className="mt-2 text-sm leading-relaxed text-violet-950">{example.recommendation}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16" aria-labelledby="report-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="report-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">Every assessment follows the same decision framework</h2>
              <p className="mt-4 text-lg text-muted-foreground">The conclusion changes with the facts. The review standard does not.</p>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {reportSections.map(({ icon: Icon, title, text }) => (
                <Card key={title} className="p-5 shadow-fab">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-16 text-white">
          <div className="container mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-violet-200">${TICKET_ASSESSMENT.priceCad} CAD total · GST included</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Get the answer for your actual ticket.</h2>
            <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-slate-300">
              If the same matter is eligible for representation, your Ticket Triage payment can be applied to Fabsy's $488 base fee, leaving a $339 base-fee balance plus applicable tax and priority placement in the representation queue.
            </p>
            <Button asChild size="lg" className="mt-7 min-h-12 bg-violet-600 px-8 text-base hover:bg-violet-500">
              <Link
                to={TICKET_ASSESSMENT.intakePath}
                onClick={() => trackAssessmentEvent(
                  "assessment_cta_click",
                  { location: "assessment_examples_final", destination: "assessment_intake", value: TICKET_ASSESSMENT.priceCad },
                  "assessment_examples_final",
                )}
              >
                {TICKET_ASSESSMENT.cta}
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
