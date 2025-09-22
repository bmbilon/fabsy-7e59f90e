import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Shield, Calculator } from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-woman-driver-new.jpg";

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
                Fight Your Traffic{" "}
                <span className="text-primary">Ticket</span>
              </h1>
              <p className="text-2xl lg:text-3xl font-medium text-white/95 drop-shadow-md">
                Save Money & Points
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

          {/* Right column - Image with overlay */}
          <div className="flex items-center justify-center">
            <div className="relative">
              <img 
                src={heroImage} 
                alt="Confident professional woman driver" 
                className="rounded-2xl shadow-elevated w-full max-w-md h-80 object-cover transform scale-x-[-1]"
              />
              <div className="absolute inset-0 flex items-start justify-end rounded-2xl bg-black/20 p-6">
                <h2 className="text-pink-300 text-3xl font-script font-semibold drop-shadow-lg leading-relaxed text-right">
                  No demerit points<br />on my FABstract!
                </h2>
              </div>
              
              {/* Driver's Abstract Document */}
              <div className="absolute bottom-4 -right-8 bg-white rounded shadow-lg p-4 w-36 h-44 transform rotate-[5deg] border border-gray-300 relative overflow-hidden">
                {/* Check mark in upper right corner */}
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center z-10">
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
                
                {/* Document header */}
                <div className="border-b border-gray-200 pb-2 mb-3">
                  <div className="text-[10px] font-bold text-gray-800 text-center">DRIVER'S ABSTRACT</div>
                </div>
                
                {/* Document content */}
                <div className="space-y-2">
                  <div className="text-[8px] text-gray-500 space-y-1">
                    <div>________________</div>
                    <div>________________</div>
                    <div>________________</div>
                  </div>
                  
                  <div className="border-t border-gray-100 pt-2 mt-4">
                    <div className="text-[8px] text-gray-600 mb-1">DEMERIT POINTS</div>
                    <div className="flex items-center justify-center bg-green-50 rounded p-2">
                      <span className="text-2xl font-bold text-green-600">0</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;