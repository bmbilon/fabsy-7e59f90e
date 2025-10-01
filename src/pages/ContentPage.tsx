import React from 'react';
import { Helmet } from 'react-helmet-async';
import { generateFaqJsonLd, generateVideoJsonLd } from '@/utils/generate-json-ld';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

interface FAQ {
  q: string;
  a: string;
}

interface ContentPageData {
  meta_title: string;
  meta_description: string;
  slug: string;
  h1: string;
  hook: string;
  bullets: string[];
  what: string;
  how: string;
  next: string;
  faqs: FAQ[];
  video?: {
    youtubeUrl?: string;
    transcript?: string;
  };
}

interface ContentPageProps {
  pageData: ContentPageData;
}

/**
 * SSG-ready content page template
 * Renders hook-first structure with exact FAQ matching
 * JSON-LD injected from same source data
 */
export default function ContentPage({ pageData }: ContentPageProps) {
  const { meta_title, meta_description, h1, hook, bullets, what, how, next, faqs, video } = pageData;

  // Generate JSON-LD from EXACT same FAQ data (single source of truth)
  const faqJsonLd = generateFaqJsonLd(faqs);
  
  // Generate video JSON-LD if video data exists
  const videoJsonLd = video?.youtubeUrl ? generateVideoJsonLd({
    youtubeUrl: video.youtubeUrl,
    transcript: video.transcript,
    title: h1
  }) : null;

  return (
    <>
      <Helmet>
        <title>{meta_title}</title>
        <meta name="description" content={meta_description} />
        <script type="application/ld+json">
          {JSON.stringify(faqJsonLd)}
        </script>
        {videoJsonLd && (
          <script type="application/ld+json">
            {JSON.stringify(videoJsonLd)}
          </script>
        )}
      </Helmet>

      <div className="min-h-screen flex flex-col">
        <Header />
        
        <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
          {/* Hook: First visible text - CRITICAL for AEO */}
          <h1 className="text-4xl font-bold mb-4">{h1}</h1>
          <p className="text-xl text-muted-foreground mb-8 font-medium aeo-hook">
            {hook}
          </p>

          {/* Key Facts */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Key facts</h2>
            <ul className="space-y-2">
              {bullets.map((bullet, i) => (
                <li key={i} className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* What Section */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">What</h2>
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: what }} />
          </section>

          {/* How Section */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">How</h2>
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: how }} />
          </section>

          {/* Next Steps Section */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Next steps</h2>
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: next }} />
          </section>

          {/* FAQs - CRITICAL: Exact same text as JSON-LD */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">Frequently asked questions</h2>
            <div className="space-y-4">
              {faqs.map((faq, idx) => (
                <details key={idx} className="border rounded-lg p-4 cursor-pointer hover:bg-accent/5 transition-colors">
                  <summary className="font-semibold text-lg">
                    {faq.q}
                  </summary>
                  <p className="mt-3 text-muted-foreground">
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="bg-primary/10 rounded-lg p-8 text-center">
            <h3 className="text-2xl font-semibold mb-4">Call to action</h3>
            <a 
              href="/ticket-form" 
              className="inline-block bg-primary text-primary-foreground px-8 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
            >
              Get a free eligibility check
            </a>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
