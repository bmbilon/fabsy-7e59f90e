import avivaLogo from "@/assets/logos/aviva.png";
import allstateLogo from "@/assets/logos/allstate.svg";
import { useTranslation } from "react-i18next";
import cooperatorsLogo from "@/assets/logos/cooperators.png";
import desjardinsLogo from "@/assets/logos/desjardins.png";
import intactLogo from "@/assets/logos/intact.png";
import tdLogo from "@/assets/logos/td.png";
import wawanesaLogo from "@/assets/logos/wawanesa.png";

const insurers = [
  { src: intactLogo, name: "Intact Insurance", imageClassName: "h-12 w-12" },
  { src: tdLogo, name: "TD Insurance", imageClassName: "h-12 w-12" },
  { src: wawanesaLogo, name: "Wawanesa Insurance", imageClassName: "h-16 w-24" },
  { src: cooperatorsLogo, name: "Co-operators", imageClassName: "h-12 w-12" },
  { src: desjardinsLogo, name: "Desjardins Insurance", imageClassName: "h-12 w-12" },
  { src: allstateLogo, name: "Allstate Insurance", imageClassName: "h-12 w-28" },
  { src: avivaLogo, name: "Aviva Canada", imageClassName: "h-14 w-14" },
] as const;

export default function InsuranceContextSection() {
  const { t } = useTranslation();
  return (
    <section
      className="border-y border-slate-200 bg-slate-50 px-4 py-12 sm:py-14"
      aria-labelledby="insurance-context-heading"
    >
      <div className="container mx-auto max-w-6xl">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-dark">
              {t('insuranceContext.eyebrow')}
            </p>
            <h2
              id="insurance-context-heading"
              className="mt-3 max-w-xl text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl"
            >
              {t('insuranceContext.title')}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            {t('insuranceContext.description')}
          </p>
        </div>

        <ul
          className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7"
          aria-label={t('insuranceContext.listLabel')}
        >
          {insurers.map((insurer) => (
            <li
              key={insurer.name}
              className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-fab"
            >
              <img
                src={insurer.src}
                alt=""
                aria-hidden="true"
                width={128}
                height={128}
                loading="lazy"
                decoding="async"
                className={`${insurer.imageClassName} max-w-full object-contain`}
              />
              <span className="text-center text-xs font-semibold text-slate-700">
                {insurer.name}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs leading-5 text-slate-600">
          {t('insuranceContext.disclaimer')}
        </p>
      </div>
    </section>
  );
}
