import { useCallback, useEffect, useRef, useState } from "react";
import {
  createIntakeDraftPendingRotation,
  forgetAllIntakeDraftAccess,
  forgetIntakeDraft,
  forgetPendingIntakeDraftRotation,
  hydrateIntakeDraftData,
  intakeDraftSaveWasApplied,
  invokeIntakeDraft,
  isIntakeDraftAccessToken,
  isIntakeDraftCapability,
  readStoredIntakeDraft,
  readPendingIntakeDraftRotation,
  rememberIntakeDraft,
  rememberPendingIntakeDraftRotation,
  resumeTokenFromHash,
  resumeUrl,
  serializeIntakeDraftData,
  stripResumeTokenFromUrl,
  uploadIntakeTicket,
  type IntakeDraftCapability,
  type IntakeDraftPendingRotation,
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
  const [deliveryRetrying, setDeliveryRetrying] = useState(false);
  const [discardingPendingUpload, setDiscardingPendingUpload] = useState(false);
  const [error, setError] = useState("");
  const capabilityRef = useRef<IntakeDraftCapability | null>(null);
  const pendingRotationRef = useRef<IntakeDraftPendingRotation | null>(null);
  const revisionRef = useRef(0);
  const restoreRef = useRef(onRestore);
  const saveQueue = useRef<Promise<IntakeDraftRecord | null>>(Promise.resolve(null));
  restoreRef.current = onRestore;

  const applyRecord = useCallback((next: IntakeDraftRecord, accessToken?: string) => {
    // A contact correction after a delivery attempt rotates the bearer
    // capability. Prefer that newly issued token over the prior local copy.
    const token = next.accessToken ?? accessToken ?? capabilityRef.current?.accessToken;
    if (!token || !isIntakeDraftAccessToken(token)) throw new Error("The secure resume token is invalid.");
    const nextCapability = { draftId: next.draftId, accessToken: token, expiresAt: next.expiresAt };
    if (!isIntakeDraftCapability(nextCapability)) throw new Error("The secure resume capability is invalid or expired.");
    let storageFailed = false;
    try {
      rememberIntakeDraft(nextCapability);
    } catch {
      storageFailed = true;
    }
    capabilityRef.current = nextCapability;
    revisionRef.current = next.revision;
    setCapability(nextCapability);
    setRecord(next);
    if (storageFailed) {
      setError("This browser could not remember your secure return access. Your intake remains saved in this tab; copy the resume link now before closing it.");
    }
    return { capability: nextCapability, storageFailed };
  }, []);

  const clearPendingRotation = useCallback(() => {
    pendingRotationRef.current = null;
    forgetPendingIntakeDraftRotation();
  }, []);

  const retainRotationCandidate = useCallback((
    activeCapability: IntakeDraftCapability,
    revision: number,
  ) => {
    const retained = pendingRotationRef.current;
    if (
      retained && retained.draftId === activeCapability.draftId &&
      retained.oldAccessToken === activeCapability.accessToken &&
      retained.revision === revision
    ) return retained;

    const pending = createIntakeDraftPendingRotation(
      activeCapability,
      revision,
    );
    pendingRotationRef.current = pending;
    try {
      rememberPendingIntakeDraftRotation(pending);
    } catch {
      setError("This browser could not remember your secure return access. Your intake remains saved in this tab; copy the resume link now before closing it.");
    }
    return pending;
  }, []);

  const resolvePendingRotation = useCallback(async (
    pending: IntakeDraftPendingRotation,
  ) => {
    let lastFailure: unknown = new Error("The saved intake could not be recovered.");
    for (
      const accessToken of [
        pending.oldAccessToken,
        pending.candidateAccessToken,
      ]
    ) {
      try {
        const restored = await invokeIntakeDraft({
          action: "read",
          draftId: pending.draftId,
          accessToken,
        });
        const applied = applyRecord(restored, accessToken);
        if (!applied.storageFailed) {
          clearPendingRotation();
          setError("");
        }
        return restored;
      } catch (failure) {
        lastFailure = failure;
      }
    }
    throw lastFailure;
  }, [applyRecord, clearPendingRotation]);

  const saveWithRotation = useCallback(async (
    activeCapability: IntakeDraftCapability,
    draftData: Record<string, unknown>,
    currentStep: number,
    completedStep: number,
  ) => {
    const pending = retainRotationCandidate(
      activeCapability,
      revisionRef.current,
    );
    const request = {
      action: "save",
      draftId: pending.draftId,
      accessToken: pending.oldAccessToken,
      replacementAccessToken: pending.candidateAccessToken,
      revision: pending.revision,
      currentStep,
      completedStep,
      draftData,
    };
    try {
      const saved = await invokeIntakeDraft(request);
      const selectedToken = saved.capabilityRotated
        ? pending.candidateAccessToken
        : pending.oldAccessToken;
      const applied = applyRecord(saved, selectedToken);
      if (!applied.storageFailed) {
        clearPendingRotation();
        setError("");
      }
      return saved;
    } catch (failure) {
      let recovered: IntakeDraftRecord;
      try {
        recovered = await resolvePendingRotation(pending);
      } catch {
        throw failure;
      }
      if (
        intakeDraftSaveWasApplied(recovered, {
          revision: pending.revision,
          currentStep,
          completedStep,
          draftData,
        })
      ) return recovered;
      throw failure;
    }
  }, [
    applyRecord,
    clearPendingRotation,
    resolvePendingRotation,
    retainRotationCandidate,
  ]);

  const discardPendingUpload = useCallback(async () => {
    const activeCapability = capabilityRef.current;
    if (!activeCapability) throw new Error("The secure intake session was lost.");
    setDiscardingPendingUpload(true);
    setError("");
    try {
      const restored = await invokeIntakeDraft({
        action: "discard_pending_upload",
        draftId: activeCapability.draftId,
        accessToken: activeCapability.accessToken,
        revision: revisionRef.current,
      });
      applyRecord(restored);
      setStatus("saved");
      return restored;
    } catch (failure) {
      const message = failure instanceof Error
        ? failure.message
        : "The unfinished replacement upload could not be discarded.";
      setError(message);
      setStatus("error");
      throw failure;
    } finally {
      setDiscardingPendingUpload(false);
    }
  }, [applyRecord]);

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
      let pending = resumeToken ? null : readPendingIntakeDraftRotation();
      if (
        pending && stored && (
          pending.draftId !== stored.draftId ||
          ![
            pending.oldAccessToken,
            pending.candidateAccessToken,
          ].includes(stored.accessToken)
        )
      ) {
        forgetPendingIntakeDraftRotation();
        pending = null;
      }
      pendingRotationRef.current = pending;
      const attempts = resumeToken
        ? [{ accessToken: resumeToken, draftId: undefined }]
        : pending
        ? [
          { accessToken: pending.oldAccessToken, draftId: pending.draftId },
          {
            accessToken: pending.candidateAccessToken,
            draftId: pending.draftId,
          },
        ]
        : stored
        ? [{ accessToken: stored.accessToken, draftId: stored.draftId }]
        : [];
      if (!attempts.length) {
        if (active) setStatus("idle");
        return;
      }
      try {
        let restored: IntakeDraftRecord | null = null;
        let resolvedAccessToken = "";
        let lastFailure: unknown = new Error(
          "The saved intake link is no longer available.",
        );
        for (const attempt of attempts) {
          try {
            restored = await invokeIntakeDraft({
              action: "read",
              accessToken: attempt.accessToken,
              ...(attempt.draftId ? { draftId: attempt.draftId } : {}),
            });
            resolvedAccessToken = attempt.accessToken;
            break;
          } catch (failure) {
            lastFailure = failure;
          }
        }
        if (!restored) throw lastFailure;
        if (!active) return;
        if (restored.hasPendingTicketUpload) {
          // A browser close or failed upload must not leave an invisible
          // replacement blocking checkout. Restore the last confirmed ticket.
          try {
            restored = await invokeIntakeDraft({
              action: "discard_pending_upload",
              draftId: restored.draftId,
              accessToken: resolvedAccessToken,
              revision: restored.revision,
            });
          } catch {
            // Keep the capability and expose a manual recovery action below.
          }
          if (!active) return;
        }
        const applied = applyRecord(restored, resolvedAccessToken);
        if (pending && !applied.storageFailed) clearPendingRotation();
        restoreRef.current(restored, {
          ...hydrateIntakeDraftData(restored.draftData || {}),
          email: restored.contact?.email || "",
          phone: restored.contact?.phone || "",
          albertaConfirmed: restored.albertaConfirmed === true,
          contactPermission: restored.contactPermission === true,
        });
        if (restored.hasPendingTicketUpload) {
          setError("A replacement ticket upload is unfinished. Keep your last confirmed ticket before continuing.");
          setStatus("error");
        } else {
          setStatus("saved");
        }
      } catch (failure) {
        if (!active) return;
        if (!pending) {
          forgetIntakeDraft();
          capabilityRef.current = null;
          setCapability(null);
          setRecord(null);
        }
        setError(failure instanceof Error ? failure.message : "The saved intake link is no longer available.");
        setStatus("error");
      }
    };
    void initialize();
    return () => { active = false; };
  }, [applyRecord, clearPendingRotation]);

  const createOrUpload = useCallback(async (file: File, formData: Record<string, unknown>) => {
    const descriptor = validateTicketCaptureFile(file);
    if ("error" in descriptor) throw new Error(descriptor.error);
    setStatus("saving");
    setError("");
    let preparedReplacement = Boolean(record?.hasPendingTicketUpload);
    try {
      let created: IntakeDraftRecord;
      const current = capabilityRef.current;
      if (current) {
        const synchronized = await saveWithRotation(
          current,
          serializeIntakeDraftData(formData),
          1,
          0,
        );
        const synchronizedCapability = capabilityRef.current;
        if (!synchronizedCapability) throw new Error("The secure intake session was lost.");
        created = await invokeIntakeDraft({
          action: "prepare_upload",
          draftId: synchronizedCapability.draftId,
          accessToken: synchronizedCapability.accessToken,
          revision: revisionRef.current,
          file: { contentType: descriptor.mimeType, size: file.size },
        });
        applyRecord(created);
        preparedReplacement = created.hasPendingTicketUpload;
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
      if (preparedReplacement && capabilityRef.current) {
        try {
          const restored = await invokeIntakeDraft({
            action: "discard_pending_upload",
            draftId: capabilityRef.current.draftId,
            accessToken: capabilityRef.current.accessToken,
            revision: revisionRef.current,
          });
          applyRecord(restored);
        } catch {
          // Keep the pending state visible so checkout remains blocked and the
          // customer can explicitly recover the last confirmed ticket.
        }
      }
      const message = failure instanceof Error ? failure.message : "Your intake could not be saved.";
      setError(message);
      setStatus("error");
      throw failure;
    }
  }, [applyRecord, preferredLocale, record?.hasPendingTicketUpload, saveWithRotation]);

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
          const saved = await saveWithRotation(
            activeCapability,
            snapshot,
            currentStep,
            completedStep,
          );
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
  }, [saveWithRotation]);

  const getResumeUrl = useCallback(() => {
    const activeCapability = capabilityRef.current;
    return activeCapability ? resumeUrl(activeCapability, window.location) : null;
  }, []);

  const retryDelivery = useCallback(async () => {
    const activeCapability = capabilityRef.current;
    if (!activeCapability) throw new Error("The secure intake session was lost.");
    setDeliveryRetrying(true);
    setError("");
    try {
      const delivered = await invokeIntakeDraft({
        action: "retry_delivery",
        draftId: activeCapability.draftId,
        accessToken: activeCapability.accessToken,
      });
      applyRecord(delivered);
      return delivered;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "The secure resume link could not be sent.";
      setError(message);
      throw failure;
    } finally {
      setDeliveryRetrying(false);
    }
  }, [applyRecord]);

  const startNewIntake = useCallback(() => {
    // A converted checkout can remain readable for support/recovery, but it
    // must never trap this browser in that immutable intake. Clear both the
    // active bearer and any retained rotation candidate before resetting UI.
    forgetAllIntakeDraftAccess();
    pendingRotationRef.current = null;
    capabilityRef.current = null;
    revisionRef.current = 0;
    saveQueue.current = Promise.resolve(null);
    setCapability(null);
    setRecord(null);
    setError("");
    setStatus("idle");
  }, []);

  return {
    capability,
    record,
    status,
    error,
    hasUploadedTicket: Boolean(record?.ticketUploadedAt && record.ticketDocumentPath),
    createOrUpload,
    save,
    retryDelivery,
    deliveryRetrying,
    discardPendingUpload,
    discardingPendingUpload,
    getResumeUrl,
    startNewIntake,
  };
}
