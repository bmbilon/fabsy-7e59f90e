import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Award, 
  Target, 
  Heart, 
  Scale,
  TrendingUp,
  Shield,
  Star
} from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const About = () => {
  const stats = [
    { number: "5,000+", label: "Women Helped", icon: Users },
    { number: "94%", label: "Success Rate", icon: Award },
    { number: "$1.2M+", label: "Insurance Savings", icon: TrendingUp },
    { number: "10+", label: "Years Experience", icon: Star },
  ];

  const values = [
    {
      icon: Heart,
      title: "Women-Focused Service",
      description: "We understand the unique challenges women face with traffic tickets and insurance discrimination. Our approach is designed specifically with women's needs in mind."
    },
    {
      icon: Shield,
      title: "Complete Transparency",
      description: "No hidden fees, no surprises. We believe in honest communication and keeping you informed every step of the way."
    },
    {
      icon: Target,
      title: "Results-Driven",
      description: "Our 94% success rate speaks for itself. We're not satisfied unless we've fought hard for the best possible outcome for your case."
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
            Empowering Women Through 
            <span className="text-gradient-hero font-script block text-5xl lg:text-7xl mt-2">
              Legal Excellence
            </span>
          </h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto drop-shadow-sm">
            Founded by women, for women. We're on a mission to level the playing field 
            when it comes to traffic tickets and insurance fairness in Alberta.
          </p>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-20">
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
                  Fabsy was born from a simple frustration: watching too many women accept 
                  expensive traffic tickets without fighting back, only to face massive 
                  insurance increases that could have been avoided.
                </p>
                <p>
                  As experienced traffic representatives, we saw how the system was stacked against 
                  everyday drivers, especially women who often face higher insurance premiums 
                  and less aggressive court representation.
                </p>
                <p>
                  We decided to change that. By focusing exclusively on traffic ticket defense 
                  and building a service designed around busy women's needs, we've helped 
                  thousands keep their abstracts clean and their insurance rates low.
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
                  <p className="text-muted-foreground">Keeping abstracts fab</p>
                </div>
              </div>
              
              <p className="text-muted-foreground leading-relaxed mb-6">
                To provide every Alberta woman with accessible, expert traffic representation 
                against traffic tickets, ensuring fair treatment and protecting their 
                financial future from insurance discrimination.
              </p>
              
              <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                <p className="text-primary font-semibold text-center">
                  "Every woman deserves a fighting chance in court"
                </p>
              </div>
            </Card>
          </div>
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
              Expert <span className="text-gradient-hero">Team</span>
            </h2>
            
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-card-foreground">
                  Experienced Representatives
                </h3>
                <p className="text-muted-foreground">
                  Our team includes experienced traffic representatives with over 10 years of experience specifically 
                  in Alberta traffic matters, having handled thousands of cases successfully.
                </p>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-card-foreground">
                  Specialized Knowledge
                </h3>
                <p className="text-muted-foreground">
                  We stay current with all changes to Alberta traffic regulations and court procedures 
                  to ensure the strongest possible representation for every client.
                </p>
              </div>
            </div>
            
            <div className="bg-primary/10 p-6 rounded-lg border border-primary/20">
              <p className="text-primary font-semibold text-lg">
                Licensed to practice in all Alberta courts and committed to fighting for your rights
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
              Join thousands of satisfied clients who've kept their driving records clean and their insurance rates low.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/submit-ticket">
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