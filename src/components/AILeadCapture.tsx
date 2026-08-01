import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Zap } from "lucide-react";
import { EligibilityChecker } from "./EligibilityChecker";

interface AILeadCaptureProps {
  variant?: "open" | "gated";
  ticketType?: string;
  aiAnswer?: string;
  onSubmitSuccess?: () => void;
}

export default function AILeadCapture({ 
  variant = "open", 
  ticketType = "", 
  aiAnswer = "",
  onSubmitSuccess 
}: AILeadCaptureProps) {
  const [isCheckerOpen, setIsCheckerOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleCheckerSuccess = () => {
    setIsSuccess(true);
    if (onSubmitSuccess) {
      onSubmitSuccess();
    }
  };

  if (isSuccess) {
    return (
      <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/20 border-green-200 dark:border-green-800">
        <CardContent className="p-6 text-center space-y-3">
          <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
          <h3 className="text-xl font-bold text-green-900 dark:text-green-100">
            Request Received!
          </h3>
          <p className="text-sm text-green-800 dark:text-green-200">
            Our team will review the request and follow up using the contact information you provided.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20">
        <CardContent className="p-8 text-center space-y-4">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">Prepare Your Ticket for Review</h3>
            <p className="text-sm text-muted-foreground">
              Upload your ticket to capture its details and prepare them for review by Fabsy's agent service.
            </p>
          </div>

          <Button 
            onClick={() => setIsCheckerOpen(true)}
            className="w-full" 
            size="lg"
          >
            <Zap className="h-5 w-5 mr-2" />
            Start Ticket Review
          </Button>

          <p className="text-xs text-muted-foreground">
            There is no charge to use this upload tool. If Fabsy can assist, pricing is a flat $488
            plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.
          </p>
        </CardContent>
      </Card>

      <EligibilityChecker 
        open={isCheckerOpen} 
        onOpenChange={setIsCheckerOpen}
      />
    </>
  );
}
