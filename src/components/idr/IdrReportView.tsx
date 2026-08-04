import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Phone } from "lucide-react";
import type { IdrReport } from "@/lib/idr/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface IdrReportViewProps {
  report: IdrReport;
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));

const formatMoney = (cents: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export default function IdrReportView({ report }: IdrReportViewProps) {
  const estimate = report.estimatedThreeYearPremiumImpact;
  const ticketScenario = report.ticketScenario;

  return (
    <article className="space-y-8 print:space-y-5">
      <section className="rounded-2xl bg-gradient-to-br from-slate-950 to-slate-800 p-7 text-white sm:p-10">
        <Badge className="mb-4 bg-black/20 text-white">Insurance Damage Report</Badge>
        <h1 className="text-3xl font-bold sm:text-4xl">Your insurance exposure research</h1>
        <p className="mt-3 max-w-2xl text-white/80">
          Prepared from the driver abstract and ticket particulars reviewed by Fabsy as of {formatDate(report.asOfDate)}.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {report.verification.status === "verified" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            Abstract verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review status</p>
              <p className="mt-1 font-semibold capitalize">{report.verification.status.replace("-", " ")}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket match</p>
              <p className="mt-1 font-semibold capitalize">{report.verification.ticketMatch.replace("-", " ")}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Convictions checked</p>
              <p className="mt-1 font-semibold">{report.verification.checkedConvictions}</p>
            </div>
          </div>
          {report.verification.issues.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p className="font-semibold">Items to review</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {report.verification.issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            </div>
          )}
          {report.verification.blockers.length > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-950">
              <p className="font-semibold">Delivery blockers</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {report.verification.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {ticketScenario && (
        <Card className="border-violet-300 bg-violet-50/50">
          <CardHeader>
            <CardTitle>{ticketScenario.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="capitalize">
                {ticketScenario.mode} mode
              </Badge>
              <Badge variant="outline" className="capitalize">
                {ticketScenario.status.replace("-", " ")}
              </Badge>
              {ticketScenario.convictionClass && (
                <Badge variant="outline" className="capitalize">
                  {ticketScenario.convictionClass}
                </Badge>
              )}
            </div>
            {ticketScenario.assumedConvictionDate && (
              <p className="text-sm">
                {ticketScenario.status === "projected" ? "Assumed" : "Matched"} conviction date: {formatDate(ticketScenario.assumedConvictionDate)}.
              </p>
            )}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {ticketScenario.basis}
            </p>
            <p className="text-sm font-medium">
              {ticketScenario.appliedAsAdditionalConviction
                ? "Applied as one additional conviction in the projection."
                : "Not added as another conviction in the projection."}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Conviction aging timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {report.convictions.length === 0 ? (
            <p className="text-muted-foreground">No convictions were transcribed from the uploaded abstract.</p>
          ) : (
            <ol className="relative ml-3 border-l-2 border-primary/25 pl-7">
              {report.convictions.map((conviction) => (
                <li key={conviction.convictionId} className="relative pb-8 last:pb-0">
                  <span className="absolute -left-[2.15rem] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{conviction.offence}</h3>
                    <Badge variant="outline" className="capitalize">{conviction.convictionClass}</Badge>
                  </div>
                  {conviction.section && <p className="mt-1 text-sm text-muted-foreground">Section {conviction.section}</p>}
                  <p className="mt-2 text-sm">
                    Convicted {formatDate(conviction.convictionDate)}. Three-year exit date: <strong>{formatDate(conviction.threeYearExitDate)}</strong>.
                  </p>
                  {conviction.applicableExitDate !== conviction.threeYearExitDate && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      <p>Sourced applicable lookback exit: {formatDate(conviction.applicableExitDate)}.</p>
                      {conviction.applicableLookbackSource && (
                        <a
                          className="inline-flex items-center text-primary hover:underline"
                          href={conviction.applicableLookbackSource.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {conviction.applicableLookbackSource.title}
                          <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}
                  {conviction.discrepancyFlags.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-sm text-amber-700">
                      {conviction.discrepancyFlags.map((flag) => <li key={`${flag.code}-${flag.detail}`}>{flag.detail}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Estimated 3-year premium impact</CardTitle>
          </CardHeader>
          <CardContent>
            {estimate.status === "estimated" && estimate.range ? (
              <>
                <p className="text-3xl font-bold text-primary">
                  {formatMoney(estimate.range.minimumCents)} to {formatMoney(estimate.range.maximumCents)}
                </p>
                <p className="mt-2 text-sm font-medium">Estimated range, not an insurance quote</p>
              </>
            ) : (
              <p className="font-semibold">A reliable estimated range is not available from the verified inputs.</p>
            )}
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{estimate.basis}</p>
            {estimate.sources.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {estimate.sources.map((item) => (
                  <li key={`${item.url}-${item.accessedDate}`}>
                    <a className="inline-flex items-center text-primary hover:underline" href={item.url} target="_blank" rel="noreferrer">
                      {item.title} <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Public Grid benchmark</CardTitle>
          </CardHeader>
          <CardContent>
            {report.gridBenchmark.status === "calculated" && report.gridBenchmark.annualPremiumCents !== null ? (
              <p className="text-3xl font-bold text-primary">{formatMoney(report.gridBenchmark.annualPremiumCents)} annually</p>
            ) : (
              <p className="font-semibold capitalize">{report.gridBenchmark.status.replace("-", " ")}</p>
            )}
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{report.gridBenchmark.basis}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {report.gridBenchmark.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
            <a
              className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
              href={report.gridBenchmark.source.url}
              target="_blank"
              rel="noreferrer"
            >
              View the public source <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </a>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{report.carrierCallList.heading}</CardTitle>
          <p className="text-sm text-muted-foreground">{report.carrierCallList.framing}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.carrierCallList.entries.length === 0 ? (
            <p className="text-muted-foreground">No carrier met the current verified rule criteria.</p>
          ) : report.carrierCallList.entries.map((carrier) => (
            <div key={carrier.carrierId} className="rounded-lg border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{carrier.rank}. {carrier.carrierName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{carrier.reason}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {carrier.phone && (
                    <a className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium" href={`tel:${carrier.phone}`}>
                      <Phone className="mr-1.5 h-4 w-4" /> Call
                    </a>
                  )}
                  {carrier.quoteUrl && (
                    <a className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium" href={carrier.quoteUrl} target="_blank" rel="noreferrer">
                      Quote page <ExternalLink className="ml-1.5 h-4 w-4" />
                    </a>
                  )}
                  {carrier.researchSources.map((item, sourceIndex) => (
                    <a
                      key={`${item.url}-${item.accessedDate}-${sourceIndex}`}
                      className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Research source {carrier.researchSources.length > 1 ? sourceIndex + 1 : ""}
                      <ExternalLink className="ml-1.5 h-4 w-4" />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {report.renewalSchedule.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Renewal reminders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.renewalSchedule.map((renewal) => (
              <div key={renewal.renewalDate} className="rounded-lg bg-muted/40 p-4">
                <p className="font-semibold">Renewal date: {formatDate(renewal.renewalDate)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reminder dates: {renewal.reminderDates.map((item) => formatDate(item.reminderDate)).join(", ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <footer className="rounded-lg border-2 border-slate-300 bg-slate-50 p-5 text-sm leading-relaxed text-slate-700">
        <p className="font-semibold text-slate-950">Important consumer research disclaimer</p>
        <p className="mt-2">{report.disclaimer}</p>
      </footer>
    </article>
  );
}
