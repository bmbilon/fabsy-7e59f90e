import { useState } from "react";
import { CreditCard, DollarSign, FileSearch, Shield } from "lucide-react";
import { FormData } from "../TicketForm";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ABSTRACT_SELF_ORDER,
  IDR_DISCLAIMER,
  IDR_PRICE_ADDON,
} from "@/config/idr";
import { validateTicketCaptureFile } from "@/lib/ticket/ticketCapture";
import {
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";

interface PaymentStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

async function functionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: Response }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: unknown };
        if (typeof body.error === "string" && body.error.trim()) return body.error;
      } catch {
        // Use the provider error below when the response body is unavailable.
      }
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function PaymentStep({ formData, updateFormData }: PaymentStepProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [includeIdrAddon, setIncludeIdrAddon] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [idrOrderId] = useState(() => crypto.randomUUID());
  const { toast } = useToast();
  const hasLegacyAssessment = Boolean(formData.sourceAssessmentId && formData.sourceAssessmentAccessToken);

  const checkoutSubtotal = RAPID_RESOLUTION.priceCad + (includeIdrAddon ? IDR_PRICE_ADDON : 0);

  const handleStripeCheckout = async () => {
    if (!agreedToTerms) {
      toast({
        title: "Agreement required",
        description: "Agree to the Terms of Service and Privacy Policy before continuing.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const sourceAssessment = formData.sourceAssessmentId && formData.sourceAssessmentAccessToken
        ? {
          submissionId: formData.sourceAssessmentId,
          accessToken: formData.sourceAssessmentAccessToken,
        }
        : null;
      const ticketFile = formData.ticketImage;
      if (!sourceAssessment && !ticketFile) {
        throw new Error("Return to Ticket Details and attach the ticket PDF or photo before checkout.");
      }
      let ticketMimeType: string | undefined;
      if (ticketFile) {
        const ticketDescriptor = validateTicketCaptureFile(ticketFile);
        if ("error" in ticketDescriptor) throw new Error(ticketDescriptor.error);
        ticketMimeType = ticketDescriptor.mimeType;
      }

      const { data: submission, error: submissionError } = await supabase.functions.invoke("submit-ticket", {
        body: {
          driversLicense: formData.driversLicense,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          province: formData.province,
          postalCode: formData.postalCode,
          dateOfBirth: formData.dateOfBirth?.toISOString().split("T")[0],
          smsOptIn: formData.smsOptIn,
          ticketNumber: formData.ticketNumber,
          violation: formData.violation || formData.offenceDescription,
          fineAmount: formData.fineAmount,
          violationDate: formData.issueDate?.toISOString().split("T")[0],
          courtLocation: formData.courtJurisdiction || formData.location,
          courtDate: formData.courtDate?.toISOString().split("T")[0],
          defenseStrategy: `${formData.pleaType}\n\nExplanation: ${formData.explanation}\n\nCircumstances: ${formData.circumstances}`,
          additionalNotes: [
            formData.additionalNotes,
            formData.offenceSection ? `Section: ${formData.offenceSection}${formData.offenceSubSection ? `(${formData.offenceSubSection})` : ""}` : "",
            formData.officer ? `Officer: ${formData.officer}${formData.officerBadge ? ` (${formData.officerBadge})` : ""}` : "",
            formData.location ? `Offence location: ${formData.location}` : "",
          ].filter(Boolean).join("\n"),
          insuranceCompany: formData.insuranceCompany,
          ...(sourceAssessment ? { sourceAssessment } : {
            file: { contentType: ticketMimeType!, size: ticketFile!.size },
          }),
        },
      });

      if (submissionError || !submission?.success || !submission.submissionId || !submission.clientId || !submission.accessToken) {
        throw new Error(
          typeof submission?.error === "string"
            ? submission.error
            : await functionErrorMessage(submissionError, "Ticket submission could not be created."),
        );
      }

      const submissionId = submission.submissionId as string;
      const clientId = submission.clientId as string;
      const representationAccessToken = submission.accessToken as string;
      if (submission.upload?.path && submission.upload?.token && ticketFile) {
        if (!ticketMimeType) throw new Error("The ticket file type could not be validated.");
        const { error: uploadError } = await supabase.storage
          .from("assessment-tickets")
          .uploadToSignedUrl(submission.upload.path, submission.upload.token, ticketFile, {
            contentType: ticketMimeType,
            upsert: true,
          });
        if (uploadError) throw new Error("Your ticket was saved, but the private file upload did not finish. Please try again.");
      }
      const { data: consent, error: consentError } = await supabase.functions.invoke("generate-consent-form", {
        body: {
          submissionId,
          accessToken: representationAccessToken,
          digitalSignature: formData.digitalSignature,
        },
      });
      if (consentError || !consent?.success || !consent?.consentFormPath) {
        throw new Error(await functionErrorMessage(consentError, "Your signed consent form could not be stored. Please try again."));
      }

      const { error: notificationError } = await supabase.functions.invoke("send-notification", {
        body: { submissionId, accessToken: representationAccessToken },
      });
      if (notificationError) console.error("Submission notification failed", notificationError);

      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("create-payment", {
        body: {
          formData,
          submissionId,
          clientId,
          accessToken: representationAccessToken,
          includeIdrAddon,
          ...(includeIdrAddon ? { idrOrderId } : {}),
        },
      });
      if (checkoutError || !checkout?.url) {
        throw checkoutError || new Error("Secure checkout did not return a payment URL.");
      }
      window.location.assign(checkout.url);
    } catch (error) {
      console.error("Ticket checkout failed", error);
      toast({
        title: "Checkout unavailable",
        description: error instanceof Error ? error.message : "We could not start secure checkout. Please try again.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card className="border-primary/10 bg-gradient-card p-6 shadow-fab">
        <div className="mb-5 flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-primary" />
          <h3 className="text-xl font-bold">Rapid Resolution checkout</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">Rapid Resolution</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Eligible Alberta pre-trial service through disclosure, prosecutor review, Crown-response explanation and your decision. Trial representation is separate.
              </p>
            </div>
            <p className="shrink-0 font-bold">${RAPID_RESOLUTION.priceCad} CAD</p>
          </div>
          <div className="rounded-lg border border-secondary/20 bg-secondary/5 p-4 text-sm">
            {RAPID_RESOLUTION.actionCommitment} {RAPID_RESOLUTION.speedDisclaimer}
          </div>
          {hasLegacyAssessment && (
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
              A previous assessment is linked to this matter. Any credit available under its original terms is validated securely before payment.
            </div>
          )}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Checkout subtotal</span>
              <span className="text-primary">${checkoutSubtotal} CAD</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Applicable GST is calculated at Stripe checkout. Government fines, trial representation and out-of-scope work are separate.
            </p>
            {includeIdrAddon && (
              <p className="mt-2 text-xs text-muted-foreground">
                Promotion codes cannot be combined with the ${IDR_PRICE_ADDON} report add-on in the same checkout.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <CreditCard className="h-6 w-6 text-primary" />
            <h3 className="text-xl font-bold">Payment options</h3>
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

          {!hasLegacyAssessment && <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="idr-addon"
                checked={includeIdrAddon}
                onCheckedChange={(value) => setIncludeIdrAddon(value === true)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="idr-addon" className="cursor-pointer text-base font-semibold">
                  Add the {INSURANCE_IMPACT_REPORT.shortName} for ${IDR_PRICE_ADDON}
                </Label>
                <p className="mt-2 text-sm text-muted-foreground">
                  Get both services for ${RAPID_RESOLUTION_BUNDLE.priceCad} CAD plus GST. The report provides source-backed conviction-impact scenarios, aging dates, public research sources and a renewal checklist.
                </p>
                {ABSTRACT_SELF_ORDER && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    You order your own commercial 5-year Alberta driver abstract and upload it privately after payment. Registry or government fees are separate.
                  </p>
                )}
              </div>
            </div>
            {includeIdrAddon && (
              <div className="mt-4 flex items-start gap-3 border-t border-primary/20 pt-4">
                <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-muted-foreground">{IDR_DISCLAIMER}</p>
              </div>
            )}
          </div>}

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
                  I agree to the <a href="/terms-of-purchase" className="text-primary underline">Terms of Purchase</a>, <a href="/terms-of-service" className="text-primary underline">Terms of Service</a>, and <a href="/privacy-policy" className="text-primary underline">Privacy Policy</a>.
                </Label>
                <p className="mt-2 text-xs text-muted-foreground">
                  Payment activates Rapid Resolution under the signed consent. Fabsy is a traffic ticket agent service, not a law firm, and no outcome is promised.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleStripeCheckout}
            disabled={!agreedToTerms || isProcessing}
            className="min-h-12 h-auto w-full whitespace-normal py-3 text-base font-semibold sm:text-lg"
            size="lg"
          >
            {isProcessing ? "Starting secure checkout..." : (
              <span className="flex flex-wrap items-center justify-center gap-2">
                <CreditCard className="h-5 w-5" /> Continue to Stripe for ${checkoutSubtotal} CAD plus tax
              </span>
            )}
          </Button>

          <div className="flex items-start gap-3 rounded-lg border border-secondary/15 bg-secondary/5 p-4">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
            <p className="text-sm text-muted-foreground">
              Stripe handles payment details on its secure checkout page. Fabsy does not collect card details in this form.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
