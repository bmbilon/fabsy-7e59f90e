import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, AlertCircle, Download } from "lucide-react";
import { FormData } from "../TicketForm";

interface ConsentStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const ConsentStep = ({ formData, updateFormData }: ConsentStepProps) => {
  const [consentGiven, setConsentGiven] = useState(formData.consentGiven || false);
  const [consentUnderstood, setConsentUnderstood] = useState(formData.consentUnderstood || false);

  const handleConsentChange = (field: 'consentGiven' | 'consentUnderstood', checked: boolean) => {
    if (field === 'consentGiven') {
      setConsentGiven(checked);
      updateFormData({ consentGiven: checked });
    } else {
      setConsentUnderstood(checked);
      updateFormData({ consentUnderstood: checked });
    }
  };

  const currentDate = new Date().toLocaleDateString('en-CA');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <FileText className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Required Consent Form</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Before we can represent you, Alberta law requires your written consent as outlined in SafeRoads Alberta Form SRA12675.
        </p>
      </div>

      {/* Consent Form Document */}
      <Card className="p-6 bg-gradient-card shadow-fab border-primary/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">Form SRA12675 - Written Consent</h3>
          </div>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
        
        <ScrollArea className="h-96 w-full border rounded-lg p-4 bg-background/50">
          <div className="space-y-4 text-sm leading-relaxed">
            <div className="text-center font-bold text-lg text-primary mb-6">
              SAFEROADS ALBERTA<br />
              WRITTEN CONSENT FOR LEGAL REPRESENTATION<br />
              FORM SRA12675
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <strong>Client Name:</strong> {formData.firstName} {formData.lastName}
              </div>
              <div>
                <strong>Date:</strong> {currentDate}
              </div>
              <div>
                <strong>Ticket Number:</strong> {formData.ticketNumber || '[TO BE COMPLETED]'}
              </div>
              <div>
                <strong>Driver's License:</strong> {formData.driversLicense || '[TO BE COMPLETED]'}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-base">CONSENT TO LEGAL REPRESENTATION</h4>
              
              <p>
                I, <strong>{formData.firstName} {formData.lastName}</strong>, hereby acknowledge and consent to the following:
              </p>

              <div className="space-y-3">
                <p>
                  <strong>1. AUTHORIZATION TO REPRESENT:</strong> I hereby authorize Fabsy Legal Services and its designated legal representatives to act on my behalf in connection with the traffic violation(s) detailed above.
                </p>

                <p>
                  <strong>2. SCOPE OF REPRESENTATION:</strong> This authorization includes, but is not limited to:
                </p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>Appearing in court on my behalf for all scheduled hearings</li>
                  <li>Filing motions, applications, and other legal documents</li>
                  <li>Negotiating with prosecutors regarding plea agreements or alternative resolutions</li>
                  <li>Accessing my driving record and related documents</li>
                  <li>Communicating with court officials, prosecutors, and other parties</li>
                </ul>

                <p>
                  <strong>3. UNDERSTANDING OF SERVICES:</strong> I understand that:
                </p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>No guarantee of specific outcomes can be made</li>
                  <li>Legal representation does not guarantee dismissal of charges</li>
                  <li>I may be required to provide additional documentation if requested</li>
                  <li>Court dates may be rescheduled, and I will be notified of any changes</li>
                </ul>

                <p>
                  <strong>4. FINANCIAL AGREEMENT:</strong> I acknowledge that I have reviewed and agreed to the fee structure of $488.00 (plus applicable taxes) for the legal services provided. I understand the refund policy as outlined in the service agreement.
                </p>

                <p>
                  <strong>5. COMMUNICATION:</strong> I authorize Fabsy Legal Services to communicate with me via the contact information provided (email: {formData.email}, phone: {formData.phone}). I will promptly notify them of any changes to my contact information.
                </p>

                <p>
                  <strong>6. PRIVACY AND CONFIDENTIALITY:</strong> I understand that all information shared will be kept confidential in accordance with solicitor-client privilege and applicable privacy laws.
                </p>

                <p>
                  <strong>7. WITHDRAWAL OF CONSENT:</strong> I understand that I may withdraw this consent at any time by providing written notice, subject to the terms of the service agreement.
                </p>
              </div>

              <div className="border-t pt-4 mt-6">
                <p className="font-medium">
                  By checking the boxes below, I acknowledge that I have read, understood, and agree to the terms outlined in this consent form.
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </Card>

      {/* Consent Checkboxes */}
      <Card className="p-6 bg-primary/5 border-primary/20">
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="consentUnderstood"
              checked={consentUnderstood}
              onCheckedChange={(checked) => handleConsentChange('consentUnderstood', checked as boolean)}
              className="mt-1"
            />
            <Label htmlFor="consentUnderstood" className="text-sm leading-relaxed">
              I have read and understand all terms outlined in Form SRA12675. I understand that this consent allows Fabsy Legal Services to represent me in all matters related to my traffic violation.
            </Label>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="consentGiven"
              checked={consentGiven}
              onCheckedChange={(checked) => handleConsentChange('consentGiven', checked as boolean)}
              className="mt-1"
            />
            <Label htmlFor="consentGiven" className="text-sm leading-relaxed font-medium">
              <strong>I HEREBY GIVE MY WRITTEN CONSENT</strong> for Fabsy Legal Services to represent me as outlined in Form SRA12675. This serves as my electronic signature and legal authorization.
            </Label>
          </div>
        </div>

        {(!consentGiven || !consentUnderstood) && (
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800">Consent Required</p>
              <p className="text-yellow-700">
                Both consent checkboxes must be checked before you can proceed. This is required by Alberta law for legal representation.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Client Information Confirmation */}
      <Card className="p-4 bg-muted/50 border border-muted">
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong>Electronic Signature Notice:</strong> By checking the consent boxes above, you are providing your electronic signature which has the same legal effect as a handwritten signature under Alberta's Electronic Transactions Act.
          </p>
          <p>
            <strong>Record Keeping:</strong> A copy of this consent form will be maintained in your client file and can be provided upon request.
          </p>
          <p>
            <strong>Questions?</strong> If you have any questions about this consent form or your rights, please contact our office before proceeding.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default ConsentStep;