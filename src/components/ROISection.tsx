import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, DollarSign, Scale } from "lucide-react";
import { Link } from "react-router-dom";

const ROISection = () => {
  return (
    <section id="pricing-overview" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            Straightforward Pricing
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-foreground drop-shadow-lg">
            Know How <span className="text-gradient-hero">Fabsy Charges</span>
          </h2>
          <p className="text-xl text-foreground/90 max-w-3xl mx-auto drop-shadow-sm mb-6">
            Pricing is a flat $488 plus 30% of any fine reduction achieved. If the fine is not
            reduced, there is no additional charge.
          </p>

        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start max-w-6xl mx-auto">
          <div className="space-y-8">
            <Card className="p-8 bg-gradient-card shadow-fab border-white/20 backdrop-blur-sm">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-6 w-6 text-primary" />
                  <h3 className="text-2xl font-bold text-card-foreground">Pricing Breakdown</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between gap-4 p-4 bg-accent/50 rounded-lg">
                    <span className="text-secondary">Flat service fee</span>
                    <span className="font-bold text-primary">$488 CAD</span>
                  </div>
                  <div className="flex justify-between gap-4 p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <span className="text-secondary">Fine reduction charge</span>
                    <span className="font-bold text-primary text-right">30% of reduction achieved</span>
                  </div>
                  <div className="flex justify-between gap-4 p-4 bg-accent/50 rounded-lg">
                    <span className="text-secondary">If the fine is not reduced</span>
                    <span className="font-bold text-primary text-right">No additional charge</span>
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card className="p-6 text-center bg-gradient-card backdrop-blur-sm shadow-fab border-white/20">
                <CheckCircle className="h-8 w-8 text-primary mx-auto mb-3" />
                <div className="text-2xl font-bold text-gradient-hero">95%+</div>
                <div className="text-sm text-secondary">Historical rate; outcomes vary</div>
              </Card>

              <Card className="p-6 text-center bg-gradient-card backdrop-blur-sm shadow-fab border-white/20">
                <Scale className="h-8 w-8 text-secondary mx-auto mb-3" />
                <div className="text-2xl font-bold text-gradient-hero">Agent Service</div>
                <div className="text-sm text-secondary">Not a law firm</div>
              </Card>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-6">
              <h3 className="text-3xl font-bold text-foreground drop-shadow-lg">
                What the Service Covers
              </h3>
              <p className="text-lg text-foreground/90 leading-relaxed drop-shadow-sm">
                Fabsy reviews the ticket information you provide and offers traffic ticket agent
                representation where that service is permitted and available.
              </p>
            </div>

            <div className="space-y-4">
              {[
                {
                  title: "Ticket Review",
                  description: "Review of the ticket, available documents, and circumstances you provide",
                },
                {
                  title: "Representation Planning",
                  description: "A ticket-specific plan based on the available information",
                },
                {
                  title: "Case Updates",
                  description: "Clear communication as the matter moves through the applicable process",
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-4 p-4 bg-white/20 backdrop-blur-sm rounded-lg border border-primary/20">
                  <CheckCircle className="h-6 w-6 text-primary mt-1 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-primary mb-1">{item.title}</h4>
                    <p className="text-sm text-foreground/80">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link to="/submit-ticket">
              <Button size="lg" className="w-full bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
                Submit Your Ticket
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ROISection;
