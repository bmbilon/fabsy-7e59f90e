import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';
import useSafeHead from '@/hooks/useSafeHead';

const CourtOptionsDeadlines: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/court-options-and-deadlines';
  useSafeHead({
    title: 'Ticket Options and Deadlines | Fabsy Alberta',
    description: 'Check the response choices and deadline printed on your Alberta traffic ticket, keep the ticket, and confirm current court instructions.',
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
    name: 'Options and deadlines after an Alberta traffic ticket',
    url,
    description: 'General information about checking the choices and deadline printed on an Alberta traffic ticket and confirming current court instructions.',
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
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">What Are Your Options and Deadlines After an Alberta Traffic Ticket?</h1>
        <p className="text-lg leading-relaxed text-foreground mb-3">
          Start with the response choices, instructions, and deadline printed on the ticket. Depending on the notice and current process, the available paths may include payment, requesting a resolution where available, disputing the allegation, or obtaining permitted representation.
        </p>
        <p className="mb-8 text-sm text-muted-foreground">Reviewed August 23, 2026 · The ticket and current court instructions control</p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">What to check</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>Read the response choices and deadline printed on the ticket.</li>
            <li>Keep the ticket and any relevant photos, video, or documents.</li>
            <li>Confirm current filing, disclosure, and appearance instructions with the court or an authorized service provider.</li>
          </ul>
        </section>

        <section className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-2xl font-bold text-foreground">Unsure which path makes financial sense?</h2>
          <p className="mt-2 text-muted-foreground">Ticket Triage reviews the ticket, likely consequences, available options, and whether representation appears worth the cost.</p>
          <Link to="/traffic-ticket-assessment" className="mt-4 inline-flex font-semibold text-primary underline underline-offset-4">See Ticket Triage - $149</Link>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Official information</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://traffictickets.alberta.ca/">Alberta Traffic Tickets Service</a></li>
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://www.alberta.ca/fine-payment">Alberta fine payment information</a></li>
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

export default CourtOptionsDeadlines;
