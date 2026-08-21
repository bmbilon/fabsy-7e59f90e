import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Zap, 
  Phone, 
  Camera, 
  Car, 
  AlertTriangle, 
  Clock,
  Shield,
  CheckCircle,
  DollarSign
} from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import useSafeHead from "@/hooks/useSafeHead";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";

const Services = () => {
  useSafeHead({
    title: "Traffic Ticket Agent Services | Fabsy Alberta",
    description: "Alberta traffic ticket agent services for speeding, red light, distracted driving, careless driving, and other provincial traffic matters.",
    canonical: "https://fabsy.ca/services"
  });

  const ticketTypes = [
    {
      icon: Zap,
      title: "Speeding Tickets",
      description: "We review the ticket, available disclosure, and the circumstances you provide."
    },
    {
      icon: AlertTriangle,
      title: "Excessive Speeding",
      description: "We assess the ticket details and explain whether agent representation is available."
    },
    {
      icon: Phone,
      title: "Distracted Driving",
      description: "We review the allegation, the available information, and possible next steps."
    },
    {
      icon: Camera,
      title: "Photo Radar",
      description: "We review automated-enforcement tickets and the options shown on the ticket."
    },
    {
      icon: Car,
      title: "Careless Driving",
      description: "We assess service availability and the information relevant to the allegation."
    },
    {
      icon: Clock,
      title: "Other Violations",
      description: "We also review red-light, lane-change, and other Alberta traffic tickets."
    }
  ];

  const benefits = [
    {
      icon: Shield,
      title: "Understand the Stakes",
      description: "Review the ticket and its possible record implications before choosing how to respond.",
      value: "Informed decisions"
    },
    {
      icon: CheckCircle,
      title: "Review Your Options",
      description: "Get a focused assessment of the ticket information and available next steps.",
      value: "Ticket-specific review"
    },
    {
      icon: DollarSign,
      title: "Know the Pricing",
      description: "Pricing is explained before checkout, including when an additional charge applies.",
      value: "Clear fee structure"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />
      
      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            Traffic Ticket Defense
          </Badge>
          <h1 className="text-4xl lg:text-6xl font-bold text-white drop-shadow-lg mb-6">
            What We <span className="text-gradient-hero font-script">Help</span> With
          </h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto drop-shadow-sm">
            Fabsy provides traffic ticket agent services across Alberta. Fabsy is not a law firm
            and does not provide legal advice.
          </p>
        </div>

        {/* Ticket Types Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {ticketTypes.map((ticket, index) => (
            <Card key={index} className="p-8 bg-gradient-card shadow-fab border-white/20 backdrop-blur-sm hover:shadow-elevated transition-all duration-300">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 bg-gradient-button rounded-full flex items-center justify-center shadow-glow flex-shrink-0">
                  <ticket.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-card-foreground mb-2">
                  {ticket.title}
                </h3>
              </div>
              
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {ticket.description}
              </p>
              
              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                Alberta agent service
              </Badge>
            </Card>
          ))}
        </div>

        {/* Entry-level assessment */}
        <div className="mb-16">
          <Card className="overflow-hidden border-violet-300/30 bg-white shadow-elevated">
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="p-8 sm:p-10">
                <Badge className="mb-4">Entry-level decision service</Badge>
                <h2 className="text-3xl font-bold text-card-foreground">Not ready to spend $488+ on representation?</h2>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                  For $149 CAD, Fabsy reviews the Alberta ticket, explains the options, assesses likely insurance significance and tells you whether further paid representation appears economically worthwhile.
                </p>
                <p className="mt-3 font-semibold text-foreground">If fighting it isn't worth the cost, we'll tell you.</p>
                <Button asChild size="lg" className="mt-6"><Link to={TICKET_ASSESSMENT.slug}>{TICKET_ASSESSMENT.cta}</Link></Button>
              </div>
              <div className="bg-slate-950 p-8 text-white sm:p-10">
                <p className="text-sm font-semibold text-violet-200">Complete assessment</p>
                <p className="mt-2 text-5xl font-bold">$149</p>
                <p className="mt-1 text-sm text-slate-300">CAD · one-time · applicable tax included</p>
                <p className="mt-6 text-sm leading-relaxed text-slate-300">Government fines and any later representation fee are separate. No percentage or success fee applies to the assessment.</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Benefits Section */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white drop-shadow-lg mb-4">
              Why Fight Your <span className="text-gradient-hero">Ticket</span>?
            </h2>
            <p className="text-xl text-white/90 max-w-2xl mx-auto">
              A ticket can affect more than the amount printed on it
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <Card key={index} className="p-8 text-center bg-gradient-card shadow-fab border-white/20 backdrop-blur-sm">
                <div className="w-16 h-16 bg-gradient-button rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow">
                  <benefit.icon className="h-8 w-8 text-white" />
                </div>
                
                <h3 className="text-xl font-bold text-card-foreground mb-4">
                  {benefit.title}
                </h3>
                
                <p className="text-muted-foreground leading-relaxed mb-4">
                  {benefit.description}
                </p>
                
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  {benefit.value}
                </Badge>
              </Card>
            ))}
          </div>
        </div>

        {/* Process Overview */}
        <div className="mb-16">
          <Card className="p-12 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-card-foreground mb-4">
                Our <span className="text-gradient-hero">Review</span> Process
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                We examine the information available and identify practical next steps
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-card-foreground">
                  Ticket Information We Review:
                </h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    The allegation and offence details shown on the ticket
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Available disclosure and supporting material
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Filing, service, and court information
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Any documents or evidence you provide
                  </li>
                </ul>
              </div>
              
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-card-foreground">
                  Circumstances We Consider:
                </h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Weather and road conditions at the time
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Traffic flow and safety considerations
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Emergency or necessity situations
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Mistaken identity or vehicle confusion
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </div>

        {/* Special Note */}
        <div className="mb-16">
          <Card className="p-8 bg-gradient-accent border-primary/20">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-card-foreground mb-4">
                A Note on Insurance Increases
              </h3>
              <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl mx-auto">
                Insurance consequences vary by driver, conviction, insurer, and renewal timing.
                Fabsy's $149 Ticket + Insurance Impact Assessment can estimate likely risk and
                financial significance, but it is not an insurer-issued quote and does not promise savings.
              </p>
            </div>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="p-12 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
            <h2 className="text-3xl font-bold text-card-foreground mb-4">
              Get Your Ticket Reviewed
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Pricing is a flat $488 plus 30% of any fine reduction achieved. If the fine is not
              reduced, there is no additional charge.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/submit-ticket">
                <Button size="lg" className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
                  Submit Your Ticket
                </Button>
              </Link>
              <Link to="/how-it-works">
                <Button variant="outline" size="lg" className="border-primary/30 hover:bg-primary/10 transition-smooth">
                  Learn How It Works
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

export default Services;
