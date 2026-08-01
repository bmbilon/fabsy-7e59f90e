import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileCheck, Scale, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import useSafeHead from "@/hooks/useSafeHead";

const TestimonialsPage = () => {
  useSafeHead({
    title: "Client Outcomes | Fabsy Alberta",
    description: "Review Fabsy's historical success-rate context, service limitations, and pricing for Alberta traffic ticket agent services.",
    canonical: "https://fabsy.ca/testimonials",
  });

  const serviceFacts = [
    {
      icon: FileCheck,
      value: "95%+",
      label: "Historical Success Rate",
      description: "Fabsy's aggregate past figure. Individual outcomes vary.",
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
      <Header />

      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            Transparent Outcome Information
          </Badge>
          <h1 className="text-4xl lg:text-6xl font-bold text-white drop-shadow-lg mb-6">
            Evidence Before <span className="text-gradient-hero">Anecdotes</span>
          </h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto drop-shadow-sm">
            Fabsy publishes outcome claims only with clear definitions and methodology. Individual
            results vary, and no ticket outcome is promised.
          </p>
        </div>

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
            <h2 className="text-2xl font-bold text-card-foreground mb-4">Historical Outcome Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Fabsy reports a 95%+ historical success rate across past matters. It is an aggregate
              past figure, not a prediction for a particular ticket. Individual outcomes vary.
            </p>
          </Card>

          <Card className="p-8 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
            <Shield className="h-10 w-10 text-primary mb-5" />
            <h2 className="text-2xl font-bold text-card-foreground mb-4">Verified Feedback Only</h2>
            <p className="text-muted-foreground leading-relaxed">
              Fabsy does not present sample, anonymous, or unverified stories as client testimonials.
              Feedback will be published only when its source and publication permission can be
              confirmed.
            </p>
          </Card>
        </div>

        <div className="text-center">
          <Card className="p-12 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-card-foreground mb-4">
              Ready to Have Your Ticket Reviewed?
            </h2>
            <p className="text-lg text-muted-foreground mb-3 max-w-3xl mx-auto">
              Pricing is a flat $488 plus 30% of any fine reduction achieved. If the fine is not
              reduced, there is no additional charge.
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Outcomes depend on the facts and are not promised.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/submit-ticket">
                <Button size="lg" className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0 text-lg px-8">
                  Submit Your Ticket
                </Button>
              </Link>
              <Link to="/how-it-works">
                <Button variant="outline" size="lg" className="border-primary/30 hover:bg-primary/10 transition-smooth text-lg px-8">
                  See How It Works
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
