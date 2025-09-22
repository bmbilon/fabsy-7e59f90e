import { Link } from "react-router-dom";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PaymentCanceled = () => {
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
            If you'd like to proceed with fighting your ticket, you can try again.
          </p>
          <div className="pt-4 space-y-2">
            <Button asChild className="w-full">
              <Link to="/ticket-form">Try Again</Link>
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