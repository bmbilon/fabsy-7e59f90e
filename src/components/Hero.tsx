import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Calculator, CheckCircle2, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EligibilityChecker } from "./EligibilityChecker";

const Hero = () => {
  const navigate = useNavigate();
  const [eligibilityOpen, setEligibilityOpen] = useState(false);

  const handleHeroFile = (file?: File | null) => {
    if (!file) return;
    navigate("/submit-ticket", { state: { ticketImage: file } });
  };

  return (
    <section className="relative bg-gradient-hero overflow-hidden">
      <div className="container mx-auto px-4 py-20 lg:py-28 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: message */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1">
              <span className="text-xs font-medium tracking-wide text-white/80">No win, no admin fee*</span>
            </div>

            <div className="space-y-5">
              <h1 className="text-4xl lg:text-5xl font-bold leading-tight text-white">
                Alberta traffic ticket representation
              </h1>
              <p className="text-lg lg:text-xl text-white/70 leading-relaxed max-w-xl">
                Professional representation for Alberta drivers. Save time, reduce stress,
                and avoid unnecessary penalties. Upload your ticket and we'll review it and
                explain your options.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary-dark text-white transition-smooth text-base font-semibold px-6 py-6"
                onClick={() => setEligibilityOpen(true)}
              >
                Check if your ticket qualifies
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="link"
                className="text-white hover:text-primary-light transition-smooth text-base font-semibold"
                onClick={() => document.getElementById("savings-calculator")?.scrollIntoView({ behavior: "smooth" })}
              >
                <Calculator className="mr-2 h-5 w-5" />
                Estimate your savings
              </Button>
            </div>

            {/* Upload */}
            <div className="rounded-lg border border-white/15 bg-white/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-5 w-5 text-white/70" />
                <h2 className="text-sm font-semibold text-white">Upload your ticket</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label htmlFor="drag-upload" className="flex flex-col items-center justify-center p-4 rounded-md border border-dashed border-white/25 text-white/70 hover:border-primary hover:text-white transition-colors cursor-pointer">
                  <span className="text-sm font-medium">Drag &amp; drop</span>
                  <span className="text-xs text-white/50">or click to browse</span>
                  <input type="file" accept="image/*,.heic,.heif,.pdf" className="sr-only" id="drag-upload" onChange={(e) => handleHeroFile(e.target.files?.[0])} />
                </label>
                <label htmlFor="camera-upload" className="flex flex-col items-center justify-center p-4 rounded-md border border-dashed border-white/25 text-white/70 hover:border-primary hover:text-white transition-colors cursor-pointer">
                  <span className="text-sm font-medium">Take a photo</span>
                  <span className="text-xs text-white/50">use your camera</span>
                  <input type="file" accept="image/*,.heic,.heif" capture="environment" className="sr-only" id="camera-upload" onChange={(e) => handleHeroFile(e.target.files?.[0])} />
                </label>
              </div>
              <p className="mt-3 text-xs text-white/50 leading-relaxed">
                No-cost review. Reply within 24 hours. Questions?{" "}
                <a href="tel:403-669-5353" className="text-primary-light hover:text-white transition-colors">403-669-5353</a>
              </p>
            </div>

            <div className="flex gap-10 pt-2">
              <div>
                <div className="text-2xl font-bold text-white">95%+</div>
                <div className="text-sm text-white/50">success rate</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">$993</div>
                <div className="text-sm text-white/50">average saved</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">24 hr</div>
                <div className="text-sm text-white/50">turnaround</div>
              </div>
            </div>
          </div>

          {/* Right: outcome document, not a person */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white p-6 shadow-elevated">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-secondary" />
                  <span className="text-sm font-semibold text-foreground">Driver's Abstract</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(160_84%_39%/0.1)] px-2.5 py-1 text-xs font-medium text-[hsl(160_84%_30%)]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Cleared
                </span>
              </div>
              <div className="space-y-3 py-5">
                {["Charge", "Court date", "Representation"].map((k) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{k}</span>
                    <span className="h-2 w-24 rounded-full bg-accent" />
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-muted p-4 text-center">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Demerit points</div>
                <div className="mt-1 text-4xl font-bold text-[hsl(160_84%_30%)]">0</div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-secondary">
                <Shield className="h-4 w-4 text-primary" />
                Record kept clean. Insurance protected.
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
