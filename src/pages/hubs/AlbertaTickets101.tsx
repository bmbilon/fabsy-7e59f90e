import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';

const AlbertaTickets101: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/alberta-tickets-101';

  const topCityPages = [
    { url: '/content/fight-speeding-ticket-calgary', name: 'Speeding Ticket — Calgary' },
    { url: '/content/fight-distracted-ticket-edmonton', name: 'Distracted Driving — Edmonton' },
    { url: '/content/fight-red-light-ticket-red-deer', name: 'Red Light Ticket — Red Deer' },
    { url: '/content/fight-speeding-ticket-lethbridge', name: 'Speeding Ticket — Lethbridge' },
    { url: '/content/fight-speeding-ticket-medicine-hat', name: 'Speeding Ticket — Medicine Hat' },
  ];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Alberta Tickets 101 — Fabsy',
    url,
    description:
      'Overview of Alberta traffic tickets, categories, process, and outcomes. Start here to understand how tickets work, what to expect, and how to protect your driving record and insurance.',
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
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">Alberta Tickets 101</h1>
        <p className="text-muted-foreground mb-8">
          A practical overview of Alberta traffic tickets: types, process, and outcomes. Use this hub to find the right path for your situation and follow expert trails into the most relevant city pages.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">What to know</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>Tickets fall into camera-based (photo radar) and officer-issued. Evidence and defenses differ.</li>
            <li>Outcomes that preserve your abstract (no demerits) typically avoid insurance hikes.</li>
            <li>Deadlines matter: filing disputes and disclosure requests promptly preserves options.</li>
          </ul>
        </section>

        <section className="mb-10">
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

export default AlbertaTickets101;
