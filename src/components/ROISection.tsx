import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Shield, Clock } from "lucide-react";
import { Link } from "react-router-dom";

const ROISection = () => {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            Smart Financial Move
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-white drop-shadow-lg">
            <span className="text-gradient-hero">Pay $488</span> to Save{" "}
            <span className="text-gradient-hero">$1,650</span>
          </h2>
          <p className="text-xl text-white/90 max-w-3xl mx-auto drop-shadow-sm mb-6">
            That's not just smart — that's <span className="font-semibold text-primary shadow-glow font-script text-2xl">fabulous</span> financial planning.
            Invest in yourself and protect your driving record.
          </p>
          
          {/* Zero Risk Badge */}
          <div className="inline-flex items-center gap-2 bg-green-500/20 border border-green-400/30 text-green-100 px-4 py-2 rounded-full text-sm font-medium">
            <Shield className="h-4 w-4" />
            Zero Risk - Money Back if No Savings
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          {/* Left side - ROI breakdown */}
          <div className="space-y-8">
            <Card className="p-8 bg-gradient-card shadow-fab border-white/20 backdrop-blur-sm">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-6 w-6 text-primary" />
                  <h3 className="text-2xl font-bold text-card-foreground">Return on Investment</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-accent/50 rounded-lg">
                    <span className="text-lg text-secondary">Service Investment:</span>
                    <span className="text-xl font-bold text-primary">$488</span>
                  </div>
                  
                  <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <span className="text-lg text-secondary">Potential Insurance Savings:</span>
                    <span className="text-xl font-bold text-primary">$1,001 - $1,650</span>
                  </div>
                  
                  <div className="border-t border-muted pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold text-secondary">Your Profit:</span>
                      <span className="text-2xl font-bold text-gradient-hero">$513 - $1,162</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-accent p-4 rounded-lg border border-white/20 text-center">
                  <div className="text-3xl font-bold text-gradient-hero mb-2">2-3x ROI</div>
                  <div className="text-sm text-secondary">
                    That's better than most investment portfolios
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card className="p-6 text-center bg-gradient-card backdrop-blur-sm shadow-fab border-white/20">
                <TrendingUp className="h-8 w-8 text-primary mx-auto mb-3" />
                <div className="text-2xl font-bold text-gradient-hero">94%</div>
                <div className="text-sm text-secondary">Success Rate</div>
              </Card>
              
              <Card className="p-6 text-center bg-gradient-card backdrop-blur-sm shadow-fab border-white/20">
                <Clock className="h-8 w-8 text-secondary mx-auto mb-3" />
                <div className="text-2xl font-bold text-gradient-hero">2-4</div>
                <div className="text-sm text-secondary">Weeks Process</div>
              </Card>
            </div>
          </div>

          {/* Right side - Value proposition */}
          <div className="space-y-8">
            <div className="space-y-6">
              <h3 className="text-3xl font-bold text-white drop-shadow-lg">
                You Work Hard for Your Money
              </h3>
              <p className="text-lg text-white/90 leading-relaxed drop-shadow-sm">
                Don't let one moment of going 10 over cost you $1,650 over three years. 
                Our expert team has helped over 5,000 Alberta women protect their driving records 
                and keep their insurance rates low.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-white/20 backdrop-blur-sm rounded-lg border border-primary/20">
                <Shield className="h-6 w-6 text-primary mt-1" />
                <div>
                  <h4 className="font-semibold text-primary mb-1">Protected Driving Record</h4>
                  <p className="text-sm text-white/90">
                    Keep your abstract clean and maintain your good driver status
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-white/20 backdrop-blur-sm rounded-lg border border-secondary/30">
                <DollarSign className="h-6 w-6 text-secondary mt-1" />
                <div>
                  <h4 className="font-semibold text-secondary mb-1">Lower Insurance Premiums</h4>
                  <p className="text-sm text-white/90">
                    Avoid the 3-year insurance penalty that can cost $200-$500 annually
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-white/20 backdrop-blur-sm rounded-lg border border-primary/30">
                <Clock className="h-6 w-6 text-primary mt-1" />
                <div>
                  <h4 className="font-semibold text-primary mb-1">Time & Stress Free</h4>
                  <p className="text-sm text-white/90">
                    No court dates, no paperwork, no dealing with bureaucracy
                  </p>
                </div>
              </div>
            </div>

            <Link to="/submit-ticket">
              <Button size="lg" className="w-full bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
                Start Saving Money Now
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ROISection;