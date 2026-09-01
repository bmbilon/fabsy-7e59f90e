import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';
import useSafeHead from '@/hooks/useSafeHead';
import { RAPID_RESOLUTION } from '@/config/offers';

const AlbertaTickets101: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/alberta-tickets-101';
  useSafeHead({
    title: 'Alberta Traffic Tickets 101 | Fabsy',
    description: 'Start with the instructions and deadline printed on your Alberta traffic ticket, then review general response options and related Fabsy pages.',
    canonical: url,
  });

  const topCityPages = [
    { url: '/content/fight-speeding-ticket-calgary', name: 'Speeding Ticket, Calgary' },
    { url: '/content/fight-distracted-ticket-edmonton', name: 'Distracted Driving, Edmonton' },
    { url: '/content/fight-red-light-ticket-red-deer', name: 'Red Light Ticket, Red Deer' },
    { url: '/content/fight-speeding-ticket-lethbridge', name: 'Speeding Ticket, Lethbridge' },
    { url: '/content/fight-speeding-ticket-medicine-hat', name: 'Speeding Ticket, Medicine Hat' },
  ];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'What to do after getting a traffic ticket in Alberta',
    url,
    description:
      'Overview of Alberta traffic tickets, common issuing methods, response instructions, and links to current official information.',
    dateModified: '2026-08-31',
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
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">What Should You Do After Getting a Traffic Ticket in Alberta?</h1>
        <p className="text-lg leading-relaxed text-foreground mb-3">
          Read the ticket, confirm the alleged offence and response deadline, preserve relevant records, and compare the available response choices before acting. The ticket and current Alberta sources control; general web information cannot replace its instructions.
        </p>
        <p className="mb-3 text-foreground">
          If the allegation is speeding, start with our{' '}
          <Link to="/content/speeding-ticket-alberta" className="underline decoration-dashed underline-offset-4 hover:text-primary">
            guide to fighting a speeding ticket in Alberta
          </Link>
          . If you are considering trial, also review{' '}
          <Link to="/blog/alberta-traffic-trial-evidence-self-represented" className="underline decoration-dashed underline-offset-4 hover:text-primary">
            what Alberta traffic-trial evidence rules can require
          </Link>
          .
        </p>
        <p className="mb-8 text-sm text-muted-foreground">Sources checked August 31, 2026 · General information, not legal advice</p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">What to know</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>A notice may be issued through automated enforcement or directly by an officer.</li>
            <li>The alleged offence and available material differ by ticket. Review the notice and any disclosure before deciding how to respond.</li>
            <li>The response deadline is printed on the ticket. Follow the stated instructions before that date.</li>
          </ul>
        </section>

        <section className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-2xl font-bold text-foreground">Unsure whether to pay or fight?</h2>
          <p className="mt-2 text-muted-foreground">Rapid Resolution handles an eligible pre-trial ticket through intake, disclosure review, prosecutor review, file updates and your final decision.</p>
          <Link to={RAPID_RESOLUTION.slug} className="mt-4 inline-flex font-semibold text-primary underline underline-offset-4">See Rapid Resolution - ${RAPID_RESOLUTION.priceCad}</Link>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Official information</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://traffictickets.alberta.ca/">Alberta Traffic Tickets Service</a></li>
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://www.alberta.ca/fine-payment">Alberta fine payment information</a></li>
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://www.alberta.ca/photo-radar-alberta">Alberta photo radar rules</a></li>
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
