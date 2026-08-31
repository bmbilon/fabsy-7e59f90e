import {
  createReferralCaptureController,
  latestReferralAttribution,
  readReferralDraft,
  referralCodeFromLocation,
  REFERRAL_DRAFT_STORAGE_KEY,
  ReferralCaptureError,
  writeReferralDraft,
  type ReferralAttribution,
} from "./attribution";

export const REFERRAL_ATTRIBUTION_EVENT = "fabsy:referral-attribution";
let memoryReferral: ReferralAttribution | null = null;

function sessionStorageOrNull() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readActiveReferral(): ReferralAttribution | null {
  memoryReferral = latestReferralAttribution([memoryReferral, readReferralDraft(sessionStorageOrNull())]);
  return memoryReferral;
}

function announceChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REFERRAL_ATTRIBUTION_EVENT));
}

const controller = createReferralCaptureController({
  read: readActiveReferral,
  write: referral => {
    memoryReferral = writeReferralDraft(sessionStorageOrNull(), referral);
    announceChange();
  },
  clear: () => {
    memoryReferral = null;
    try { sessionStorageOrNull()?.removeItem(REFERRAL_DRAFT_STORAGE_KEY); } catch { /* optional storage */ }
    announceChange();
  },
  request: async code => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.functions.invoke("referral-program", { body: { action: "capture", code } });
    if (error) {
      const context = "context" in error ? error.context : undefined;
      throw new ReferralCaptureError(context instanceof Response && context.status === 400 ? "invalid" : "unavailable");
    }
    return data;
  },
});

let pendingCapture: Promise<ReferralAttribution | null> | null = null;

export function captureReferralCode(code: unknown, force = false): Promise<ReferralAttribution | null> {
  const request = controller.capture(code, force);
  pendingCapture = request;
  void request.finally(() => {
    if (pendingCapture === request) pendingCapture = null;
  }).catch(() => { /* The caller shows a manual-code failure, if applicable. */ });
  return request;
}

export function clearReferralAttribution() {
  pendingCapture = null;
  controller.clear();
}

/** Give a deliberate code application a bounded chance to finish before submit. */
export async function referralForCheckout(maxWaitMs = 5000): Promise<ReferralAttribution | null> {
  const request = pendingCapture;
  if (request) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        request.catch(() => null),
        new Promise(resolve => { timer = setTimeout(resolve, maxWaitMs); }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  return readActiveReferral();
}

/** Run from the router without delaying page rendering. Captures no PII. */
export async function captureReferralFromLocation(location: { pathname: string; search: string }): Promise<ReferralAttribution | null> {
  const code = referralCodeFromLocation(location);
  if (!code) return readActiveReferral();
  try {
    return await captureReferralCode(code);
  } catch {
    // A bad or unavailable campaign link never erases a previously valid touch.
    return readActiveReferral();
  }
}
