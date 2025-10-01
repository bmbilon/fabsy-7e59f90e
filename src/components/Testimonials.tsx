import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Quote } from "lucide-react";

const Testimonials = () => {
  const testimonials = [
    {
      name: "Sarah M.",
      location: "Calgary, AB",
      quote: "I was worried about how the ticket would affect our family's budget—insurance was already expensive. Fabsy handled everything and kept my record clean. So relieved!",
      rating: 5,
      savings: "$1,220"
    },
    {
      name: "Jennifer L.",
      location: "Edmonton, AB",
      quote: "As a working mom, I didn't have time to figure out court dates and paperwork. Fabsy made it effortless—I just uploaded my ticket and they did the rest. Ticket dismissed!",
      rating: 5,
      savings: "$950"
    },
    {
      name: "Amanda K.",
      location: "Red Deer, AB",
      quote: "I can't believe how simple it was. No stress, no confusion—just results. My insurance didn't go up and I kept my clean record. Best decision I made!",
      rating: 5,
      savings: "$1,500"
    }
  ];

  const stats = [
    { number: "94%", label: "Success Rate" },
    { number: "$993", label: "avg saved" },
    { number: "4.9/5", label: "Client Rating" }
  ];

  return (
    <section className="py-20 bg-gradient-soft">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            Real Results from Real Women
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Be the next to receive <span className="text-gradient-primary">5-Star Results</span> from Fabsy
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Alberta women are taking control of their finances and fighting back. 
            Here's what they're saying about their Fabsy experience.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16 max-w-4xl mx-auto">
          {stats.map((stat, index) => (
            <Card key={index} className="p-6 text-center bg-gradient-card shadow-fab border-primary/10">
              <div className="text-3xl font-bold text-gradient-primary mb-2">
                {stat.number}
              </div>
              <div className="text-sm text-muted-foreground">
                {stat.label}
              </div>
            </Card>
          ))}
        </div>

        {/* Testimonials */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="p-8 bg-gradient-card shadow-elevated border-primary/10 hover:shadow-glow transition-smooth">
              <div className="space-y-6">
                {/* Quote icon */}
                <div className="flex justify-between items-start">
                  <Quote className="h-8 w-8 text-primary/30" />
                  <Badge className="bg-primary/10 text-primary border-primary/20">
                    Saved {testimonial.savings}
                  </Badge>
                </div>

                {/* Rating */}
                <div className="flex gap-1">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="text-foreground/80 leading-relaxed">
                  "{testimonial.quote}"
                </blockquote>

                {/* Author */}
                <div className="border-t pt-4">
                  <div className="font-semibold text-primary">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.location}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16 space-y-6">
          <h3 className="text-2xl font-bold">
            You Deserve Peace of Mind
          </h3>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Don't let one ticket derail your budget or stress you out. Join 1,000+ Alberta women who chose to fight back. 
            Questions? <a href="tel:403-669-5353" className="font-bold text-primary hover:text-primary-dark transition-smooth underline">Call 403-669-5353</a>
          </p>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;