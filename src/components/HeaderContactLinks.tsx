import { Phone } from "lucide-react";
import { FABSY_WHATSAPP_URL, WHATSAPP_ENABLED } from "@/config/whatsapp";

export default function HeaderContactLinks() {
  if (!WHATSAPP_ENABLED) return null;

  return (
    <div className="border-t border-slate-100">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 sm:flex sm:justify-end sm:gap-x-6">
        <a
          href="tel:+18257932279"
          aria-label="Call Fabsy at (825) 793-2279"
          data-funnel-action="phone"
          data-funnel-position="header"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-xs font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm"
        >
          <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap">825 79 FABSY</span>
          <span className="hidden font-normal text-slate-600 sm:inline">(825) 793-2279</span>
        </a>
        <a
          href={FABSY_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 min-w-0 items-center justify-self-end gap-1.5 rounded-sm text-xs font-semibold leading-snug text-emerald-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:text-sm"
        >
          {/* WhatsApp mark: Simple Icons (CC0). */}
          <img src="/whatsapp.svg" alt="" aria-hidden="true" width="20" height="20" className="h-5 w-5 shrink-0" />
          <span>Chat with us on WhatsApp</span>
        </a>
      </div>
    </div>
  );
}
