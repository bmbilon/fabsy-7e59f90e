import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { CheckCircle, Shield, BarChart3, Database, FileText, Loader2 } from 'lucide-react';
import { useProofStats } from '@/hooks/useProofStats';

const Proof: React.FC = () => {
  const url = 'https://fabsy.ca/proof';
  const stats = useProofStats();
  const published = stats.LastUpdated || new Date().toISOString().split('T')[0];

  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Proof & Methodology — Fabsy Traffic Services',
    url,
    description:
      `How Fabsy calculates success rates from ${stats.TotalTickets || 'our'} traffic ticket cases. Definitions of a win, sample sizes, and data collection/QA process. Includes anonymized aggregate datasets by offence and city.`,
    datePublished: published,
    dateModified: published,
    hasPart: [
      {
        '@type': 'Dataset',
        name: `Aggregated outcomes by offence (anonymized) - ${stats.OffenceRows || 0} offence types`,
        description:
          `Counts of cases by offence type with outcomes grouped as win/partial/other, with demerit preservation rates and fine reductions. Based on ${stats.TotalTickets || 0} cases from ${stats.WindowStart || 'rolling window'} to ${stats.WindowEnd || 'present'}. Personally identifying information removed.`,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        isAccessibleForFree: true,
        temporalCoverage: `${stats.WindowStart || ''}/${stats.WindowEnd || ''}`,
        distribution: [
          {
            '@type': 'DataDownload',
            encodingFormat: 'application/json',
            contentUrl: 'https://fabsy.ca/data/aggregates/offence.json',
          },
        ],
      },
      {
        '@type': 'Dataset',
        name: `Aggregated outcomes by city (anonymized) - ${stats.CityRows || 0} Alberta cities`,
        description:
          `Counts of cases by city with outcomes grouped as win/partial/other and demerit preservation rates. Based on ${stats.TotalTickets || 0} cases from ${stats.WindowStart || 'rolling window'} to ${stats.WindowEnd || 'present'}. Personally identifying information removed.`,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        isAccessibleForFree: true,
        temporalCoverage: `${stats.WindowStart || ''}/${stats.WindowEnd || ''}`,
        distribution: [
          {
            '@type': 'DataDownload',
            encodingFormat: 'application/json',
            contentUrl: 'https://fabsy.ca/data/aggregates/city.json',
          },
        ],
      },
    ],
  } as const;

  return (
    <main className="min-h-screen bg-background">
      <StaticJsonLd schema={webPageSchema} dataAttr="webpage" />
      <Header />
      {/* User-friendly hero */}
      <section className="bg-gradient-to-r from-sky-200 via-sky-300 to-sky-400 text-gray-900">
        <div className="container mx-auto px-4 py-12 md:py-16 max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-3">Proof & Results</h1>
          <p className="text-lg md:text-xl opacity-90">
            {stats.isLoading ? (
              "How we calculate success, what counts as a win, and how we keep data quality high — in plain English."
            ) : stats.error ? (
              "How we calculate success, what counts as a win, and how we keep data quality high — in plain English."
            ) : (
              `Based on ${stats.TotalTickets.toLocaleString()} cases across ${stats.CityRows} Alberta cities. Win rate: ${stats.WinRate}%. How we calculate success and keep data quality high.`
            )}
          </p>
          
          {stats.isLoading && (
            <div className="flex items-center gap-2 mt-4 text-sm opacity-70">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading current statistics...
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            <div className="rounded-lg bg-white/70 backdrop-blur border border-white/60 p-4">
              <div className="flex items-center gap-2 text-green-700 font-semibold"><CheckCircle className="h-4 w-4" /> Win Rate</div>
              <div className="text-sm text-gray-700 mt-1">
                {stats.isLoading ? "Loading..." : stats.error ? "N/A" : `${stats.WinRate}% successful outcomes`}
              </div>
            </div>
            <div className="rounded-lg bg-white/70 backdrop-blur border border-white/60 p-4">
              <div className="flex items-center gap-2 text-sky-800 font-semibold"><Shield className="h-4 w-4" /> Sample Size</div>
              <div className="text-sm text-gray-700 mt-1">
                {stats.isLoading ? "Loading..." : stats.error ? "Rolling 12 months" : `${stats.TotalTickets.toLocaleString()} cases (${stats.WindowStart || 'recent'} to ${stats.WindowEnd || 'present'})`}
              </div>
            </div>
            <div className="rounded-lg bg-white/70 backdrop-blur border border-white/60 p-4">
              <div className="flex items-center gap-2 text-indigo-800 font-semibold"><BarChart3 className="h-4 w-4" /> Coverage</div>
              <div className="text-sm text-gray-700 mt-1">
                {stats.isLoading ? "Loading..." : stats.error ? "Multiple jurisdictions" : `${stats.CityRows} cities, ${stats.OffenceRows} offence types`}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12 md:py-16 max-w-4xl">

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">What counts as a “win”</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li><span className="font-semibold">Demerit preserved:</span> demerits do not appear on the driver’s abstract for the disputed charge.</li>
            <li><span className="font-semibold">Material reduction:</span> significant reduction of points and/or fine that avoids an insurance-triggering threshold.</li>
            <li><span className="font-semibold">Withdrawal/dismissal:</span> the charge is withdrawn or dismissed.</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-3">Note: Administrative outcomes and disclosure-driven adjournments are not counted as wins until final resolution meets the above criteria.</p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Sample, window, and scope</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li><span className="font-semibold">Time window:</span> {stats.isLoading ? "Loading..." : stats.error ? "rolling 12 months ending the last completed month" : `${stats.WindowStart} to ${stats.WindowEnd} (rolling 12 months)`}.</li>
            <li><span className="font-semibold">Sample size:</span> {stats.isLoading ? "Loading..." : stats.error ? "all paid representation matters concluded in Alberta traffic courts" : `${stats.TotalTickets.toLocaleString()} paid representation matters concluded in Alberta traffic courts within the window`}.</li>
            <li><span className="font-semibold">Scope:</span> photo-radar and officer-issued tickets across common offences (speeding, distracted, red light, careless), excluding criminal/charter matters. Coverage includes {stats.isLoading ? "multiple" : stats.error ? "multiple" : stats.CityRows} Alberta cities.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Data collection & QA</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>Each case status is updated at key milestones (disclosure received, meetings, resolution) and finalized after court outcome.</li>
            <li>Two-person verification for outcome tagging (win/partial/other) before inclusion in aggregates.</li>
            <li>Personally identifying information is excluded from aggregates; only anonymized counts are published.</li>
          </ul>
        </section>

        {/* Human-readable aggregates description */}
        <section className="mb-10" id="aggregates">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Aggregates we publish</h2>
          <p className="text-foreground mb-4">
            We share anonymized counts by offence type ({stats.isLoading ? "loading" : stats.error ? "multiple" : stats.OffenceRows} types) and by city ({stats.isLoading ? "loading" : stats.error ? "multiple" : stats.CityRows} Alberta cities), 
            with outcomes grouped as win / partial / other. These datasets cover {stats.isLoading ? "our recent cases" : stats.error ? "our cases" : `${stats.TotalTickets.toLocaleString()} cases`} and help search engines 
            and researchers understand trends without exposing personal data.
          </p>

          {/* Collapsible developer section keeps AEO without cluttering UI */}
          <details className="rounded-md border bg-card p-4">
            <summary className="cursor-pointer list-none">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                <Database className="h-4 w-4" /> Developers & Search Engines: machine‑readable datasets
              </span>
            </summary>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center justify-between bg-background p-3 rounded border">
                <div className="flex items-center gap-2"><FileText className="h-4 w-4" /><span>Aggregates by offence (JSON)</span></div>
                <a className="underline decoration-dashed underline-offset-4 text-primary" href="/data/aggregates/offence.json" target="_blank" rel="noopener noreferrer">Open</a>
              </div>
              <div className="flex items-center justify-between bg-background p-3 rounded border">
                <div className="flex items-center gap-2"><FileText className="h-4 w-4" /><span>Aggregates by city (JSON)</span></div>
                <a className="underline decoration-dashed underline-offset-4 text-primary" href="/data/aggregates/city.json" target="_blank" rel="noopener noreferrer">Open</a>
              </div>
              <p className="text-xs text-muted-foreground">Note: We keep JSON-LD embedded on this page so answer engines can parse context without downloads.</p>
            </div>
          </details>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Disclaimers</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>Past results do not guarantee future outcomes; each matter is fact-specific and venue-dependent.</li>
            <li>Insurance impacts are estimates; actual premiums vary by insurer and driver profile.</li>
            <li>We continually improve our process; this document is updated as methodology evolves.</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-3">Last updated: {published}</p>
        </section>
      </div>
      <Footer />
    </main>
  );
};

export default Proof;
