import { liveChatContextAllowed, TAWK_EMBED_URL } from "@/config/live-chat";

interface TawkApi {
  onLoad?: () => void;
  onBeforeLoad?: () => void;
  onChatMaximized?: () => void;
  onChatMinimized?: () => void;
  onChatHidden?: () => void;
  onChatMessageAgent?: () => void;
  onChatMessageSystem?: () => void;
  showWidget?: () => void;
  maximize?: () => void;
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
export interface LiveChatState {
  expanded: boolean;
  loading: boolean;
  failed: boolean;
  unread: boolean;
}
const listeners = new Set<(state: LiveChatState) => void>();
let state: LiveChatState = { expanded: false, loading: false, failed: false, unread: false };
let wanted = false;
let ready = false;
let paused = false;
let openRequested = false;
let timeout: ReturnType<typeof setTimeout> | undefined;

function canShow() {
  return wanted && liveChatContextAllowed(window.location.href, document.referrer);
}

function updateState(update: Partial<LiveChatState>) {
  state = { ...state, ...update };
  for (const listener of listeners) listener(state);
}

function collapse() {
  openRequested = false;
  updateState({ expanded: false, loading: false });
}

function reportFailure() {
  collapse();
  updateState({ failed: true });
  window.Tawk_API?.hideWidget?.();
}

function applyVisibility() {
  const api = window.Tawk_API;
  if (!canShow()) {
    collapse();
    api?.minimize?.();
    api?.hideWidget?.();
    api?.shutdown?.();
    paused = true;
  } else if (!openRequested) {
    // Keep the provider connected, but hide its launcher and message previews.
    api?.hideWidget?.();
  } else if (ready) {
    updateState({ expanded: true, loading: false, unread: false });
    if (paused) api?.start?.({ showWidget: true });
    else api?.showWidget?.();
    paused = false;
    api?.maximize?.();
  }
}

/** Eligibility alone never loads the provider or opens its greeting. */
export function setLiveChatVisible(visible: boolean) {
  wanted = visible;
  applyVisibility();
}

/** Load one provider instance only after a click, retaining its conversation. */
export function openLiveChat() {
  if (!canShow() || state.failed) return;
  openRequested = true;
  updateState({ loading: !ready, unread: false });
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
    updateState({ failed: false, loading: false });
    applyVisibility();
  };
  api.onChatMaximized = () => {
    // A provider trigger must never reopen chat after the visitor closed it.
    if (!canShow() || !openRequested) {
      collapse();
      api.minimize?.();
      api.hideWidget?.();
      return;
    }
    updateState({ expanded: true, loading: false, unread: false });
  };
  api.onChatMinimized = () => {
    collapse();
    api.hideWidget?.();
  };
  api.onChatHidden = collapse;
  // Only a small badge is shown for replies while closed; message contents stay
  // inside the provider and never become another homepage overlay.
  const markUnread = () => {
    if (canShow() && !openRequested) updateState({ unread: true });
  };
  api.onChatMessageAgent = markUnread;
  api.onChatMessageSystem = markUnread;
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
    reportFailure();
  };
  // Also catches a blocked secondary vendor bundle, which doesn't reject the
  // initial script load. Contact remains available if the provider is blocked.
  timeout = setTimeout(() => { if (!ready) reportFailure(); }, 15_000);
  document.head.appendChild(script);
}

export function subscribeLiveChatState(listener: (state: LiveChatState) => void) {
  listeners.add(listener);
  listener(state);
  return () => { listeners.delete(listener); };
}
