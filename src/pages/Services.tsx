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

const Services = () => {
  useSafeHead({
    title: "Traffic Ticket Defense Services | Fabsy Alberta",
    description: "Complete traffic ticket defense for speeding, red light violations, careless driving, and more. 100% success rate. Serving all Alberta cities.",
    canonical: "https://fabsy.ca/services",
    keywords: "traffic ticket services Alberta, fight speeding ticket, careless driving defense, distracted driving lawyer",
    schema: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "Traffic Ticket Defense Services",
      "description": "Complete list of traffic ticket defense services offered by Fabsy",
      "itemListElement": [
        {
          "@type": "Service",
          "position": 1,
          "name": "Speeding Ticket Defense",
          "description": "Defense against all speeding violations including excessive speeding charges"
        },
        {
          "@type": "Service",
          "position": 2,
          "name": "Red Light Violation Defense",
          "description": "Defense against red light camera and officer-issued red light tickets"
        },
        {
          "@type": "Service",
          "position": 3,
          "name": "Distracted Driving Defense",
          "description": "Defense against phone use and distracted driving charges"
        },
        {
          "@type": "Service",
          "position": 4,
          "name": "Careless Driving Defense",
          "description": "Defense against careless and dangerous driving charges"
        },
        {
          "@type": "Service",
          "position": 5,
          "name": "Stop Sign Violation Defense",
          "description": "Defense against failure to stop at stop signs"
        }
      ]
    }
  });

  const ticketTypes = [
    {
      icon: Zap,
      title: "Speeding Tickets",
      description: "Most common traffic violation. We fight these daily with high success rates.",
      penalty: "3-6 demerits",
      fine: "$78-$474",
      successRate: "96%"
    },
    {
      icon: AlertTriangle,
      title: "Excessive Speeding",
      description: "50+ km/h over the limit. Serious charges that can lead to license suspension.",
      penalty: "6 demerits + suspension",
      fine: "$474-$2,542",
      successRate: "89%"
    },
    {
      icon: Phone,
      title: "Distracted Driving",
      description: "Phone use while driving. Heavy penalties and insurance increases.",
      penalty: "3 demerits",
      fine: "$300",
      successRate: "92%"
    },
    {
      icon: Camera,
      title: "Photo Radar",
      description: "Automated camera tickets. Often have technical defenses available.",
      penalty: "No demerits*",
      fine: "$78-$474",
      successRate: "91%"
    },
    {
      icon: Car,
      title: "Careless Driving",
      description: "Subjective charge that can have serious consequences on your record.",
      penalty: "6 demerits",
      fine: "$400",
      successRate: "87%"
    },
    {
      icon: Clock,
      title: "Other Violations",
      description: "Running red lights, improper lane changes, and other traffic infractions.",
      penalty: "2-4 demerits",
      fine: "$115-$287",
      successRate: "100%"
    }
  ];

  const benefits = [
    {
      icon: Shield,
      title: "Protect Your Insurance",
      description: "Avoid premium increases that can cost $500+ per year for 3 years",
      value: "Save up to $1,650"
    },
    {
      icon: CheckCircle,
      title: "Keep Your Record Clean",
      description: "Maintain your good driver status and avoid demerit point accumulation",
      value: "Protect your license"
    },
    {
      icon: DollarSign,
      title: "Minimize Financial Impact",
      description: "Often the legal fee is less than the long-term insurance cost",
      value: "Smart investment"
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
            Expert defense for all types of Alberta traffic violations. 
            We've successfully handled thousands of cases across every category.
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
                <div>
                  <h3 className="text-xl font-bold text-card-foreground mb-2">
                    {ticket.title}
                  </h3>
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                    {ticket.successRate} Success Rate
                  </Badge>
                </div>
              </div>
              
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {ticket.description}
              </p>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-muted">
                  <span className="text-sm text-muted-foreground">Penalty:</span>
                  <span className="font-medium text-card-foreground">{ticket.penalty}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-muted">
                  <span className="text-sm text-muted-foreground">Fine Range:</span>
                  <span className="font-medium text-card-foreground">{ticket.fine}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Benefits Section */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white drop-shadow-lg mb-4">
              Why Fight Your <span className="text-gradient-hero">Ticket</span>?
            </h2>
            <p className="text-xl text-white/90 max-w-2xl mx-auto">
              The true cost of accepting a ticket goes far beyond the fine
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
                Our <span className="text-gradient-hero">Defense</span> Strategy
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                We examine every aspect of your case to build the strongest possible defense
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-card-foreground">
                  Legal Technicalities We Review:
                </h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Radar/laser device calibration and certification
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Officer training and qualification records
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Proper service and filing of the ticket
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    Charter rights violations during the stop
                  </li>
                </ul>
              </div>
              
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-card-foreground">
                  Circumstantial Defenses:
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
                Special Note for Women Drivers
              </h3>
              <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl mx-auto">
                Research shows that women often face higher insurance premium increases after traffic violations. 
                This makes professional ticket defense even more valuable as an investment in your financial future. 
                Our clients typically save 3-5 times our fee in avoided insurance costs.
              </p>
            </div>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="p-12 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
            <h2 className="text-3xl font-bold text-card-foreground mb-4">
              Don't Let That Ticket Cost You Thousands
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Upload your ticket now and let our experts fight for the best possible outcome.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/submit-ticket">
                <Button size="lg" className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
                  Submit Your Ticket - $488
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