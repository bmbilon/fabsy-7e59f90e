import { useState } from "react";
import { CheckCircle, CreditCard, DollarSign, Shield } from "lucide-react";
import { FormData } from "../TicketForm";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PaymentStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

interface SubmissionResponse {
  success?: boolean;
  submissionId?: string;
}

interface PaymentResponse {
  url?: string;
}

const PaymentStep = ({ formData, updateFormData }: PaymentStepProps) => {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleStripeCheckout = async () => {
    if (!agreedToTerms) {
      toast({
        title: "Agreement required",
        description: "Please agree to the Terms of Service and Privacy Policy to continue.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const { data: submission, error: submissionError } =
        await supabase.functions.invoke<SubmissionResponse>("submit-ticket", {
          body: {
            driversLicense: formData.driversLicense,
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            city: formData.city,
            postalCode: formData.postalCode,
            dateOfBirth: formData.dateOfBirth?.toISOString().split("T")[0],
            smsOptIn: formData.smsOptIn,
            ticketNumber: formData.ticketNumber,
            violation: formData.violation,
            fineAmount: formData.fineAmount,
            violationDate: formData.issueDate?.toISOString().split("T")[0],
            courtLocation: formData.courtJurisdiction,
            courtDate: formData.courtDate?.toISOString().split("T")[0],
            defenseStrategy: `${formData.pleaType}\n\nExplanation: ${formData.explanation}\n\nCircumstances: ${formData.circumstances}`,
            additionalNotes: formData.additionalNotes,
            insuranceCompany: formData.insuranceCompany,
          },
        });

      if (submissionError || !submission?.success || !submission.submissionId) {
        throw submissionError || new Error("Ticket submission could not be created.");
      }

      const submissionId = submission.submissionId;
      const customerName = `${formData.firstName} ${formData.lastName}`.trim();
      const { data: paymentData, error: paymentError } =
        await supabase.functions.invoke<PaymentResponse>("create-payment", {
          body: {
            submissionId,
            customerEmail: formData.email,
            customerName,
            ticketNumber: formData.ticketNumber,
            // Keep the current production Edge Function contract working
            // until the hardened function below is deployed.
            formData: {
              email: formData.email,
              fullName: customerName,
              ticketNumber: formData.ticketNumber,
            },
          },
        });

      if (paymentError || !paymentData?.url) {
        throw paymentError || new Error("Secure checkout could not be created.");
      }

      const { error: consentError } = await supabase.functions.invoke("generate-consent-form", {
        body: {
          submissionId,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          province: formData.province,
          postalCode: formData.postalCode,
          driversLicense: formData.driversLicense,
          ticketNumber: formData.ticketNumber,
          violation: formData.violation,
          issueDate: formData.issueDate?.toLocaleDateString() || "",
          digitalSignature: formData.digitalSignature,
        },
      });
      if (consentError) console.error("Consent form generation failed", consentError);

      const { error: notificationError } = await supabase.functions.invoke("send-notification", {
        body: {
          submissionId,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          ticketNumber: formData.ticketNumber,
          violation: formData.violation,
          fineAmount: formData.fineAmount,
          submittedAt: new Date().toLocaleString(),
          smsOptIn: formData.smsOptIn,
        },
      });
      if (notificationError) console.error("Submission notification failed", notificationError);

      window.location.assign(paymentData.url);
    } catch (error) {
      console.error("Payment checkout failed", error);
      toast({
        title: "Payment unavailable",
        description: "We could not open secure checkout. Please try again.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card className="border-primary/10 bg-gradient-card p-6 shadow-fab">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <DollarSign className="h-6 w-6 text-primary" />
            <h3 className="text-xl font-bold">Service and Payment Summary</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-background/50 p-4 text-center">
              <CheckCircle className="mx-auto mb-2 h-8 w-8 text-primary" />
              <div className="text-2xl font-bold text-primary">95%+</div>
              <div className="text-sm text-muted-foreground">Historical success rate</div>
              <div className="mt-1 text-xs text-muted-foreground">Individual outcomes vary</div>
            </div>
            <div className="rounded-lg bg-background/50 p-4 text-center">
              <Shield className="mx-auto mb-2 h-8 w-8 text-secondary" />
              <div className="font-bold text-secondary">Agent Service</div>
              <div className="mt-1 text-sm text-muted-foreground">Fabsy is not a law firm</div>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex justify-between text-lg">
              <span>Flat service fee</span>
              <span className="font-semibold">$488.00 CAD</span>
            </div>
            <div className="flex justify-between border-t pt-3 text-xl font-bold">
              <span>Amount Due Today</span>
              <span className="text-primary">$488.00 CAD</span>
            </div>
            <p className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-center text-sm text-primary">
              Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional
              charge if the fine is not reduced.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <CreditCard className="h-6 w-6 text-primary" />
            <h3 className="text-xl font-bold">Secure Payment</h3>
          </div>

          <div className="space-y-2">
            <Label htmlFor="insurance-company">Insurance company, optional</Label>
            <Input
              id="insurance-company"
              value={formData.insuranceCompany}
              onChange={(event) => updateFormData({ insuranceCompany: event.target.value })}
              placeholder="Current insurance company"
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="payment-terms"
                checked={agreedToTerms}
                onCheckedChange={(value) => setAgreedToTerms(value === true)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="payment-terms" className="cursor-pointer leading-relaxed">
                  I agree to the <a href="/terms-of-service" className="text-primary underline">Terms of Service</a> and <a href="/privacy-policy" className="text-primary underline">Privacy Policy</a>.
                </Label>
                <p className="mt-2 text-xs text-muted-foreground">
                  Payment confirms the selected Fabsy agent service described above.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleStripeCheckout}
            disabled={!agreedToTerms || isProcessing}
            className="min-h-12 w-full py-3 text-base font-semibold sm:text-lg"
            size="lg"
          >
            <CreditCard className="mr-2 h-5 w-5" />
            {isProcessing ? "Opening secure checkout..." : "Pay $488 CAD with Stripe"}
          </Button>

          <div className="flex items-start gap-3 rounded-lg border border-secondary/15 bg-secondary/5 p-4">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
            <p className="text-sm text-muted-foreground">
              Stripe processes the payment securely. Fabsy does not receive or store your complete card details.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default PaymentStep;
