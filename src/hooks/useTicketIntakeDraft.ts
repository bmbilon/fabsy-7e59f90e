import { useCallback, useEffect, useRef, useState } from "react";
import {
  forgetIntakeDraft,
  hydrateIntakeDraftData,
  invokeIntakeDraft,
  isIntakeDraftAccessToken,
  readStoredIntakeDraft,
  rememberIntakeDraft,
  resumeTokenFromHash,
  resumeUrl,
  serializeIntakeDraftData,
  stripResumeTokenFromUrl,
  uploadIntakeTicket,
  type IntakeDraftCapability,
  type IntakeDraftRecord,
  type IntakeDraftStatus,
} from "@/lib/ticket/intakeDraft";
import { validateTicketCaptureFile } from "@/lib/ticket/ticketCapture";

type RestoreDraft = (record: IntakeDraftRecord, values: Record<string, unknown>) => void;

export function useTicketIntakeDraft({ preferredLocale, onRestore }: {
  preferredLocale: string;
  onRestore: RestoreDraft;
}) {
  const [capability, setCapability] = useState<IntakeDraftCapability | null>(null);
  const [record, setRecord] = useState<IntakeDraftRecord | null>(null);
  const [status, setStatus] = useState<IntakeDraftStatus>("loading");
  const [error, setError] = useState("");
  const capabilityRef = useRef<IntakeDraftCapability | null>(null);
  const revisionRef = useRef(0);
  const restoreRef = useRef(onRestore);
  const saveQueue = useRef<Promise<IntakeDraftRecord | null>>(Promise.resolve(null));
  restoreRef.current = onRestore;

  const applyRecord = useCallback((next: IntakeDraftRecord, accessToken?: string) => {
    const token = accessToken ?? capabilityRef.current?.accessToken;
    if (!token || !isIntakeDraftAccessToken(token)) throw new Error("The secure resume token is invalid.");
    const nextCapability = { draftId: next.draftId, accessToken: token, expiresAt: next.expiresAt };
    rememberIntakeDraft(nextCapability);
    capabilityRef.current = nextCapability;
    revisionRef.current = next.revision;
    setCapability(nextCapability);
    setRecord(next);
    return nextCapability;
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const hadResumeParameter = new URLSearchParams(window.location.hash.replace(/^#/, "")).has("resume");
      const resumeToken = resumeTokenFromHash(window.location.hash);
      if (hadResumeParameter) {
        // A fragment is not included in HTTP requests or referrers. Remove it
        // immediately after reading so it cannot be copied accidentally.
        window.history.replaceState(window.history.state, "", stripResumeTokenFromUrl(window.location));
      }
      if (hadResumeParameter && !resumeToken) {
        setError("The secure resume link is invalid.");
        setStatus("error");
        return;
      }
      const stored = resumeToken ? null : readStoredIntakeDraft();
      const accessToken = resumeToken ?? stored?.accessToken;
      if (!accessToken) {
        if (active) setStatus("idle");
        return;
      }
      try {
        const restored = await invokeIntakeDraft({
          action: "read",
          accessToken,
          ...(stored?.draftId ? { draftId: stored.draftId } : {}),
        });
        if (!active) return;
        applyRecord(restored, accessToken);
        restoreRef.current(restored, {
          ...hydrateIntakeDraftData(restored.draftData || {}),
          email: restored.contact?.email || "",
          phone: restored.contact?.phone || "",
          albertaConfirmed: restored.albertaConfirmed === true,
          contactPermission: restored.contactPermission === true,
        });
        setStatus("saved");
      } catch (failure) {
        if (!active) return;
        forgetIntakeDraft();
        capabilityRef.current = null;
        setCapability(null);
        setRecord(null);
        setError(failure instanceof Error ? failure.message : "The saved intake link is no longer available.");
        setStatus("error");
      }
    };
    void initialize();
    return () => { active = false; };
  }, [applyRecord]);

  const createOrUpload = useCallback(async (file: File, formData: Record<string, unknown>) => {
    const descriptor = validateTicketCaptureFile(file);
    if ("error" in descriptor) throw new Error(descriptor.error);
    setStatus("saving");
    setError("");
    try {
      let created: IntakeDraftRecord;
      const current = capabilityRef.current;
      if (current) {
        const synchronized = await invokeIntakeDraft({
          action: "save",
          draftId: current.draftId,
          accessToken: current.accessToken,
          revision: revisionRef.current,
          currentStep: 1,
          completedStep: 0,
          draftData: serializeIntakeDraftData(formData),
        });
        applyRecord(synchronized);
        created = await invokeIntakeDraft({
          action: "prepare_upload",
          draftId: current.draftId,
          accessToken: current.accessToken,
          revision: revisionRef.current,
          file: { contentType: descriptor.mimeType, size: file.size },
        });
        applyRecord(created);
      } else {
        created = await invokeIntakeDraft({
          action: "create",
          contact: { email: String(formData.email || ""), phone: String(formData.phone || "") },
          albertaConfirmed: formData.albertaConfirmed === true,
          contactPermission: formData.contactPermission === true,
          preferredLocale,
          currentStep: 1,
          completedStep: 0,
          draftData: serializeIntakeDraftData(formData),
          file: { contentType: descriptor.mimeType, size: file.size },
        });
        if (!created.accessToken) throw new Error("The secure resume token was not returned.");
        applyRecord(created, created.accessToken);
      }
      if (!created.upload) throw new Error("The private ticket upload could not be prepared.");
      await uploadIntakeTicket(created.upload, file);
      const activeCapability = capabilityRef.current;
      if (!activeCapability) throw new Error("The secure intake session was lost.");
      const confirmed = await invokeIntakeDraft({
        action: "confirm_upload",
        draftId: activeCapability.draftId,
        accessToken: activeCapability.accessToken,
        revision: revisionRef.current,
      });
      applyRecord(confirmed);
      setStatus("saved");
      return confirmed;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Your intake could not be saved.";
      setError(message);
      setStatus("error");
      throw failure;
    }
  }, [applyRecord, preferredLocale]);

  const save = useCallback((formData: Record<string, unknown>, currentStep: number, completedStep: number) => {
    const snapshot = serializeIntakeDraftData(formData);
    const operation = saveQueue.current
      .catch(() => null)
      .then(async () => {
        const activeCapability = capabilityRef.current;
        if (!activeCapability) return null;
        setStatus("saving");
        setError("");
        try {
          const saved = await invokeIntakeDraft({
            action: "save",
            draftId: activeCapability.draftId,
            accessToken: activeCapability.accessToken,
            revision: revisionRef.current,
            currentStep,
            completedStep,
            draftData: snapshot,
          });
          applyRecord(saved);
          setStatus("saved");
          return saved;
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : "Your latest changes could not be saved.";
          setError(message);
          setStatus("error");
          throw failure;
        }
      });
    saveQueue.current = operation;
    return operation;
  }, [applyRecord]);

  const getResumeUrl = useCallback(() => {
    const activeCapability = capabilityRef.current;
    return activeCapability ? resumeUrl(activeCapability, window.location) : null;
  }, []);

  return {
    capability,
    record,
    status,
    error,
    hasUploadedTicket: Boolean(record?.ticketUploadedAt && record.ticketDocumentPath),
    createOrUpload,
    save,
    getResumeUrl,
  };
}
