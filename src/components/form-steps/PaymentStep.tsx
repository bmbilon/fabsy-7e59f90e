import { useEffect, useState } from "react";
import FeeRefundNotice from "@/components/FeeRefundNotice";
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
import { ticketCheckoutSelection } from "@/lib/ticket/ticketType";
import { isProLicenceClass, licencePhotoAsDataUrl, normalizeLicenceClass, proCheckoutSubtotalCents, validateProLicenceFile, verifiedProResponse, type ProVerificationResponse } from "@/lib/pro-drivers/intake";
import { latestReferralAttribution } from "@/lib/referrals/attribution";
import { referralForCheckout } from "@/lib/referrals/capture";
import {
  INSURANCE_IMPACT_REPORT,
  PHOTO_RADAR,
  PHOTO_RADAR_PRICE_LABEL,
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
  const isPhotoRadar = formData.ticketType === "photo_radar";
  const offer = isPhotoRadar ? PHOTO_RADAR : RAPID_RESOLUTION;
  const { includeIdrAddon } = ticketCheckoutSelection(formData.ticketType, selectedIdrAddon, locale);
  useEffect(() => { setIncludeIdrAddon(false); setAgreedToTerms(false); }, [formData.ticketType, locale]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifyingPro, setIsVerifyingPro] = useState(false);
  const [proVerification, setProVerification] = useState<{ response: ProVerificationResponse; identity: string; image: File } | null>(null);
  const [proCheckFailed, setProCheckFailed] = useState(false);
  const [idrOrderId] = useState(() => crypto.randomUUID());
  const { toast } = useToast();
  const hasLegacyAssessment = Boolean(formData.sourceAssessmentId && formData.sourceAssessmentAccessToken);

  const requestsProDiscount = !isPhotoRadar && isProLicenceClass(formData.licenceClass);
  const requiresEnglish = locale !== "en" && (isPhotoRadar || requestsProDiscount);
  const hasProDeclaration = locale === "en" && requestsProDiscount;
  const proIdentity = JSON.stringify([locale, formData.ticketType, formData.ticketNumber, formData.sourceAssessmentId, formData.licenceClass, formData.firstName, formData.lastName, formData.email, formData.driversLicense, formData.dateOfBirth]);
  const currentProVerification = proVerification?.identity === proIdentity && proVerification.image === formData.driversLicenseImage
    ? proVerification.response : null;
  const baseSubtotalCents = offer.priceCents + (includeIdrAddon ? IDR_PRICE_ADDON * 100 : 0);
  const checkoutSubtotalCents = proCheckoutSubtotalCents(baseSubtotalCents, formData, currentProVerification);
  const checkoutSubtotal = (checkoutSubtotalCents / 100).toFixed(2);
  const proDiscountApplied = checkoutSubtotalCents < baseSubtotalCents;
  const hasUsableProPhoto = hasProDeclaration && formData.driversLicenseImage && validateProLicenceFile(formData.driversLicenseImage).valid;
  const fullPriceNotice = `Your licence discount is not verified. Stripe checkout will be $${(baseSubtotalCents / 100).toFixed(2)} CAD plus GST. After payment, securely send a licence photo for the 20% partial refund if eligible.`;

  const handleStripeCheckout = async () => {
    if (isProcessing) return;
    if (!isReleased || requiresEnglish) {
      toast({ title: t('language.draftTitle'), description: t('language.paymentBlocked'), variant: "destructive" });
      return;
    }
    if (isPhotoRadar && !formData.registeredOwnerOnOffenceDate) {
      toast({ title: "Ownership answer required", description: "Return to Ticket Details and confirm whether the vehicle was registered to you on the offence date.", variant: "destructive" });
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
    setProCheckFailed(false);
    setProVerification(null);
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

      const referral = latestReferralAttribution([formData.referral, await referralForCheckout()]);
      const { data: submission, error: submissionError } = await supabase.functions.invoke("submit-ticket", {
        body: {
          preferred_locale: locale,
          ticket_type: formData.ticketType,
          ticket_type_source: formData.ticketTypeSource === "default" ? "entry" : formData.ticketTypeSource,
          registered_owner_on_offence_date: isPhotoRadar ? formData.registeredOwnerOnOffenceDate : null,
          declaredLicenceClass: locale !== "en" || isPhotoRadar ? "unknown" : normalizeLicenceClass(formData.licenceClass),
          ...(referral ? { refCode: referral.code, refAttributionToken: referral.attributionToken } : {}),
          ...(formData.plateNumber?.trim() ? { plateNumber: formData.plateNumber.trim() } : {}),
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
          insuranceCompany: isPhotoRadar ? "" : formData.insuranceCompany,
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

      // Only a direct response for this stored submission can change the UI
      // price. The checkout endpoint independently rechecks the stored result.
      if (hasProDeclaration) {
        const licencePhoto = formData.driversLicenseImage;
        const descriptor = licencePhoto ? validateProLicenceFile(licencePhoto) : null;
        let verified: ProVerificationResponse | null = null;
        if (licencePhoto && descriptor?.valid) {
          setIsVerifyingPro(true);
          try {
            const imageBase64 = await licencePhotoAsDataUrl(licencePhoto);
            const { data: verification, error: verificationError } = await supabase.functions.invoke("verify-pro-licence", {
              body: { submissionId, accessToken: representationAccessToken, licenceClass: formData.licenceClass, imageBase64, mimeType: descriptor.mimeType },
            });
            if (!verificationError) verified = verifiedProResponse(verification);
            if (verified) setProVerification({ response: verified, identity: proIdentity, image: licencePhoto });
          } catch {
            // An unavailable or unreadable licence never blocks base checkout.
          } finally {
            setIsVerifyingPro(false);
          }
        }
        if (!verified) {
          setProCheckFailed(true);
          if (licencePhoto) toast({ title: "Continuing at full price", description: fullPriceNotice });
        }
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
          formData: { email: formData.email, firstName: formData.firstName, lastName: formData.lastName, ticketNumber: formData.ticketNumber },
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
      setIsVerifyingPro(false);
    }
  };

  if (requiresEnglish) return <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
    <p>{t('language.paymentBlocked')}</p>
    <p lang="en">{isPhotoRadar ? "Photo Radar" : "Pro Driver Discount"} pricing and authorization are available in English.</p>
    <Link to={isPhotoRadar ? PHOTO_RADAR.intakePath : "/submit-ticket?ticket_type=officer_issued"}
      state={{ prefillTicketData: { ...formData, consentGiven: false, digitalSignature: '' }, startAtStep: 4, ticketImage: formData.ticketImage }}
      className="font-semibold underline">{t('language.continueEnglish')}</Link>
  </section>;

  if (locale !== "en") return <div className="space-y-6">
    <section className="space-y-4 rounded-xl border bg-slate-50 p-5">
      <h3 className="text-xl font-bold">{t('checkout.title')}</h3>
      <div className="flex flex-wrap justify-between gap-3 font-semibold"><span>{t('common.serviceName')}</span><span dir="ltr">${checkoutSubtotal} CAD + GST</span></div>
      <p className="text-sm leading-relaxed text-slate-600">{t('checkout.scope')}</p>
      <p className="text-sm leading-relaxed text-slate-600">{t('common.noSuccessFee')}</p>
      <p className="text-sm leading-relaxed text-slate-600">{t('rapid.speedDisclaimer')}</p>
      <p className="text-sm leading-relaxed text-slate-600">{t('common.noOutcomePromise')}</p>
      <FeeRefundNotice compact openTermsInNewTab />
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
          <h3 className="text-xl font-bold">{offer.name} checkout</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{offer.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isPhotoRadar ? `Fabsy enters a not-guilty plea, requests disclosure and pursues a Crown reduction or withdrawal. You approve any deal. No trial. No success fee. ${PHOTO_RADAR.insuranceDisclaimer}` : "Eligible Alberta pre-trial service through disclosure, prosecutor review, Crown-response explanation and your decision. Trial representation is separate."}
              </p>
            </div>
            <p className="shrink-0 font-bold">${offer.priceCad} CAD</p>
          </div>
          <div className="rounded-lg border border-secondary/20 bg-secondary/5 p-4 text-sm">
            {offer.actionCommitment} {offer.speedDisclaimer}
          </div>
          {hasLegacyAssessment && !isPhotoRadar && (
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
              A previous assessment is linked to this matter. Any credit available under its original terms is validated securely before payment.
            </div>
          )}
          {hasProDeclaration && <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm" aria-live="polite">
            <p className="font-semibold">{proDiscountApplied ? "20% pro driver discount verified" : isVerifyingPro ? "Verifying your Alberta licence…" : "Pro driver discount: verification required"}</p>
            <p className="mt-2 text-muted-foreground">{proDiscountApplied
              ? `Your licence matched your Class ${formData.licenceClass} declaration. The 20% discount applies to this officer-ticket service${includeIdrAddon ? " and its report add-on" : ""}.`
              : hasUsableProPhoto
                ? `You declared Class ${formData.licenceClass}. We will securely check the licence photo against your declaration and identity before creating checkout. Until verified, the subtotal shown is full price.`
                : `You declared Class ${formData.licenceClass}, but no usable verification photo is attached. Checkout is full price. Go back to Personal Info to attach a clear JPG, PNG or WebP licence photo, or submit it securely after payment for the 20% partial refund if eligible.`}</p>
            {proCheckFailed && <p className="mt-2 font-medium">{fullPriceNotice}</p>}
          </div>}
          <div className="border-t pt-4">
            {includeIdrAddon && <div className="mb-3 flex items-center justify-between gap-3 text-sm"><span>{INSURANCE_IMPACT_REPORT.shortName} add-on</span><span>${IDR_PRICE_ADDON.toFixed(2)} CAD</span></div>}
            {proDiscountApplied && <div className="mb-3 flex items-center justify-between gap-3 text-sm text-primary"><span>Verified pro driver discount (20%)</span><span>−${((baseSubtotalCents - checkoutSubtotalCents) / 100).toFixed(2)} CAD</span></div>}
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Checkout subtotal</span>
              <span className="text-primary">${checkoutSubtotal} CAD</span>
            </div>
            {isPhotoRadar && <p className="mt-3 text-sm font-semibold">{PHOTO_RADAR_PRICE_LABEL}</p>}
            <p className="mt-2 text-xs text-muted-foreground">
              {isPhotoRadar ? `GST is $${PHOTO_RADAR.gstCad.toFixed(2)}. The total charged is $${PHOTO_RADAR.totalCad.toFixed(2)} CAD. Government fines are separate. No legal outcome is guaranteed; the fee-refund terms below apply.` : "Applicable GST is calculated at Stripe checkout. Government fines, trial representation and out-of-scope work are separate."}
            </p>
            {includeIdrAddon && (
              <p className="mt-2 text-xs text-muted-foreground">
                The verified pro driver discount applies to the full bundle. Other promotion codes cannot be combined with this checkout.
              </p>
            )}
          </div>
        </div>
      </Card>

      <FeeRefundNotice photoRadar={isPhotoRadar} compact openTermsInNewTab />

      <Card className="p-6">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <CreditCard className="h-6 w-6 text-primary" />
            <h3 className="text-xl font-bold">Payment options</h3>
          </div>

          {!isPhotoRadar && <div className="space-y-2">
            <Label htmlFor="insurance-company">Insurance company, optional</Label>
            <Input
              id="insurance-company"
              value={formData.insuranceCompany}
              disabled={isProcessing}
              onChange={(event) => updateFormData({ insuranceCompany: event.target.value })}
              placeholder="Current insurance company"
            />
          </div>}

          {!isPhotoRadar && !hasLegacyAssessment && <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="idr-addon"
                checked={includeIdrAddon}
                disabled={isProcessing}
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
                disabled={isProcessing}
                onCheckedChange={(value) => setAgreedToTerms(value === true)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="payment-terms" className="cursor-pointer leading-relaxed">
                  I agree to the <a href="/terms-of-purchase" className="text-primary underline">Terms of Purchase</a>, <a href="/terms-of-service" className="text-primary underline">Terms of Service</a>, and <a href="/privacy-policy" className="text-primary underline">Privacy Policy</a>.
                </Label>
                <p className="mt-2 text-xs text-muted-foreground">
                  Payment activates {offer.name} under the signed consent. Fabsy is a traffic ticket agent service, not a law firm, and no outcome is promised.
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
            {isProcessing ? (isVerifyingPro ? "Verifying licence before checkout…" : "Starting secure checkout...") : (
              <span className="flex flex-wrap items-center justify-center gap-2">
                <CreditCard className="h-5 w-5" /> {isPhotoRadar ? `$${PHOTO_RADAR.priceCad} + GST` : hasUsableProPhoto && !proDiscountApplied ? "Verify licence and continue to Stripe" : `Continue to Stripe for $${checkoutSubtotal} CAD plus GST`}
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
