import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';
import useSafeHead from '@/hooks/useSafeHead';

const CityQuirks: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/city-specific-quirks';
  useSafeHead({
    title: 'Alberta Ticket Information by City | Fabsy',
    description: 'Find related Alberta traffic ticket pages by city and confirm the court, response choices, and deadline printed on your own ticket.',
    canonical: url,
  });
  const topCityPages = [
    { url: '/content/fight-speeding-ticket-calgary', name: 'Speeding, Calgary' },
    { url: '/content/fight-distracted-ticket-edmonton', name: 'Distracted, Edmonton' },
    { url: '/content/fight-red-light-ticket-red-deer', name: 'Red Light, Red Deer' },
    { url: '/content/fight-speeding-ticket-lethbridge', name: 'Speeding, Lethbridge' },
    { url: '/content/fight-speeding-ticket-medicine-hat', name: 'Speeding, Medicine Hat' },
  ];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Alberta Traffic Ticket Information by City, Fabsy',
    url,
    description: 'Related Alberta traffic ticket information by city, with a reminder to confirm the instructions printed on each ticket.',
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
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">Alberta Traffic Ticket Information by City</h1>
        <p className="text-muted-foreground mb-8">
          Court locations, municipal enforcement programs, and filing instructions can differ.
          Confirm the information printed on your ticket and current official instructions.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">What may differ</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>The court location and response instructions printed on the ticket.</li>
            <li>Municipal automated-enforcement programs and published locations.</li>
            <li>Whether Fabsy can provide paid agent representation for the matter and court location.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3 text-foreground">Related city pages</h2>
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
