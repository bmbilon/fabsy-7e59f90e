import { ArrowRight, BadgePercent, CarTaxiFront, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/locale-context";
import { PRO_DRIVER_PRICE_CAD, PRO_DRIVER_PROMOTION, RAPID_RESOLUTION } from "@/config/offers";

function isolatePrices(text: string) {
  return text.split(/(\$\d+(?:\.\d+)?)/g).map((part, index) =>
    index % 2 ? <bdi key={index} dir="ltr">{part}</bdi> : part,
  );
}

export default function ProDriverSection() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  return (
    <section
      className="border-b border-blue-200 bg-blue-50 px-4 py-12 sm:py-14"
      aria-labelledby="pro-driver-heading"
      data-promotion={PRO_DRIVER_PROMOTION.id}
    >
      <div className="container mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-12">
        <div>
          <div className="mb-4 flex items-center gap-3 text-primary-dark" aria-hidden="true">
            <Truck className="h-7 w-7" /><CarTaxiFront className="h-7 w-7" /><BadgePercent className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold text-primary-dark">{t('proDriver.eyebrow')}</p>
          <h2 id="pro-driver-heading" className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            {t('proDriver.title')}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">{t('proDriver.description')}</p>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-600">{t('proDriver.scope')}</p>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-100 p-5 text-[13px] shadow-sm sm:p-6">
          <p className="text-xs text-slate-600">{t('proDriver.regularPrice')} <s dir="ltr">${RAPID_RESOLUTION.priceCad} CAD</s></p>
          <p className="mt-3 text-[13px] font-semibold text-violet-900">{t('proDriver.discountedPrice')}</p>
          <p className="mt-2 text-[28px] font-bold tracking-tight text-slate-950" dir="ltr">${PRO_DRIVER_PRICE_CAD.toFixed(2)} <span className="text-sm font-medium text-slate-600">CAD + GST</span></p>
          <p className="mt-2.5 text-[13px] leading-5 text-slate-600">{isolatePrices(t('proDriver.savings'))}</p>
          <p className="mt-2.5 text-[13px] font-medium leading-5 text-slate-700">{isolatePrices(t('proDriver.bundlePrice'))}</p>
          <Button asChild size="lg" className="mt-5 h-auto min-h-11 w-full whitespace-normal bg-violet-700 py-2.5 text-center text-sm text-white hover:bg-violet-800 hover:text-white focus-visible:text-white">
            <Link to={PRO_DRIVER_PROMOTION.detailsPath}>
              {t('proDriver.cta')}<ArrowRight className="ms-2 h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </Button>
          <p className="mt-3 text-[13px] leading-5 text-slate-600">{t('proDriver.claimHint')}</p>
          {locale !== 'en' && <p className="mt-3 text-[13px] leading-5 text-slate-600">{t('proDriver.englishDetails')}</p>}
        </div>
      </div>
    </section>
  );
}
