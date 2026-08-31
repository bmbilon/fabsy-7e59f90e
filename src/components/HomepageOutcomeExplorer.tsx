import { ArrowRight, FileCheck2, FileText, Minus, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RAPID_RESOLUTION } from "@/config/offers";
import { HOMEPAGE_REFUND_COPY } from "@/content/homepageRefundCopy";

const outcomes = [
  {
    value: "reduced",
    label: "Reduced charge",
    title: "A reduced charge",
    icon: TrendingDown,
    condition: "If a supported offer is available",
    description: "We pursue a reduced charge that may lower the fine and/or demerits.",
    rows: [
      { label: "Fine", before: "Original ticket amount", after: "May be lower" },
      { label: "Demerits", before: "Associated with the charge", after: "May be fewer" },
      { label: "Resolution", before: "Options to review", after: "You approve any offer" },
    ],
  },
  {
    value: "withdrawal",
    label: "Withdrawal",
    title: "Charge withdrawn",
    icon: FileCheck2,
    condition: "If a withdrawal is available",
    description: "Withdrawal pursued where supported by the charge, evidence, and procedure.",
    rows: [
      { label: "Charge", before: "Allegation on your ticket", after: "Could be withdrawn" },
      { label: "Review", before: "Evidence to assess", after: "A request based on your case" },
      { label: "Resolution", before: "Options to review", after: "Crown response explained" },
    ],
  },
  {
    value: "original",
    label: "No reduction",
    title: "No penalty reduction",
    icon: Minus,
    condition: "After the Crown rejects Fabsy’s efforts and no reduction or withdrawal is obtained",
    description: HOMEPAGE_REFUND_COPY.refundCondition,
    rows: [
      { label: "Fine", before: "Original ticket amount", after: "May stay the same" },
      { label: "Demerits", before: "Associated with the charge", after: "May stay the same" },
      { label: "Service fee", before: "Paid upfront", after: "Refunded within 30 days of receiving the rejection" },
    ],
  },
] as const;

export default function HomepageOutcomeExplorer() {
  return (
    <section
      className="bg-slate-50 px-4 py-16 text-slate-900 sm:py-20"
      aria-labelledby="homepage-outcomes-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-dark">
            The outcome matters
          </p>
          <h2
            id="homepage-outcomes-heading"
            className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl"
          >
            What could change for you?
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-700">
            We pursue a withdrawal or a reduced charge where available. See the possibilities
            before you decide.
          </p>
          <p id="homepage-outcomes-context" className="mt-3 text-sm leading-relaxed text-slate-600">
            For eligible officer-issued tickets. Illustrations only, not a prediction.
          </p>
        </div>

        <Tabs defaultValue="reduced" className="mt-8">
          <TabsList
            className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-200/60 p-1.5 sm:max-w-xl"
            aria-label="Explore possible ticket outcomes"
            aria-describedby="homepage-outcomes-context"
          >
            {outcomes.map((outcome) => (
              <TabsTrigger
                key={outcome.value}
                value={outcome.value}
                className="min-h-12 min-w-0 whitespace-normal rounded-lg px-2 py-3 text-xs font-semibold leading-tight text-slate-700 transition-colors hover:bg-slate-300/60 focus-visible:ring-primary-dark data-[state=active]:bg-primary-dark data-[state=active]:text-white data-[state=active]:hover:bg-blue-800 sm:text-sm"
              >
                {outcome.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {outcomes.map(({ value, title, icon: Icon, condition, description, rows }) => (
            <TabsContent
              key={value}
              value={value}
              className="mt-5 rounded-2xl border border-slate-200 bg-white px-3 py-4 focus-visible:ring-primary-dark sm:px-6 sm:py-6 lg:px-8 lg:py-8"
            >
              <div className="mb-6 flex items-start gap-3 sm:gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary-dark">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold leading-relaxed text-slate-950">{condition}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table
                  className="w-full table-fixed border-separate border-spacing-0 text-left"
                  lang="en"
                  aria-describedby="homepage-outcomes-context"
                >
                  <caption className="sr-only">
                    Original ticket and possible outcome: {title}. Illustrations only, not a prediction.
                  </caption>
                  <colgroup>
                    <col className="w-[24%] sm:w-[16%]" />
                    <col className="w-[38%] sm:w-[42%]" />
                    <col className="w-[38%] sm:w-[42%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className="bg-white px-1 py-3 align-top sm:p-5">
                        <span className="sr-only">Ticket detail</span>
                      </th>
                      <th scope="col" className="bg-slate-50 px-2 py-3 align-top sm:p-5">
                        <div className="sm:flex sm:items-start sm:gap-3">
                          <FileText className="mt-1 hidden h-5 w-5 shrink-0 text-slate-500 sm:block" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold uppercase leading-snug tracking-wide text-slate-500">
                              Starting point
                            </p>
                            <h3 className="mt-2 break-words text-sm font-bold leading-snug text-slate-900 sm:text-2xl">
                              Original ticket
                            </h3>
                          </div>
                        </div>
                      </th>
                      <th scope="col" className="bg-slate-950 px-2 py-3 align-top sm:p-5">
                        <div className="sm:flex sm:items-start sm:gap-3">
                          <Icon className="mt-1 hidden h-5 w-5 shrink-0 text-blue-300 sm:block" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold uppercase leading-snug tracking-wide text-blue-200">
                              Possible outcome
                            </p>
                            <h3 className="mt-2 break-words text-sm font-bold leading-snug text-white sm:text-2xl">
                              {title}
                            </h3>
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label}>
                        <th
                          scope="row"
                          className="hyphens-auto border-t border-slate-200 bg-white px-1 py-3 align-top text-xs font-medium leading-relaxed text-slate-500 [overflow-wrap:anywhere] sm:p-5"
                        >
                          {row.label}
                        </th>
                        <td className="break-words border-t border-slate-200 bg-slate-50 px-2 py-3 align-top text-sm font-semibold leading-relaxed text-slate-700 sm:p-5 sm:text-base">
                          {row.before}
                        </td>
                        <td className="break-words border-t border-white/15 bg-slate-950 px-2 py-3 align-top text-sm font-semibold leading-relaxed text-white sm:p-5 sm:text-base">
                          {row.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <div className="max-w-2xl">
            <h3 className="text-xl font-bold text-slate-950">We Negotiate. You Decide.</h3>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-800">
              Fabsy explains the Crown response. You approve any available resolution before
              it is accepted.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              {HOMEPAGE_REFUND_COPY.declinedOfferDisclaimer}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {HOMEPAGE_REFUND_COPY.outcomeQualification}{" "}
              <a href="#money-back-guarantee" className="font-semibold text-primary-dark underline underline-offset-4">
                Read the money-back policy.
              </a>
            </p>
          </div>
          <Link
            to={RAPID_RESOLUTION.slug}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary-dark px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-slate-900 hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark focus-visible:ring-offset-2 sm:self-start"
          >
            <span>See how Rapid Resolution works</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
