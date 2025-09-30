import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormData } from "../TicketForm";
import { format } from "date-fns";
import { 
  User, 
  FileText, 
  Scale, 
  CreditCard, 
  CheckCircle, 
  Clock,
  Mail,
  Phone,
  MapPin,
  Calendar,
  DollarSign
} from "lucide-react";

interface ReviewStepProps {
  formData: FormData;
  onSubmit: () => void;
  isSubmitting: boolean;
}

const ReviewStep = ({ formData, onSubmit, isSubmitting }: ReviewStepProps) => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-primary" />
        </div>
        <h2 className="text-3xl font-bold">Review Your Application</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Please review all information below. Once submitted, our legal experts will begin working on your case immediately.
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
            <div><span className="font-medium">Ticket #:</span> {formData.ticketNumber}</div>
            <div><span className="font-medium">Violation:</span> {formData.violation}</div>
            <div><span className="font-medium">Fine Amount:</span> {formData.fineAmount}</div>
            <div><span className="font-medium">Officer:</span> {formData.officer}</div>
            {formData.officerBadge && <div><span className="font-medium">Badge #:</span> {formData.officerBadge}</div>}
          </div>
          <div className="space-y-2">
            <div><span className="font-medium">Issue Date:</span> {formData.issueDate ? format(formData.issueDate, "MMM dd, yyyy") : "Not provided"}</div>
            <div><span className="font-medium">Location:</span> {formData.location}</div>
            <div><span className="font-medium">Court Date:</span> {formData.courtDate ? format(formData.courtDate, "MMM dd, yyyy") : "Not scheduled"}</div>
            <div><span className="font-medium">Ticket Image:</span> {formData.ticketImage ? "✓ Uploaded" : "Not uploaded"}</div>
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

      {/* Payment Summary */}
      <Card className="p-6 bg-gradient-card shadow-fab border-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <DollarSign className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold">Payment Summary</h3>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span>Fabsy Defense Service</span>
            <span>$488.00</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Alberta HST (5%)</span>
            <span>$24.40</span>
          </div>
          <div className="border-t pt-3">
            <div className="flex justify-between text-lg font-bold">
              <span>Total Amount</span>
              <span className="text-primary">$512.40</span>
            </div>
          </div>
          {formData.insuranceCompany && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Insurance:</span> {formData.insuranceCompany}
            </div>
          )}
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
              <div className="font-medium">Immediate Confirmation</div>
              <div className="text-muted-foreground">You'll receive an email confirmation within 5 minutes</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
            <div>
              <div className="font-medium">Expert Review (24-48 hours)</div>
              <div className="text-muted-foreground">Our expert team reviews your case and develops a defense strategy</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">3</div>
            <div>
              <div className="font-medium">Court Representation (2-6 weeks)</div>
              <div className="text-muted-foreground">We handle all court proceedings and keep you updated</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">4</div>
            <div>
              <div className="font-medium">Results Notification</div>
              <div className="text-muted-foreground">You'll be notified of the outcome immediately</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Submit Button */}
      <div className="text-center space-y-4">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          size="lg"
          className="bg-gradient-primary hover:opacity-90 transition-smooth shadow-glow px-12 py-4 text-lg"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Processing Application...
            </>
          ) : (
            <>
              Submit Application & Process Payment
            </>
          )}
        </Button>
        
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          By submitting, you authorize Fabsy to represent you in court and process your payment. 
          Remember: if we don't successfully dismiss or reduce your ticket, you get a full refund.
        </p>
      </div>
    </div>
  );
};

export default ReviewStep;