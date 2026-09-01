import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';
import useSafeHead from '@/hooks/useSafeHead';
import { PHOTO_RADAR, RAPID_RESOLUTION } from '@/config/offers';

const PhotoRadarVsOfficer: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/photo-radar-vs-officer-issued';
  useSafeHead({
    title: 'Photo Radar and Officer Tickets | Fabsy',
    description: 'Review general differences between Alberta automated-enforcement notices and officer-issued traffic tickets, then check the notice itself.',
    canonical: url,
  });
  const topCityPages = [
    { url: '/content/fight-photo-radar-ticket-calgary', name: 'Photo Radar, Calgary' },
    { url: '/content/fight-red-light-ticket-edmonton', name: 'Red Light Ticket, Edmonton' },
    { url: '/content/fight-speeding-ticket-red-deer', name: 'Speeding, Red Deer' },
    { url: '/content/fight-speeding-ticket-lethbridge', name: 'Speeding, Lethbridge' },
    { url: '/content/fight-speeding-ticket-medicine-hat', name: 'Speeding, Medicine Hat' },
  ];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'How photo radar and officer-issued tickets differ in Alberta',
    url,
    description: 'A cautious overview of how Alberta photo radar notices and officer-issued traffic tickets differ.',
    dateModified: '2026-08-23',
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
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">How Are Photo Radar and Officer-Issued Tickets Different in Alberta?</h1>
        <p className="text-lg leading-relaxed text-foreground mb-3">
          A photo-radar notice is generally issued to the registered owner rather than identifying a driver, while an officer-issued ticket identifies the driver who was stopped. That distinction affects demerits, driving-record treatment, available evidence, and the questions worth asking before responding.
        </p>
        <p className="mb-8 text-sm text-muted-foreground">Reviewed August 23, 2026 · Check the notice and current official Alberta rules</p>

        <section className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-2xl font-bold text-foreground">Need the distinction applied to your ticket?</h2>
          <p className="mt-2 text-muted-foreground">Rapid Resolution handles secure intake, disclosure review, prosecutor review, file updates and your final decision for an eligible pre-trial matter.</p>
          <Link to={RAPID_RESOLUTION.slug} className="mt-4 inline-flex font-semibold text-primary underline underline-offset-4">See Rapid Resolution - ${RAPID_RESOLUTION.priceCad}</Link>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Core differences</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>A photo radar notice is issued to the registered owner. {PHOTO_RADAR.insuranceDisclaimer}</li>
            <li>An officer-issued ticket identifies a driver. Demerit points depend on the specific offence and outcome.</li>
            <li>The available records vary by matter. Review the ticket instructions and request available disclosure through the current process.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Official information</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://www.alberta.ca/photo-radar-alberta">Alberta photo radar rules</a></li>
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://www.alberta.ca/demerit-driving-suspension">Alberta demerit point suspensions</a></li>
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
