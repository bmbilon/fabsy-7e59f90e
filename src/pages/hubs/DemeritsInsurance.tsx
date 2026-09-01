import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';
import useSafeHead from '@/hooks/useSafeHead';
import { PHOTO_RADAR, RAPID_RESOLUTION } from '@/config/offers';

const DemeritsInsurance: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/demerits-and-insurance';
  useSafeHead({
    title: 'Alberta Demerits and Insurance | Fabsy',
    description: 'Read a cautious overview of Alberta demerit points, driving abstracts, and questions to ask your insurer about a traffic conviction.',
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
    name: 'Do Alberta traffic tickets affect demerits and insurance?',
    url,
    description: 'A cautious overview of Alberta demerit points, driving abstracts, and questions to ask an insurer about a traffic conviction.',
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
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">Do Alberta Traffic Tickets Affect Demerits and Insurance?</h1>
        <p className="text-lg leading-relaxed text-foreground mb-3">
          Some convictions carry Alberta demerit points, while insurance treatment is a separate underwriting decision made by an insurer. The ticket type, final outcome, driving record, insurer, and renewal timing can all matter, so a demerit count alone does not answer the insurance question.
        </p>
        <p className="mb-8 text-sm text-muted-foreground">Sources checked August 31, 2026 · General information, not an insurance quote or legal advice</p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Key points</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li>Alberta assigns demerit points after convictions for specified offences.</li>
            <li>{PHOTO_RADAR.insuranceDisclaimer}</li>
            <li>Ask your insurer how a particular conviction may affect its underwriting or pricing. Fabsy does not predict insurance outcomes.</li>
          </ul>
          <p className="mt-4 text-foreground">
            See the{' '}
            <Link to="/content/speeding-ticket-alberta" className="underline decoration-dashed underline-offset-4 hover:text-primary">
              Alberta speeding-ticket guide
            </Link>{' '}
            for current speeding bands and response choices.
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-2xl font-bold text-foreground">Need a ticket-specific answer?</h2>
          <p className="mt-2 text-muted-foreground">Rapid Resolution handles an eligible pre-trial ticket through disclosure review, prosecutor review, file updates and your final decision. Insurance planning is available separately or in the bundle.</p>
          <Link to={RAPID_RESOLUTION.slug} className="mt-4 inline-flex font-semibold text-primary underline underline-offset-4">See Rapid Resolution - ${RAPID_RESOLUTION.priceCad}</Link>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Official information</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://www.alberta.ca/demerit-points">Alberta demerit point schedule</a></li>
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://www.alberta.ca/demerit-driving-suspension">Alberta demerit point suspensions</a></li>
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://www.alberta.ca/photo-radar-alberta">Alberta photo radar rules</a></li>
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
