import { Phone } from "lucide-react";

const PHONE_DISPLAY = "(825) 793-2279";
const PHONE_HREF = "tel:+18257932279";

/**
 * Sticky tap-to-call bar shown only on mobile, fixed to the bottom of the viewport
 * so the phone number is always one tap away.
 */
const CallBar = () => {
  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 z-40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-sm border-t border-muted shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      <a href={PHONE_HREF} aria-label={`Call Fabsy at ${PHONE_DISPLAY}`} className="block">
        <button className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-button text-white font-semibold py-3 shadow-glow transition-smooth hover:opacity-90">
          <Phone className="h-5 w-5" />
          Call {PHONE_DISPLAY}
        </button>
      </a>
    </div>
  );
};

export default CallBar;
