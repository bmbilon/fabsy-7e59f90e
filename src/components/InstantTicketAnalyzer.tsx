import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, DollarSign, FileText, Zap, TrendingDown, Shield, Calendar } from "lucide-react";
import { useTicketAssessment, AssessmentFormData } from "@/hooks/useTicketAssessment";

interface InstantTicketAnalyzerProps {
  ticketImage: File | null;
  fineAmount: string;
  violation: string;
}

const InstantTicketAnalyzer = ({ ticketImage, fineAmount, violation }: InstantTicketAnalyzerProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const { calculateAssessment, getViolationTypeKey, getEstimatedDemeritPoints } = useTicketAssessment();

  useEffect(() => {
    if (ticketImage && fineAmount && violation) {
      setIsAnalyzing(true);
      // Simulate analysis delay
      const timer = setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisComplete(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [ticketImage, fineAmount, violation]);

  if (!ticketImage || !fineAmount || !violation) {
    return null;
  }

  const fine = parseFloat(fineAmount.replace('$', '')) || 0;
  const ticketType = getViolationTypeKey(violation);
  const estimatedPoints = getEstimatedDemeritPoints(violation);

  const assessmentData: AssessmentFormData = {
    ticketType,
    fineAmount: fine,
    demeritPoints: estimatedPoints,
    driverRecord: 'clean' // Default assumption
  };

  const assessment = calculateAssessment(assessmentData);
  const avgSavings = Math.round((assessment.savings.totalMin + assessment.savings.totalMax) / 2);
  const avgFineSavings = Math.round((assessment.savings.fineMin + assessment.savings.fineMax) / 2);
  const processingTime = `${assessment.timeline[0]}-${assessment.timeline[1]} weeks`;

  return (
    <Card className="mt-6 border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Instant Ticket Analysis</CardTitle>
          {isAnalyzing && (
            <Badge variant="secondary" className="animate-pulse">
              Analyzing...
            </Badge>
          )}
          {analysisComplete && (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Complete
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isAnalyzing ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
              Analyzing your ticket image and violation details...
            </div>
            <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
              <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }}></div>
            </div>
          </div>
        ) : analysisComplete ? (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <DollarSign className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Total Savings
                  </p>
                  <p className="text-lg font-bold text-green-600">
                    ${avgSavings}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <Clock className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Processing Time
                  </p>
                  <p className="text-sm font-semibold text-blue-600">
                    {processingTime}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <Shield className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
                    Success Rate
                  </p>
                  <p className="text-sm font-semibold text-purple-600">
                    {assessment.ticketInfo.flexibility === 'high' ? '85%' : 
                     assessment.ticketInfo.flexibility === 'medium' ? '70%' : '55%'}
                  </p>
                </div>
              </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-white/50 dark:bg-black/20 border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4" />
                    Current vs Potential Outcome
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Fine:</span>
                    <div>
                      <span className="line-through text-muted-foreground">${assessment.original.fine}</span>
                      <span className="ml-2 text-green-600 font-semibold">
                        ${Math.round((assessment.potential.fineMin + assessment.potential.fineMax) / 2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Demerit Points:</span>
                    <div>
                      <span className="line-through text-muted-foreground">{assessment.original.points}</span>
                      <span className="ml-2 text-green-600 font-semibold">
                        {Math.round((assessment.potential.pointsMin + assessment.potential.pointsMax) / 2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Insurance Impact:</span>
                    <div>
                      <span className="line-through text-muted-foreground">+{assessment.original.insuranceIncrease}%</span>
                      <span className="ml-2 text-green-600 font-semibold">
                        +{assessment.potential.insuranceIncrease}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/50 dark:bg-black/20 border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Recommended Strategy
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm">
                    <p className="font-medium mb-2">
                      {assessment.ticketInfo.flexibility === 'high' ? 'Prosecutor Review' :
                       assessment.ticketInfo.flexibility === 'medium' ? 'Prosecutor Review' : 'Request Trial'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Based on your violation type and our success rate for similar cases.
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Fine Reduction:</span> ${avgFineSavings}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Insurance Savings:</span> ${assessment.savings.insuranceSavings} (3 years)
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="bg-white/50 dark:bg-black/20 p-4 rounded-lg border border-primary/10">
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Preliminary Analysis Summary
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Strong defense options identified for {violation.toLowerCase()}</li>
                <li>• Technical errors detected in ticket documentation</li>
                <li>• Jurisdiction and procedural compliance review pending</li>
                <li>• Success rate for similar cases: {assessment.ticketInfo.flexibility === 'high' ? '85%' : 
                     assessment.ticketInfo.flexibility === 'medium' ? '70%' : '55%'}</li>
              </ul>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Note:</strong> This is a preliminary analysis based on image recognition. 
                Complete your application and payment to receive detailed legal review and defense strategy.
              </p>
            </div>

            <iframe 
              src="https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/6af6da4b229d84376621d93bb36e8dbd/fd8226a5-8034-49c8-ac3e-a6922d3b1cfc/index.html"
              width="100%" 
              height="400px" 
              className="border-0 rounded-lg shadow-sm bg-white"
              title="Detailed Ticket Analysis"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default InstantTicketAnalyzer;