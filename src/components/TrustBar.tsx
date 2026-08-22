import { CheckCircle, Phone, Scale, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";

const TrustBar = () => {
  const trustPoints = [
    {
      icon: Shield,
      stat: "Straightforward Pricing",
      detail: "Representation uses a $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced.",
      color: "text-primary"
    },
    {
      icon: CheckCircle,
      stat: "95%+ Historical Rate",
      detail: "Fabsy's published historical success rate. Individual outcomes vary.",
      color: "text-green-600"
    },
    {
      icon: Scale,
      stat: "Traffic Ticket Agent",
      detail: "Fabsy is an agent service, not a law firm.",
      color: "text-primary"
    }
  ];

  return (
    <section className="py-12 bg-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-soft opacity-20" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {trustPoints.map((point) => {
            const Icon = point.icon;
            return (
              <Card 
                key={point.stat}
                className="bg-white/80 backdrop-blur-sm border-2 border-primary/20 p-6 text-center hover:border-primary/40 transition-smooth shadow-fab"
              >
                <Icon className={`h-10 w-10 ${point.color} mx-auto mb-3`} />
                <h3 className="text-2xl font-bold text-gray-800 mb-1">
                  {point.stat}
                </h3>
                <p className="text-gray-600 font-medium">{point.detail}</p>
              </Card>
            );
          })}
        </div>

        {/* Quick Contact */}
        <div className="text-center mt-8">
          <p className="text-gray-700 text-lg">
            Have questions? <a
              href="tel:+18257932279"
              className="font-bold text-primary hover:text-primary-dark transition-smooth inline-flex items-center gap-2"
            >
              <Phone className="h-5 w-5" />
              Call (825) 793-2279
            </a>
          </p>
        </div>
      </div>
    </section>
  );
};

export default TrustBar;
