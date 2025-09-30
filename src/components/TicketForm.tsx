import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import PersonalInfoStep from "./form-steps/PersonalInfoStep";
import TicketDetailsStep from "./form-steps/TicketDetailsStep";
import DefenseStep from "./form-steps/DefenseStep";
import ConsentStep from "./form-steps/ConsentStep";
import PaymentStep from "./form-steps/PaymentStep";
import ReviewStep from "./form-steps/ReviewStep";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export interface FormData {
  // Personal Information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  smsOptIn: boolean;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  dateOfBirth: Date | undefined;
  driversLicense: string;
  driversLicenseImage: File | null;
  addressDifferentFromLicense: boolean;
  
  // Ticket Details
  ticketNumber: string;
  issueDate: Date | undefined;
  location: string;
  officer: string;
  officerBadge: string;
  offenceSection: string;
  offenceSubSection: string;
  offenceDescription: string;
  violation: string;
  fineAmount: string;
  courtDate: Date | undefined;
  courtJurisdiction: string;
  agentRepresentationPermitted: boolean | null;
  ticketImage: File | null;
  vehicleSeized: boolean;
  
  // Defense Information
  pleaType: string;
  explanation: string;
  circumstances: string;
  witnesses: boolean;
  witnessDetails: string;
  evidence: boolean;
  evidenceDetails: string;
  priorTickets: string;
  
  // Consent Information
  consentGiven: boolean;
  digitalSignature: string;
  
  // Additional Info
  insuranceCompany: string;
  vehicleDetails: string;
  additionalNotes: string;
  couponCode: string;
}

const initialFormData: FormData = {
  // Personal Information
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  smsOptIn: false,
  address: "",
  city: "",
  province: "",
  postalCode: "",
  dateOfBirth: undefined,
  driversLicense: "",
  driversLicenseImage: null,
  addressDifferentFromLicense: false,
  
  // Ticket Details
  ticketNumber: "",
  issueDate: undefined,
  location: "",
  officer: "",
  officerBadge: "",
  offenceSection: "",
  offenceSubSection: "",
  offenceDescription: "",
  violation: "",
  fineAmount: "",
  courtDate: undefined,
  courtJurisdiction: "",
  agentRepresentationPermitted: null,
  ticketImage: null,
  vehicleSeized: false,
  
  // Defense Information
  pleaType: "",
  explanation: "",
  circumstances: "",
  witnesses: false,
  witnessDetails: "",
  evidence: false,
  evidenceDetails: "",
  priorTickets: "none",
  
  // Consent Information
  consentGiven: false,
  digitalSignature: "",
  
  // Additional Info
  insuranceCompany: "",
  vehicleDetails: "",
  additionalNotes: "",
  couponCode: ""
};

const steps = [
  { id: 1, title: "Ticket Details", description: "Information about your ticket" },
  { id: 2, title: "Personal Info", description: "Your basic information" },
  { id: 3, title: "Your Defense", description: "Why you want to fight this ticket" },
  { id: 4, title: "Consent Form", description: "Authorization for representation" },
  { id: 5, title: "Payment", description: "Secure payment processing" },
  { id: 6, title: "Review", description: "Review and submit" }
];

const TicketForm = ({ initialTicketImage = null }: { initialTicketImage?: File | null }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(() => ({
    ...initialFormData,
    ticketImage: initialTicketImage ?? null,
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const updateFormData = (updates: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Send notification email and SMS
      const { error: emailError } = await supabase.functions.invoke('send-notification', {
        body: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          ticketNumber: formData.ticketNumber,
          violation: formData.violation,
          fineAmount: formData.fineAmount,
          submittedAt: new Date().toLocaleString(),
          smsOptIn: formData.smsOptIn
        }
      });

      if (emailError) {
        console.error("Email notification error:", emailError);
        // Continue with submission even if email fails
      }
      
      toast({
        title: "Application Submitted Successfully! 🎉",
        description: "We'll review your case and contact you within 24 hours.",
      });
      
      // Reset form or redirect
      setCurrentStep(1);
      setFormData(initialFormData);
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Please try again or contact support.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <TicketDetailsStep formData={formData} updateFormData={updateFormData} />;
      case 2:
        return <PersonalInfoStep formData={formData} updateFormData={updateFormData} />;
      case 3:
        return <DefenseStep formData={formData} updateFormData={updateFormData} />;
      case 4:
        return <ConsentStep formData={formData} updateFormData={updateFormData} />;
      case 5:
        return <PaymentStep formData={formData} updateFormData={updateFormData} />;
      case 6:
        return <ReviewStep formData={formData} onSubmit={handleSubmit} isSubmitting={isSubmitting} />;
      default:
        return null;
    }
  };

  // Validation function for each step
  const isStepValid = () => {
    switch (currentStep) {
      case 1: // Ticket Details
        return !!(
          formData.ticketNumber &&
          formData.issueDate &&
          formData.location &&
          formData.officer &&
          formData.fineAmount
        );
      case 2: // Personal Info
        return !!(
          formData.firstName &&
          formData.lastName &&
          formData.email &&
          formData.phone &&
          formData.dateOfBirth &&
          formData.driversLicense &&
          formData.address &&
          formData.city &&
          formData.province &&
          formData.postalCode
        );
      case 3: // Defense
        return !!(
          formData.pleaType &&
          formData.explanation
        );
      case 4: // Consent
        return !!(
          formData.consentGiven &&
          formData.digitalSignature
        );
      case 5: // Payment
        return true; // Payment step doesn't have required fields to advance
      case 6: // Review
        return true;
      default:
        return false;
    }
  };

  const progress = (currentStep / steps.length) * 100;

  return (
    <section className="py-20 bg-gradient-soft min-h-screen">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            Fight Your Ticket
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">
            Let's Get Your <span className="text-gradient-primary">Ticket Dismissed</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Complete this form and our experts will review your case. 
            94% success rate • Fixed $488 fee • No hidden costs
          </p>
        </div>

        {/* Progress */}
        <Card className="p-6 mb-8 bg-gradient-card shadow-fab border-primary/10">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">
                Step {currentStep} of {steps.length}
              </span>
              <span className="text-sm font-medium text-primary">
                {Math.round(progress)}% Complete
              </span>
            </div>
            
            <Progress value={progress} className="h-2" />
            
            <div className="grid grid-cols-6 gap-2">
              {steps.map((step) => (
                <div key={step.id} className="text-center">
                  <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center text-sm font-medium transition-smooth ${
                    currentStep > step.id 
                      ? 'bg-primary text-white' 
                      : currentStep === step.id 
                        ? 'bg-primary/20 text-primary border-2 border-primary' 
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
                  </div>
                  <div className="text-xs font-medium">{step.title}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Form Content */}
        <Card className="p-8 bg-gradient-card shadow-elevated border-primary/10">
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2">{steps[currentStep - 1].title}</h2>
            <p className="text-muted-foreground">{steps[currentStep - 1].description}</p>
          </div>

          {/* Navigation - Top */}
          {currentStep < 6 && (
            <div className="flex justify-between mb-8 pb-6 border-b">
              <Button 
                variant="outline" 
                onClick={prevStep} 
                disabled={currentStep === 1}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <Button 
                onClick={nextStep}
                disabled={!isStepValid()}
                className="bg-gradient-primary hover:opacity-90 transition-smooth flex items-center gap-2"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {renderStep()}

          {/* Navigation - Bottom */}
          {currentStep < 6 && (
            <div className="flex justify-between mt-8 pt-6 border-t">
              <Button 
                variant="outline" 
                onClick={prevStep} 
                disabled={currentStep === 1}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <Button 
                onClick={nextStep}
                disabled={!isStepValid()}
                className="bg-gradient-primary hover:opacity-90 transition-smooth flex items-center gap-2"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>

        {/* Security Note */}
        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>🔒 Your information is encrypted and secure. We never share your data with third parties.</p>
        </div>
      </div>
    </section>
  );
};

export default TicketForm;