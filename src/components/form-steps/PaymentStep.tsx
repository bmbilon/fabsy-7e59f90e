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
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/locale-context";
import { buildIntakeAdditionalNotes, buildIntakeDefenseStrategy, validateLocalizedIntakeStep } from "@/i18n/intake-validation";
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

class CheckoutFailure extends Error {
  constructor(message: string, readonly translationKey?: 'intake.validation.consentCharacter') { super(message); }
}

async function functionErrorDetails(error: unknown, fallback: string): Promise<{ message: string; code?: string }> {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: Response }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: unknown; code?: unknown };
        if (typeof body.error === "string" && body.error.trim()) return { message: body.error, code: typeof body.code === 'string' ? body.code : undefined };
      } catch {
        // Use the provider error below when the response body is unavailable.
      }
    }
  }
  return { message: error instanceof Error && error.message ? error.message : fallback };
}

export default function PaymentStep({ formData, updateFormData }: PaymentStepProps) {
  const { t } = useTranslation();
  const { locale, isReleased, href } = useLocale();
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [selectedIdrAddon, setIncludeIdrAddon] = useState(false);
  // The report intake is still English. Offer the released RR service alone on
  // localized checkout instead of silently handing off an untranslated add-on.
  const includeIdrAddon = locale === "en" && selectedIdrAddon;
  const [isProcessing, setIsProcessing] = useState(false);
  const [idrOrderId] = useState(() => crypto.randomUUID());
  const { toast } = useToast();
  const hasLegacyAssessment = Boolean(formData.sourceAssessmentId && formData.sourceAssessmentAccessToken);

  const checkoutSubtotal = RAPID_RESOLUTION.priceCad + (includeIdrAddon ? IDR_PRICE_ADDON : 0);

  const handleStripeCheckout = async () => {
    if (!isReleased) {
      toast({ title: t('language.draftTitle'), description: t('language.paymentBlocked'), variant: "destructive" });
      return;
    }
    if (locale !== "en") {
      const invalid = [1, 2, 3, 4].flatMap(step => Object.values(validateLocalizedIntakeStep(step, formData)));
      if (invalid.length) {
        toast({ title: t('intake.review.title'), description: t(invalid[0]), variant: "destructive" });
        return;
      }
    }
    if (!agreedToTerms) {
      toast({
        title: locale === "en" ? "Agreement required" : t('intake.validation.consent'),
        description: locale === "en" ? "Agree to the Terms of Purchase, Terms of Service and Privacy Policy before continuing." : t('intake.validation.terms'),
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
          preferred_locale: locale,
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
          violation: formData.offenceDescription || formData.violation,
          fineAmount: formData.fineAmount,
          violationDate: formData.issueDate?.toISOString().split("T")[0],
          courtLocation: formData.courtJurisdiction || formData.location,
          courtDate: formData.courtDate?.toISOString().split("T")[0],
          defenseStrategy: buildIntakeDefenseStrategy(formData),
          additionalNotes: buildIntakeAdditionalNotes(formData),
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
            : (await functionErrorDetails(submissionError, "Ticket submission could not be created.")).message,
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
        const detail = await functionErrorDetails(consentError, "Your signed consent form could not be stored. Please try again.");
        throw new CheckoutFailure(detail.message, detail.code === 'consent_character_not_supported' ? 'intake.validation.consentCharacter' : undefined);
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
        title: locale === "en" ? "Checkout unavailable" : t('checkout.paymentFailed'),
        description: locale === "en" ? (error instanceof Error ? error.message : "We could not start secure checkout. Please try again.") : t(error instanceof CheckoutFailure && error.translationKey ? error.translationKey : 'intake.validation.submit'),
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  if (locale !== "en") return <div className="space-y-6">
    <section className="space-y-4 rounded-xl border bg-slate-50 p-5">
      <h3 className="text-xl font-bold">{t('checkout.title')}</h3>
      <div className="flex flex-wrap justify-between gap-3 font-semibold"><span>{t('common.serviceName')}</span><span dir="ltr">${checkoutSubtotal} CAD + GST</span></div>
      <p className="text-sm leading-relaxed text-slate-600">{t('checkout.scope')}</p>
      <p className="text-sm leading-relaxed text-slate-600">{t('common.noSuccessFee')}</p>
      <p className="text-sm leading-relaxed text-slate-600">{t('rapid.speedDisclaimer')}</p>
      <p className="text-sm leading-relaxed text-slate-600">{t('common.noOutcomePromise')}</p>
      <div className="flex justify-between border-t pt-4 font-semibold"><span>{t('checkout.subtotal')}</span><span dir="ltr">${checkoutSubtotal} CAD</span></div>
    </section>
    {!isReleased && <aside className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
      <p>{t('language.paymentBlocked')}</p><Link to="/submit-ticket" state={{ prefillTicketData: { ...formData, consentGiven: false, digitalSignature: '' }, startAtStep: 4, ticketImage: formData.ticketImage }} className="font-semibold underline">{t('language.continueEnglish')}</Link>
    </aside>}
    <div className="space-y-3">
      <label htmlFor="localized-payment-terms" className="flex items-start gap-3 text-sm leading-relaxed">
        <input id="localized-payment-terms" type="checkbox" checked={agreedToTerms} disabled={!isReleased || isProcessing} onChange={event => setAgreedToTerms(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-700" />
        <span>{t('checkout.termsAcceptance')}</span>
      </label>
      <div className="flex flex-wrap gap-4 text-sm"><Link to={href('/terms-of-service')} target="_blank" rel="noopener noreferrer" className="text-primary underline">{t('nav.terms')}</Link><Link to="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-primary underline">{t('language.readEnglish')}</Link><Link to="/terms-of-purchase" target="_blank" rel="noopener noreferrer" className="text-primary underline" lang="en">Terms of Purchase (English)</Link><Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline" lang="en">Privacy Policy (English)</Link></div>
    </div>
    <Button className="h-auto min-h-12 w-full whitespace-normal py-3" disabled={!isReleased || !agreedToTerms || isProcessing} onClick={handleStripeCheckout}>
      <CreditCard className="me-2 h-5 w-5 shrink-0" aria-hidden="true" />{t(isProcessing ? 'checkout.processing' : 'checkout.pay')}
    </Button>
    <p className="text-sm leading-relaxed text-slate-600">{t('common.notLawFirm')} {t('common.clientDecision')}</p>
  </div>;

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
