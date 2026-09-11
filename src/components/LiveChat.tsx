import { useEffect, useLayoutEffect, useState } from "react";
import { LoaderCircle, MessageCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { liveChatContextAllowed, TAWK_CHAT_URL } from "@/config/live-chat";
import { openLiveChat, setLiveChatVisible, subscribeLiveChatState, type LiveChatState } from "@/lib/liveChat";

const launcherClassName = "fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-wait md:bottom-6 md:right-6";

/** Mounted outside Routes so public navigation does not recreate the widget. */
export default function LiveChat({ documentAllowed }: { documentAllowed?: () => boolean }) {
  const location = useLocation();
  const [chat, setChat] = useState<LiveChatState>({ expanded: false, loading: false, failed: false, unread: false });
  const allowed = !(window as Window & { __FABSY_PRERENDER__?: boolean }).__FABSY_PRERENDER__ &&
    (documentAllowed?.() ?? true) && liveChatContextAllowed(window.location.href, document.referrer);

  useEffect(() => subscribeLiveChatState(setChat), []);
  useLayoutEffect(() => {
    setLiveChatVisible(allowed);
  }, [allowed, location.pathname, location.search, location.hash]);
  useEffect(() => () => setLiveChatVisible(false), []);

  if (!allowed || chat.expanded) return null;
  if (chat.failed) return (
    <a
      href={TAWK_CHAT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Fabsy in a new tab"
      title="Chat with Fabsy in a new tab"
      className={launcherClassName}
    >
      <MessageCircle className="h-6 w-6" aria-hidden="true" />
    </a>
  );
  return (
    <button
      type="button"
      onClick={openLiveChat}
      disabled={chat.loading}
      aria-label={chat.loading ? "Opening chat" : chat.unread ? "Open chat with Fabsy, unread messages" : "Open chat with Fabsy"}
      aria-expanded={false}
      aria-busy={chat.loading}
      title="Chat with Fabsy"
      className={launcherClassName}
    >
      {chat.loading
        ? <LoaderCircle className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
      {chat.unread && <span className="absolute right-0 top-0 h-3 w-3 rounded-full bg-red-600 ring-2 ring-background" aria-hidden="true" />}
    </button>
  );
}
