import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormData } from "../TicketForm";
import { CreditCard, Shield, DollarSign, Clock, CheckCircle } from "lucide-react";

interface PaymentStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const PaymentStep = ({ formData, updateFormData }: PaymentStepProps) => {
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [billingName, setBillingName] = useState("");

  const handleFieldUpdate = (field: keyof FormData, value: any) => {
    updateFormData({ [field]: value });
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
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
              <span>Fabsy Ticket Defense Service</span>
              <span className="font-semibold">$499.00</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Processing Fee</span>
              <span>$0.00</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Alberta HST (5%)</span>
              <span>$24.95</span>
            </div>
            <div className="border-t pt-2">
              <div className="flex justify-between text-xl font-bold">
                <span>Total Amount</span>
                <span className="text-primary">$523.95</span>
              </div>
            </div>
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

          {/* Payment Options */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Payment Method</Label>
            <div className="grid gap-3">
              <Card 
                className={`p-4 cursor-pointer transition-smooth border-2 ${
                  paymentMethod === 'credit' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-muted hover:border-primary/30'
                }`}
                onClick={() => setPaymentMethod('credit')}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 transition-smooth ${
                    paymentMethod === 'credit' 
                      ? 'border-primary bg-primary' 
                      : 'border-muted-foreground'
                  }`} />
                  <CreditCard className="h-5 w-5" />
                  <span className="font-medium">Credit or Debit Card</span>
                  <Badge className="ml-auto bg-primary/10 text-primary border-primary/20">Secure</Badge>
                </div>
              </Card>
            </div>
          </div>

          {/* Credit Card Form */}
          {paymentMethod === 'credit' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="billingName">Cardholder Name *</Label>
                <Input
                  id="billingName"
                  value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                  placeholder="Enter name as it appears on card"
                  className="transition-smooth focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cardNumber">Card Number *</Label>
                <Input
                  id="cardNumber"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="1234 5678 9012 3456"
                  maxLength={19}
                  className="transition-smooth focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date *</Label>
                  <Input
                    id="expiryDate"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
                    placeholder="MM/YY"
                    maxLength={5}
                    className="transition-smooth focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cvv">CVV *</Label>
                  <Input
                    id="cvv"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substring(0, 4))}
                    placeholder="123"
                    maxLength={4}
                    className="transition-smooth focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Insurance Company</Label>
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
            </div>
          )}

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

          <div className="bg-secondary/5 p-4 rounded-lg border border-secondary/10">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-secondary mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-secondary mb-1">Secure Payment Processing</p>
                <p className="text-sm text-muted-foreground">
                  Your payment information is encrypted and processed securely. 
                  We never store your credit card details on our servers.
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