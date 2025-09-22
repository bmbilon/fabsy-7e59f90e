import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FormData } from "../TicketForm";
import { CreditCard, Shield, DollarSign, Clock, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PaymentStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const PaymentStep = ({ formData, updateFormData }: PaymentStepProps) => {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleFieldUpdate = (field: keyof FormData, value: any) => {
    updateFormData({ [field]: value });
  };

  const handleStripeCheckout = async () => {
    if (!agreedToTerms) {
      toast({
        title: "Agreement Required",
        description: "Please agree to the terms and conditions to proceed.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { formData }
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        title: "Payment Error",
        description: "Unable to process payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Service Summary */}
      <Card className="p-6 bg-gradient-card shadow-fab border-primary/10">
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="h-6 w-6 text-primary" />
            <h3 className="text-xl font-bold">Service Summary</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <CheckCircle className="h-8 w-8 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold text-primary">94%</div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
            </div>
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <Clock className="h-8 w-8 text-secondary mx-auto mb-2" />
              <div className="text-2xl font-bold text-secondary">2-4</div>
              <div className="text-sm text-muted-foreground">Weeks Process</div>
            </div>
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <Shield className="h-8 w-8 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold text-primary">$1,200</div>
              <div className="text-sm text-muted-foreground">Avg. Saved</div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between text-lg">
              <span>Fabsy Flat Fee Service</span>
              <span className="font-semibold">$488.00 CAD</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Processing Fee</span>
              <span>$0.00</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>GST (5%)</span>
              <span>+ Tax as applicable</span>
            </div>
            <div className="border-t pt-2">
              <div className="flex justify-between text-xl font-bold">
                <span>Total Amount</span>
                <span className="text-primary">$488.00 CAD + Tax</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Final amount with applicable taxes will be calculated at checkout
            </p>
          </div>

          <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
            <p className="text-sm text-primary text-center">
              <strong>Money-Back Guarantee:</strong> If we don't successfully dismiss or reduce your ticket, 
              you get a full refund of our service fee.
            </p>
          </div>
        </div>
      </Card>

      {/* Payment Method */}
      <Card className="p-6">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <CreditCard className="h-6 w-6 text-primary" />
            <h3 className="text-xl font-bold">Payment Information</h3>
          </div>

          <div className="space-y-2">
            <Label>Insurance Company (Optional)</Label>
            <Input
              value={formData.insuranceCompany}
              onChange={(e) => handleFieldUpdate("insuranceCompany", e.target.value)}
              placeholder="e.g., Intact, TD Insurance, etc."
              className="transition-smooth focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-xs text-muted-foreground">
              This helps us calculate your potential insurance savings.
            </p>
          </div>

          {/* Terms and Conditions */}
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                className="mt-1"
              />
              <div className="space-y-1">
                <Label htmlFor="terms" className="text-sm font-medium leading-relaxed">
                  I agree to the{" "}
                  <a href="#" className="text-primary hover:underline">Terms of Service</a>
                  {" "}and{" "}
                  <a href="#" className="text-primary hover:underline">Privacy Policy</a>
                </Label>
                <p className="text-xs text-muted-foreground">
                  By proceeding, you authorize Fabsy to represent you in fighting your traffic ticket.
                </p>
              </div>
            </div>
          </div>

          {/* Stripe Checkout Button */}
          <Button 
            onClick={handleStripeCheckout}
            disabled={!agreedToTerms || isProcessing}
            className="w-full h-12 text-lg font-semibold"
            size="lg"
          >
            {isProcessing ? (
              "Processing..."
            ) : (
              <>
                <CreditCard className="h-5 w-5 mr-2" />
                Pay $488 CAD + Tax with Stripe
              </>
            )}
          </Button>

          <div className="bg-secondary/5 p-4 rounded-lg border border-secondary/10">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-secondary mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-secondary mb-1">Secure Payment Processing</p>
                <p className="text-sm text-muted-foreground">
                  Powered by Stripe. Your payment information is encrypted and processed securely. 
                  Promo codes accepted at checkout.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default PaymentStep;