import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Shield, Calculator } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import heroImage from "@/assets/hero-woman-driver-new.jpg";
import { EligibilityChecker } from "./EligibilityChecker";

const Hero = () => {
  const navigate = useNavigate();
  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  
  const handleHeroFile = (file?: File | null) => {
    if (!file) return;
    navigate("/submit-ticket", { state: { ticketImage: file } });
  };
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
              <div className="inline-block bg-white/20 backdrop-blur-sm border border-white/30 rounded-full px-4 py-2 mb-4">
                <p className="text-sm font-semibold text-white">✓ No Win, No Fee Guarantee</p>
              </div>
              <h1 className="text-4xl lg:text-6xl font-bold leading-tight text-white drop-shadow-lg">
                If you got a traffic ticket in Alberta, you may be able to dispute it — start a{" "}
                <button 
                  onClick={() => setEligibilityOpen(true)}
                  className="text-primary hover:text-primary-glow underline decoration-2 underline-offset-4 cursor-pointer transition-colors"
                >
                  free eligibility check
                </button>.
              </h1>
              <p className="text-xl lg:text-2xl text-white/95 font-semibold leading-relaxed">
                Protect your insurance rates from skyrocketing — one ticket can cost you thousands in premium increases
              </p>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <Button 
                  size="lg" 
                  className="bg-primary hover:bg-primary/90 text-white transition-smooth text-xl font-bold px-8 py-6 shadow-glow"
                  onClick={() => setEligibilityOpen(true)}
                >
                  Free eligibility check — start now
                  <ArrowRight className="ml-3 h-6 w-6" />
                </Button>
                <p className="text-sm text-white/80 leading-relaxed">
                  No-cost review • 24-hr reply
                </p>
              </div>

              {/* Upload Your Ticket Box */}
              <div className="bg-white/90 backdrop-blur-sm border border-white/50 rounded-lg p-6 shadow-glow">
                <div className="flex items-center gap-3 mb-4">
                  <ArrowRight className="h-6 w-6 text-primary" />
                  <h3 className="text-xl font-bold text-gray-800">Upload Your Ticket*</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label htmlFor="drag-upload" className="flex flex-col items-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary transition-colors cursor-pointer">
                    <svg className="h-8 w-8 text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-sm font-medium text-gray-600">Drag & Drop</span>
                    <span className="text-xs text-gray-500">or click to browse</span>
                    <input type="file" accept="image/*,.heic,.heif,.pdf" className="sr-only" id="drag-upload" onChange={(e) => handleHeroFile(e.target.files?.[0])} />
                  </label>
                  <label htmlFor="camera-upload" className="flex flex-col items-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary transition-colors cursor-pointer">
                    <svg className="h-8 w-8 text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-600">Camera</span>
                    <span className="text-xs text-gray-500">Take photo</span>
                    <input type="file" accept="image/*,.heic,.heif" capture="environment" className="sr-only" id="camera-upload" onChange={(e) => handleHeroFile(e.target.files?.[0])} />
                  </label>
                </div>
              </div>
              
              <div className="flex justify-center lg:justify-start">
                <Button 
                  size="lg" 
                  className="bg-[#5b3ac7] text-white border-[#5b3ac7] hover:bg-[#7c4fea] hover:border-[#7c4fea] shadow-glow transition-smooth text-xl font-bold px-8 py-4"
                  onClick={() => {
                    document.getElementById('savings-calculator')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <Calculator className="mr-3 h-6 w-6" />
                  Calculate Savings
                </Button>
              </div>

              {/* Zero Risk Guarantee */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/30 rounded-lg p-6 shadow-glow">
                <div className="flex items-center gap-3 mb-3">
                  <Shield className="h-6 w-6 text-primary" />
                  <h3 className="text-xl font-bold text-white">No Win, No Fee—Guaranteed</h3>
                </div>
                <p className="text-white/95 leading-relaxed">
                  If we don't save you money, you pay nothing. Zero risk, zero pressure. Questions? Call us: <a href="tel:825-793-2279" className="font-bold text-primary hover:text-primary-light transition-smooth underline">(825) 793-2279</a>
                </p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-6 pt-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-white drop-shadow-lg"><a href="/proof" className="underline decoration-dashed underline-offset-4">100%</a></div>
                <div className="text-sm text-white/80"><a href="/proof" className="underline decoration-dashed underline-offset-4 hover:text-primary">Success Rate</a></div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white drop-shadow-lg">$993</div>
                <div className="text-sm text-white/80">avg saved</div>
              </div>
            </div>
          </div>

          {/* Right column - Image with overlay */}
          <div className="flex items-center justify-center">
            <div className="relative">
              <img 
                src={heroImage} 
                alt="Professional Alberta woman driver celebrating clean driving abstract with zero demerit points after successful traffic ticket defense" 
                className="rounded-2xl shadow-elevated w-full max-w-md h-80 object-cover transform scale-x-[-1]"
                loading="eager"
                width="400"
                height="320"
              />
              <div className="absolute inset-0 flex items-start justify-end rounded-2xl bg-black/20 p-6">
                <h2 className="text-pink-300 text-3xl font-script font-semibold drop-shadow-lg leading-relaxed text-right">
                  No demerit points<br />on my FABstract!
                </h2>
              </div>
              
              {/* Driver's Abstract Document */}
              <div className="absolute bottom-4 left-1/2 bg-white rounded shadow-lg p-4 w-36 h-44 transform -translate-x-1/2 rotate-[5deg] border border-gray-300 relative overflow-hidden">
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
      
      <EligibilityChecker open={eligibilityOpen} onOpenChange={setEligibilityOpen} />
    </section>
  );
};

export default Hero;