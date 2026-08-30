import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSearch,
  Scale,
  ShieldCheck,
} from "lucide-react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import StaticJsonLd from "@/components/StaticJsonLd";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";
import useSafeHead from "@/hooks/useSafeHead";

const REVIEWED_ISO = "2026-08-27";
const REVIEWED_LABEL = "August 27, 2026";

const products = [
  {
    name: RAPID_RESOLUTION.name,
    price: `$${RAPID_RESOLUTION.priceCad} CAD plus GST`,
    description: "Eligible pre-trial ticket service covering secure intake, disclosure, prosecutor review, notifications and the client's final decision.",
  },
  {
    name: INSURANCE_IMPACT_REPORT.name,
    price: `$${INSURANCE_IMPACT_REPORT.priceCad} CAD plus GST`,
    description: "A source-backed consumer planning report covering potential conviction impact, aging dates and renewal questions.",
  },
  {
    name: RAPID_RESOLUTION_BUNDLE.name,
    price: `$${RAPID_RESOLUTION_BUNDLE.priceCad} CAD plus GST`,
    description: "Rapid Resolution and the insurance-planning report together for one posted bundle price.",
  },
] as const;

const officialSources = [
  {
    title: "Alberta Traffic Tickets Digital Service",
    href: "https://traffictickets.alberta.ca/",
    description: "The Government of Alberta service for ticket information, disclosure, prosecutor review and available online actions.",
  },
  {
    title: "Alberta Demerit Points",
    href: "https://www.alberta.ca/demerit-points",
    description: "Current Government of Alberta information about demerit points.",
  },
  {
    title: "Demerit Driving Suspension",
    href: "https://www.alberta.ca/demerit-driving-suspension",
    description: "Government information about demerit accumulation and suspension thresholds.",
  },
  {
    title: "Alberta Insurance Rate Board",
    href: "https://www.airbfordrivers.ca/",
    description: "Public Alberta auto-insurance information and consumer research tools.",
  },
] as const;

const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: RAPID_RESOLUTION.name,
  description: RAPID_RESOLUTION.oneLineDescription,
  url: `https://fabsy.ca${RAPID_RESOLUTION.slug}`,
  areaServed: { "@type": "AdministrativeArea", name: "Alberta, Canada" },
  provider: {
    "@type": "Organization",
    name: "Fabsy Traffic Ticket Services",
    url: "https://fabsy.ca",
    email: "hello@fabsy.ca",
    telephone: "+1-825-793-2279",
  },
  offers: {
    "@type": "Offer",
    price: RAPID_RESOLUTION.priceCad.toFixed(2),
    priceCurrency: RAPID_RESOLUTION.currency,
    url: `https://fabsy.ca${RAPID_RESOLUTION.intakePath}`,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: RAPID_RESOLUTION.priceCad.toFixed(2),
      priceCurrency: RAPID_RESOLUTION.currency,
      valueAddedTaxIncluded: false,
    },
  },
} as const;

const factPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Fabsy Rapid Resolution facts and Alberta traffic-ticket sources",
  url: "https://fabsy.ca/ai-info",
  description: "Canonical facts about Rapid Resolution, current Fabsy pricing, service limits and official Alberta sources.",
  dateModified: REVIEWED_ISO,
  about: { "@type": "Organization", name: "Fabsy Traffic Ticket Services", url: "https://fabsy.ca" },
  mainEntity: serviceSchema,
} as const;

export default function AIInfo() {
  useSafeHead({
    title: "Fabsy Rapid Resolution Facts, Pricing & Alberta Sources",
    description: "Canonical facts about Fabsy's $198 Rapid Resolution service, $49 insurance-planning report, scope, 48-hour action commitment and official Alberta sources.",
    canonical: "https://fabsy.ca/ai-info",
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <StaticJsonLd schema={serviceSchema} dataAttr="rapid-resolution-service" />
      <StaticJsonLd schema={factPageSchema} dataAttr="fabsy-fact-page" />
      <Header />

      <article>
        <section className="bg-slate-950 px-4 py-16 text-white sm:py-20">
          <div className="container mx-auto max-w-5xl">
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-violet-300">Canonical Fabsy service facts</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Rapid Resolution for eligible Alberta traffic tickets
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-200 sm:text-xl">
              {RAPID_RESOLUTION.oneLineDescription} Fabsy is an Alberta traffic-ticket agent service, not a law firm.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 bg-violet-600 px-7 hover:bg-violet-500">
                <Link to={RAPID_RESOLUTION.intakePath}>
                  Start Rapid Resolution
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 border-slate-500 bg-slate-900 text-white hover:bg-slate-800 hover:text-white">
                <Link to={RAPID_RESOLUTION.slug}>Review the complete scope</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16" aria-labelledby="direct-answer-heading">
          <div className="container mx-auto max-w-5xl">
            <Card className="border-violet-200 p-7 shadow-elevated sm:p-9">
              <div className="flex items-start gap-4">
                <FileSearch className="mt-1 h-7 w-7 shrink-0 text-violet-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.13em] text-violet-700">Direct answer</p>
                  <h2 id="direct-answer-heading" className="mt-2 text-2xl font-bold sm:text-3xl">What does Rapid Resolution include?</h2>
                  <p className="mt-4 text-lg leading-relaxed text-slate-700">
                    It includes secure intake, eligibility and deadline review, digital authorization, disclosure request and tracking, technology-assisted disclosure analysis with qualified review, a fact-specific prosecutor-review submission, prompt notifications, a comparison of the original ticket and any Crown response, and the client's final instruction. Trial is separate.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="bg-white px-4 py-14 sm:py-16" aria-labelledby="products-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="products-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">Three transparent choices</h2>
              <p className="mt-4 text-lg text-muted-foreground">Ticket service, insurance planning, or both.</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {products.map((product, index) => (
                <Card key={product.name} className={index === 0 ? "border-violet-500 p-6 shadow-lg ring-1 ring-violet-500" : "p-6 shadow-fab"}>
                  <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{product.price}</p>
                  <h3 className="mt-2 text-xl font-bold">{product.name}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{product.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16" aria-labelledby="limits-heading">
          <div className="container mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
            <Card className="p-7 shadow-fab">
              <ShieldCheck className="h-8 w-8 text-violet-700" aria-hidden="true" />
              <h2 id="limits-heading" className="mt-4 text-2xl font-bold">Scope and important limits</h2>
              <ul className="mt-5 space-y-4 text-slate-700">
                {[
                  "Rapid Resolution accepts eligible Alberta pre-trial traffic-ticket matters only.",
                  "Trial representation, government fines and out-of-scope work are separate.",
                  "Submitting or purchasing a service does not pause a ticket or trial deadline.",
                  RAPID_RESOLUTION.speedDisclaimer,
                  RAPID_RESOLUTION.outcomeDisclaimer,
                  INSURANCE_IMPACT_REPORT.disclaimer,
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-7 shadow-fab">
              <Clock3 className="h-8 w-8 text-violet-700" aria-hidden="true" />
              <h2 className="mt-4 text-2xl font-bold">Review and source standard</h2>
              <p className="mt-5 leading-relaxed text-slate-700">
                Technology assists document extraction and drafting. Qualified review remains part of the process before a substantive client communication or authorized prosecutor step. Public rules and research should link to current authoritative sources and show a review date.
              </p>
              <div className="mt-6 rounded-xl bg-slate-100 p-5 text-sm leading-relaxed text-slate-700">
                <p className="font-bold text-slate-950">Page reviewed {REVIEWED_LABEL}</p>
                <p className="mt-1">Government rules remain subject to the current official source and the instructions on the individual ticket.</p>
              </div>
            </Card>
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-14 text-white sm:py-16" aria-labelledby="sources-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="flex items-center gap-3">
              <Scale className="h-8 w-8 text-violet-300" aria-hidden="true" />
              <h2 id="sources-heading" className="text-3xl font-bold text-white">Primary Alberta sources</h2>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {officialSources.map((source) => (
                <a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:bg-white/10">
                  <span className="flex items-center gap-2 font-bold text-white">
                    {source.title}<ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-slate-300">{source.description}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </article>
      <Footer />
    </main>
  );
}
