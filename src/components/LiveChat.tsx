import { useEffect, useLayoutEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { liveChatContextAllowed, TAWK_CHAT_URL } from "@/config/live-chat";
import { setLiveChatVisible, subscribeLiveChatFailure } from "@/lib/liveChat";

/** Mounted outside Routes so public navigation does not recreate the widget. */
export default function LiveChat({ documentAllowed }: { documentAllowed?: () => boolean }) {
  const location = useLocation();
  const [failed, setFailed] = useState(false);
  const allowed = !(window as Window & { __FABSY_PRERENDER__?: boolean }).__FABSY_PRERENDER__ &&
    (documentAllowed?.() ?? true) && liveChatContextAllowed(window.location.href, document.referrer);

  useEffect(() => subscribeLiveChatFailure(setFailed), []);
  useLayoutEffect(() => {
    setLiveChatVisible(allowed);
  }, [allowed, location.pathname, location.search, location.hash]);
  useEffect(() => () => setLiveChatVisible(false), []);

  if (!allowed || !failed) return null;
  return (
    <a
      href={TAWK_CHAT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Fabsy in a new tab"
      className="fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 md:bottom-6 md:right-6"
    >
      <MessageCircle className="h-5 w-5" aria-hidden="true" />
      Chat with Fabsy
    </a>
  );
}
