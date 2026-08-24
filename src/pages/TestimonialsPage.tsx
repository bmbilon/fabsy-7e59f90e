import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileCheck, Quote, Scale, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import StaticJsonLd from "@/components/StaticJsonLd";
import { VERIFIED_CLIENT_TESTIMONIALS } from "@/content/clientTestimonials";
import useSafeHead from "@/hooks/useSafeHead";

const TestimonialsPage = () => {
  useSafeHead({
    title: "Client Testimonials & Service Standards | Fabsy Alberta",
    description: "Read verified client feedback and review Fabsy's evidence standard, service limitations, and pricing for Alberta traffic ticket agent services.",
    canonical: "https://fabsy.ca/testimonials",
  });

  const testimonialSchema = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "Fabsy Traffic Ticket Services",
    url: "https://fabsy.ca",
    areaServed: { "@type": "AdministrativeArea", name: "Alberta, Canada" },
    review: VERIFIED_CLIENT_TESTIMONIALS.map((testimonial) => ({
      "@type": "Review",
      author: { "@type": "Person", name: testimonial.name },
      reviewBody: testimonial.quote,
      itemReviewed: {
        "@type": "ProfessionalService",
        name: "Fabsy Traffic Ticket Services",
        url: "https://fabsy.ca",
      },
    })),
  } as const;

  const serviceFacts = [
    {
      icon: FileCheck,
      value: "Human",
      label: "Ticket Review",
      description: "Paid Ticket Triage recommendations are reviewed by a Fabsy team member.",
    },
    {
      icon: Scale,
      value: "Agent Service",
      label: "Not a Law Firm",
      description: "Fabsy provides traffic ticket agent services, not legal advice.",
    },
    {
      icon: Shield,
      value: "Alberta",
      label: "Service Area",
      description: "Availability depends on the matter and court location.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-hero">
      <StaticJsonLd schema={testimonialSchema} dataAttr="client-testimonials" />
      <Header />

      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            Verified Client Feedback
          </Badge>
          <h1 className="text-4xl lg:text-6xl font-bold text-white drop-shadow-lg mb-6">
            Real Feedback. <span className="text-gradient-hero">Clear Limits.</span>
          </h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto drop-shadow-sm">
            Fabsy publishes client feedback only with permission and keeps every outcome claim in
            context. Individual results vary, and no ticket outcome is promised.
          </p>
        </div>

        <section className="mx-auto mb-16 max-w-4xl space-y-6" aria-labelledby="client-feedback-heading">
          <h2 id="client-feedback-heading" className="sr-only">Client feedback</h2>
          {VERIFIED_CLIENT_TESTIMONIALS.map((testimonial) => (
            <Card key={`${testimonial.name}-${testimonial.location}`} className="relative overflow-hidden border-white/20 bg-white p-8 shadow-elevated sm:p-10">
              <Quote className="h-10 w-10 text-primary" aria-hidden="true" />
              <blockquote className="mt-5 text-xl font-medium leading-relaxed text-card-foreground sm:text-2xl">
                “{testimonial.quote}”
              </blockquote>
              <p className="mt-6 font-bold text-card-foreground">{testimonial.name}, {testimonial.location}</p>
              <p className="mt-1 text-sm text-muted-foreground">{testimonial.matter} · Shared with permission</p>
              <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
                This is one client's experience. Outcomes depend on the facts, evidence, procedure, and available options.
              </p>
            </Card>
          ))}
        </section>

        <div className="flex flex-wrap justify-center gap-6 mb-20 max-w-5xl mx-auto">
          {serviceFacts.map(({ icon: Icon, value, label, description }) => (
            <Card key={label} className="p-6 text-center bg-[rgba(15,23,42,0.72)] border border-white/10 shadow-fab backdrop-blur-sm w-full sm:w-[280px]">
              <Icon className="h-8 w-8 text-primary mx-auto mb-3" />
              <div className="text-3xl font-bold text-[#F8FAFC] mb-2">{value}</div>
              <div className="text-lg font-semibold text-[#94A3B8] mb-1">{label}</div>
              <div className="text-sm text-[#94A3B8]">{description}</div>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto mb-20">
          <Card className="p-8 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
            <FileCheck className="h-10 w-10 text-primary mb-5" />
            <h2 className="text-2xl font-bold text-card-foreground mb-4">Outcome Claim Standard</h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Fabsy does not use an unsupported percentage as a prediction for a new ticket. Any
              future aggregate outcome reporting will identify the period, sample, inclusion rules,
              and definition of a favourable result. Individual outcomes vary.
            </p>
          </Card>

          <Card className="p-8 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
            <Shield className="h-10 w-10 text-primary mb-5" />
            <h2 className="text-2xl font-bold text-card-foreground mb-4">Verified Feedback Only</h2>
            <p className="text-muted-foreground leading-relaxed">
              Fabsy does not present sample, anonymous, or unverified stories as client testimonials.
              Feedback is published only when its source and publication permission have been
              confirmed, and it is never presented as a promise of the same outcome.
            </p>
          </Card>
        </div>

        <div className="text-center">
          <Card className="p-12 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-card-foreground mb-4">
              Ready to Have Your Ticket Reviewed?
            </h2>
            <p className="text-lg text-muted-foreground mb-3 max-w-3xl mx-auto">
              Representation uses a $488 base representation fee plus 30% of any fine reduction achieved.
              If the fine is not reduced, there is no success fee.
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Outcomes depend on the facts and are not promised.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/traffic-ticket-assessment">
                <Button size="lg" className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0 text-lg px-8">
                  Get Ticket Triage - $149
                </Button>
              </Link>
              <Link to="/submit-ticket">
                <Button variant="outline" size="lg" className="border-primary/30 hover:bg-primary/10 transition-smooth text-lg px-8">
                  Check Representation Eligibility - Free
                </Button>
              </Link>
            </div>

            <p className="text-sm text-muted-foreground mt-6">
              Questions? Call <a href="tel:+18257932279" className="font-bold text-primary hover:text-primary/80 transition-smooth">(825) 793-2279</a>
              {" "}or email <a href="mailto:hello@fabsy.ca" className="font-bold text-primary hover:text-primary/80 transition-smooth">hello@fabsy.ca</a>.
            </p>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TestimonialsPage;
