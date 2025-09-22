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
              <h1 className="text-5xl lg:text-7xl font-bold leading-tight text-white drop-shadow-lg">
                Keep Your Abstract{" "}
                <span className="text-gradient-hero font-script text-6xl lg:text-8xl">Fab</span>
              </h1>
              <p className="text-2xl lg:text-3xl font-medium text-white/95 drop-shadow-md">
                Minimize the Tab
              </p>
            </div>
            
            <div className="space-y-6">
              <p className="text-xl lg:text-2xl text-white/95 max-w-2xl drop-shadow-sm">
                That <span className="font-bold text-primary shadow-glow">$150 ticket</span> is actually costing you{" "}
                <span className="font-bold text-destructive shadow-glow">$1,650</span>. 
                We fight it with a <span className="font-bold text-primary shadow-glow">94% success rate</span>.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/submit-ticket">
                  <Button size="lg" className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow w-full sm:w-auto border-0">
                    Upload Your Ticket <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="border-white/30 bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-smooth">
                  Calculate Real Cost
                </Button>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-6 pt-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-white drop-shadow-lg">94%</div>
                <div className="text-sm text-white/80">Success Rate</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white drop-shadow-lg">5,000+</div>
                <div className="text-sm text-white/80">Women Served</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white drop-shadow-lg">$1,200</div>
                <div className="text-sm text-white/80">Avg. Saved</div>
              </div>
            </div>
          </div>

          {/* Right column - Cost visualization */}
          <div className="space-y-6">
            <Card className="p-8 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm">
              <div className="text-center space-y-6">
                <div className="flex items-center justify-center gap-4">
                  <Calculator className="h-8 w-8 text-primary" />
                  <h3 className="text-2xl font-bold text-card-foreground">The Hidden Cost Reality</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-accent/50 rounded-lg">
                    <span className="text-lg text-secondary">Ticket Fine:</span>
                    <span className="text-2xl font-bold text-secondary">$150</span>
                  </div>
                  
                  <div className="flex justify-center">
                    <ArrowRight className="h-6 w-6 text-primary animate-pulse" />
                  </div>
                  
                  <div className="flex justify-between items-center p-4 bg-destructive/15 rounded-lg border border-destructive/30">
                    <span className="text-lg text-secondary">Insurance Increase (3 years):</span>
                    <span className="text-2xl font-bold text-destructive">$1,500</span>
                  </div>
                  
                  <div className="border-t border-muted pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold text-secondary">Total Real Cost:</span>
                      <span className="text-3xl font-bold text-destructive">$1,650</span>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Shield className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-primary">Fabsy Solution</span>
                  </div>
                  <div className="text-sm text-card-foreground">
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