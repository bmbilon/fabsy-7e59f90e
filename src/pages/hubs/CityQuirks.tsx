import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';

const CityQuirks: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/city-specific-quirks';
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
    name: 'City-specific quirks — Fabsy',
    url,
    description: 'Local variations and venue nuances across Alberta cities that can affect traffic ticket outcomes and strategy.',
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
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">City-specific quirks</h1>
        <p className="text-muted-foreground mb-8">
          Cities can differ on disclosure logistics, prosecutor practices, and scheduling — here’s what to know.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Examples</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>Disclosure pickup methods and timelines vary by city.</li>
            <li>Venue capacity and docket congestion can influence adjournments.</li>
            <li>Enforcement priorities differ — e.g., school zones vs. photo radar corridors.</li>
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

export default CityQuirks;
