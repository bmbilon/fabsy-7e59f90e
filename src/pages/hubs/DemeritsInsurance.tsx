import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';

const DemeritsInsurance: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/demerits-and-insurance';
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
    name: 'Demerits & Insurance — Fabsy',
    url,
    description: 'How demerit points translate into insurance risk, why preserving your abstract matters, and which outcomes avoid premium hikes.',
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
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">Demerits & Insurance</h1>
        <p className="text-muted-foreground mb-8">
          Understand how demerit points impact premiums, and which resolutions protect your insurance.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Key points</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>Demerits on your abstract are visible to insurers and often trigger multi-year surcharges.</li>
            <li>Wins that preserve your abstract (no demerits) typically avoid premium increases.</li>
            <li>Even partial reductions can meaningfully reduce risk depending on thresholds.</li>
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

export default DemeritsInsurance;
