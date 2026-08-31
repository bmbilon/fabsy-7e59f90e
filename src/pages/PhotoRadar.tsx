import { Link } from "react-router-dom";
import { ArrowRight, Camera, CheckCircle2, Clock3, FileSearch, Upload } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FeeRefundNotice from "@/components/FeeRefundNotice";
import StaticJsonLd from "@/components/StaticJsonLd";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PHOTO_RADAR, PHOTO_RADAR_PRICE_LABEL } from "@/config/offers";
import { FEE_REFUND } from "@/config/feeRefund";
import photoRadarContent from "@/config/photoRadarContent.json";
import useSafeHead from "@/hooks/useSafeHead";

const processIcons = [Upload, FileSearch, CheckCircle2];

const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: PHOTO_RADAR.name,
  description: PHOTO_RADAR.description,
  url: `https://fabsy.ca${PHOTO_RADAR.slug}`,
  serviceType: "Registered-owner automated traffic enforcement notice review",
  areaServed: { "@type": "AdministrativeArea", name: "Alberta, Canada" },
  provider: { "@type": "Organization", name: "Fabsy", url: "https://fabsy.ca" },
  offers: {
    "@type": "Offer",
    price: String(PHOTO_RADAR.priceCad),
    priceCurrency: PHOTO_RADAR.currency,
    url: `https://fabsy.ca${PHOTO_RADAR.intakePath}`,
    availability: "https://schema.org/InStock",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: photoRadarContent.faqs.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

const PhotoRadar = () => {
  useSafeHead({
    title: "Photo Radar & Red-Light Ticket Help Alberta | $79 | Fabsy",
    description: "Alberta photo radar or red-light notice? $79 + GST. No demerits or insurance impact. We pursue a Crown reduction or withdrawal. You approve any deal.",
    canonical: `https://fabsy.ca${PHOTO_RADAR.slug}`,
  });

  return (
    <div className="min-h-screen bg-background">
      <StaticJsonLd schema={serviceSchema} dataAttr="photo-radar-service" />
      <StaticJsonLd schema={faqSchema} dataAttr="photo-radar-faq" />
      <Header />
      <main>
        <section className="relative overflow-hidden bg-gradient-hero px-4 py-16 text-white sm:py-20 lg:py-24">
          <div className="container mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-14">
              <div>
                <Badge className="border-primary/30 bg-primary/10 text-primary-light">Alberta photo radar &amp; red-light cameras</Badge>
                <h1 className="mt-6 text-4xl font-bold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-6xl">
                  Photo radar ticket in the mail? $79 flat.
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-200 sm:text-xl">
                  No demerits. No insurance impact. The only thing on the table is the fine.
                </p>
                <p className="mt-4 max-w-2xl leading-relaxed text-slate-300">
                  Fabsy enters your not-guilty plea, requests disclosure and pursues a Crown reduction or withdrawal. You approve any deal.
                </p>
                <FeeRefundNotice photoRadar tone="dark" className="mt-6" />
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="min-h-12 px-7 text-base font-bold shadow-glow">
                    <Link to={PHOTO_RADAR.intakePath}>
                      Start photo radar review
                      <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="min-h-12 border-slate-500 bg-transparent px-7 text-white hover:bg-slate-800 hover:text-white">
                    <a href="#how-it-works">How it works</a>
                  </Button>
                </div>
                <p className="mt-5 text-sm leading-relaxed text-slate-300">
                  Registered-owner automated notices under Traffic Safety Act s.160(1). No trial. No success surcharge.
                </p>
              </div>
              <Card className="overflow-hidden border-white/15 bg-white shadow-2xl">
                <div className="border-b bg-primary/5 p-7 sm:p-8">
                  <Camera className="h-8 w-8 text-primary" aria-hidden="true" />
                  <h2 className="mt-5 text-xl font-bold text-slate-950">{PHOTO_RADAR.name}</h2>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-5xl font-bold tracking-tight text-slate-950">${PHOTO_RADAR.priceCad}</span>
                    <span className="pb-1 text-sm font-semibold text-slate-600">CAD + GST</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-600">{PHOTO_RADAR_PRICE_LABEL}</p>
                </div>
                <div className="p-7 sm:p-8">
                  <ul className="space-y-4 text-sm leading-relaxed text-slate-700">
                    {[
                      "Not-guilty plea and disclosure request",
                      "Review of the notice, images and disclosure",
                      "Pursuit of a Crown reduction or withdrawal",
                      "Clear file updates and your approval of any deal",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild size="lg" className="mt-7 w-full font-bold">
                    <Link to={PHOTO_RADAR.intakePath}>Upload your notice</Link>
                  </Button>
                  <p className="mt-4 text-xs leading-relaxed text-slate-600">
                    Government fines are separate. The service fee is paid upfront and covered by our fee refund guarantee.{" "}
                    <Link to={FEE_REFUND.termsPath} className="underline underline-offset-4">See refund details</Link>.
                  </p>
                </div>
              </Card>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {photoRadarContent.heroFacts.map(({ title, description }) => (
                <div key={title} className="rounded-xl border border-slate-700 bg-slate-900 p-5">
                  <h2 className="text-base font-bold text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 px-4 py-16 sm:py-20" aria-labelledby="photo-process-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <Badge variant="outline">Three steps</Badge>
              <h2 id="photo-process-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">From mailed notice to your decision</h2>
            </div>
            <div className="mt-9 grid gap-5 md:grid-cols-3">
              {photoRadarContent.processSteps.map(({ title, description }, index) => {
                const Icon = processIcons[index];
                return (
                  <Card key={title} className="p-6 shadow-fab sm:p-7">
                    <div className="flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <span className="text-sm font-bold text-muted-foreground">0{index + 1}</span>
                    </div>
                    <h3 className="mt-5 text-xl font-bold">{title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
                  </Card>
                );
              })}
            </div>
            <div className="mt-8 flex items-start gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
              <Clock3 className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="font-bold">Fabsy action within 48 hours after complete disclosure</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{PHOTO_RADAR.actionCommitment}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{PHOTO_RADAR.speedDisclaimer} A disclosure request does not itself extend a response or court deadline.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gradient-soft px-4 py-16 sm:py-20" aria-labelledby="photo-review-heading">
          <div className="container mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
            <div>
              <Badge variant="outline">A review of your actual evidence</Badge>
              <h2 id="photo-review-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">What we check before asking the Crown</h2>
              <p className="mt-5 leading-relaxed text-muted-foreground">
                Camera rules changed in 2025, but photo radar was not abolished. Approved exceptions exist, and red-light cameras have different location rules from speed enforcement.
              </p>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                A missing record or possible error becomes a question to investigate and, where supported, a Crown request. It does not automatically cancel a ticket.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                This service covers the fine on an eligible owner notice. It does not include an Insurance Impact Report, trial, appeal or reopening. Fabsy is an agent service, not a law firm.
              </p>
            </div>
            <Card className="p-6 shadow-fab sm:p-8">
              <ul className="space-y-4">
                {photoRadarContent.reviewChecks.map((check) => (
                  <li key={check} className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span>{check}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20" aria-labelledby="photo-faq-heading">
          <div className="container mx-auto max-w-3xl">
            <h2 id="photo-faq-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">Photo radar questions, answered</h2>
            <Accordion type="single" collapsible className="mt-8">
              {photoRadarContent.faqs.map(({ question, answer }, index) => (
                <AccordionItem key={question} value={`photo-faq-${index}`}>
                  <AccordionTrigger className="text-left">{question}</AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-muted-foreground">{answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              <Link to={FEE_REFUND.termsPath} className="underline underline-offset-4">Read the full fee refund guarantee</Link>.
            </p>
            <aside className="mt-8 text-sm leading-relaxed text-muted-foreground" aria-label="Official sources">
              <p className="font-semibold">Official sources checked August 31, 2026</p>
              <ul className="mt-2 space-y-2">
                {photoRadarContent.sourceLinks.map(({ title, url }) => (
                  <li key={url}><a href={url} className="underline underline-offset-4" rel="noopener noreferrer">{title}</a></li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-14 text-white" aria-labelledby="photo-start-heading">
          <div className="container mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="photo-start-heading" className="text-2xl font-bold text-white sm:text-3xl">Have your notice ready?</h2>
              <p className="mt-3 text-slate-300">{PHOTO_RADAR_PRICE_LABEL}. You approve any deal.</p>
              <p className="mt-2 text-sm text-slate-400">Multiple vehicles? <Link to="/fleet" className="text-slate-200 underline underline-offset-4">See fleet ticket support</Link>.</p>
            </div>
            <Button asChild size="lg" className="min-h-12 shrink-0 px-7 font-bold">
              <Link to={PHOTO_RADAR.intakePath}>Start for ${PHOTO_RADAR.priceCad} + GST <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default PhotoRadar;
