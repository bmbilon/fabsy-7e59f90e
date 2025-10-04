import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';

const Proof: React.FC = () => {
  const url = 'https://fabsy.ca/proof';
  const published = new Date().toISOString().split('T')[0];

  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Proof & Methodology — Fabsy Traffic Services',
    url,
    description:
      'How Fabsy calculates success rates, definitions of a win, sample sizes, and our data collection/QA process. Includes anonymized aggregate datasets by offence and city.',
    datePublished: published,
    dateModified: published,
    hasPart: [
      {
        '@type': 'Dataset',
        name: 'Aggregated outcomes by offence (anonymized)',
        description:
          'Counts of cases by offence type with outcomes grouped as win/partial/other, with demerit preservation rates and fine reductions. Personally identifying information removed.',
        license: 'https://creativecommons.org/licenses/by/4.0/',
        isAccessibleForFree: true,
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
        name: 'Aggregated outcomes by city (anonymized)',
        description:
          'Counts of cases by city with outcomes grouped as win/partial/other and demerit preservation rates. Personally identifying information removed.',
        license: 'https://creativecommons.org/licenses/by/4.0/',
        isAccessibleForFree: true,
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
      <div className="container mx-auto px-4 py-12 md:py-16 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">Proof & Methodology</h1>
        <p className="text-muted-foreground mb-8">
          We publish how our success rates are calculated so you (and answer engines) can understand what our claims mean. Below are the definitions, sample sizes, time windows, and quality controls we use.
        </p>

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
            <li><span className="font-semibold">Time window:</span> rolling 12 months ending the last completed month.</li>
            <li><span className="font-semibold">Sample size:</span> all paid representation matters concluded in Alberta traffic courts within the window.</li>
            <li><span className="font-semibold">Scope:</span> photo-radar and officer-issued tickets across common offences (speeding, distracted, red light, careless), excluding criminal/charter matters.</li>
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

        <section className="mb-10" id="dataset-offence">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Aggregates (by offence)</h2>
          <p className="text-foreground mb-4">We publish anonymized counts by offence type with win/partial/other outcomes. Additional breakdowns (demerit preservation, fine reduction) are included where available.</p>
          <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground flex items-center justify-between">
            <span>Sample data will appear here as we finalize exports. For access or media inquiries, contact us.</span>
            <a className="underline decoration-dashed underline-offset-4 text-primary" href="/data/aggregates/offence.json" target="_blank" rel="noopener noreferrer">Download JSON</a>
          </div>
        </section>

        <section className="mb-10" id="dataset-city">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Aggregates (by city)</h2>
          <p className="text-foreground mb-4">We publish anonymized counts by city with win/partial/other outcome rates to account for local variation.</p>
          <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground flex items-center justify-between">
            <span>Sample data will appear here as we finalize exports. For access or media inquiries, contact us.</span>
            <a className="underline decoration-dashed underline-offset-4 text-primary" href="/data/aggregates/city.json" target="_blank" rel="noopener noreferrer">Download JSON</a>
          </div>
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
