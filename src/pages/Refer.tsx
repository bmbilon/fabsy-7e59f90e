import { Link } from "react-router-dom";
import { ArrowRight, Banknote, Camera, Link2, ShieldCheck, Ticket } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StaticJsonLd from "@/components/StaticJsonLd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { REFERRAL_PUBLIC_CONTENT as copy } from "@/config/pro-referral-public";
import useSafeHead from "@/hooks/useSafeHead";
import useHashScroll from "@/hooks/useHashScroll";

const rewards = copy.rewards.map((item, index) => ({ ...item, icon: [Ticket, Camera][index] }));
const steps = copy.steps.map((item, index) => ({ ...item, icon: [Link2, ShieldCheck, Banknote][index] }));

export default function Refer() {
  useHashScroll();
  useSafeHead({
    title: copy.title,
    description: copy.description,
    canonical: "https://fabsy.ca/refer",
  });

  return (
    <div className="min-h-screen bg-background">
      <StaticJsonLd dataAttr="referral-program" schema={{ "@context": "https://schema.org", "@type": "WebPage", name: copy.schemaName, description: copy.schemaDescription, url: "https://fabsy.ca/refer" }} />
      <StaticJsonLd dataAttr="referral-faq" schema={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: copy.faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }} />
      <Header />
      <main>
        <section className="bg-gradient-hero px-4 py-16 text-white sm:py-20">
          <div className="container mx-auto max-w-6xl">
            <Badge className="border-primary/30 bg-primary/10 text-primary-light">{copy.badge}</Badge>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">{copy.heading}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-200">{copy.intro}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button asChild size="lg" className="min-h-12 font-bold"><Link to="/portal/referrals">Get your referral link <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 border-slate-500 bg-transparent text-white hover:bg-slate-800 hover:text-white"><a href="#referral-terms">See the terms</a></Button>
            </div>
            <div className="mt-10 grid max-w-3xl gap-5 sm:grid-cols-2">
              {rewards.map(({ icon: Icon, amount, label }) => (
                <div key={label} className="rounded-xl border border-slate-700 bg-slate-900 p-6">
                  <Icon className="h-6 w-6 text-primary-light" aria-hidden="true" /><p className="mt-3 text-4xl font-bold">${amount}<span className="ml-2 text-sm font-medium text-slate-300">CAD</span></p><p className="mt-2 font-semibold text-slate-100">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-relaxed text-slate-300">{copy.scope}</p>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16" aria-labelledby="referral-process">
          <div className="container mx-auto max-w-6xl">
            <h2 id="referral-process" className="text-3xl font-bold tracking-tight">{copy.processHeading}</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {steps.map(({ icon: Icon, title, text }) => (
                <Card key={title} className="p-6"><Icon className="h-7 w-7 text-primary" aria-hidden="true" /><h3 className="mt-4 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p></Card>
              ))}
            </div>
          </div>
        </section>

        <section id="referral-terms" className="scroll-mt-24 border-y bg-muted/30 px-4 py-14 sm:py-16" aria-labelledby="referral-terms-heading">
          <div className="container mx-auto max-w-4xl">
            <h2 id="referral-terms-heading" className="text-3xl font-bold tracking-tight">{copy.termsHeading}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{copy.termsEffective}</p>
            <div className="mt-8 divide-y">
              {copy.rules.map(({ title, text }) => <div key={title} className="py-5 first:pt-0"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></div>)}
            </div>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              {copy.termsPrivacy}{" "}
              See <Link to="/terms-of-service#referral-terms" className="font-medium text-primary underline underline-offset-4">Terms of Service section 5E</Link> and
              our <Link to="/privacy-policy" className="font-medium text-primary underline underline-offset-4">Privacy Policy</Link>.
            </p>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16" aria-labelledby="referral-faq-heading">
          <div className="container mx-auto max-w-4xl"><h2 id="referral-faq-heading" className="text-3xl font-bold tracking-tight">Referral questions</h2><div className="mt-8 divide-y">{copy.faqs.map(({ question, answer }) => <details key={question} className="py-5"><summary className="cursor-pointer font-semibold"><h3 className="inline">{question}</h3></summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{answer}</p></details>)}</div></div>
        </section>

        <section className="px-4 py-14 text-center sm:py-16">
          <div className="container mx-auto max-w-2xl"><h2 className="text-3xl font-bold tracking-tight">{copy.signupHeading}</h2><p className="mt-4 text-muted-foreground">{copy.signupText}</p><Button asChild size="lg" className="mt-7"><Link to="/portal/referrals">Open Refer a driver</Link></Button></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
