import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  Search, 
  FileCheck, 
  Gavel, 
  CheckCircle, 
  ArrowRight,
  Clock,
  Shield,
  DollarSign
} from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const HowItWorks = () => {
  const steps = [
    {
      icon: Upload,
      title: "Upload Your Ticket",
      description: "Simply upload a photo of your traffic ticket through our secure online form. Takes less than 2 minutes.",
      time: "2 minutes"
    },
    {
      icon: Search,
      title: "Expert Review",
      description: "Our experienced team analyzes your ticket for legal defenses, procedural errors, and technicalities.",
      time: "24 hours"
    },
    {
      icon: FileCheck,
      title: "Strategy Development",
      description: "We craft a personalized defense strategy based on your specific case circumstances and Alberta traffic regulations.",
      time: "1-2 days"
    },
    {
      icon: Gavel,
      title: "Court Representation",
      description: "We handle all court proceedings on your behalf. No need for you to take time off work or appear in court.",
      time: "2-4 weeks"
    },
    {
      icon: CheckCircle,
      title: "Resolution",
      description: "Get notified of the outcome. Most cases result in dismissal or reduced charges, protecting your driving record.",
      time: "Same day"
    }
  ];

  const guarantees = [
    {
      icon: Shield,
      title: "Money-Back Guarantee",
      description: "If we don't improve your ticket outcome, you get a full refund. That's our promise to you.",
      highlight: "100% Risk-Free"
    },
    {
      icon: Clock,
      title: "No Court Appearances",
      description: "We handle everything so you don't have to miss work or stress about court dates.",
      highlight: "Save Your Time"
    },
    {
      icon: DollarSign,
      title: "Insurance Protection",
      description: "Avoid insurance premium increases that can cost you thousands over 3 years.",
      highlight: "Save Up to 5,000+"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />
      
      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            Simple 5-Step Process
          </Badge>
          <h1 className="text-4xl lg:text-6xl font-bold text-white drop-shadow-lg mb-6">
            How <span className="text-gradient-hero font-script">Fabsy</span> Works
          </h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto drop-shadow-sm">
            From ticket upload to case resolution, we've streamlined the entire process 
            to be as simple and stress-free as possible for busy women.
          </p>
        </div>

        {/* Steps Section */}
        <div className="mb-20">
          <div className="grid gap-8">
            {steps.map((step, index) => (
              <Card key={index} className="p-8 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
                <div className="flex flex-col md:flex-row items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 bg-gradient-button rounded-full flex items-center justify-center shadow-glow">
                      <step.icon className="h-8 w-8 text-white" />
                    </div>
                    <div className="mt-3 text-center">
                      <Badge variant="outline" className="text-xs font-medium">
                        Step {index + 1}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
                      <h3 className="text-2xl font-bold text-card-foreground">
                        {step.title}
                      </h3>
                      <div className="flex items-center gap-2 text-primary">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-medium">{step.time}</span>
                      </div>
                    </div>
                    
                    <p className="text-lg text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                  
                  {index < steps.length - 1 && (
                    <div className="hidden md:block">
                      <ArrowRight className="h-6 w-6 text-primary/50" />
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Guarantees Section */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white drop-shadow-lg mb-4">
              Our <span className="text-gradient-hero">Promises</span> to You
            </h2>
            <p className="text-xl text-white/90 max-w-2xl mx-auto">
              We stand behind our service with industry-leading guarantees
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {guarantees.map((guarantee, index) => (
              <Card key={index} className="p-8 text-center bg-gradient-card shadow-fab border-white/20 backdrop-blur-sm">
                <div className="w-16 h-16 bg-gradient-button rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow">
                  <guarantee.icon className="h-8 w-8 text-white" />
                </div>
                
                <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
                  {guarantee.highlight}
                </Badge>
                
                <h3 className="text-xl font-bold text-card-foreground mb-4">
                  {guarantee.title}
                </h3>
                
                <p className="text-muted-foreground leading-relaxed">
                  {guarantee.description}
                </p>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="p-12 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
            <h2 className="text-3xl font-bold text-card-foreground mb-4">
              Ready to Fight Your Ticket?
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of Alberta women who've successfully protected their driving records with Fabsy.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/submit-ticket">
                <Button size="lg" className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
                  Submit Your Ticket Now
                </Button>
              </Link>
              <Link to="/testimonials">
                <Button variant="outline" size="lg" className="border-primary/30 hover:bg-primary/10 transition-smooth">
                  Read Success Stories
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default HowItWorks;