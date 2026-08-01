import React, { useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import useSafeHead from '@/hooks/useSafeHead';

type Gtag = (...args: unknown[]) => void;

interface AnalyticsWindow extends Window {
  gtag?: Gtag;
}

interface CheckoutLineItem {
  description?: string;
  quantity?: number;
  amount_total?: number;
  currency?: string;
}

interface CheckoutSession {
  amount_total?: number;
  currency?: string;
  id?: string;
  payment_status?: string;
  total_details?: {
    amount_tax?: number;
  };
  line_items?: CheckoutLineItem[];
}

const acquisitionKeys = [
  'gclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

const ThankYou: React.FC = () => {
  const url = 'https://fabsy.ca/thank-you';
  useSafeHead({
    title: 'Submission Received | Fabsy',
    description: 'Fabsy received your submission and will follow up with the next steps.',
    robots: 'noindex, nofollow',
  });
  const published = new Date().toISOString().split('T')[0];

  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Thank You, Fabsy Traffic Ticket Services',
    url,
    description:
      'Thank you for contacting Fabsy Traffic Ticket Services. We received your submission and will follow up with the next steps.',
    datePublished: published,
    dateModified: published,
  } as const;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const gtag = (window as AnalyticsWindow).gtag;

    // Always record a generate_lead for GA4 (you can mark as conversion in GA)
    if (typeof gtag === 'function') {
      try {
        gtag('event', 'generate_lead', { page_path: '/thank-you' });
      } catch {
        // Analytics failures must not interrupt the confirmation page.
      }
    }

    // If Stripe session exists, fetch details and fire purchase
    (async () => {
      if (sessionId) {
        try {
          const { data, error } = await supabase.functions.invoke<CheckoutSession>('get-checkout-session', {
            body: { sessionId },
          });
          if (error) throw error;
          if (data?.payment_status !== 'paid' || typeof gtag !== 'function') return;
          const value = (data?.amount_total ?? 0) / 100;
          const currency = (data?.currency || 'cad').toUpperCase();
          const transaction_id = data?.id || sessionId;

          // Attach stored acquisition parameters if present
          let acq: Record<string, string> = {};
          try {
            acq = JSON.parse(localStorage.getItem('fabsy_marketing') || '{}') as Record<string, string>;
          } catch {
            // Missing or malformed attribution data is non-blocking.
          }

          // GA4 purchase event
          gtag('event', 'purchase', {
            transaction_id,
            value,
            currency,
            tax: (data?.total_details?.amount_tax ?? 0) / 100,
            items: (data?.line_items || []).map((li) => ({
              item_name: li.description,
              quantity: li.quantity,
              price: (li.amount_total ?? 0) / 100,
              currency: (li.currency || currency).toUpperCase(),
            })),
            ...(acquisitionKeys.reduce<Record<string, string>>((acc, key) => {
              if (acq[key]) acc[key] = acq[key];
              return acc;
            }, {})),
          });

          // Google Ads conversion (purchase) if configured
          const gadsId = import.meta.env.VITE_GADS_ID;
          const gadsPurchaseLabel = import.meta.env.VITE_GADS_PURCHASE_LABEL;
          if (gadsId && gadsPurchaseLabel) {
            gtag('event', 'conversion', {
              send_to: `${gadsId}/${gadsPurchaseLabel}`,
              value,
              currency,
              transaction_id,
            });
          }
        } catch {
          // Analytics failures must not interrupt the confirmation page.
        }
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <StaticJsonLd schema={webPageSchema} dataAttr="webpage" />
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Thank You!</h1>
        <p className="text-lg text-muted-foreground mb-8">
          We received your request and emailed you a confirmation. Our team will review the
          submission and follow up with the next steps.
          If it’s urgent, call us at{' '}
          <a href="tel:+18257932279" className="underline decoration-dashed underline-offset-4 text-primary hover:text-primary/80">(825) 793-2279</a>.
        </p>

        <div className="grid gap-4 sm:grid-cols-3 text-left">
          <div className="rounded-lg border p-4 bg-card">
            <h2 className="font-semibold text-foreground mb-1">What happens next</h2>
            <p className="text-sm text-muted-foreground">We’ll confirm your details, request disclosure if needed, and outline the plan.</p>
          </div>
          <div className="rounded-lg border p-4 bg-card">
            <h2 className="font-semibold text-foreground mb-1">How our pricing works</h2>
            <p className="text-sm text-muted-foreground">
              Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no
              additional charge if the fine is not reduced.
            </p>
          </div>
          <div className="rounded-lg border p-4 bg-card">
            <h2 className="font-semibold text-foreground mb-1">Historical outcomes</h2>
            <p className="text-sm text-muted-foreground">
              Fabsy reports a 95%+ historical success rate across past matters. Individual outcomes vary.
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
