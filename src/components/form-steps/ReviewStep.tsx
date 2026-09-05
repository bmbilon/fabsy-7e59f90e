import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormData } from "../TicketForm";
import { format } from "date-fns";
import { 
  User, 
  FileText, 
  Scale, 
  CheckCircle, 
  Clock,
  Mail,
  Phone,
  MapPin,
  Calendar,
  DollarSign
} from "lucide-react";
import { PHOTO_RADAR, PHOTO_RADAR_PRICE_LABEL, RAPID_RESOLUTION } from "@/config/offers";
import { REGISTERED_OWNER_LABELS } from "@/lib/ticket/ticketType";
import { isProLicenceClass } from "@/lib/pro-drivers/intake";
import { parseReferralAttribution } from "@/lib/referrals/attribution";

interface ReviewStepProps {
  formData: FormData;
  onSubmit: () => void;
  hasStoredTicket?: boolean;
}

const ReviewStep = ({ formData, onSubmit, hasStoredTicket = false }: ReviewStepProps) => {
  const isPhotoRadar = formData.ticketType === "photo_radar";
  const offer = isPhotoRadar ? PHOTO_RADAR : RAPID_RESOLUTION;
  const hasProDeclaration = !isPhotoRadar && isProLicenceClass(formData.licenceClass);
  const referral = parseReferralAttribution(formData.referral);
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-primary" />
        </div>
        <h2 className="text-3xl font-bold">Review Your Application</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Please review the information below before continuing to secure payment. Fabsy's traffic
          ticket agent team will review the paid submission, request disclosure where authorized,
          and notify you as the file advances.
        </p>
      </div>

      {/* Personal Information */}
      <Card className="p-6 bg-gradient-card shadow-fab border-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <User className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold">Personal Information</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div><span className="font-medium">Ticket type:</span> {isPhotoRadar ? "Photo radar / red-light camera notice" : "Officer-issued ticket"}</div>
            {isPhotoRadar && <div><span className="font-medium">Registered owner on the offence date:</span> {REGISTERED_OWNER_LABELS[formData.registeredOwnerOnOffenceDate] || "Not answered"}</div>}
            {!isPhotoRadar && formData.licenceClass !== "unknown" && <div><span className="font-medium">Declared Alberta licence class:</span> Class {formData.licenceClass}</div>}
            <div className="flex items-center gap-2">
              <span className="font-medium">Name:</span>
              <span>{formData.firstName} {formData.lastName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{formData.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{formData.phone}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div>{formData.address}</div>
                <div>{formData.city}, {formData.province} {formData.postalCode}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>DOB: {formData.dateOfBirth ? format(formData.dateOfBirth, "MMM dd, yyyy") : "Not provided"}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Ticket Details */}
      <Card className="p-6 bg-gradient-card shadow-fab border-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="h-5 w-5 text-secondary" />
          <h3 className="text-lg font-bold">Ticket Details</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div>
              <span className="font-medium">Ticket Number *</span>
              <div className="bg-white dark:bg-white/10 p-2 rounded mt-1">{formData.ticketNumber}</div>
            </div>
            <div><span className="font-medium">Violation:</span> {formData.violation}</div>
            {(formData.offenceSection || formData.offenceSubSection || formData.offenceDescription) && (
              <div className="bg-muted/30 p-3 rounded-lg mt-2 space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Offence Details:</div>
                {formData.offenceSection && <div className="text-sm">Sec. {formData.offenceSection}</div>}
                {formData.offenceSubSection && <div className="text-sm">Sub-Sec. {formData.offenceSubSection}</div>}
                {formData.offenceDescription && <div className="text-sm">{formData.offenceDescription}</div>}
              </div>
            )}
            <div>
              <span className="font-medium">Fine Amount *</span>
              <div className="bg-white dark:bg-white/10 p-2 rounded mt-1">{formData.fineAmount}</div>
            </div>
            <div>
              <span className="font-medium">Officer Name *</span>
              <div className="bg-white dark:bg-white/10 p-2 rounded mt-1">{formData.officer}</div>
            </div>
            {formData.officerBadge && (
              <div>
                <span className="font-medium">Badge Number</span>
                <div className="bg-muted/30 p-2 rounded mt-1">{formData.officerBadge}</div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div>
              <span className="font-medium">Issue Date *</span>
              <div className="bg-white dark:bg-white/10 p-2 rounded mt-1">{formData.issueDate ? format(formData.issueDate, "MMM dd, yyyy") : "Not provided"}</div>
            </div>
            <div>
              <span className="font-medium">Location *</span>
              <div className="bg-white dark:bg-white/10 p-2 rounded mt-1">{formData.location}</div>
            </div>
            <div>
              <span className="font-medium">Court Date</span>
              <div className="bg-muted/30 p-2 rounded mt-1">{formData.courtDate ? format(formData.courtDate, "MMM dd, yyyy") : "Not scheduled"}</div>
            </div>
            <div><span className="font-medium">Ticket Image:</span> {formData.ticketImage || hasStoredTicket ? "Uploaded" : "Not uploaded"}</div>
          </div>
        </div>
      </Card>

      {/* Defense Strategy */}
      <Card className="p-6 bg-gradient-card shadow-fab border-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <Scale className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold">Defense Strategy</h3>
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <span className="font-medium">Plea Type:</span>
            <Badge className="ml-2 bg-primary/10 text-primary border-primary/20">
              {formData.pleaType === 'not_guilty' ? 'Not Guilty' :
               formData.pleaType === 'guilty_explanation' ? 'Guilty with Explanation' :
               formData.pleaType === 'procedural' ? 'Procedural Issues' :
               formData.pleaType === 'emergency' ? 'Emergency Situation' :
               formData.pleaType === 'equipment_error' ? 'Equipment Error' : 'Not selected'}
            </Badge>
          </div>
          
          {formData.explanation && (
            <div>
              <span className="font-medium block mb-2">Your Explanation:</span>
              <div className="bg-background/50 p-3 rounded text-xs">
                {formData.explanation.substring(0, 200)}
                {formData.explanation.length > 200 && '...'}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div><span className="font-medium">Witnesses:</span> {formData.witnesses ? 'Yes' : 'No'}</div>
            <div><span className="font-medium">Additional Evidence:</span> {formData.evidence ? 'Yes' : 'No'}</div>
          </div>
        </div>
      </Card>

      {/* Service pricing */}
      <Card className="p-6 bg-gradient-card shadow-fab border-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <DollarSign className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold">Service Pricing</h3>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span>{offer.name}</span>
            <span>${offer.priceCad}.00 CAD</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{isPhotoRadar ? "5% GST" : "Applicable tax"}</span>
            <span>{isPhotoRadar ? `$${PHOTO_RADAR.gstCad.toFixed(2)}` : "Calculated at checkout"}</span>
          </div>
          {isPhotoRadar && <p className="border-t pt-3 font-semibold">{PHOTO_RADAR_PRICE_LABEL}</p>}
          {hasProDeclaration && <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-medium">20% pro driver discount pending verification</p>
            <p className="mt-2 text-muted-foreground">{formData.driversLicenseImage
              ? "Your licence photo is attached. Before checkout we will verify your identity, Alberta licence and declared class. The price stays unchanged until verification succeeds."
              : "No licence photo is attached, so checkout will be full price. You can go back to Personal Info to upload one, or provide it securely after payment for a 20% partial refund if eligible."}</p>
          </div>}
          {referral && <p className="text-sm text-muted-foreground"><span className="font-medium">Referral code:</span> {referral.code}. Your referrer may receive a referral payment; your price stays the same.</p>}
          {!isPhotoRadar && formData.insuranceCompany && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Insurance:</span> {formData.insuranceCompany}
            </div>
          )}
          <p className="border-t pt-3 text-sm text-muted-foreground">
            {isPhotoRadar ? <>{PHOTO_RADAR.insuranceDisclaimer} Fabsy enters a not-guilty plea, requests disclosure and pursues a Crown reduction or withdrawal. You approve any deal. {PHOTO_RADAR.outcomeDisclaimer}</> : <>This fee covers the eligible pre-trial service described above. Trial representation,
            government fines and out-of-scope work are separate. {RAPID_RESOLUTION.outcomeDisclaimer}</>}
          </p>
        </div>
      </Card>

      {/* What Happens Next */}
      <Card className="p-6 bg-primary/5 border-primary/20">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-primary">What Happens Next</h3>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
            <div>
              <div className="font-medium">Secure Checkout</div>
              <div className="text-muted-foreground">{isPhotoRadar ? `Pay ${PHOTO_RADAR_PRICE_LABEL}. No insurance report is needed.` : "Review the final subtotal, tax, and any optional insurance-report add-on in the next step"}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
            <div>
              <div className="font-medium">Disclosure request and tracking</div>
              <div className="text-muted-foreground">Fabsy checks deadlines, requests disclosure where authorized, and tracks the file</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">3</div>
            <div>
              <div className="font-medium">Analysis and prosecutor review</div>
              <div className="text-muted-foreground">Complete disclosure is reviewed and the next authorized prosecutor step is prepared or submitted within 48 hours</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">4</div>
            <div>
              <div className="font-medium">Immediate status notifications</div>
              <div className="text-muted-foreground">You receive a plain-language comparison and give the final instruction on any Crown response</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Submit Button */}
      <div className="text-center space-y-4">
        <Button
          onClick={onSubmit}
          size="lg"
          className="bg-gradient-primary hover:opacity-90 transition-smooth shadow-glow px-12 py-4 text-lg"
        >
          Continue to Secure Checkout
        </Button>
        
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          By continuing, you confirm the information above and proceed to the ${offer.priceCad} CAD plus GST {offer.name} checkout. Fabsy is an agent service, not a law firm.
        </p>
      </div>
    </div>
  );
};

export default ReviewStep;
