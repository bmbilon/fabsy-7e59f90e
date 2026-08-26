import avivaLogo from "@/assets/logos/aviva.png";
import cooperatorsLogo from "@/assets/logos/cooperators.png";
import desjardinsLogo from "@/assets/logos/desjardins.png";
import intactLogo from "@/assets/logos/intact.png";
import tdLogo from "@/assets/logos/td.png";
import wawanesaLogo from "@/assets/logos/wawanesa.png";

const insurers = [
  { src: intactLogo, name: "Intact Insurance", imageClassName: "h-16 w-16" },
  { src: avivaLogo, name: "Aviva Canada", imageClassName: "h-20 w-20" },
  { src: cooperatorsLogo, name: "Co-operators", imageClassName: "h-16 w-16" },
  { src: tdLogo, name: "TD Insurance", imageClassName: "h-16 w-16" },
  { src: desjardinsLogo, name: "Desjardins Insurance", imageClassName: "h-16 w-16" },
  { src: wawanesaLogo, name: "Wawanesa Insurance", imageClassName: "h-24 w-24" },
] as const;

export default function InsuranceContextSection() {
  return (
    <section
      className="border-y border-slate-200 bg-slate-50 px-4 py-12 sm:py-14"
      aria-labelledby="insurance-context-heading"
    >
      <div className="container mx-auto max-w-6xl">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Insurance context
            </p>
            <h2
              id="insurance-context-heading"
              className="mt-3 max-w-xl text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl"
            >
              Built around your actual insurer and policy
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Insurance consequences are not one-size-fits-all. Fabsy reviews the policy information
            you provide alongside the ticket, driving record and circumstances to explain the
            likely significance and practical options.
          </p>
        </div>

        <ul
          className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          aria-label="Examples of insurance providers"
        >
          {insurers.map((insurer) => (
            <li
              key={insurer.name}
              className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-5 shadow-fab"
            >
              <img
                src={insurer.src}
                alt=""
                aria-hidden="true"
                width={128}
                height={128}
                loading="lazy"
                decoding="async"
                className={`${insurer.imageClassName} object-contain`}
              />
              <span className="text-center text-xs font-semibold text-slate-700">
                {insurer.name}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs leading-5 text-slate-600">
          Examples of insurers commonly identified in Alberta ticket assessments. Logos are
          trademarks of their respective owners and appear for identification only. Fabsy is
          independent and is not affiliated with or endorsed by the insurers shown. Insurance
          treatment varies by provider, policy, driving record and underwriting rules; no premium,
          coverage or underwriting outcome is promised.
        </p>
      </div>
    </section>
  );
}
