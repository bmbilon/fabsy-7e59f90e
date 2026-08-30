import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSearch,
  LockKeyhole,
  MessageSquareText,
  Scale,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StaticJsonLd from "@/components/StaticJsonLd";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";
import useSafeHead from "@/hooks/useSafeHead";

const processSteps = [
  {
    icon: Upload,
    title: "Upload and authorize",
    description:
      "Complete the secure intake, upload your ticket, and sign the digital consent needed for Fabsy to act within the accepted service scope.",
  },
  {
    icon: FileSearch,
    title: "We request disclosure",
    description:
      "Fabsy submits and tracks the disclosure request. A request does not itself extend a ticket or trial deadline, so you receive clear deadline instructions and file updates.",
  },
  {
    icon: FileCheck2,
    title: "Disclosure is reviewed",
    description:
      "Technology-assisted analysis and qualified review identify the evidence, procedural issues, and practical pre-trial options.",
  },
  {
    icon: MessageSquareText,
    title: "We advance the review",
    description:
      "Fabsy prepares or submits the next authorized prosecutor-review step, then explains any Crown response in plain language.",
  },
  {
    icon: BellRing,
    title: "You choose the outcome",
    description:
      "You are notified when a response arrives and direct whether an available pre-trial resolution should be accepted. Nothing is accepted automatically.",
  },
] as const;

const trustPoints = [
  { icon: LockKeyhole, label: "Secure digital intake" },
  { icon: FileSearch, label: "Disclosure requested and tracked" },
  { icon: Clock3, label: "48-hour Fabsy action commitment" },
  { icon: ShieldCheck, label: "You direct any acceptance" },
] as const;

const faqs = [
  {
    question: `What does the $${RAPID_RESOLUTION.priceCad} fee cover?`,
    answer:
      "It covers secure intake, eligibility and deadline review, digital authorization, disclosure request and tracking, disclosure analysis with qualified review, a fact-specific prosecutor-review submission, status notifications, and explanation of an available Crown response. Applicable GST is extra.",
  },
  {
    question: "Is the matter resolved within 48 hours?",
    answer: RAPID_RESOLUTION.speedDisclaimer,
  },
  {
    question: "Does requesting disclosure extend my deadline?",
    answer:
      "No. A disclosure request does not itself extend the response date or a scheduled trial date. Follow the deadline instructions Fabsy provides and the dates shown on the ticket, portal, or court notice.",
  },
  {
    question: "Does Rapid Resolution include a trial?",
    answer:
      "No. Rapid Resolution is a pre-trial service. Trial representation, appeals, reopenings, government charges, and out-of-scope matters are separate. If you want to continue to trial, Fabsy can explain whether a separate quote or referral is available.",
  },
  {
    question: "Will Fabsy accept a Crown response for me?",
    answer:
      "Only after you give file-specific instructions. Fabsy explains the original ticket and the Crown response so you can decide; an offer is never accepted automatically.",
  },
  {
    question: "Is a withdrawal or reduction promised?",
    answer: RAPID_RESOLUTION.outcomeDisclaimer,
  },
] as const;

const RapidResolution = () => {
  useSafeHead({
    title: `Rapid Resolution | Alberta Ticket Help | $${RAPID_RESOLUTION.priceCad} CAD`,
    description:
      "Secure Alberta ticket intake, disclosure request and analysis, prosecutor review, and clear client updates for one flat pre-trial service fee.",
    canonical: `https://fabsy.ca${RAPID_RESOLUTION.slug}`,
  });

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: RAPID_RESOLUTION.name,
    description: RAPID_RESOLUTION.oneLineDescription,
    url: `https://fabsy.ca${RAPID_RESOLUTION.slug}`,
    areaServed: { "@type": "AdministrativeArea", name: "Alberta, Canada" },
    provider: { "@type": "Organization", name: "Fabsy", url: "https://fabsy.ca" },
    offers: {
      "@type": "Offer",
      url: `https://fabsy.ca${RAPID_RESOLUTION.intakePath}`,
      price: RAPID_RESOLUTION.priceCad.toFixed(2),
      priceCurrency: RAPID_RESOLUTION.currency,
      availability: "https://schema.org/InStock",
    },
  } as const;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  } as const;

  return (
    <div className="min-h-screen bg-background">
      <StaticJsonLd schema={productSchema} dataAttr="rapid-resolution-service" />
      <StaticJsonLd schema={faqSchema} dataAttr="rapid-resolution-faq" />
      <Header />

      <main>
        <section className="relative overflow-hidden bg-gradient-hero px-4 py-16 text-white sm:py-20 lg:py-24">
          <div className="container relative z-10 mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-14">
              <div>
                <Badge className="border-primary/30 bg-primary/10 text-primary-light">
                  Alberta pre-trial ticket resolution
                </Badge>
                <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
                  Your ticket, moving forward now.
                </h1>
                <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-200 sm:text-xl">
                  We handle intake, disclosure, analysis, prosecutor review, and client updates for
                  an eligible Alberta traffic ticket, from one secure online journey.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="min-h-12 px-7 text-base font-bold shadow-glow">
                    <Link to={RAPID_RESOLUTION.intakePath}>
                      Start Rapid Resolution
                      <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="min-h-12 border-slate-500 bg-transparent px-7 text-base font-bold text-white hover:bg-slate-800 hover:text-white">
                    <a href="#how-it-works">See the process</a>
                  </Button>
                </div>
                <p className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-300">
                  Eligible pre-trial matters only. Trial representation is separate. Outcomes vary
                  and no withdrawal, reduction, demerit, or insurance result is promised.
                </p>
              </div>

              <Card className="overflow-hidden border-white/15 bg-white shadow-2xl">
                <div className="border-b bg-primary/5 p-7 sm:p-8">
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Rapid Resolution</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-5xl font-bold tracking-tight text-slate-950">${RAPID_RESOLUTION.priceCad}</span>
                    <span className="pb-1 text-sm font-semibold text-slate-600">CAD + GST</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">One flat service fee. No percentage-based success fee.</p>
                </div>
                <div className="p-7 sm:p-8">
                  <ul className="space-y-4 text-sm text-slate-700">
                    {RAPID_RESOLUTION.included.slice(0, 6).map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild size="lg" className="mt-7 w-full font-bold">
                    <Link to={RAPID_RESOLUTION.intakePath}>Upload your ticket</Link>
                  </Button>
                </div>
              </Card>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {trustPoints.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm font-semibold text-slate-100">
                  <Icon className="h-5 w-5 shrink-0 text-primary-light" aria-hidden="true" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 px-4 py-16 sm:py-20" aria-labelledby="rapid-process-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline">From upload to client decision</Badge>
              <h2 id="rapid-process-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                One connected process. No chasing the file yourself.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Each stage is tied to the same secure file, so the ticket, consent, disclosure, review, and response stay together.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
              {processSteps.map(({ icon: Icon, title, description }, index) => (
                <Card key={title} className="relative p-6 shadow-fab">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="text-xs font-bold text-muted-foreground">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-16 text-white sm:py-20" aria-labelledby="rapid-speed-heading">
          <div className="container mx-auto max-w-5xl">
            <Card className="border-primary/30 bg-slate-900 p-7 text-white shadow-elevated sm:p-10">
              <div className="grid gap-7 lg:grid-cols-[auto_1fr] lg:items-start">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary-light">
                  <Clock3 className="h-7 w-7" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary-light">The 48-hour commitment</p>
                  <h2 id="rapid-speed-heading" className="mt-3 text-3xl font-bold tracking-tight text-white">
                    Complete disclosure in. Fabsy's next action within 48 hours.
                  </h2>
                  <p className="mt-4 text-lg leading-relaxed text-slate-300">
                    {RAPID_RESOLUTION.actionCommitment}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-slate-400">
                    {RAPID_RESOLUTION.speedDisclaimer}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20" aria-labelledby="rapid-scope-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline">Clear scope</Badge>
              <h2 id="rapid-scope-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Know exactly what is included</h2>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <Card className="border-primary/20 p-7 shadow-fab sm:p-8">
                <h3 className="text-2xl font-bold">Included in Rapid Resolution</h3>
                <ul className="mt-6 space-y-4">
                  {RAPID_RESOLUTION.included.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-7 shadow-fab sm:p-8">
                <h3 className="text-2xl font-bold">Separate or outside scope</h3>
                <ul className="mt-6 space-y-4">
                  {RAPID_RESOLUTION.excluded.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-muted-foreground">
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                  If you want to go to trial, any available representation is quoted separately on a case-by-case basis.
                </p>
              </Card>
            </div>
          </div>
        </section>

        <section className="bg-gradient-soft px-4 py-16 sm:py-20" aria-labelledby="rapid-pricing-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline">Choose your service</Badge>
              <h2 id="rapid-pricing-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Straightforward pricing</h2>
              <p className="mt-4 text-muted-foreground">All prices are CAD plus applicable GST. Government and third-party fees are separate.</p>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              <Card className="flex flex-col p-7 shadow-fab">
                <Scale className="h-7 w-7 text-primary" aria-hidden="true" />
                <h3 className="mt-5 text-2xl font-bold">{RAPID_RESOLUTION.name}</h3>
                <p className="mt-3 text-4xl font-bold">${RAPID_RESOLUTION.priceCad}</p>
                <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">Eligible Alberta pre-trial ticket resolution from intake through an available client-directed resolution.</p>
                <Button asChild className="mt-6"><Link to={RAPID_RESOLUTION.intakePath}>Start now</Link></Button>
              </Card>
              <Card className="flex flex-col p-7 shadow-fab">
                <FileCheck2 className="h-7 w-7 text-primary" aria-hidden="true" />
                <h3 className="mt-5 text-2xl font-bold">{INSURANCE_IMPACT_REPORT.shortName}</h3>
                <p className="mt-3 text-4xl font-bold">${INSURANCE_IMPACT_REPORT.priceCad}</p>
                <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">Source-backed planning information about possible conviction impact and renewal preparation.</p>
                <Button asChild variant="outline" className="mt-6"><Link to={INSURANCE_IMPACT_REPORT.slug}>View report</Link></Button>
              </Card>
              <Card className="flex flex-col border-primary/40 bg-primary/5 p-7 shadow-elevated">
                <Badge className="w-fit">Both services</Badge>
                <h3 className="mt-5 text-2xl font-bold">{RAPID_RESOLUTION_BUNDLE.shortName}</h3>
                <p className="mt-3 text-4xl font-bold text-primary">${RAPID_RESOLUTION_BUNDLE.priceCad}</p>
                <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">Rapid Resolution plus the Insurance Impact & Renewal Planning Report for one bundle price.</p>
                <Button asChild className="mt-6"><Link to={RAPID_RESOLUTION.intakePath}>Choose the bundle</Link></Button>
              </Card>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20" aria-labelledby="rapid-faq-heading">
          <div className="container mx-auto max-w-3xl">
            <h2 id="rapid-faq-heading" className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Rapid Resolution FAQs</h2>
            <Accordion type="single" collapsible className="mt-8">
              {faqs.map((faq, index) => (
                <AccordionItem key={faq.question} value={`rapid-faq-${index}`}>
                  <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                  <AccordionContent className="leading-relaxed text-muted-foreground">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-16 text-white" aria-labelledby="rapid-final-heading">
          <div className="container mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-primary-light">${RAPID_RESOLUTION.priceCad} CAD + GST · Eligible pre-trial matters</p>
            <h2 id="rapid-final-heading" className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Put your ticket into motion today.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-300">Upload your ticket, complete the secure intake, and choose the service that fits your file.</p>
            <Button asChild size="lg" className="mt-7 min-h-12 px-8 text-base font-bold">
              <Link to={RAPID_RESOLUTION.intakePath}>
                Start Rapid Resolution
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default RapidResolution;
