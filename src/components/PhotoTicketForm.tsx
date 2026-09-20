import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { FormData, TicketFormProps } from "./TicketForm";
import QuickTicketIntake from "./QuickTicketIntake";
import { initialFormData } from "@/lib/ticket/initialFormData";
import { ticketDateAsLocalDate } from "@/lib/ticket/ticketType";
import { useLocale } from "@/i18n/locale-context";
import { latestReferralAttribution } from "@/lib/referrals/attribution";
import { captureReferralFromLocation, readActiveReferral, REFERRAL_ATTRIBUTION_EVENT } from "@/lib/referrals/capture";

export default function PhotoTicketForm({ initialTicketImage = null, initialPrefill = null, sourceAssessment = null, embedded = false }: TicketFormProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const leaving = useRef(false);
  const { setIntakeHandoff } = useLocale();
  const [formData, setFormData] = useState<FormData>(() => ({
    ...initialFormData,
    ...initialPrefill,
    ticketImage: initialTicketImage,
    sourceAssessmentId: sourceAssessment?.submissionId ?? initialPrefill?.sourceAssessmentId ?? "",
    sourceAssessmentAccessToken: sourceAssessment?.accessToken ?? initialPrefill?.sourceAssessmentAccessToken ?? "",
    issueDate: ticketDateAsLocalDate(initialPrefill?.issueDate),
    courtDate: ticketDateAsLocalDate(initialPrefill?.courtDate),
    dateOfBirth: ticketDateAsLocalDate(initialPrefill?.dateOfBirth),
    referral: latestReferralAttribution([initialPrefill?.referral, readActiveReferral()]),
    consentGiven: false,
    digitalSignature: "",
  }));
  const updateFormData = (updates: Partial<FormData> | ((current: FormData) => Partial<FormData>)) => {
    setFormData(current => ({ ...current, ...(typeof updates === "function" ? updates(current) : updates) }));
  };

  useEffect(() => {
    const syncReferral = () => setFormData(current => ({ ...current, referral: readActiveReferral() }));
    window.addEventListener(REFERRAL_ATTRIBUTION_EVENT, syncReferral);
    void captureReferralFromLocation(window.location);
    return () => window.removeEventListener(REFERRAL_ATTRIBUTION_EVENT, syncReferral);
  }, []);
  useEffect(() => {
    setIntakeHandoff({ prefillTicketData: { ...formData, consentGiven: false, digitalSignature: "" }, startAtStep: 1, ticketImage: formData.ticketImage });
  }, [formData, setIntakeHandoff]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("fabsy:live-stage", { detail: "intake" }));
    if (!embedded) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [embedded]);

  // Match the assessment's existing fresh-document privacy boundary before
  // a homepage advertising/chat script can see a file name or contact value.
  const privateUpload = location.pathname !== "/" || new URLSearchParams(location.search).has("upload") || new URLSearchParams(location.search).has("assessment");
  const enterPrivateUpload = (event: SyntheticEvent<HTMLElement>) => {
    if (privateUpload || !(event.target as HTMLElement).closest("button,input,select,textarea")) return;
    event.preventDefault();
    event.stopPropagation();
    if (leaving.current) return;
    leaving.current = true;
    navigate("/?upload=1#ticket-form-container");
  };

  return <div onPointerDownCapture={enterPrivateUpload} onFocusCapture={enterPrivateUpload} onClickCapture={enterPrivateUpload}>
    <QuickTicketIntake formData={formData} updateFormData={updateFormData} embedded={embedded} allowFileSelection={privateUpload} />
  </div>;
}
