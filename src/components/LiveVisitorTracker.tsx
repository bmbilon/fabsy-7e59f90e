import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import {
  FABSY_FUNNEL_CONSENT_CHANGED,
  FABSY_FUNNEL_CONSENT_STORAGE_KEY,
  getFabsyFunnelConsentChoice,
} from "@/lib/fabsyFunnelConsent";
import {
  HEARTBEAT_MS,
  LIVE_STAGE_EVENT,
  SESSION_KEY,
  isBot,
  livePage,
  nextSession,
  pageStage,
  visitorSource,
  type BrowserSession,
  type VisitorStage,
} from "@/lib/live-view/core";

// Retain the session across SPA navigation when browser storage is blocked.
let memory: BrowserSession | null = null;

function subscribeConsent(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === FABSY_FUNNEL_CONSENT_STORAGE_KEY || event.key === null)
      notify();
  };
  window.addEventListener(FABSY_FUNNEL_CONSENT_CHANGED, notify);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(FABSY_FUNNEL_CONSENT_CHANGED, notify);
    window.removeEventListener("storage", storage);
  };
}
const serverConsent = () => "unknown" as const;

export default function LiveVisitorTracker() {
  const { pathname } = useLocation();
  const consent = useSyncExternalStore(
    subscribeConsent,
    getFabsyFunnelConsentChoice,
    serverConsent,
  );
  useEffect(() => {
    if (consent !== "accepted") {
      memory = null;
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        /* Privacy choices take precedence over storage. */
      }
      return;
    }
    if (
      !import.meta.env.PROD ||
      import.meta.env.VITE_LIVE_VIEW_ENABLED === "false" ||
      !["fabsy.ca", "www.fabsy.ca"].includes(window.location.hostname) ||
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl ||
      isBot(navigator.userAgent)
    )
      return;
    const page = livePage(pathname);
    if (!page) return;

    let active = true;
    let pending = false;
    let retryAfter = 0;
    let stage: VisitorStage = pageStage(page);
    const source = visitorSource(document.referrer);
    const abort = new AbortController();
    const heartbeat = async () => {
      if (
        !active ||
        pending ||
        document.visibilityState !== "visible" ||
        Date.now() < retryAfter
      )
        return;
      if (getFabsyFunnelConsentChoice() !== "accepted") {
        memory = null;
        try {
          localStorage.removeItem(SESSION_KEY);
        } catch {
          /* Expired consent stays off. */
        }
        return;
      }
      pending = true;
      try {
        let raw = memory ? JSON.stringify(memory) : null;
        try {
          raw = localStorage.getItem(SESSION_KEY) || raw;
        } catch {
          /* In-memory fallback. */
        }
        memory = nextSession(raw, Date.now(), source, () =>
          crypto.randomUUID(),
        );
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(memory));
        } catch {
          /* Tracking must never block intake. */
        }
        const response = await fetch("/api/live-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          referrerPolicy: "no-referrer",
          // Explicit fields only. Never send a URL, title, referrer, identity or form data.
          body: JSON.stringify({
            session_id: memory.id,
            page,
            stage,
            source: memory.source,
            consent: true,
          }),
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok)
          retryAfter =
            Date.now() + (response.status === 429 ? 60_000 : 5 * 60_000);
      } catch {
        retryAfter = Date.now() + 60_000;
      } finally {
        pending = false;
      }
    };
    const onStage = (event: Event) => {
      stage = pageStage(page, (event as CustomEvent<unknown>).detail);
      void heartbeat();
    };
    const onVisible = () => {
      void heartbeat();
    };
    const timer = window.setInterval(onVisible, HEARTBEAT_MS);
    window.addEventListener(LIVE_STAGE_EVENT, onStage);
    document.addEventListener("visibilitychange", onVisible);
    void heartbeat();
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
      window.removeEventListener(LIVE_STAGE_EVENT, onStage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, consent]);
  return null;
}
