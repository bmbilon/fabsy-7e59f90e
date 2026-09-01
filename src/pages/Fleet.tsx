import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, Files, Truck } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StaticJsonLd from "@/components/StaticJsonLd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PHOTO_RADAR } from "@/config/offers";
import content from "@/config/fleetContent.json";
import useSafeHead from "@/hooks/useSafeHead";
import { useToast } from "@/hooks/use-toast";

const emptyIntake = { company: "", name: "", email: "", phone: "", monthlyVolume: "", plates: "", notes: "" };

export default function Fleet() {
  const [intake, setIntake] = useState(emptyIntake);
  const [pending, setPending] = useState(false);
  const [received, setReceived] = useState(false);
  const { toast } = useToast();
  useSafeHead({ title: "Alberta Fleet Photo Radar Help | $79 per Ticket | Fabsy", description: "One intake, all your plates. Alberta camera notices: $79 + GST each. Account pricing at 5+/month; monthly QuickBooks invoicing by arrangement.", canonical: "https://fabsy.ca/fleet" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!intake.company.trim() || !intake.name.trim()) {
      toast({ title: "Add your company and contact name", variant: "destructive" });
      return;
    }
    setPending(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("send-contact-email", { body: {
        name: intake.name.trim(), email: intake.email.trim(), phone: intake.phone.trim(),
        subject: "Fleet account intake", inquiry_type: "fleet", preferred_locale: "en",
        message: [
          `Business: ${intake.company.trim()}`,
          `Expected tickets per month: ${intake.monthlyVolume}`,
          `Plates (one account):\n${intake.plates.trim() || "To be supplied through secure onboarding"}`,
          `Notes:\n${intake.notes.trim() || "None"}`,
          "Request: photo radar / red-light owner-notice account, $79 + GST per ticket or confirmed account pricing, monthly QuickBooks invoicing by arrangement. No service has been retained by this enquiry.",
        ].join("\n\n"),
      } });
      if (error || data?.success !== true) throw new Error("The fleet request could not be confirmed.");
      setReceived(true);
      setIntake(emptyIntake);
    } catch {
      toast({ title: "We could not confirm your request", description: "Please try again or call (825) 793-2279. No account or payment has been created.", variant: "destructive" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <StaticJsonLd dataAttr="fleet-service" schema={{
        "@context": "https://schema.org", "@type": "Service", name: "Fabsy Fleet Photo Radar", url: "https://fabsy.ca/fleet", description: content.description,
        provider: { "@type": "Organization", name: "Fabsy Traffic Ticket Services", url: "https://fabsy.ca" },
        areaServed: { "@type": "AdministrativeArea", name: "Alberta, Canada" },
        offers: { "@type": "Offer", price: String(PHOTO_RADAR.priceCad), priceCurrency: "CAD", description: "$79 per ticket plus GST. Account pricing at 5+ per month is confirmed separately.", url: "https://fabsy.ca/fleet#fleet-intake" },
      }} />
      <main>
        <section className="bg-slate-950 px-4 py-16 text-white sm:py-20">
          <div className="container mx-auto max-w-6xl">
            <Badge className="bg-violet-900 text-violet-100">For Alberta fleets</Badge>
            <h1 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-6xl">{content.headline}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-300">{content.description}</p>
            <div className="mt-6 flex flex-wrap gap-2">{content.segments.map(segment => <Badge key={segment} variant="outline" className="border-slate-600 text-slate-200">{segment}</Badge>)}</div>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Button asChild size="lg"><a href="#fleet-intake">Start one fleet intake</a></Button>
              <p className="text-lg font-semibold">${PHOTO_RADAR.priceCad} + GST per ticket</p>
            </div>
            <p className="mt-5 text-sm text-slate-300">{PHOTO_RADAR.insuranceDisclaimer} No success fee. You approve each Crown deal.</p>
          </div>
        </section>

        <section className="container mx-auto max-w-6xl px-4 py-14" aria-labelledby="fleet-process">
          <h2 id="fleet-process" className="text-3xl font-bold">One account. A decision on every ticket.</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">{content.steps.map((step, index) => <Card key={step.title} className="p-6"><p className="text-sm font-bold text-violet-700">STEP {index + 1}</p><h3 className="mt-3 text-xl font-semibold">{step.title}</h3><p className="mt-3 leading-relaxed text-muted-foreground">{step.description}</p></Card>)}</div>
          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <Card className="p-6"><Building2 className="h-7 w-7 text-primary" aria-hidden="true" /><h3 className="mt-3 text-xl font-semibold">5+ tickets a month?</h3><p className="mt-3 leading-relaxed text-muted-foreground">{content.accountPricing}</p></Card>
            <Card className="p-6"><Files className="h-7 w-7 text-primary" aria-hidden="true" /><h3 className="mt-3 text-xl font-semibold">Fine-only service, clearly scoped</h3><p className="mt-3 leading-relaxed text-muted-foreground">This service covers Alberta automated notices mailed to a registered owner under TSA 160(1). Officer-issued tickets, trial representation and government fines are separate.</p><p className="mt-3 text-sm text-muted-foreground">{PHOTO_RADAR.speedDisclaimer}</p></Card>
          </div>
        </section>

        <section id="fleet-intake" className="container mx-auto max-w-3xl scroll-mt-20 px-4 pb-16" aria-labelledby="fleet-intake-heading">
          <Card className="p-6 sm:p-8">
            <Truck className="h-8 w-8 text-primary" aria-hidden="true" />
            <h2 id="fleet-intake-heading" className="mt-4 text-3xl font-bold">Introduce your fleet</h2>
            <p className="mt-3 text-muted-foreground">One enquiry for your company and all its plates. No payment is taken here. Fabsy confirms eligibility, authorization, pricing and invoicing before work starts.</p>
            {received ? <div role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5"><CheckCircle2 className="mb-2 h-6 w-6 text-emerald-700" aria-hidden="true" /><p className="font-semibold text-emerald-950">Your fleet request was received.</p><p className="mt-2 text-emerald-900">Fabsy will follow up about account terms and secure ticket intake. This request does not pause ticket deadlines.</p></div> : (
              <form className="mt-6 space-y-5" onSubmit={submit}>
                <div><Label htmlFor="fleet-company">Company</Label><Input id="fleet-company" autoComplete="organization" required maxLength={160} value={intake.company} onChange={e => setIntake(previous => ({ ...previous, company: e.target.value }))} /></div>
                <div><Label htmlFor="fleet-name">Account contact</Label><Input id="fleet-name" autoComplete="name" required maxLength={120} value={intake.name} onChange={e => setIntake(previous => ({ ...previous, name: e.target.value }))} /></div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div><Label htmlFor="fleet-email">Email</Label><Input id="fleet-email" type="email" autoComplete="email" required maxLength={254} value={intake.email} onChange={e => setIntake(previous => ({ ...previous, email: e.target.value }))} /></div>
                  <div><Label htmlFor="fleet-phone">Phone (optional)</Label><Input id="fleet-phone" type="tel" autoComplete="tel" maxLength={40} value={intake.phone} onChange={e => setIntake(previous => ({ ...previous, phone: e.target.value }))} /></div>
                </div>
                <div><Label htmlFor="fleet-volume">Expected tickets per month</Label><select id="fleet-volume" required value={intake.monthlyVolume} onChange={e => setIntake(previous => ({ ...previous, monthlyVolume: e.target.value }))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Select volume</option><option value="1-4">1–4</option><option value="5-9">5–9</option><option value="10-24">10–24</option><option value="25+">25+</option></select></div>
                <div><Label htmlFor="fleet-plates">Plates (optional, one per line)</Label><Textarea id="fleet-plates" rows={4} maxLength={3000} value={intake.plates} onChange={e => setIntake(previous => ({ ...previous, plates: e.target.value }))} aria-describedby="fleet-plates-help" /><p id="fleet-plates-help" className="mt-1 text-sm text-muted-foreground">You can supply the plate list during secure onboarding instead. Do not include driver licence, payment or ticket access details here.</p></div>
                <div><Label htmlFor="fleet-notes">Anything we should know? (optional)</Label><Textarea id="fleet-notes" rows={3} maxLength={1200} value={intake.notes} onChange={e => setIntake(previous => ({ ...previous, notes: e.target.value }))} /></div>
                <p className="text-sm leading-relaxed text-muted-foreground">By submitting, you ask Fabsy to contact you about this fleet enquiry. See our <Link to="/privacy-policy" className="underline">Privacy Policy</Link>. This is not an agreement to accept any Crown offer.</p>
                <Button type="submit" size="lg" disabled={pending}>{pending ? "Submitting…" : "Request fleet account"}</Button>
              </form>
            )}
          </Card>
          <p className="mt-5 text-center text-sm text-muted-foreground">Just one notice? <Link to={PHOTO_RADAR.slug} className="font-semibold text-primary underline">Start with Photo Radar · $79 + GST</Link>.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
