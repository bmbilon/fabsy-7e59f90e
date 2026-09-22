// Public identifiers from Brett's Fabsy widget installation code. No API key.
export const TAWK_PROPERTY_ID = "6aa1fe19a9c2983442420e67";
export const TAWK_WIDGET_ID = "1k24ch563";
export const TAWK_EMBED_URL = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
export const TAWK_CHAT_URL = `https://tawk.to/chat/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;

const publicPaths = new Set([
  "/", "/about", "/about/comparison", "/services", "/how-it-works",
  "/testimonials", "/faq", "/founder", "/blog", "/rapid-resolution", "/photo-radar",
  "/pro-drivers", "/refer", "/insurance-damage-report", "/ai-info",
  "/privacy-policy", "/terms-of-service", "/terms-of-purchase",
]);

/** Only public pages; ticket intake, portals, payment links and unknown URLs stay out. */
export function isLiveChatPage(pathname: string): boolean {
  if (/[?%#\\\s]/.test(pathname)) return false;
  const path = pathname.replace(/\/$/, "").replace(/^\/(?:en|pa|tl|zh-hans|zh-hant|ar|es|hi)(?=\/|$)/, "") || "/";
  return publicPaths.has(path) || /^\/(?:blog|content|hubs)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);
}

export function isLiveChatUrl(href: string): boolean {
  try {
    const url = new URL(href);
    if (!isLiveChatPage(url.pathname) || url.username || url.password) return false;
    // Marketing parameters and section anchors are public. Unknown query data
    // (including email, case IDs and bearer tokens) must not reach the widget.
    for (const [key, value] of url.searchParams) {
      if (!/^(?:utm_(?:source|medium|campaign|term|content)|gclid|gbraid|wbraid|fbclid)$/.test(key) ||
          !/^[a-zA-Z0-9_.~ -]{0,512}$/.test(value)) return false;
    }
    return !url.hash || /^#[a-z][a-z0-9-]{0,80}$/.test(url.hash);
  } catch {
    return false;
  }
}

export function liveChatContextAllowed(href: string, referrer: string): boolean {
  if (!isLiveChatUrl(href)) return false;
  if (!referrer) return true;
  try {
    const previous = new URL(referrer);
    if (previous.search || previous.hash || previous.username || previous.password) return false;
    const current = new URL(href);
    return previous.origin === current.origin || /^(?:www\.)?fabsy\.ca$/.test(previous.hostname)
      ? isLiveChatPage(previous.pathname)
      : previous.pathname === "/";
  } catch {
    return false;
  }
}
