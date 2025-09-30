import { FormData } from "../TicketForm";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

interface ConsentStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const ConsentStep = ({ formData, updateFormData }: ConsentStepProps) => {
  const [agreedToConsent, setAgreedToConsent] = useState(false);
  const [digitalSignature, setDigitalSignature] = useState("");
  const currentDate = new Date().toLocaleDateString('en-CA');

  const handleSignatureChange = (value: string) => {
    setDigitalSignature(value);
    updateFormData({ digitalSignature: value });
  };

  const handleConsentChange = (checked: boolean) => {
    setAgreedToConsent(checked);
    updateFormData({ consentGiven: checked });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-muted/30">
        <h3 className="text-lg font-semibold mb-4 text-center">
          Digital Consent Form for Traffic Ticket Representation
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

            {/* Consent to Representation */}
            <div>
              <h4 className="font-semibold mb-3 text-primary">Consent to Representation</h4>
              <p className="text-sm leading-relaxed mb-4">
                I, <span className="font-semibold">{formData.firstName} {formData.lastName}</span>, hereby consent to and authorize Fabsy.ca and its agents to:
              </p>
              <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                <li>Represent me in all proceedings related to the traffic ticket identified above</li>
                <li>Review and dispute my traffic ticket on my behalf</li>
                <li>Appear in court or administrative proceedings as my authorized representative</li>
                <li>Communicate with courts, prosecutors, and government agencies regarding my case</li>
                <li>Access my driving record and ticket information as necessary for my defense</li>
                <li>Make procedural decisions in the best interest of my case</li>
                <li>Negotiate resolutions including plea arrangements, reduced charges, or alternative disposals</li>
              </ul>
            </div>

            <Separator />

            {/* Terms of Service Agreement */}
            <div>
              <h4 className="font-semibold mb-3 text-primary">Terms of Service Agreement</h4>
              <p className="text-sm leading-relaxed mb-2">By signing below, I acknowledge and agree that:</p>
              <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                <li>I have voluntarily retained Fabsy.ca for traffic ticket representation services</li>
                <li>I understand the scope of representation as outlined above</li>
                <li>I will provide accurate and complete information regarding my case</li>
                <li>I authorize digital communication via email and text regarding my case</li>
                <li>Payment for services is due according to the fee schedule provided</li>
                <li>Fabsy.ca will make reasonable efforts to defend my ticket but cannot guarantee specific outcomes</li>
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
                <li>Collecting and processing my personal information for legal representation purposes</li>
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
                  <li>I agree to all terms and authorize representation as described</li>
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
          <p>Form Version: 2025-09-30</p>
          <p>Contact: support@fabsy.ca</p>
          <p className="mt-2 italic">
            This consent form complies with Alberta legal requirements for traffic ticket representation and data protection regulations.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default ConsentStep;
