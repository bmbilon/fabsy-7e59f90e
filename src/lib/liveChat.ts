import { liveChatContextAllowed, TAWK_EMBED_URL } from "@/config/live-chat";

interface TawkApi {
  onLoad?: () => void;
  onBeforeLoad?: () => void;
  showWidget?: () => void;
  minimize?: () => void;
  hideWidget?: () => void;
  start?: (options: { showWidget: boolean }) => void;
  shutdown?: () => void;
  customStyle?: {
    zIndex: number;
    visibility: {
      desktop: { position: string; xOffset: number; yOffset: number };
      mobile: { position: string; xOffset: number; yOffset: number };
    };
  };
}

declare global {
  interface Window {
    Tawk_API?: TawkApi;
    Tawk_LoadStart?: Date;
  }
}

const SCRIPT_ID = "fabsy-tawk-widget";
const listeners = new Set<(failed: boolean) => void>();
let wanted = false;
let ready = false;
let paused = false;
let failed = false;
let timeout: ReturnType<typeof setTimeout> | undefined;

function canShow() {
  return wanted && liveChatContextAllowed(window.location.href, document.referrer);
}

function reportFailure(value: boolean) {
  failed = value;
  for (const listener of listeners) listener(value);
}

function applyVisibility() {
  const api = window.Tawk_API;
  if (!canShow()) {
    api?.minimize?.();
    api?.hideWidget?.();
    api?.shutdown?.();
    paused = true;
  } else if (ready) {
    if (paused) api?.start?.({ showWidget: true });
    else api?.showWidget?.();
    paused = false;
  }
}

/** One vendor instance for the app lifetime, retaining Tawk's own conversation. */
export function setLiveChatVisible(visible: boolean) {
  wanted = visible;
  if (!visible) {
    applyVisibility();
    return;
  }
  if (!canShow()) return;
  if (document.getElementById(SCRIPT_ID)) {
    applyVisibility();
    return;
  }

  const api = window.Tawk_API = window.Tawk_API || {};
  api.customStyle = {
    zIndex: 45,
    visibility: {
      // Tawk chooses desktop/mobile by device, while CallBar uses viewport width.
      // Also clear the bar in narrow desktop windows and embedded browsers.
      desktop: { position: "br", xOffset: 24, yOffset: window.innerWidth < 768 ? 120 : 24 },
      // Clears CallBar, including the iPhone home-indicator safe area.
      mobile: { position: "br", xOffset: 16, yOffset: 120 },
    },
  };
  api.onBeforeLoad = applyVisibility;
  api.onLoad = () => {
    ready = true;
    clearTimeout(timeout);
    reportFailure(false);
    applyVisibility();
  };
  window.Tawk_LoadStart = new Date();
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = TAWK_EMBED_URL;
  script.async = true;
  script.charset = "UTF-8";
  script.crossOrigin = "anonymous";
  script.referrerPolicy = "no-referrer";
  script.onerror = () => {
    clearTimeout(timeout);
    reportFailure(true);
  };
  // Also catches a blocked secondary vendor bundle, which doesn't reject the
  // initial script load. Contact remains available if the provider is blocked.
  timeout = setTimeout(() => { if (!ready) reportFailure(true); }, 15_000);
  document.head.appendChild(script);
}

export function subscribeLiveChatFailure(listener: (failed: boolean) => void) {
  listeners.add(listener);
  listener(failed);
  return () => { listeners.delete(listener); };
}
