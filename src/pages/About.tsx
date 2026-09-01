import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Award, 
  Target, 
  Heart, 
  Scale,
  Shield
} from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import useSafeHead from "@/hooks/useSafeHead";

const About = () => {
  useSafeHead({
    title: "About Fabsy | Alberta Traffic Ticket Agent Service",
    description: "Learn about Fabsy Traffic Ticket Services, its Alberta agent service, founder, and source-backed editorial standards.",
    canonical: "https://fabsy.ca/about"
  });

  const stats = [
    { number: "Alberta", label: "Service Area", icon: Award },
    { number: "Agent Service", label: "Not a Law Firm", icon: Scale },
    { number: "Clear Pricing", label: "Explained Up Front", icon: Shield },
  ];

  const values = [
    {
      icon: Heart,
      title: "Driver-Focused Service",
      description: "We understand the practical concerns that can follow a traffic ticket. Our approach is designed around drivers' needs."
    },
    {
      icon: Shield,
      title: "Complete Transparency",
      description: "We explain the service fees, limitations, and next steps clearly before you proceed."
    },
    {
      icon: Target,
      title: "Results-Driven",
      description: "We review each ticket on its own facts and work toward the best available outcome without promising a particular result."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />
      
      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            About Fabsy
          </Badge>
          <h1 className="text-4xl lg:text-6xl font-bold text-white drop-shadow-lg mb-6">
            Focused Representation for
            <span className="text-gradient-hero font-script block text-5xl lg:text-7xl mt-2">
              Alberta Drivers
            </span>
          </h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto drop-shadow-sm">
            Built for Alberta drivers who want a clearer way to respond to a provincial traffic ticket.
          </p>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {stats.map((stat, index) => (
            <Card key={index} className="p-6 text-center bg-gradient-card shadow-fab border-white/20 backdrop-blur-sm">
              <stat.icon className="h-8 w-8 text-primary mx-auto mb-3" />
              <div className="text-3xl font-bold text-gradient-hero mb-2">
                {stat.number}
              </div>
              <div className="text-sm text-muted-foreground font-medium">
                {stat.label}
              </div>
            </Card>
          ))}
        </div>

        {/* Our Story */}
        <div className="mb-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-white drop-shadow-lg mb-6">
                Our <span className="text-gradient-hero">Story</span>
              </h2>
              <div className="space-y-6 text-white/90 text-lg leading-relaxed">
                <p>
                  Fabsy was built to make responding to an Alberta traffic ticket clearer and
                  more manageable for busy drivers.
                </p>
                <p>
                  Our traffic ticket agents focus on reviewing ticket details, explaining the
                  service process, and providing representation where agent services are permitted.
                </p>
                <p>
                  The service is designed around online ticket submission, clear communication,
                  and ticket-specific next steps. Fabsy is an agent service, not a law firm, and
                  does not provide legal advice.
                </p>
              </div>
            </div>
            
            <Card className="p-8 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-gradient-button rounded-full flex items-center justify-center">
                  <Scale className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-card-foreground">Our Mission</h3>
                  <p className="text-muted-foreground">Ticket-focused representation</p>
                </div>
              </div>
              
              <p className="text-muted-foreground leading-relaxed mb-6">
                To provide Alberta drivers with accessible traffic ticket agent services,
                straightforward communication, and careful review of the information available.
              </p>
              
              <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                <p className="text-primary font-semibold text-center">
                  "Alberta drivers deserve clear information and careful representation"
                </p>
              </div>
            </Card>
          </div>
        </div>

        {/* Editorial standards */}
        <div className="mb-20">
          <Card className="p-8 md:p-10 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
            <h2 className="text-3xl font-bold text-card-foreground mb-5">How Fabsy reviews public information</h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Fabsy's public guides use primary sources where available, including the Government of Alberta,
                Alberta Court of Justice, and the Traffic Tickets Digital Service. Curated guides identify their
                sources and last editorial review date so readers can check the controlling information directly.
              </p>
              <p>
                Fabsy distinguishes general legal information from ticket-specific agent services. The website is
                not legal advice, Fabsy is not a law firm, and no article is presented as a substitute for the
                notice, current court instructions, or advice from a lawyer.
              </p>
              <p>
                Accuracy concern or changed official guidance? Email{' '}
                <a href="mailto:hello@fabsy.ca" className="font-semibold text-primary underline underline-offset-4">
                  hello@fabsy.ca
                </a>
                . Learn more about <Link to="/founder" className="font-semibold text-primary underline underline-offset-4">Lauren Bilon, Fabsy's founder</Link>.
              </p>
            </div>
          </Card>
        </div>

        {/* Our Values */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white drop-shadow-lg mb-4">
              What We <span className="text-gradient-hero">Stand For</span>
            </h2>
            <p className="text-xl text-white/90 max-w-2xl mx-auto">
              Our core values guide everything we do
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {values.map((value, index) => (
              <Card key={index} className="p-8 bg-gradient-card shadow-fab border-white/20 backdrop-blur-sm">
                <div className="w-16 h-16 bg-gradient-button rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow">
                  <value.icon className="h-8 w-8 text-white" />
                </div>
                
                <h3 className="text-xl font-bold text-card-foreground mb-4 text-center">
                  {value.title}
                </h3>
                
                <p className="text-muted-foreground leading-relaxed text-center">
                  {value.description}
                </p>
              </Card>
            ))}
          </div>
        </div>

        {/* Team Section */}
        <div className="mb-16">
          <Card className="p-12 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm text-center">
            <h2 className="text-4xl font-bold text-card-foreground mb-6">
              Focused <span className="text-gradient-hero">Team</span>
            </h2>
            
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-card-foreground">
                  Traffic Ticket Agents
                </h3>
                <p className="text-muted-foreground">
                  Our team focuses on Alberta provincial traffic ticket matters and assesses
                  whether agent representation is available for each submission.
                </p>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-card-foreground">
                  Focused Review
                </h3>
                <p className="text-muted-foreground">
                  We review the ticket, available documents, and relevant court information to
                  identify practical next steps for each client.
                </p>
              </div>
            </div>
            
            <div className="bg-primary/10 p-6 rounded-lg border border-primary/20">
              <p className="text-primary font-semibold text-lg">
                Service is available across Alberta where paid agent representation is permitted
              </p>
            </div>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="p-12 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
            <h2 className="text-3xl font-bold text-card-foreground mb-4">
              Ready to Experience the Fabsy Difference?
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Submit your ticket for review and learn whether Fabsy's agent service is available for your matter.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/traffic-ticket-assessment/start">
                <Button size="lg" className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
                  Get Started Today
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

export default About;
