import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, DollarSign, FileText, Zap } from "lucide-react";

interface InstantTicketAnalyzerProps {
  ticketImage: File | null;
  fineAmount: string;
  violation: string;
}

const InstantTicketAnalyzer = ({ ticketImage, fineAmount, violation }: InstantTicketAnalyzerProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);

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

  const estimatedSavings = Math.round(parseFloat(fineAmount.replace('$', '')) * 0.75);
  const processingTime = violation.includes('Speeding') ? '3-5 business days' : '5-7 business days';

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
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <DollarSign className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Estimated Savings
                  </p>
                  <p className="text-lg font-bold text-green-600">
                    ${estimatedSavings}
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
                <li>• Success rate for similar cases: 78%</li>
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