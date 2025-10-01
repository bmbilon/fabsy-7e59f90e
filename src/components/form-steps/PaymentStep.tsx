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
  
  const isTestUser = formData.couponCode?.toUpperCase() === "TESTUSER";
  const displayPrice = isTestUser ? "$0.00" : "$488.00";

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
      // Step 1: Check if client exists or create new client
      console.log('[Payment] Checking for existing client...');
      let clientId: string;
      
      const { data: existingClient, error: clientLookupError } = await supabase
        .from('clients')
        .select('id')
        .eq('drivers_license', formData.driversLicense)
        .maybeSingle();
      
      if (clientLookupError) {
        console.error('[Payment] Client lookup error:', clientLookupError);
        toast({
          title: 'Submission Error',
          description: 'Failed to process your information. Please try again.',
          variant: 'destructive',
        });
        setIsProcessing(false);
        return;
      }

      if (existingClient) {
        console.log('[Payment] Found existing client:', existingClient.id);
        clientId = existingClient.id;
        
        // Update client information with latest data
        const { error: updateError } = await supabase
          .from('clients')
          .update({
            first_name: formData.firstName,
            last_name: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            city: formData.city,
            postal_code: formData.postalCode,
            date_of_birth: formData.dateOfBirth?.toISOString().split('T')[0],
            sms_opt_in: formData.smsOptIn,
            updated_at: new Date().toISOString()
          })
          .eq('id', clientId);
          
        if (updateError) {
          console.error('[Payment] Client update error:', updateError);
        }
      } else {
        // Create new client
        console.log('[Payment] Creating new client...');
        const { data: newClient, error: createClientError } = await supabase
          .from('clients')
          .insert({
            drivers_license: formData.driversLicense,
            first_name: formData.firstName,
            last_name: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            city: formData.city,
            postal_code: formData.postalCode,
            date_of_birth: formData.dateOfBirth?.toISOString().split('T')[0],
            sms_opt_in: formData.smsOptIn
          })
          .select('id')
          .single();

        if (createClientError || !newClient) {
          console.error('[Payment] Client creation error:', createClientError);
          toast({
            title: 'Submission Error',
            description: 'Failed to create client record. Please try again.',
            variant: 'destructive',
          });
          setIsProcessing(false);
          return;
        }
        
        clientId = newClient.id;
        console.log('[Payment] Client created:', clientId);
      }

      // Step 2: Create ticket submission linked to client
      console.log('[Payment] Saving ticket submission to database...');
      const { data: submissionData, error: submissionError } = await supabase
        .from('ticket_submissions')
        .insert({
          client_id: clientId,
          ticket_number: formData.ticketNumber,
          violation: formData.violation,
          fine_amount: formData.fineAmount,
          violation_date: formData.issueDate?.toISOString().split('T')[0],
          court_location: formData.courtJurisdiction,
          court_date: formData.courtDate?.toISOString().split('T')[0],
          defense_strategy: `${formData.pleaType}\n\nExplanation: ${formData.explanation}\n\nCircumstances: ${formData.circumstances}`,
          additional_notes: formData.additionalNotes,
          coupon_code: formData.couponCode,
          insurance_company: formData.insuranceCompany,
          status: 'pending'
        } as any)
        .select('id')
        .single();

      if (submissionError || !submissionData) {
        console.error('[Payment] Database error:', submissionError);
        toast({
          title: 'Submission Error',
          description: 'Failed to save your submission. Please try again.',
          variant: 'destructive',
        });
        setIsProcessing(false);
        return;
      }

      console.log('[Payment] Submission saved successfully:', submissionData.id);

      // Step 3: Generate consent form PDF
      console.log('[Payment] Generating consent form PDF...');
      const { data: consentData, error: consentError } = await supabase.functions.invoke('generate-consent-form', {
        body: {
          submissionId: submissionData.id,
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
          issueDate: formData.issueDate?.toLocaleDateString() || '',
          digitalSignature: formData.digitalSignature
        }
      });

      if (consentError) {
        console.error('[Payment] Consent form generation error:', consentError);
        toast({
          title: "Warning",
          description: "Consent form generation failed. Admin will generate manually.",
          variant: "destructive",
        });
        // Continue with submission even if consent form fails
      } else {
        console.log('[Payment] Consent form generated successfully:', consentData);
        
        // Wait a moment to ensure storage is consistent
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Step 4: Send notification email and SMS
      console.log('[Payment] Sending notification email and SMS...');
      const { error: notificationError } = await supabase.functions.invoke('send-notification', {
        body: {
          submissionId: submissionData.id,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          ticketNumber: formData.ticketNumber,
          violation: formData.violation,
          fineAmount: formData.fineAmount,
          submittedAt: new Date().toLocaleString(),
          smsOptIn: formData.smsOptIn,
          couponCode: formData.couponCode
        }
      });

      if (notificationError) {
        console.error('[Payment] Notification error:', notificationError);
        toast({
          title: "Notification Error",
          description: "Failed to send notifications. Please contact support.",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      console.log('[Payment] Notifications sent successfully');

      // If TESTUSER coupon, skip payment and go to success
      if (isTestUser) {
        toast({
          title: "Test Submission Successful! 🎉",
          description: "Your ticket has been submitted for review (Test Mode - No Payment Required).",
        });
        // Redirect to success page after short delay
        setTimeout(() => {
          window.location.href = "/payment-success?test=true";
        }, 1500);
        return;
      }

      // Regular Stripe payment flow
      console.log('[Payment] Creating Stripe checkout session...');
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { formData }
      });

      if (error) throw error;

      if (data?.url) {
        console.log('[Payment] Redirecting to Stripe checkout...');
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('[Payment] Payment error:', error);
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
              <div className="text-2xl font-bold text-secondary">2-6</div>
              <div className="text-sm text-muted-foreground">Weeks Process</div>
            </div>
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <Shield className="h-8 w-8 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold text-primary">$993</div>
              <div className="text-sm text-muted-foreground">avg saved</div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between text-lg">
              <span>Fabsy Flat Fee Service</span>
              <span className={`font-semibold ${isTestUser ? 'line-through text-muted-foreground' : ''}`}>$488.00 CAD</span>
            </div>
            {isTestUser && (
              <div className="flex justify-between text-lg">
                <span className="text-green-600 font-semibold">Test User Discount</span>
                <span className="font-semibold text-green-600">-$488.00 CAD</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Processing Fee</span>
              <span>$0.00</span>
            </div>
            {!isTestUser && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>GST (5%)</span>
                <span>+ Tax as applicable</span>
              </div>
            )}
            <div className="border-t pt-2">
              <div className="flex justify-between text-xl font-bold">
                <span>Total Amount</span>
                <span className={`${isTestUser ? 'text-green-600' : 'text-primary'}`}>
                  {displayPrice} CAD {!isTestUser && '+ Tax'}
                </span>
              </div>
            </div>
            {!isTestUser && (
              <p className="text-xs text-muted-foreground text-center">
                Final amount with applicable taxes will be calculated at checkout
              </p>
            )}
            {isTestUser && (
              <p className="text-xs text-green-600 text-center font-semibold">
                ✓ Test mode activated - No payment required
              </p>
            )}
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
            <Label>Coupon Code (Optional)</Label>
            <Input
              value={formData.couponCode}
              onChange={(e) => handleFieldUpdate("couponCode", e.target.value)}
              placeholder="Enter coupon code"
              className="transition-smooth focus:ring-2 focus:ring-primary/20 uppercase"
            />
            {isTestUser && (
              <p className="text-xs text-green-600 font-semibold">
                ✓ Valid test user code applied
              </p>
            )}
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
            className="w-full min-h-12 h-auto text-base sm:text-lg font-semibold whitespace-normal py-3"
            size="lg"
          >
            {isProcessing ? (
              "Processing..."
            ) : isTestUser ? (
              <span className="flex items-center justify-center gap-2 flex-wrap">
                <CheckCircle className="h-5 w-5 flex-shrink-0" />
                <span>Submit Test Application (No Payment)</span>
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2 flex-wrap">
                <CreditCard className="h-5 w-5 flex-shrink-0" />
                <span>Pay {displayPrice} CAD + Tax with Stripe</span>
              </span>
            )}
          </Button>

          <div className="bg-secondary/5 p-4 rounded-lg border border-secondary/10">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-secondary mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-secondary mb-1">
                  {isTestUser ? "Test Mode Active" : "Secure Payment Processing"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isTestUser 
                    ? "You're submitting in test mode. Your ticket and contact info will be submitted without payment."
                    : "Powered by Stripe. Your payment information is encrypted and processed securely. Promo codes accepted at checkout."
                  }
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