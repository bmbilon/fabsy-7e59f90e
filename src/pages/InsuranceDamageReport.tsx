import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  ChartNoAxesCombined,
  FileSearch,
  LockKeyhole,
  PhoneCall,
  ReceiptText,
  Upload,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StaticJsonLd from "@/components/StaticJsonLd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import useSafeHead from "@/hooks/useSafeHead";
import { IDR_DISCLAIMER, IDR_PRICE_STANDALONE } from "@/config/idr";
import {
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";

const faqs = [
  {
    question: `What is the ${INSURANCE_IMPACT_REPORT.name}?`,
    answer:
      "It is a personalized, source-backed consumer planning report covering potential conviction impact, renewal timing, conviction-aging dates, and insurance carriers worth researching or calling.",
  },
  {
    question: "What document do I need?",
    answer:
      "You need a current commercial 5-year Alberta driver's abstract. After purchase, you order the abstract yourself and upload the PDF or a clear image through your secure customer workspace.",
  },
  {
    question: "Does Fabsy order my driver's abstract?",
    answer:
      "No. You order the commercial 5-year Alberta driver's abstract yourself and government or registry fees apply separately. This keeps you in control of the request and lets you upload the document directly after purchase.",
  },
  {
    question: "What will the report show me?",
    answer:
      "The report verifies the convictions transcribed from your abstract, explains possible conviction scenarios, shows relevant aging dates, and provides a renewal-planning checklist with carriers worth researching or calling. Each carrier makes its own eligibility, underwriting, and pricing decisions.",
  },
  {
    question: "How much does the report cost?",
    answer:
      `The standalone ${INSURANCE_IMPACT_REPORT.name} costs $${IDR_PRICE_STANDALONE} CAD plus applicable GST. It is also included with ${RAPID_RESOLUTION.name} in the $${RAPID_RESOLUTION_BUNDLE.priceCad} CAD plus GST bundle.`,
  },
  {
    question: "Is the report insurance advice?",
    answer: IDR_DISCLAIMER,
  },
] as const;

const steps = [
  {
    icon: ReceiptText,
    title: "Purchase the report",
    description:
      `Choose the $${IDR_PRICE_STANDALONE} standalone report, or choose both the report and ${RAPID_RESOLUTION.name} for $${RAPID_RESOLUTION_BUNDLE.priceCad}.`,
  },
  {
    icon: Upload,
    title: "Order and upload your abstract",
    description:
      "Order your commercial 5-year Alberta driver's abstract, then upload the PDF or a clear image through your secure customer workspace.",
  },
  {
    icon: FileSearch,
    title: "Review your completed report",
    description:
      "Fabsy prepares a private, source-backed planning report with potential conviction impact, aging dates, renewal questions, and carriers worth researching or calling.",
  },
] as const;

const keyFacts = [
  {
    icon: FileSearch,
    title: "Abstract verification",
    description: "A human reviewer transcribes each listed conviction, class, date, and any discrepancy that needs attention.",
  },
  {
    icon: CalendarClock,
    title: "Conviction aging timeline",
    description: "See calculated conviction-aging dates and confirm the applicable lookback period with your insurer or licensed broker.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Potential impact scenarios",
    description: "Understand how possible conviction outcomes may interact with common Alberta insurance-rating factors. No premium amount or savings is promised.",
  },
  {
    icon: PhoneCall,
    title: "Carriers worth researching",
    description: "Get a focused research list based on public information. You make every call and coverage decision, or consult a licensed broker.",
  },
  {
    icon: BellRing,
    title: "Ongoing reminders",
    description: "Receive email reminders before renewal windows and when a conviction reaches its report aging date.",
  },
] as const;

const InsuranceDamageReport = () => {
  useSafeHead({
    title: `${INSURANCE_IMPACT_REPORT.name} | Fabsy Alberta`,
    description:
      `Get a personalized, source-backed insurance impact and renewal-planning report for $${IDR_PRICE_STANDALONE} CAD plus applicable GST.`,
    canonical: "https://fabsy.ca/insurance-damage-report",
  });

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  } as const;

  return (
    <div className="min-h-screen bg-gradient-hero">
      <StaticJsonLd schema={faqSchema} dataAttr="faq" />
      <Header />

      <main>
        <section className="container mx-auto px-4 py-16 lg:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-5 border-primary/20 bg-primary/10 text-primary">
              {INSURANCE_IMPACT_REPORT.name}
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-lg sm:text-5xl lg:text-6xl">
              Understand what a conviction could mean before renewal
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-white/90 sm:text-xl">
              For ${IDR_PRICE_STANDALONE} CAD plus applicable GST, Fabsy prepares a personalized,
              source-backed planning report covering potential conviction impact, renewal timing,
              aging dates, and carriers worth researching or calling.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 px-7 text-base shadow-glow">
                <Link to="/insurance-damage-report/checkout">
                  Get the report for ${IDR_PRICE_STANDALONE}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <a
                href="tel:+18257932279"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/40 px-7 text-base font-semibold text-white transition-colors hover:bg-black/20"
              >
                <PhoneCall className="mr-2 h-5 w-5" />
                Ask a question
              </a>
            </div>
          </div>
        </section>

        <section className="bg-background py-16 lg:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline" className="mb-4">What you receive</Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Five practical parts in one private planning report</h2>
              <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
                Report conclusions are labelled, sourced, and kept separate from the verified abstract record.
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3">
              {keyFacts.map((fact) => {
                const Icon = fact.icon;
                return (
                  <Card key={fact.title} className="p-6 shadow-fab">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold">{fact.title}</h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground">{fact.description}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-muted/20 py-16 lg:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline" className="mb-4">
                Three simple steps
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                From secure upload to a clearer renewal plan
              </h2>
            </div>

            <div className="mx-auto mt-10 grid max-w-6xl gap-6 md:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <Card key={step.title} className="relative p-6 shadow-fab">
                    <div className="mb-5 flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="text-sm font-bold text-muted-foreground">
                        Step {index + 1}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold">{step.title}</h3>
                    <p className="mt-3 leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-gradient-soft py-16 lg:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-5xl">
              <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Transparent pricing</h2>
                <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
                  Purchase the report by itself or combine it with Rapid Resolution.
                </p>
              </div>

              <div className="mt-10 grid gap-6 md:grid-cols-2">
                <Card className="border-primary/30 p-7 shadow-elevated">
                  <Badge className="mb-4">Available to anyone</Badge>
                  <h3 className="text-2xl font-bold">Standalone report</h3>
                  <p className="mt-3 text-4xl font-bold text-primary">
                    ${IDR_PRICE_STANDALONE} <span className="text-base font-medium text-muted-foreground">CAD</span>
                  </p>
                  <p className="mt-4 leading-relaxed text-muted-foreground">
                    Buy the {INSURANCE_IMPACT_REPORT.name} as a separate service. You order the required
                    abstract separately, and government or registry fees apply.
                  </p>
                  <Button asChild size="lg" className="mt-6 w-full">
                    <Link to="/insurance-damage-report/checkout">Continue to checkout</Link>
                  </Button>
                </Card>

                <Card className="p-7 shadow-fab">
                  <Badge variant="outline" className="mb-4">
                    Rapid Resolution bundle
                  </Badge>
                  <h3 className="text-2xl font-bold">Both services</h3>
                  <p className="mt-3 text-4xl font-bold text-primary">
                    ${RAPID_RESOLUTION_BUNDLE.priceCad} <span className="text-base font-medium text-muted-foreground">CAD</span>
                  </p>
                  <p className="mt-4 leading-relaxed text-muted-foreground">
                    Combine the report with ${RAPID_RESOLUTION.priceCad} Rapid Resolution for an
                    eligible Alberta pre-trial ticket. Applicable GST is extra, trial is separate,
                    and no ticket or insurance outcome is promised.
                  </p>
                  <Button asChild size="lg" variant="outline" className="mt-6 w-full">
                    <Link to={RAPID_RESOLUTION.intakePath}>Choose the ${RAPID_RESOLUTION_BUNDLE.priceCad} bundle</Link>
                  </Button>
                </Card>
              </div>

              <div className="mt-8 flex items-start gap-3 rounded-lg border border-primary/20 bg-background p-5">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-muted-foreground">{IDR_DISCLAIMER}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-background py-16 lg:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Insurance Impact Report FAQs
                </h2>
              </div>

              <Accordion type="single" collapsible className="mt-8 w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={faq.question} value={`faq-${index + 1}`}>
                    <AccordionTrigger className="text-left text-base font-semibold">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              <Card className="mt-10 p-8 text-center shadow-fab">
                <h2 className="text-2xl font-bold">Ready to get your report?</h2>
                <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
                  Purchase the standalone report, then follow the secure instructions to order and
                  upload your commercial 5-year Alberta driver's abstract and provide the requested renewal context.
                </p>
                <Button asChild size="lg" className="mt-6">
                  <Link to="/insurance-damage-report/checkout">
                    Get started for ${IDR_PRICE_STANDALONE}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default InsuranceDamageReport;
