import { FormData } from "../TicketForm";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PHOTO_RADAR, PHOTO_RADAR_PRICE_LABEL, RAPID_RESOLUTION } from "@/config/offers";
import { FEE_REFUND } from "@/config/feeRefund";
import FeeRefundNotice from "@/components/FeeRefundNotice";

interface ConsentStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const ConsentStep = ({ formData, updateFormData }: ConsentStepProps) => {
  const isPhotoRadar = formData.ticketType === "photo_radar";
  const offer = isPhotoRadar ? PHOTO_RADAR : RAPID_RESOLUTION;
  const agreedToConsent = formData.consentGiven;
  const digitalSignature = formData.digitalSignature;
  const currentDate = new Date().toLocaleDateString('en-CA');

  const handleSignatureChange = (value: string) => {
    updateFormData({ digitalSignature: value });
  };

  const handleConsentChange = (checked: boolean) => {
    updateFormData({ consentGiven: checked });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-muted/30">
        <h3 className="text-lg font-semibold mb-4 text-center">
          Digital Authorization for {offer.name}
        </h3>
        <p className="text-center text-sm text-muted-foreground mb-4">
          Fabsy.ca Traffic Defense Services
        </p>
        
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6">
            {/* Client Information */}
            <div>
              <h4 className="font-semibold mb-3 text-primary">Client Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Full Legal Name</Label>
                  <p className="font-medium">{formData.firstName} {formData.lastName}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email Address</Label>
                  <p className="font-medium">{formData.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone Number</Label>
                  <p className="font-medium">{formData.phone}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Driver's License Number</Label>
                  <p className="font-medium">{formData.driversLicense}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Ticket Information */}
            <div>
              <h4 className="font-semibold mb-3 text-primary">Ticket Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Ticket Number</Label>
                  <p className="font-medium">{formData.ticketNumber}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date of Offense</Label>
                  <p className="font-medium">{formData.issueDate?.toLocaleDateString()}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-muted-foreground">Location</Label>
                  <p className="font-medium">{formData.location}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Consent to Rapid Resolution */}
            <div>
              <h4 className="font-semibold mb-3 text-primary">Scope of Authorization</h4>
              <p className="text-sm leading-relaxed mb-4">
                I, <span className="font-semibold">{formData.firstName} {formData.lastName}</span>, hereby consent to and authorize Fabsy.ca and its agents to:
              </p>
              <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                {isPhotoRadar && <li>Enter a not-guilty plea for the registered-owner automated enforcement notice identified above</li>}
                <li>Request, receive and review disclosure for the traffic ticket identified above</li>
                <li>Use the Traffic Tickets Digital Service and communicate with the court, prosecutor and relevant government offices as my authorized agent where permitted</li>
                <li>Prepare and submit a fact-specific prosecutor-review request based on my instructions and the available record</li>
                <li>{isPhotoRadar ? "Pursue a Crown reduction or withdrawal and explain any proposed fine resolution to me" : "Receive a prosecutor response or proposed resolution and explain the stated charge, fine and demerit consequences to me"}</li>
                <li>Take only the final resolution step that I expressly authorize after receiving the Crown response</li>
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                This authorization does not include a contested trial, appeal, reopening, Immediate Roadside Sanction or Notice of Administrative Penalty. Fabsy will not accept a guilty plea or Crown offer without my case-specific instruction. A separate agreement and fee are required for any trial work. I may also be required to complete a prescribed Government of Alberta consent form.
              </p>
            </div>

            <Separator />

            {/* Terms of Service Agreement */}
            <div>
              <h4 className="font-semibold mb-3 text-primary">Terms of Service Agreement</h4>
              <p className="text-sm leading-relaxed mb-2">By signing below, I acknowledge and agree that:</p>
              <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                <li>I have voluntarily retained Fabsy.ca for {offer.name}</li>
                <li>I understand the included work and exclusions outlined above</li>
                <li>I will provide accurate and complete information regarding my case</li>
                <li>I authorize digital communication via email and text regarding my case</li>
                <li>{isPhotoRadar ? `The service fee is ${PHOTO_RADAR_PRICE_LABEL}, one-time, charged at checkout. No trial and no success fee. Government fines are separate.` : `The service fee is $${RAPID_RESOLUTION.priceCad} CAD plus applicable GST; government fines, trial work and other excluded services are separate`}</li>
                <li>The 48-hour commitment covers Fabsy's review and next authorized action after complete, readable disclosure is received and matched to my file—not Crown response time or final outcome timing</li>
                <li>{FEE_REFUND.payment}</li>
                <li>{isPhotoRadar ? FEE_REFUND.photoCondition : FEE_REFUND.condition}</li>
                <li>{FEE_REFUND.declinedOfferText}</li>
                {isPhotoRadar && <li>{PHOTO_RADAR.insuranceDisclaimer}</li>}
                <li>I may withdraw this consent at any time by providing written notice</li>
                <li>This consent remains valid until the matter is resolved or withdrawn</li>
              </ul>
            </div>

            <Separator />

            {/* Data Processing Consent */}
            <div>
              <h4 className="font-semibold mb-3 text-primary">Data Processing Consent</h4>
              <p className="text-sm leading-relaxed mb-2">I consent to Fabsy.ca:</p>
              <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                <li>Collecting and processing my personal information to deliver {offer.name}</li>
                <li>Using technology-assisted document extraction and analysis, subject to qualified review, for my ticket and disclosure</li>
                <li>Storing my case files securely for record-keeping requirements</li>
                <li>Communicating with me via email, phone, and text regarding my case</li>
                <li>Sharing necessary information with courts and legal authorities as required</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-3">
                I understand I may request access to my personal information or withdraw this consent by contacting privacy@fabsy.ca.
              </p>
            </div>
          </div>
        </ScrollArea>
      </Card>

      <FeeRefundNotice photoRadar={isPhotoRadar} compact openTermsInNewTab />

      {/* Digital Signature Section */}
      <Card className="p-6 bg-gradient-card">
        <h4 className="font-semibold mb-4 text-primary">Digital Signature & Confirmation</h4>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="digitalSignature" className="mb-2 block">
              Digital Signature (Type your full legal name) *
            </Label>
            <Input
              id="digitalSignature"
              value={digitalSignature}
              onChange={(e) => handleSignatureChange(e.target.value)}
              placeholder="Type your full legal name"
              className="font-serif text-lg"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Full Name</Label>
              <p className="font-medium">{formData.firstName} {formData.lastName}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Date</Label>
              <p className="font-medium">{currentDate}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4 bg-muted/30 p-4 rounded-lg">
            <p className="text-sm font-medium mb-3">By signing digitally, I confirm:</p>
            <div className="flex items-start space-x-3">
              <Checkbox
                id="consent"
                checked={agreedToConsent}
                onCheckedChange={(checked) => handleConsentChange(checked as boolean)}
              />
              <Label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
                <ul className="space-y-1 list-disc list-inside">
                  <li>I am the person named above and authorized to enter into this agreement</li>
                  <li>I have read and understand this consent form</li>
                <li>I agree to all terms and authorize the limited pre-trial service described</li>
                  <li>My digital signature has the same legal effect as a handwritten signature</li>
                </ul>
              </Label>
            </div>
          </div>

          {!agreedToConsent && (
            <p className="text-sm text-destructive">
              * You must agree to the terms and provide your signature to continue
            </p>
          )}
        </div>

        <div className="mt-6 pt-4 border-t text-xs text-muted-foreground space-y-1">
          <p>Form Version: {isPhotoRadar ? "2026-08-31-photo-radar-refund-v2" : "2026-08-31-rr-refund-v2"}</p>
          <p>Contact: support@fabsy.ca</p>
          <p className="mt-2 italic">
            This digital authorization records your consent to Fabsy's service. Any prescribed government consent form remains separately required.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default ConsentStep;
