import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';
import useSafeHead from '@/hooks/useSafeHead';

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
    name: 'Alberta Tickets 101, Fabsy',
    url,
    description:
      'Overview of Alberta traffic tickets, common issuing methods, response instructions, and links to current official information.',
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
            <li>A notice may be issued through automated enforcement or directly by an officer.</li>
            <li>The alleged offence and available material differ by ticket. Review the notice and any disclosure before deciding how to respond.</li>
            <li>The response deadline is printed on the ticket. Follow the stated instructions before that date.</li>
          </ul>
        </section>

        <section className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-2xl font-bold text-foreground">Unsure whether to pay or fight?</h2>
          <p className="mt-2 text-muted-foreground">The $149 Fabsy Ticket + Insurance Impact Assessment explains the charge, likely consequences, options and whether paying for representation appears financially sensible.</p>
          <Link to="/traffic-ticket-assessment" className="mt-4 inline-flex font-semibold text-primary underline underline-offset-4">Start with the assessment</Link>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Official information</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://www.alberta.ca/fine-payment">Alberta fine payment and traffic ticket information</a></li>
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
