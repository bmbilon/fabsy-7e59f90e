import { supabase } from "@/integrations/supabase/client";
import type { FormData } from "@/components/TicketForm";
import { readActiveReferral } from "@/lib/referrals/capture";
import { latestReferralAttribution } from "@/lib/referrals/attribution";
import { validateTicketCaptureFile } from "./ticketCapture";
import { functionErrorDetails, IntakeSaveError, type PreparedTicketSubmission, type SavedTicketSubmission } from "./submitIntake";
import { PHOTO_UPLOAD_CONSENT_VERSION } from "../../../supabase/functions/_shared/intake-consent";

export interface PhotoIntakeAttempt { submissionId: string; accessToken: string }
export interface PhotoIntakeStatus {
  success: true;
  reviewStatus: "pending_scan" | "scanning" | "needs_review" | "ready";
  fields: Pick<FormData, "firstName" | "lastName" | "email" | "phone" | "ticketNumber" | "ticketType" | "registeredOwnerOnOffenceDate">;
}
export const newPhotoIntakeAttempt = (): PhotoIntakeAttempt => ({
  submissionId: crypto.randomUUID(),
  accessToken: Array.from(crypto.getRandomValues(new Uint8Array(32))).map(byte => byte.toString(16).padStart(2, "0")).join(""),
});

export async function photoIntakeAction<T>(attempt: PhotoIntakeAttempt, action: string, values: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("photo-ticket-intake", { body: { ...values, ...attempt, action } });
  if (error || !data?.success) {
    const detail = await functionErrorDetails(error, data?.error || "Your request could not be saved. Please try again.");
    throw new IntakeSaveError(detail.message, detail.code);
  }
  return data as T;
}

export async function savePhotoTicket(data: FormData, attempt: PhotoIntakeAttempt, options: {
  pleadNotGuilty: boolean;
  prepared?: PreparedTicketSubmission | null;
  onPrepared: (value: PreparedTicketSubmission) => void;
}): Promise<SavedTicketSubmission> {
  if (data.consentGiven !== true) throw new IntakeSaveError("Check the consent box before submitting your ticket.");
  const file = data.ticketImage;
  const sourceAssessment = data.sourceAssessmentId && data.sourceAssessmentAccessToken
    ? { submissionId: data.sourceAssessmentId, accessToken: data.sourceAssessmentAccessToken } : null;
  if (!file && !sourceAssessment) throw new IntakeSaveError("Attach a ticket photo or PDF.");
  const descriptor = file ? validateTicketCaptureFile(file) : null;
  if (descriptor && "error" in descriptor) throw new IntakeSaveError(descriptor.error);
  let prepared = options.prepared;
  if (!prepared) {
    const referral = latestReferralAttribution([data.referral, readActiveReferral()]);
    prepared = await photoIntakeAction<PreparedTicketSubmission>(attempt, "prepare", {
      ticketType: data.ticketType,
      consent: { accepted: true, method: "checkbox", version: PHOTO_UPLOAD_CONSENT_VERSION, pleadNotGuilty: options.pleadNotGuilty },
      ...(referral ? { refCode: referral.code, refAttributionToken: referral.attributionToken } : {}),
      ...(sourceAssessment ? { sourceAssessment } : { file: { contentType: descriptor?.valid ? descriptor.mimeType : "", size: file!.size } }),
    });
    if (!prepared.clientId || prepared.submissionId !== attempt.submissionId || prepared.accessToken !== attempt.accessToken) throw new IntakeSaveError("Your upload could not be prepared. Please try again.");
    options.onPrepared(prepared);
  }
  if (!sourceAssessment) {
    if (!file || !descriptor?.valid || !prepared.upload?.path || !prepared.upload.token) throw new IntakeSaveError("Your private upload could not be prepared. Please try again.");
    const { error } = await supabase.storage.from("assessment-tickets").uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, { contentType: descriptor.mimeType, upsert: true });
    if (error) throw new IntakeSaveError("Your ticket upload did not finish. Your photo and consent are still here; please submit again.");
  }
  const { data: consent, error } = await supabase.functions.invoke("generate-consent-form", { body: attempt });
  if (error || !consent?.success || !consent.consentFormPath) {
    const detail = await functionErrorDetails(error, consent?.error || "Your consent could not be saved. Please submit again.");
    throw new IntakeSaveError(detail.message, detail.code);
  }
  return { ...attempt, clientId: prepared.clientId, consentFormPath: consent.consentFormPath };
}
