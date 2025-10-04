import React, { useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Helmet } from 'react-helmet-async';

const ThankYou: React.FC = () => {
  const url = 'https://fabsy.ca/thank-you';
  const published = new Date().toISOString().split('T')[0];

  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Thank You — Fabsy Traffic Services',
    url,
    description:
      'Thank you for contacting Fabsy Traffic Services. We received your submission and will respond within 24 hours.',
    datePublished: published,
    dateModified: published,
  } as const;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isTest = params.get('test') === 'true';
    const sessionId = params.get('session_id');
    const gtag = (window as any).gtag as undefined | ((...args: any[]) => void);

    // Always record a generate_lead for GA4 (you can mark as conversion in GA)
    if (typeof gtag === 'function') {
      try {
        gtag('event', 'generate_lead', { page_path: '/thank-you', test_mode: isTest });
      } catch {}
    }

    // If Stripe session exists, fetch details and fire purchase
    (async () => {
      if (sessionId && typeof gtag === 'function') {
        try {
          const { data, error } = await supabase.functions.invoke('get-checkout-session', {
            body: { sessionId },
          });
          if (error) throw error;
          const value = (data?.amount_total ?? 0) / 100;
          const currency = (data?.currency || 'cad').toUpperCase();
          const transaction_id = data?.id || sessionId;

          // Attach stored acquisition parameters if present
          let acq: any = {};
          try {
            acq = JSON.parse(localStorage.getItem('fabsy_marketing') || '{}');
          } catch {}

          // GA4 purchase event
          gtag('event', 'purchase', {
            transaction_id,
            value,
            currency,
            tax: (data?.total_details?.amount_tax ?? 0) / 100,
            items: (data?.line_items || []).map((li: any) => ({
              item_name: li.description,
              quantity: li.quantity,
              price: (li.amount_total ?? 0) / 100,
              currency: (li.currency || currency).toUpperCase(),
            })),
            ...(['gclid','utm_source','utm_medium','utm_campaign','utm_term','utm_content'].reduce((acc: any, k) => {
              if (acq && acq[k]) acc[k] = acq[k];
              return acc;
            }, {})),
          });

          // Google Ads conversion (purchase) if configured
          const gadsId = (import.meta as any).env?.VITE_GADS_ID;
          const gadsPurchaseLabel = (import.meta as any).env?.VITE_GADS_PURCHASE_LABEL;
          if (gadsId && gadsPurchaseLabel) {
            gtag('event', 'conversion', {
              send_to: `${gadsId}/${gadsPurchaseLabel}`,
              value,
              currency,
              transaction_id,
            });
          }
        } catch (e) {
          // swallow errors in analytics path
        }
      } else if (isTest && typeof gtag === 'function') {
        // Optionally also fire Ads lead conversion for test mode if label provided
        const gadsId = (import.meta as any).env?.VITE_GADS_ID;
        const gadsLeadLabel = (import.meta as any).env?.VITE_GADS_CONVERSION_LABEL;
        if (gadsId && gadsLeadLabel) {
          try {
            gtag('event', 'conversion', { send_to: `${gadsId}/${gadsLeadLabel}` });
          } catch {}
        }
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <StaticJsonLd schema={webPageSchema} dataAttr="webpage" />
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Thank You!</h1>
        <p className="text-lg text-muted-foreground mb-8">
          We received your request and emailed you a confirmation. Our team will review and get back to you within 24 hours.
          If it’s urgent, call us at{' '}
          <a href="tel:403-669-5353" className="underline decoration-dashed underline-offset-4 text-primary hover:text-primary/80">403-669-5353</a>.
        </p>

        <div className="grid gap-4 sm:grid-cols-3 text-left">
          <div className="rounded-lg border p-4 bg-card">
            <h2 className="font-semibold text-foreground mb-1">What happens next</h2>
            <p className="text-sm text-muted-foreground">We’ll confirm your details, request disclosure if needed, and outline the plan.</p>
          </div>
          <div className="rounded-lg border p-4 bg-card">
            <h2 className="font-semibold text-foreground mb-1">Zero-risk guarantee</h2>
            <p className="text-sm text-muted-foreground">You only pay if we save you money. No win, no fee.</p>
          </div>
          <div className="rounded-lg border p-4 bg-card">
            <h2 className="font-semibold text-foreground mb-1">Track record</h2>
            <p className="text-sm text-muted-foreground">
              See our methodology and definitions behind success claims on our{' '}
              <Link to="/proof" className="underline decoration-dashed underline-offset-4 text-primary hover:text-primary/80">Proof & Methodology</Link> page.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/submit-ticket" className="inline-block">
            <span className="inline-flex items-center rounded-md bg-primary px-6 py-3 font-semibold text-white hover:opacity-90 transition">Submit another ticket</span>
          </Link>
          <Link to="/how-it-works" className="inline-block">
            <span className="inline-flex items-center rounded-md border px-6 py-3 font-semibold text-foreground hover:bg-accent/40 transition">See how it works</span>
          </Link>
          <Link to="/" className="inline-block">
            <span className="inline-flex items-center rounded-md border px-6 py-3 font-semibold text-foreground hover:bg-accent/40 transition">Return home</span>
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default ThankYou;
