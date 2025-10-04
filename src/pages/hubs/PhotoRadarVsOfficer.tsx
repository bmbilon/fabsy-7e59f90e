import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';

const PhotoRadarVsOfficer: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/photo-radar-vs-officer-issued';
  const topCityPages = [
    { url: '/content/fight-photo-radar-ticket-calgary', name: 'Photo Radar — Calgary' },
    { url: '/content/fight-red-light-ticket-edmonton', name: 'Red Light Ticket — Edmonton' },
    { url: '/content/fight-speeding-ticket-red-deer', name: 'Speeding — Red Deer' },
    { url: '/content/fight-speeding-ticket-lethbridge', name: 'Speeding — Lethbridge' },
    { url: '/content/fight-speeding-ticket-medicine-hat', name: 'Speeding — Medicine Hat' },
  ];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Photo-Radar vs Officer-Issued — Fabsy',
    url,
    description: 'Key differences between camera-based and officer-issued tickets: evidence, disclosure, defenses, and outcomes.',
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
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">Photo-Radar vs Officer-Issued</h1>
        <p className="text-muted-foreground mb-8">
          Understand how photo-radar and officer-issued tickets differ in evidence, disclosure, and defense strategies.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Core differences</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>Photo radar relies on device certification and placement; officer-issued emphasizes observation and notes.</li>
            <li>Disclosure packages differ: device logs vs officer notes, calibration records, and training.</li>
            <li>Outcomes vary: photo radar has no demerits; officer-issued often triggers insurance impact unless reduced.</li>
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

export default PhotoRadarVsOfficer;
