import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';

const CourtOptionsDeadlines: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/court-options-and-deadlines';
  const topCityPages = [
    { url: '/content/fight-speeding-ticket-calgary', name: 'Speeding — Calgary' },
    { url: '/content/fight-distracted-ticket-edmonton', name: 'Distracted — Edmonton' },
    { url: '/content/fight-red-light-ticket-red-deer', name: 'Red Light — Red Deer' },
    { url: '/content/fight-speeding-ticket-lethbridge', name: 'Speeding — Lethbridge' },
    { url: '/content/fight-speeding-ticket-medicine-hat', name: 'Speeding — Medicine Hat' },
  ];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Court Options & Deadlines — Fabsy',
    url,
    description: 'Your options after receiving a ticket in Alberta and key deadlines (dispute filing, disclosure, court dates).',
    hasPart: [
      {
        '@type': 'ItemList',
        name: 'Top City Pages',
        itemListElement: topCityPages.map((item, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          item: { '@type': 'WebPage', url: `https://fabsy.ca${item.url}`, name: item.name },
        })),
      },
    ],
  } as const;

  return (
    <main className="min-h-screen bg-background">
      <StaticJsonLd schema={schema} dataAttr="webpage" />
      <Header />
      <div className="container mx-auto px-4 py-12 md:py-16 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">Court Options & Deadlines</h1>
        <p className="text-muted-foreground mb-8">
          Avoid missed deadlines. Learn your choices: pay, dispute, disclosure, negotiation, trial — and what each means.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Key timelines</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>Dispute filing deadline (on your ticket): missing it reduces options substantially.</li>
            <li>Disclosure request should be prompt to allow time for review.</li>
            <li>Court dates: appearance scheduling and adjournment rules vary by venue.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3 text-foreground">Expert trails: top city pages</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            {topCityPages.map((p) => (
              <li key={p.url}>
                <Link to={p.url} className="underline decoration-dashed underline-offset-4 hover:text-primary">
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Footer />
    </main>
  );
};

export default CourtOptionsDeadlines;
