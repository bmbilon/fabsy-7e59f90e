import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Bus, FileSearch, ShieldCheck, Truck } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StaticJsonLd from "@/components/StaticJsonLd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RAPID_RESOLUTION } from "@/config/offers";
import { PRO_DRIVER_BUNDLE_CENTS, PRO_DRIVER_RAPID_CENTS } from "@/config/pro-drivers";
import { PRO_DRIVER_PUBLIC_CONTENT as copy } from "@/config/pro-referral-public";
import useSafeHead from "@/hooks/useSafeHead";

const licenceClasses = copy.licenceClasses.map((item, index) => ({ ...item, icon: [Truck, Bus, BadgeCheck][index] }));

const rapidPrice = (PRO_DRIVER_RAPID_CENTS / 100).toFixed(2);
const bundlePrice = (PRO_DRIVER_BUNDLE_CENTS / 100).toFixed(2);

export default function ProDrivers() {
  useSafeHead({
    title: copy.title,
    description: copy.description,
    canonical: "https://fabsy.ca/pro-drivers",
  });

  return (
    <div className="min-h-screen bg-background">
      <StaticJsonLd
        dataAttr="pro-driver-service"
        schema={{
          "@context": "https://schema.org",
          "@type": "Service",
          name: copy.serviceName,
          url: "https://fabsy.ca/pro-drivers",
          provider: { "@type": "Organization", name: "Fabsy", url: "https://fabsy.ca" },
          areaServed: { "@type": "AdministrativeArea", name: "Alberta, Canada" },
          description: copy.serviceDescription,
          offers: [{ name: copy.rapidLabel, price: rapidPrice }, { name: copy.bundleLabel, price: bundlePrice }].map(({ name, price }) => ({
            "@type": "Offer",
            name,
            price,
            priceCurrency: "CAD",
            url: "https://fabsy.ca/pro-drivers",
            description: copy.offerDescription,
            priceSpecification: { "@type": "UnitPriceSpecification", price, priceCurrency: "CAD", valueAddedTaxIncluded: false },
          })),
        }}
      />
      <StaticJsonLd dataAttr="pro-driver-faq" schema={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: copy.faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }} />
      <Header />
      <main>
        <section className="bg-gradient-hero px-4 py-16 text-white sm:py-20">
          <div className="container mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <Badge className="border-primary/30 bg-primary/10 text-primary-light">{copy.badge}</Badge>
              <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">{copy.heading}</h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-200">{copy.intro}</p>
              <Button asChild size="lg" className="mt-8 min-h-12 font-bold">
                <Link to={`${RAPID_RESOLUTION.intakePath}?ticket_type=officer_issued`}>Upload your ticket <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></Link>
              </Button>
              <p className="mt-4 text-sm leading-relaxed text-slate-300">{copy.scope}</p>
            </div>
            <Card className="border-white/15 bg-white text-slate-950 shadow-elevated">
              <CardHeader className="border-b bg-primary/5">
                <p className="text-sm font-semibold uppercase tracking-wide text-primary">{copy.pricingLabel}</p>
                <CardTitle className="text-xl">{copy.pricingHeading}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-6 sm:p-8">
                <div>
                  <p className="font-semibold">{copy.rapidLabel}</p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-3"><span className="text-4xl font-bold">${rapidPrice}</span><span className="text-sm text-slate-600">CAD + GST</span></div>
                  <p className="mt-1 text-sm text-slate-600">{copy.rapidRegularLine}</p>
                </div>
                <div className="border-t pt-5">
                  <p className="font-semibold">{copy.bundleLabel}</p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-3"><span className="text-3xl font-bold">${bundlePrice}</span><span className="text-sm text-slate-600">CAD + GST</span></div>
                  <p className="mt-1 text-sm text-slate-600">{copy.bundleRegularLine}</p>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">{copy.bundleNote}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16" aria-labelledby="pro-eligibility">
          <div className="container mx-auto max-w-6xl">
            <h2 id="pro-eligibility" className="text-3xl font-bold tracking-tight">{copy.eligibilityHeading}</h2>
            <p className="mt-3 max-w-3xl text-muted-foreground">{copy.eligibilityIntro}</p>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {licenceClasses.map(({ licence, title, detail, icon: Icon }) => (
                <Card key={licence} className="p-6">
                  <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
                  <p className="mt-4 text-sm font-semibold text-primary">{licence}</p>
                  <h3 className="mt-1 text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
                </Card>
              ))}
            </div>
            <p className="mt-6 rounded-lg border bg-muted/40 p-5 text-sm leading-relaxed">{copy.exclusions}</p>
          </div>
        </section>

        <section className="border-y bg-muted/30 px-4 py-14 sm:py-16" aria-labelledby="pro-work">
          <div className="container mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
            <div>
              <FileSearch className="h-8 w-8 text-primary" aria-hidden="true" />
              <h2 id="pro-work" className="mt-4 text-3xl font-bold tracking-tight">{copy.abstractHeading}</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">{copy.abstractText}</p>
              <a href={copy.abstractSource.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4">{copy.abstractSource.title}</a>
            </div>
            <Card className="p-6 sm:p-8">
              <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-xl font-semibold">{copy.amendmentHeading}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{copy.amendmentText}</p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{copy.outcomeDisclaimer}</p>
            </Card>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16" aria-labelledby="pro-verification">
          <div className="container mx-auto max-w-4xl">
            <h2 id="pro-verification" className="text-3xl font-bold tracking-tight">{copy.verificationHeading}</h2>
            <ol className="mt-8 space-y-6">
              {copy.verificationSteps.map(({ title, text }, index) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{index + 1}</span>
                  <div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div>
                </li>
              ))}
            </ol>
            <Card className="mt-8 border-primary/20 bg-primary/5 p-6">
              <h3 className="font-semibold">{copy.unverifiedHeading}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.unverifiedText}</p>
            </Card>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Button asChild size="lg"><Link to={`${RAPID_RESOLUTION.intakePath}?ticket_type=officer_issued`}>Start Rapid Resolution</Link></Button>
              <Link to="/terms-of-service#pro-driver-terms" className="text-sm font-medium text-primary underline underline-offset-4">Read the pro driver terms</Link>
            </div>
          </div>
        </section>
        <section className="border-t bg-muted/30 px-4 py-14 sm:py-16" aria-labelledby="pro-faq-heading">
          <div className="container mx-auto max-w-4xl"><h2 id="pro-faq-heading" className="text-3xl font-bold tracking-tight">Pro driver questions</h2><div className="mt-8 divide-y">{copy.faqs.map(({ question, answer }) => <details key={question} className="py-5"><summary className="cursor-pointer font-semibold"><h3 className="inline">{question}</h3></summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{answer}</p></details>)}</div></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
