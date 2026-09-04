import { Link, useSearchParams } from "react-router-dom";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readStoredIntakeDraft } from "@/lib/ticket/intakeDraft";

const PaymentCanceled = () => {
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get("draft");
  const storedDraft = readStoredIntakeDraft();
  const canResume = Boolean(draftId && storedDraft?.draftId === draftId);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <XCircle className="h-16 w-16 text-red-500" />
          </div>
          <CardTitle className="text-2xl text-red-600">Payment Canceled</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Your payment was canceled. No charges have been made to your account.
          </p>
          <p className="text-sm text-muted-foreground">
            {canResume
              ? "Your intake is saved in this browser. Return to it to try secure checkout again."
              : draftId
                ? "For your privacy, this browser cannot open the saved intake without its secure resume access. Use the secure resume link you copied earlier, or contact Fabsy for help."
                : "If you'd like to proceed with fighting your ticket, you can return to the intake."}
          </p>
          <div className="pt-4 space-y-2">
            <Button asChild className="w-full">
              <Link to="/submit-ticket">{canResume ? "Return to Saved Intake" : "Return to Intake"}</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Return to Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentCanceled;
