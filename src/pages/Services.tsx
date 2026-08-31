import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Car,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSearch,
  Phone,
  Scale,
  ShieldCheck,
  Zap,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";
import useSafeHead from "@/hooks/useSafeHead";
import PhotoRadarOfferStrip from "@/components/PhotoRadarOfferStrip";
import PricingLadder from "@/components/PricingLadder";

const ticketTypes = [
  { icon: Zap, title: "Speeding tickets", description: "Officer-issued speeding allegations and eligible related provincial ticket matters." },
  { icon: AlertTriangle, title: "Excessive speeding", description: "Ticket review and service-scope confirmation based on the allegation and available process." },
  { icon: Phone, title: "Distracted driving", description: "Pre-trial review of the allegation, disclosure, and available prosecutor-review path." },
  { icon: Camera, title: "Photo radar and red-light cameras", description: "$79 + GST for Alberta notices mailed to a registered owner. No demerits, no insurance impact, no success fee." },
  { icon: Car, title: "Careless driving", description: "Eligibility assessment and review of disclosure and circumstances for an accepted matter." },
  { icon: Clock3, title: "Other traffic violations", description: "Selected Alberta provincial traffic tickets where agent services are permitted and accepted." },
] as const;

const Services = () => {
  useSafeHead({
    title: "Rapid Resolution & Insurance Impact Report | Fabsy Alberta",
    description:
      "Compare Fabsy Rapid Resolution for eligible Alberta traffic tickets, the Insurance Impact & Renewal Planning Report, and the combined bundle.",
    canonical: "https://fabsy.ca/services",
  });

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />

      <main>
        <section className="container mx-auto px-4 py-16 text-center sm:py-20">
          <Badge className="border-primary/20 bg-primary/10 text-primary-light">Fabsy services</Badge>
          <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Resolve the ticket. Understand the insurance questions.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-white/85 sm:text-xl">
            Choose pre-trial ticket help, a source-backed insurance planning report, or both in one clearly priced bundle.
          </p>
        </section>

        <section className="container mx-auto px-4 pb-16" aria-labelledby="service-options-heading">
          <h2 id="service-options-heading" className="sr-only">Service options</h2>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="flex flex-col border-primary/30 p-7 shadow-elevated sm:p-8">
              <Scale className="h-8 w-8 text-primary" aria-hidden="true" />
              <h3 className="mt-5 text-2xl font-bold">{RAPID_RESOLUTION.name}</h3>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-bold">${RAPID_RESOLUTION.priceCad}</span>
                <span className="pb-1 text-sm text-muted-foreground">CAD + GST</span>
              </div>
              <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">
                Secure intake, disclosure request and tracking, analysis with qualified review, prosecutor-review submission, client updates, and client-directed acceptance of an available pre-trial resolution.
              </p>
              <Button asChild className="mt-7">
                <Link to={RAPID_RESOLUTION.intakePath}>
                  Start Rapid Resolution
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </Card>

            <Card className="flex flex-col p-7 shadow-fab sm:p-8">
              <FileCheck2 className="h-8 w-8 text-primary" aria-hidden="true" />
              <h3 className="mt-5 text-2xl font-bold">{INSURANCE_IMPACT_REPORT.name}</h3>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-bold">${INSURANCE_IMPACT_REPORT.priceCad}</span>
                <span className="pb-1 text-sm text-muted-foreground">CAD + GST</span>
              </div>
              <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">{INSURANCE_IMPACT_REPORT.description}</p>
              <Button asChild variant="outline" className="mt-7">
                <Link to={INSURANCE_IMPACT_REPORT.slug}>View report details</Link>
              </Button>
            </Card>

            <Card className="flex flex-col border-primary/40 bg-primary/5 p-7 shadow-elevated sm:p-8">
              <Badge className="w-fit">Both services</Badge>
              <h3 className="mt-5 text-2xl font-bold">{RAPID_RESOLUTION_BUNDLE.shortName}</h3>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-bold text-primary">${RAPID_RESOLUTION_BUNDLE.priceCad}</span>
                <span className="pb-1 text-sm text-muted-foreground">CAD + GST</span>
              </div>
              <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">{RAPID_RESOLUTION_BUNDLE.description}</p>
              <Button asChild className="mt-7">
                <Link to={`${RAPID_RESOLUTION.intakePath}?bundle=1`}>Choose the bundle</Link>
              </Button>
            </Card>
          </div>
          <PhotoRadarOfferStrip />
          <div className="mt-6 text-white"><PricingLadder /></div>
        </section>

        <section className="bg-background px-4 py-16 sm:py-20" aria-labelledby="ticket-types-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline">Eligibility varies by matter</Badge>
              <h2 id="ticket-types-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Tickets Fabsy can review</h2>
              <p className="mt-4 text-muted-foreground">Submission does not ensure acceptance. Fabsy confirms whether the matter fits the permitted service scope.</p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {ticketTypes.map(({ icon: Icon, title, description }) => (
                <Card key={title} className="p-6 shadow-fab">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-xl font-bold">{title}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-16 text-white sm:py-20" aria-labelledby="service-commitment-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
              <div>
                <Badge className="border-primary/30 bg-primary/10 text-primary-light">Rapid Resolution service commitment</Badge>
                <h2 id="service-commitment-heading" className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Fabsy acts within 48 hours of complete disclosure
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-slate-300">{RAPID_RESOLUTION.actionCommitment}</p>
                <p className="mt-4 text-sm leading-relaxed text-slate-400">{RAPID_RESOLUTION.speedDisclaimer}</p>
              </div>
              <Card className="border-slate-700 bg-slate-900 p-7 text-white">
                <h3 className="text-2xl font-bold text-white">Important scope limits</h3>
                <ul className="mt-5 space-y-4 text-slate-300">
                  <li className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-light" aria-hidden="true" /><span>Trial representation is not included and, if available, is quoted separately.</span></li>
                  <li className="flex items-start gap-3"><FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-primary-light" aria-hidden="true" /><span>The 48-hour commitment covers Fabsy's next authorized action, not Crown timing.</span></li>
                  <li className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-light" aria-hidden="true" /><span>No withdrawal, reduction, demerit, or insurance result is promised.</span></li>
                </ul>
              </Card>
            </div>
          </div>
        </section>

        <section className="bg-background px-4 py-16 sm:py-20">
          <Card className="container mx-auto max-w-4xl p-8 text-center shadow-elevated sm:p-12">
            <h2 className="text-3xl font-bold">Ready to put your ticket into motion?</h2>
            <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              Upload the ticket, complete the secure intake and authorization, and choose Rapid Resolution or the combined insurance-planning bundle.
            </p>
            <Button asChild size="lg" className="mt-7 min-h-12 px-8">
              <Link to={RAPID_RESOLUTION.intakePath}>
                Start your secure intake
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Services;
