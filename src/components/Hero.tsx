import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Shield, Calculator } from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-woman-driver.jpg";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-hero overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-gradient-soft opacity-50" />
      <div className="absolute top-20 left-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-48 h-48 bg-secondary/10 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left column - Hero content */}
          <div className="text-center lg:text-left space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-7xl font-bold leading-tight">
                Keep Your Abstract{" "}
                <span className="text-gradient-primary">Fab</span>
              </h1>
              <p className="text-2xl lg:text-3xl font-semibold text-muted-foreground">
                Minimize the Tab
              </p>
            </div>
            
            <div className="space-y-6">
              <p className="text-xl lg:text-2xl text-foreground/80 max-w-2xl">
                That <span className="font-bold text-primary">$150 ticket</span> is actually costing you{" "}
                <span className="font-bold text-destructive">$1,650</span>. 
                We fight it with a <span className="font-bold text-primary">94% success rate</span>.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/submit-ticket">
                  <Button size="lg" className="bg-gradient-primary hover:opacity-90 transition-smooth shadow-glow w-full sm:w-auto">
                    Upload Your Ticket <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="border-primary/30 hover:bg-primary/10 transition-smooth">
                  Calculate Real Cost
                </Button>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-6 pt-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-gradient-primary">94%</div>
                <div className="text-sm text-muted-foreground">Success Rate</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gradient-primary">5,000+</div>
                <div className="text-sm text-muted-foreground">Women Served</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gradient-primary">$1,200</div>
                <div className="text-sm text-muted-foreground">Avg. Saved</div>
              </div>
            </div>
          </div>

          {/* Right column - Cost visualization */}
          <div className="space-y-6">
            <Card className="p-8 bg-gradient-card shadow-elevated border-primary/20">
              <div className="text-center space-y-6">
                <div className="flex items-center justify-center gap-4">
                  <Calculator className="h-8 w-8 text-primary" />
                  <h3 className="text-2xl font-bold">The Hidden Cost Reality</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-background/50 rounded-lg">
                    <span className="text-lg">Ticket Fine:</span>
                    <span className="text-2xl font-bold text-foreground">$150</span>
                  </div>
                  
                  <div className="flex justify-center">
                    <ArrowRight className="h-6 w-6 text-primary animate-pulse" />
                  </div>
                  
                  <div className="flex justify-between items-center p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                    <span className="text-lg">Insurance Increase (3 years):</span>
                    <span className="text-2xl font-bold text-destructive">$1,500</span>
                  </div>
                  
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total Real Cost:</span>
                      <span className="text-3xl font-bold text-destructive">$1,650</span>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Shield className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-primary">Fabsy Solution</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Pay <span className="font-bold text-primary">$488</span> • Save up to <span className="font-bold text-primary">$1,650</span>
                  </div>
                </div>
              </div>
            </Card>

            <div className="hidden lg:block">
              <img 
                src={heroImage} 
                alt="Confident professional woman driver" 
                className="rounded-2xl shadow-elevated w-full h-80 object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;