import { Shield, Clock, Users, Phone, CheckCircle, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";

const TrustBar = () => {
  const trustPoints = [
    {
      icon: Shield,
      stat: "No Win, No Fee",
      detail: "You only pay if we save you money",
      color: "text-primary"
    },
    {
      icon: CheckCircle,
      stat: "100% Success Rate",
      detail: "Every case we've handled has been reduced or dismissed",
      color: "text-green-600"
    },
    {
      icon: Zap,
      stat: "Instant Analysis, Free",
      detail: "Get your results in under 60 seconds",
      color: "text-primary"
    }
  ];

  return (
    <section className="py-12 bg-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-soft opacity-20" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {trustPoints.map((point, index) => {
            const Icon = point.icon;
            return (
              <Card 
                key={index}
                className="bg-white/80 backdrop-blur-sm border-2 border-primary/20 p-6 text-center hover:border-primary/40 transition-smooth shadow-fab"
              >
                <Icon className={`h-10 w-10 ${point.color} mx-auto mb-3`} />
                <h3 className="text-2xl font-bold text-gray-800 mb-1">
                  {point.stat.includes('Success Rate') ? (
                    <Link to="/proof" className="underline decoration-dashed underline-offset-4 hover:text-primary">
                      {point.stat}
                    </Link>
                  ) : (
                    point.stat
                  )}
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
              href="tel:825-793-2279" 
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
