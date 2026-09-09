import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';
import useSafeHead from '@/hooks/useSafeHead';
import { CANONICAL_OFFER_PRICING, PHOTO_RADAR, RAPID_RESOLUTION } from '@/config/offers';

const questions = [
  {
    question: 'Can I fight an Alberta traffic ticket online?',
    answer: 'For supported tickets, Alberta’s Traffic Tickets Digital Service offers a not-guilty plea, a trial-date request and prosecutor review. Check the choices available for your ticket. An online request does not mean a required appearance has been cancelled.',
  },
  {
    question: 'How long do I have to dispute a ticket?',
    answer: 'Use the response date and instructions printed on your ticket or court notice. There is no single deadline that this guide can safely substitute for your document. If a date has passed or is unclear, contact the court office identified on the notice promptly.',
  },
  {
    question: 'Is it worth fighting a traffic ticket in Alberta?',
    answer: 'Compare the evidence, possible consequences, time involved and any service fee. A fine reduction and a change to the offence are different outcomes; clarify exactly what a proposed resolution changes before deciding. Disputing a ticket does not guarantee a better outcome.',
  },
  {
    question: 'What does a ticket administration agent do?',
    answer: 'An authorized agent can help with permitted ticket steps, records, disclosure requests, follow-ups and communications. Ask which tasks are included and which decisions remain yours. Fabsy handles eligible pre-trial matters and obtains the client’s direction on any available resolution; trial representation is separate.',
  },
] as const;

const AlbertaTickets101: React.FC = () => {
  const url = 'https://fabsy.ca/hubs/alberta-tickets-101';
  useSafeHead({
    title: 'How to Fight a Traffic Ticket in Alberta | Fabsy',
    description: 'How to dispute an Alberta traffic ticket: check your deadline, use TTDS, request disclosure and compare prosecutor review, trial and ticket-agent support.',
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
    name: 'How to fight a traffic ticket in Alberta',
    url,
    description:
      'Alberta ticket response steps, official resources, disclosure preparation and permitted ticket administration agent support.',
    dateModified: '2026-09-09',
    publisher: { '@type': 'Organization', name: 'Fabsy Traffic Ticket Services', url: 'https://fabsy.ca' },
    citation: [
      'https://www.alberta.ca/fine-payment',
      'https://albertacourts.ca/cj/areas-of-law/traffic',
      'https://traffictickets.alberta.ca/',
    ],
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
      <article className="container mx-auto px-4 py-12 md:py-16 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">How to fight a traffic ticket in Alberta</h1>
        <p className="text-lg leading-relaxed text-foreground mb-3">
          To fight a traffic ticket in Alberta, follow its dispute instructions before the printed deadline. For supported tickets, use Alberta’s Traffic Tickets Digital Service to plead not guilty, request a trial date or request prosecutor review. Gather the available evidence, keep your confirmations and follow any remaining court instructions.
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
        <p className="mb-8 text-sm text-muted-foreground">Sources checked September 9, 2026 · By Fabsy Traffic Ticket Services · General information, not legal advice</p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Start with the right type of notice</h2>
          <p className="leading-relaxed text-foreground">
            Read the charge, issuing authority, response date and any mandatory-appearance instruction. Municipal bylaw tickets, including parking tickets, follow the instructions on that notice. Immediate Roadside Sanctions and Notices of Administrative Penalty use the SafeRoads Alberta process.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Sources: <a href="https://albertacourts.ca/cj/areas-of-law/traffic" className="underline underline-offset-4">Alberta Court of Justice: Traffic Court</a> and <a href="https://www.alberta.ca/fine-payment" className="underline underline-offset-4">Alberta ticket response options</a>.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4 text-foreground">Five steps to organize your response</h2>
          <ol className="list-decimal ml-6 space-y-4 text-foreground leading-relaxed">
            <li><strong>Record the deadline.</strong> Save a readable copy of both sides of the ticket and any later court notice. Calendar the required action and date.</li>
            <li><strong>Check the available response choices.</strong> Open the <a href="https://traffictickets.alberta.ca/" className="underline underline-offset-4">official Traffic Tickets Digital Service</a> directly. Alberta lists not-guilty pleas, trial requests and prosecutor review among its options. Follow your ticket’s instructions if it is not supported online.</li>
            <li><strong>Collect the records.</strong> Request available disclosure through the applicable process. Keep your own photos, video, timeline and correspondence together. Disclosure is the prosecution material available for reviewing the allegation.</li>
            <li><strong>Compare the next steps.</strong> Read any prosecutor response carefully. Identify the proposed offence, fine, conditions and actions required before deciding whether to accept an available resolution or continue disputing the allegation.</li>
            <li><strong>Keep confirmation and follow up.</strong> Save submission receipts and court notices. Check whether a response or appearance is still required. Do not assume that requesting disclosure or hiring an agent pauses a deadline.</li>
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">For current online options, see <a href="https://www.alberta.ca/fine-payment" className="underline underline-offset-4">Alberta’s TTDS overview</a>. Your ticket and current court instructions control.</p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Handle it yourself or use a ticket agent?</h2>
          <p className="leading-relaxed text-foreground">You can use the government’s ticket service directly. Agent support may be useful when you want help organizing documents, tracking disclosure and handling authorized pre-trial communications. Compare the work included, the fee and the time you would otherwise spend.</p>
          <p className="mt-3 leading-relaxed text-foreground">Before choosing support, ask: who will manage the file, who reviews the evidence, who approves a proposed resolution, and what happens if the matter needs a trial? For advice about your legal position, contact a lawyer.</p>
        </section>

        <section className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-2xl font-bold text-foreground">How Fabsy helps</h2>
          <p className="mt-2 text-muted-foreground">Fabsy provides ticket administration and permitted agent representation for eligible Alberta pre-trial matters. Rapid Resolution includes intake, authorization, disclosure request and review, prosecutor review, file updates and your final decision. Fabsy is not a law firm and does not provide legal advice.</p>
          <p className="mt-3 text-muted-foreground">{CANONICAL_OFFER_PRICING}</p>
          <p className="mt-3 text-muted-foreground">No withdrawal or reduction is guaranteed.</p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            <Link to={RAPID_RESOLUTION.slug} className="font-semibold text-primary underline underline-offset-4">Review Rapid Resolution</Link>
            <Link to={PHOTO_RADAR.slug} className="font-semibold text-primary underline underline-offset-4">Review Photo Radar support</Link>
          </div>
        </section>

        <section className="mb-10" aria-labelledby="ticket-questions">
          <h2 id="ticket-questions" className="text-2xl font-bold mb-5 text-foreground">Common questions about fighting Alberta tickets</h2>
          <div className="space-y-6">
            {questions.map(({ question, answer }) => (
              <div key={question}>
                <h3 className="text-xl font-semibold text-foreground">{question}</h3>
                <p className="mt-2 leading-relaxed text-foreground">{answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Official information</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://traffictickets.alberta.ca/">Alberta Traffic Tickets Service</a></li>
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://www.alberta.ca/fine-payment">Alberta fine payment information</a></li>
            <li><a className="underline decoration-dashed underline-offset-4 hover:text-primary" href="https://albertacourts.ca/cj/areas-of-law/traffic">Alberta Court of Justice: Traffic Court</a></li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3 text-foreground">Related Alberta ticket guides</h2>
          <ul className="list-disc ml-6 space-y-2 text-foreground">
            <li><Link to="/hubs/court-options-and-deadlines" className="underline underline-offset-4 hover:text-primary">Ticket response options and deadlines</Link></li>
            <li><Link to="/hubs/photo-radar-vs-officer-issued" className="underline underline-offset-4 hover:text-primary">Photo radar and officer-issued tickets compared</Link></li>
            <li><Link to="/hubs/demerits-and-insurance" className="underline underline-offset-4 hover:text-primary">Demerits and insurance questions</Link></li>
            {topCityPages.map((p) => (
              <li key={p.url}>
                <Link to={p.url} className="underline decoration-dashed underline-offset-4 hover:text-primary">
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
      <Footer />
    </main>
  );
};

export default AlbertaTickets101;
