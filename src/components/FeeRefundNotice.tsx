import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FEE_REFUND } from "@/config/feeRefund";
import { useLocale } from "@/i18n/locale-context";
import { cn } from "@/lib/utils";

interface FeeRefundNoticeProps {
  photoRadar?: boolean;
  tone?: "light" | "dark";
  compact?: boolean;
  openTermsInNewTab?: boolean;
  className?: string;
}

/** Keep the refund trigger and upfront-payment disclosure beside the promise. */
export default function FeeRefundNotice({
  photoRadar = false,
  tone = "light",
  compact = false,
  openTermsInNewTab = false,
  className,
}: FeeRefundNoticeProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const copy = (key: Exclude<keyof typeof FEE_REFUND, "termsPath" | "refundWindowDays" | "declinedOfferText">) =>
    locale === "en" ? FEE_REFUND[key] : t(`feeRefund.${key}`, { defaultValue: FEE_REFUND[key] });
  const dark = tone === "dark";

  return (
    <aside
      className={cn(
        "rounded-xl border p-5 text-start",
        dark ? "border-emerald-300/40 bg-white/10 text-white" : "border-primary/25 bg-primary/5 text-slate-900",
        className,
      )}
      data-fee-refund-notice={photoRadar ? "photo-radar" : "ticket-representation"}
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className={cn("mt-0.5 h-6 w-6 shrink-0", dark ? "text-emerald-200" : "text-primary")} aria-hidden="true" />
        <div className="min-w-0 space-y-3">
          <h2 className={cn("font-bold leading-snug", compact ? "text-lg" : "text-xl sm:text-2xl", dark && "text-white")}>
            {copy(photoRadar ? "photoHeadline" : "headline")}
          </h2>
          <p className={cn("text-sm leading-relaxed", dark ? "text-slate-100" : "text-slate-700")}>
            {copy(photoRadar ? "photoCondition" : "condition")}
          </p>
          <p lang="en" dir="ltr" className={cn("text-sm leading-relaxed", dark ? "text-slate-100" : "text-slate-700")}>
            {locale !== "en" && <span className="font-semibold">Refund clarification (English): </span>}
            {FEE_REFUND.declinedOfferText}
          </p>
          <p className={cn("text-sm font-medium leading-relaxed", dark ? "text-slate-100" : "text-slate-700")}>
            {copy("payment")}
          </p>
          <Link
            to={FEE_REFUND.termsPath}
            target={openTermsInNewTab ? "_blank" : undefined}
            rel={openTermsInNewTab ? "noopener noreferrer" : undefined}
            className={cn("inline-flex min-h-6 items-center text-sm font-semibold underline underline-offset-4", dark ? "text-white" : "text-primary")}
          >
            {copy("details")}{locale !== "en" && <span className="ms-1" lang="en">(English)</span>}
          </Link>
        </div>
      </div>
    </aside>
  );
}
