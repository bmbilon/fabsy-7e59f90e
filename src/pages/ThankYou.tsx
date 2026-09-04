import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import useSafeHead from '@/hooks/useSafeHead';
import { usePaidPurchaseTracking } from '@/hooks/usePaidPurchaseTracking';
import { PHOTO_RADAR, RAPID_RESOLUTION } from '@/config/offers';
import { paidCheckoutSummary, type CheckoutReceipt } from '@/lib/checkoutReceipt';
import { forgetIntakeDraft } from '@/lib/ticket/intakeDraft';

const ThankYou: React.FC = () => {
  const [searchParams] = useSearchParams();
  // React Router retains this in memory when only the browser URL is scrubbed.
  // A later SPA navigation still supplies its own session rather than a stale one.
  const sessionId = searchParams.get('session_id');
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const [checking, setChecking] = useState(false);
  const summary = paidCheckoutSummary(receipt);
  usePaidPurchaseTracking(receipt, sessionId);
  const offer = summary?.photoRadar ? PHOTO_RADAR : RAPID_RESOLUTION;
  const url = 'https://fabsy.ca/thank-you';
  useSafeHead({
    title: 'Payment Confirmation | Fabsy',
    description: 'Check your Fabsy payment confirmation and the next steps for your ticket.',
    robots: 'noindex, nofollow',
  });
  const published = new Date().toISOString().split('T')[0];

  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Thank You, Fabsy Traffic Ticket Services',
    url,
    description:
      'Check your Fabsy payment confirmation and the next steps for your ticket.',
    datePublished: published,
    dateModified: published,
  } as const;

  useEffect(() => {
    let cancelled = false;
    setReceipt(null);
    setChecking(false);
    if (!sessionId || !/^cs_(?:test_|live_)[A-Za-z0-9]+$/.test(sessionId)) return;
    setChecking(true);
    void (async () => {
        try {
          const { data, error } = await supabase.functions.invoke<CheckoutReceipt>('get-checkout-session', {
            body: { sessionId },
          });
          if (cancelled || error || data?.id !== sessionId) return;
          const paid = paidCheckoutSummary(data);
          if (!paid) return;
          setReceipt(data);
        } catch {
          // Analytics failures must not interrupt the confirmation page.
        } finally {
          if (!cancelled) setChecking(false);
        }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (paidCheckoutSummary(receipt)) forgetIntakeDraft();
  }, [receipt]);

  return (
    <main className="min-h-screen bg-background">
      <StaticJsonLd schema={webPageSchema} dataAttr="webpage" />
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">{summary ? 'Payment confirmed' : 'Payment confirmation'}</h1>
        <p role="status" className="text-lg text-muted-foreground mb-8">
          {checking ? 'Checking your payment… ' : summary ? `Your ${summary.name} payment of $${summary.total.toFixed(2)} CAD is confirmed. Fabsy will validate your authorization and deadlines before the next step. ` : 'We could not confirm a paid order from this page. Check your Stripe receipt or contact Fabsy before paying again. '}
          If it’s urgent, call{' '}
          <a href="tel:+18257932279" className="underline decoration-dashed underline-offset-4 text-primary hover:text-primary/80">(825) 793-2279</a>.
        </p>

        {summary ? <div className="grid gap-4 sm:grid-cols-3 text-left">
          <div className="rounded-lg border p-4 bg-card">
            <h2 className="font-semibold text-foreground mb-1">What happens next</h2>
            <p className="text-sm text-muted-foreground">{summary.photoRadar ? 'After accepting the file and confirming authorization, Fabsy enters the not-guilty plea and requests disclosure. You approve any Crown deal.' : 'We confirm the intake and authorization, then request and track disclosure where available.'}</p>
          </div>
          <div className="rounded-lg border p-4 bg-card">
            <h2 className="font-semibold text-foreground mb-1">How our pricing works</h2>
            <p className="text-sm text-muted-foreground">
              ${summary.serviceValue.toFixed(2)} service fee + ${summary.tax.toFixed(2)} GST (${summary.total.toFixed(2)} total). {summary.photoRadar ? `${PHOTO_RADAR.insuranceDisclaimer} No trial. No success fee.` : 'Trial representation is separate.'} Government fines are separate.
            </p>
          </div>
          <div className="rounded-lg border p-4 bg-card">
            <h2 className="font-semibold text-foreground mb-1">Outcome standard</h2>
            <p className="text-sm text-muted-foreground">
              {offer.speedDisclaimer} No legal outcome is guaranteed. Your service-fee refund rights follow the written purchase terms for your order.
            </p>
          </div>
        </div> : null}

        {summary && !summary.photoRadar && !summary.proDiscountApplied ? <div className="mt-6 rounded-lg border bg-card p-5 text-left"><p>Alberta Class 1, 2 or 4 licence? Send a photo of your licence for 20% off. Once verified, we refund the difference.</p><Link to="/portal/pro-discount" className="mt-3 inline-block font-semibold text-primary underline">Verify your licence privately</Link></div> : null}

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to={summary?.photoRadar ? PHOTO_RADAR.intakePath : RAPID_RESOLUTION.intakePath} className="inline-block">
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
