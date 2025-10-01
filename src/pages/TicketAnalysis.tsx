import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, DollarSign, ArrowLeft, TrendingDown, Shield, Calculator, AlertTriangle } from "lucide-react";
import { useSearchParams, Link } from "react-router-dom";

interface TicketData {
  violation?: string;
  fine?: string; // e.g. "$300"
  ticketNumber?: string;
  issueDate?: string;
  location?: string;
}

interface StoredPayload {
  ticketData: TicketData;
  monthlyPremium?: string;
}

const SERVICE_FEE = 488;
const AVERAGE_PREMIUM = 1800;

const violationImpacts: Record<string, { increase: number; points: number; description: string }> = {
  "speeding-minor": { increase: 0.15, points: 2, description: "Minor Speeding (1-15 km/h over)" },
  "speeding-major": { increase: 0.25, points: 3, description: "Major Speeding (16-30 km/h over)" },
  "speeding-excessive": { increase: 0.35, points: 4, description: "Excessive Speeding (31+ km/h over)" },
  "careless-driving": { increase: 0.40, points: 6, description: "Careless/Reckless Driving" },
  "distracted-driving": { increase: 0.30, points: 3, description: "Distracted Driving" },
  "running-light": { increase: 0.20, points: 3, description: "Running Red Light/Stop Sign" },
  "following-too-close": { increase: 0.15, points: 2, description: "Following Too Closely" },
  "improper-lane-change": { increase: 0.10, points: 2, description: "Improper Lane Change" },
  other: { increase: 0.15, points: 2, description: "Other Traffic Violation" },
};

function detectViolationType(violationText: string): string {
  const text = (violationText || "").toLowerCase();
  if (text.includes("speed")) {
    if (text.includes("excessive") || text.match(/\d{2,}\s*km/)) {
      const match = text.match(/(\d+)\s*km/);
      if (match) {
        const speed = parseInt(match[1]);
        if (speed > 30) return "speeding-excessive";
        if (speed > 15) return "speeding-major";
      }
      return "speeding-major";
    }
    return "speeding-minor";
  }
  if (text.includes("careless") || text.includes("reckless") || text.includes("dangerous")) return "careless-driving";
  if (text.includes("distract") || text.includes("phone") || text.includes("cell")) return "distracted-driving";
  if (text.includes("red light") || text.includes("stop sign") || text.includes("traffic control")) return "running-light";
  if (text.includes("follow") && text.includes("close")) return "following-too-close";
  if (text.includes("lane") && text.includes("change")) return "improper-lane-change";
  return "other";
}

const TicketAnalysis = () => {
  const [searchParams] = useSearchParams();
  const key = searchParams.get("k");

  const [payload, setPayload] = useState<StoredPayload | null>(null);
  const [monthlyPremium, setMonthlyPremium] = useState<string>("");

  useEffect(() => {
    if (!key) return;
    const raw = localStorage.getItem(`ticket-analysis:${key}`);
    if (raw) {
      try {
        const parsed: StoredPayload = JSON.parse(raw);
        setPayload(parsed);
        if (parsed.monthlyPremium) setMonthlyPremium(parsed.monthlyPremium);
      } catch (e) {
        console.error("Failed to parse stored payload", e);
      } finally {
        // Clear stored payload after reading to avoid stale data reuse
        localStorage.removeItem(`ticket-analysis:${key}`);
      }
    }
  }, [key]);

  const result = useMemo(() => {
    if (!payload?.ticketData) return null;
    const { ticketData } = payload;

    const fineAmount = parseFloat(ticketData.fine?.replace(/[^0-9.]/g, "") || "0");
    const violationTypeKey = detectViolationType(ticketData.violation || "");
    const violation = violationImpacts[violationTypeKey];

    const userPremium = monthlyPremium ? parseFloat(monthlyPremium) * 12 : AVERAGE_PREMIUM;
    const annualIncrease = userPremium * violation.increase;
    const threeYearImpact = annualIncrease * 3;
    const totalCostIfConvicted = fineAmount + threeYearImpact;
    const potentialSavings = totalCostIfConvicted - SERVICE_FEE;
    const roi = ((potentialSavings - SERVICE_FEE) / SERVICE_FEE) * 100;

    return {
      violationType: violation.description,
      demeritPoints: violation.points,
      financials: {
        fine: fineAmount,
        estimatedInsuranceIncrease: annualIncrease,
        threeYearImpact,
        totalCostIfConvicted,
        potentialSavings,
        serviceFee: SERVICE_FEE,
        roi,
      },
      isEligible: potentialSavings > 0,
      reason:
        potentialSavings > 0
          ? `This ticket is worth disputing! You could save $${potentialSavings.toFixed(0)} over 3 years.`
          : `This ticket may not justify representation costs, but our zero-risk guarantee means you have nothing to lose.`,
    };
  }, [payload, monthlyPremium]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Header />

      <section className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center text-primary hover:underline font-medium">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Home
          </Link>
        </div>

        {!payload ? (
          <Card className="border-2 border-warning">
            <CardContent className="p-8">
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-8 w-8 text-warning flex-shrink-0" />
                <div>
                  <p className="font-bold text-lg mb-2">No ticket data found</p>
                  <p className="text-muted-foreground">Please try scanning your ticket again.</p>
                  <Link to="/">
                    <Button className="mt-4">Scan Ticket</Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : result ? (
          <div className="space-y-6">
            {/* Hero ROI Banner */}
            <div className={`relative overflow-hidden rounded-2xl p-8 ${result.isEligible ? 'bg-gradient-to-br from-green-600 to-emerald-700' : 'bg-gradient-to-br from-orange-500 to-amber-600'} text-white shadow-2xl`}>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  {result.isEligible ? (
                    <CheckCircle className="h-12 w-12" />
                  ) : (
                    <Shield className="h-12 w-12" />
                  )}
                  <h1 className="text-4xl font-bold">
                    {result.isEligible ? "This Ticket is Worth Fighting!" : "Zero-Risk Guarantee Applies"}
                  </h1>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6 mt-8">
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                    <p className="text-white/80 text-sm font-medium mb-2">Your Potential Savings</p>
                    <p className="text-5xl font-bold">${result.financials.potentialSavings.toFixed(0)}</p>
                  </div>
                  
                  {result.financials.roi > 0 && (
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                      <p className="text-white/80 text-sm font-medium mb-2">Return on Investment</p>
                      <p className="text-5xl font-bold">{result.financials.roi.toFixed(0)}%</p>
                    </div>
                  )}
                  
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                    <p className="text-white/80 text-sm font-medium mb-2">Service Fee</p>
                    <p className="text-5xl font-bold">${result.financials.serviceFee}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Side-by-Side Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Ticket Details */}
              <Card className="border-2">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <AlertTriangle className="h-6 w-6 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold">Ticket Details</h2>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b">
                      <span className="text-muted-foreground font-medium">Violation</span>
                      <span className="font-bold text-lg">{result.violationType}</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b">
                      <span className="text-muted-foreground font-medium">Fine Amount</span>
                      <span className="font-bold text-lg text-destructive">${result.financials.fine}</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b">
                      <span className="text-muted-foreground font-medium">Demerit Points</span>
                      <span className="font-bold text-lg">{result.demeritPoints} points</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-medium">Ticket Number</span>
                      <span className="font-bold text-lg">{payload.ticketData.ticketNumber || 'N/A'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Insurance Premium Input */}
              <Card className="border-2">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <Calculator className="h-6 w-6 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold">Customize Your Analysis</h2>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="monthly-premium" className="text-base font-semibold mb-3 block">
                        Monthly Insurance Premium
                      </Label>
                      <Input
                        id="monthly-premium"
                        type="number"
                        placeholder="e.g., 150"
                        value={monthlyPremium}
                        onChange={(e) => setMonthlyPremium(e.target.value)}
                        className="h-14 text-lg font-semibold"
                      />
                      <p className="text-sm text-muted-foreground mt-2">
                        {monthlyPremium 
                          ? `Annual premium: $${(parseFloat(monthlyPremium || '0') * 12).toFixed(0)}/year` 
                          : `Using average: $${AVERAGE_PREMIUM}/year`}
                      </p>
                    </div>
                    
                    <div className="bg-muted/50 rounded-lg p-4 mt-4">
                      <p className="text-sm text-muted-foreground">
                        💡 <strong>Tip:</strong> Enter your actual premium for a more accurate savings calculation
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Financial Breakdown */}
            <Card className="border-2">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-lg bg-destructive/10">
                    <TrendingDown className="h-6 w-6 text-destructive" />
                  </div>
                  <h2 className="text-2xl font-bold">Complete Financial Breakdown</h2>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-muted-foreground mb-4">If Convicted</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                        <span className="font-medium">Ticket Fine</span>
                        <span className="font-bold text-lg">${result.financials.fine}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                        <span className="font-medium">Annual Insurance Increase</span>
                        <span className="font-bold text-lg">${result.financials.estimatedInsuranceIncrease.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                        <span className="font-medium">3-Year Insurance Impact</span>
                        <span className="font-bold text-lg">${result.financials.threeYearImpact.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between items-center p-4 bg-destructive/10 rounded-lg border-2 border-destructive/20">
                        <span className="font-bold text-lg">Total Cost</span>
                        <span className="font-bold text-2xl text-destructive">${result.financials.totalCostIfConvicted.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-muted-foreground mb-4">With Our Help</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                        <span className="font-medium">Our Service Fee</span>
                        <span className="font-bold text-lg">${result.financials.serviceFee}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                        <span className="font-medium">Potential Reduction</span>
                        <span className="font-bold text-lg text-primary">-${result.financials.totalCostIfConvicted.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg border-2 border-primary/20 mt-8">
                        <span className="font-bold text-lg">Your Savings</span>
                        <span className="font-bold text-2xl text-primary">${result.financials.potentialSavings.toFixed(0)}</span>
                      </div>
                      {result.financials.roi > 0 && (
                        <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border-2 border-green-500/20 text-center">
                          <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">Return on Investment</p>
                          <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                            {result.financials.roi.toFixed(0)}% ROI
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CTA Section */}
            <Card className="border-2 border-primary bg-gradient-to-br from-primary/5 to-primary/10">
              <CardContent className="p-8 text-center">
                <Shield className="h-16 w-16 mx-auto mb-4 text-primary" />
                <h2 className="text-3xl font-bold mb-4">🛡️ Zero-Risk Guarantee</h2>
                <p className="text-xl text-muted-foreground mb-6 max-w-2xl mx-auto">
                  {result.isEligible 
                    ? "With our no-win, no-fee guarantee, you only pay if we save you money. Start now and protect your driving record!"
                    : "Even with limited savings potential, our zero-risk guarantee means you pay nothing if we don't reduce your costs. Why not try?"}
                </p>
                <div className="flex gap-4 justify-center flex-wrap">
                  <Link to="/ticket-form">
                    <Button size="lg" className="text-lg px-8 py-6 h-auto">
                      Get Started Now
                      <ArrowLeft className="ml-2 h-5 w-5 rotate-180" />
                    </Button>
                  </Link>
                  <Link to="/">
                    <Button size="lg" variant="outline" className="text-lg px-8 py-6 h-auto">
                      Scan Another Ticket
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>

      <Footer />
    </main>
  );
};

export default TicketAnalysis;
