import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, DollarSign, ArrowLeft } from "lucide-react";
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
    <main className="min-h-screen">
      <Header />

      <section className="container mx-auto px-4 py-10">
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center text-primary hover:underline">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Home
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-4">Ticket Analysis Results</h1>

        {!payload ? (
          <div className="p-6 rounded-lg border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <p className="font-medium">No ticket data found.</p>
            <p className="text-sm text-muted-foreground mt-2">Please try scanning your ticket again.</p>
          </div>
        ) : result ? (
          <div className="space-y-6">
            <div className={`p-6 rounded-lg border-2 ${result.isEligible ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'}`}>
              <div className="flex items-start gap-4">
                {result.isEligible ? (
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" />
                ) : (
                  <XCircle className="h-8 w-8 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
                )}
                <div>
                  <h2 className="text-xl font-bold mb-2">
                    {result.isEligible ? "✅ Worth Fighting!" : "⚠️ Consider Carefully"}
                  </h2>
                  <p className="text-lg">{result.reason}</p>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold mb-3">Ticket Information</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Violation Type:</span>
                  <p className="font-medium">{result.violationType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Demerit Points:</span>
                  <p className="font-medium">{result.demeritPoints} points</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Fine Amount:</span>
                  <p className="font-medium">${'{'}result.financials.fine{'}'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ticket #:</span>
                  <p className="font-medium">{payload.ticketData.ticketNumber || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border space-y-3">
              <div className="space-y-2">
                <Label htmlFor="monthly-premium" className="text-sm font-medium">
                  Monthly Insurance Premium (Optional)
                </Label>
                <Input
                  id="monthly-premium"
                  type="number"
                  placeholder="e.g., 150"
                  value={monthlyPremium}
                  onChange={(e) => setMonthlyPremium(e.target.value)}
                  className="bg-white dark:bg-gray-900"
                />
                <p className="text-xs text-muted-foreground">
                  {monthlyPremium ? `Annual: $${(parseFloat(monthlyPremium || '0') * 12).toFixed(0)}` : `Leave blank to use average ($${AVERAGE_PREMIUM}/year)`}
                </p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Financial Impact</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Ticket Fine:</span>
                  <span className="font-medium">${'{'}result.financials.fine{'}'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Annual Insurance Increase:</span>
                  <span className="font-medium">${'{'}result.financials.estimatedInsuranceIncrease.toFixed(0){'}'}</span>
                </div>
                <div className="flex justify-between">
                  <span>3-Year Insurance Impact:</span>
                  <span className="font-medium">${'{'}result.financials.threeYearImpact.toFixed(0){'}'}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span>Total Cost if Convicted:</span>
                  <span className="text-destructive">${'{'}result.financials.totalCostIfConvicted.toFixed(0){'}'}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Our Service Fee:</span>
                  <span>${'{'}result.financials.serviceFee{'}'}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Your Savings:</span>
                  <span className="text-primary">${'{'}result.financials.potentialSavings.toFixed(0){'}'}</span>
                </div>
                {result.financials.roi > 0 && (
                  <div className="bg-primary/10 rounded p-2 text-center">
                    <span className="text-primary font-bold">{result.financials.roi.toFixed(0)}% more than you invest!</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Link to="/">
                <Button variant="outline">Scan Another Ticket</Button>
              </Link>
              <Link to="/ticket-form">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      <Footer />
    </main>
  );
};

export default TicketAnalysis;
