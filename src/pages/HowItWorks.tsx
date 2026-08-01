import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HowToSchema from "@/components/HowToSchema";
import { Shield, Upload, FileCheck, Scale, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useSafeHead from "@/hooks/useSafeHead";

/**
 * HowItWorks, content + schema in sync; short meta for AEO.
 */

const HowItWorks: React.FC = () => {
  const navigate = useNavigate();
  useSafeHead({
    title: "How Fabsy Works | Alberta Traffic Ticket Help",
    description: "See Fabsy's five-step Alberta traffic ticket process, from ticket submission and assessment through agent representation where permitted.",
    canonical: "https://fabsy.ca/how-it-works",
  });
  
  // Handle file upload and navigate to submit-ticket page
  const handleTicketUpload = (file?: File | null) => {
    if (!file) return;
    navigate("/submit-ticket", { state: { ticketImage: file } });
  };
  
  const steps = [
    {
      name: "Upload your ticket",
      text: "Upload a clear image or PDF of the ticket so Fabsy can review the information you provide.",
      url: "https://fabsy.ca/submit-ticket",
      icon: Upload,
    },
    {
      name: "Get a free analysis",
      text: "Fabsy reviews the submitted ticket and explains whether the service is available and what next steps may be considered. Keep following the instructions and deadlines printed on the ticket unless Fabsy confirms otherwise.",
      url: "https://fabsy.ca/submit-ticket",
      icon: FileCheck,
    },
    {
      name: "Review the service scope",
      text: "Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced. Fabsy confirms the available service scope before the matter proceeds.",
      url: "https://fabsy.ca/services",
      icon: Shield,
    },
    {
      name: "Proceed with the accepted service",
      text: "If Fabsy accepts the matter, it provides traffic ticket agent services where permitted and available. Court requirements and client attendance depend on the matter.",
      url: "https://fabsy.ca/how-it-works",
      icon: Scale,
    },
    {
      name: "Receive the outcome",
      text: "Fabsy communicates the outcome information it receives and explains any next steps within the accepted service scope. Individual outcomes vary.",
      url: "https://fabsy.ca/testimonials",
      icon: Trophy,
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-hero">
      <HowToSchema
        name="How to Fight a Traffic Ticket in Alberta"
        description="A clear five-step process for submitting an Alberta traffic ticket, reviewing available options, and receiving agent representation where permitted."
        steps={steps.map((s) => ({ name: s.name, text: s.text, url: s.url }))}
      />

      <Header />

      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold mb-4 text-white">How Fabsy's Ticket Review Process Works</h1>
          <p className="text-lg text-white/80 mb-8">
            Five steps from ticket submission through the scope and outcome of an accepted agent service.
          </p>

          <div className="space-y-8">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={step.name} className="bg-card rounded-xl p-6 shadow-elegant border border-primary/20 hover:shadow-glow transition-smooth">
                  <div className="flex items-start gap-4">
                    <div className="bg-gradient-primary text-white rounded-full w-12 h-12 flex items-center justify-center shadow-md">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="mb-2">
                        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold mr-2">Step {idx + 1}</span>
                        <h3 className="font-bold text-xl inline-block text-foreground">{step.name}</h3>
                      </div>
                      <p className="text-muted-foreground leading-relaxed mb-4">{step.text}</p>
                      
                      {/* Upload interface for first step */}
                      {idx === 0 && (
                        <div className="bg-gradient-soft border border-primary/30 rounded-lg p-4 mt-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label htmlFor={`drag-upload-${idx}`} className="flex flex-col items-center p-4 border-2 border-dashed border-primary/30 rounded-lg hover:border-primary transition-colors cursor-pointer bg-white/50">
                              <svg className="h-8 w-8 text-primary/70 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              <span className="text-sm font-medium text-primary">Drag & Drop</span>
                              <span className="text-xs text-muted-foreground">or click to browse</span>
                              <input 
                                type="file" 
                                accept="image/*,.heic,.heif,.pdf" 
                                className="sr-only" 
                                id={`drag-upload-${idx}`} 
                                onChange={(e) => handleTicketUpload(e.target.files?.[0])} 
                              />
                            </label>
                            <label htmlFor={`camera-upload-${idx}`} className="flex flex-col items-center p-4 border-2 border-dashed border-primary/30 rounded-lg hover:border-primary transition-colors cursor-pointer bg-white/50">
                              <svg className="h-8 w-8 text-primary/70 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span className="text-sm font-medium text-primary">Camera</span>
                              <span className="text-xs text-muted-foreground">Take photo</span>
                              <input 
                                type="file" 
                                accept="image/*,.heic,.heif" 
                                capture="environment" 
                                className="sr-only" 
                                id={`camera-upload-${idx}`} 
                                onChange={(e) => handleTicketUpload(e.target.files?.[0])} 
                              />
                            </label>
                          </div>
                          <p className="text-xs text-muted-foreground text-center mt-2">
                            Supported formats: JPG, PNG, HEIC, PDF • Max 10MB
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default HowItWorks;
