import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useLocale } from '@/i18n/locale-context';
import useSafeHead from '@/hooks/useSafeHead';
import { readMarketingAttribution } from '@/lib/marketingAttribution';

type SessionResult = { id?: string; payment_status?: string; amount_total?: number; currency?: string; total_details?: { amount_tax?: number } };
type AnalyticsWindow = Window & { gtag?: (...args: unknown[]) => void };
const reportedTransactions = new Set<string>();

export default function LocalizedPaymentReturn() {
  const { t } = useTranslation();
  const { locale, href, isReleased } = useLocale();
  const location = useLocation();
  const sessionId = new URLSearchParams(location.search).get('session_id');
  const [receipt, setReceipt] = useState<SessionResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  useSafeHead({ title: `${t('checkout.title')} | Fabsy`, description: t('checkout.scope'), canonical: `https://fabsy.ca${href('/thank-you')}`, robots: 'noindex, nofollow' });

  useEffect(() => {
    let cancelled = false;
    setReceipt(null);
    setVerifying(false);
    if (!isReleased || !sessionId || !/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) return;
    setVerifying(true);
    void supabase.functions.invoke<SessionResult>('get-checkout-session', { body: { sessionId } }).then(({ data, error }) => {
      if (cancelled || error || data?.payment_status !== 'paid') return;
      setReceipt(data);
      const gtag = (window as AnalyticsWindow).gtag;
      const transactionId = data.id || sessionId;
      // A return URL alone is not evidence of payment or a submitted lead.
      if (gtag && typeof data.amount_total === 'number' && !reportedTransactions.has(transactionId)) {
        reportedTransactions.add(transactionId);
        const value = data.amount_total / 100;
        const currency = (data.currency || 'CAD').toUpperCase();
        try {
          gtag('event', 'purchase', { ...readMarketingAttribution(), transaction_id: transactionId, value, currency, tax: (data.total_details?.amount_tax || 0) / 100, preferred_locale: locale });
          if (import.meta.env.VITE_GADS_ID && import.meta.env.VITE_GADS_PURCHASE_LABEL) gtag('event', 'conversion', {
            send_to: `${import.meta.env.VITE_GADS_ID}/${import.meta.env.VITE_GADS_PURCHASE_LABEL}`, value, currency, transaction_id: transactionId,
          });
        } catch { /* Measurement must never block the verified receipt. */ }
      }
    }).catch(() => undefined).finally(() => { if (!cancelled) setVerifying(false); });
    return () => { cancelled = true; };
  }, [sessionId, isReleased, locale]);

  return <div className="min-h-screen bg-slate-50 text-slate-900"><Header /><main className="container mx-auto max-w-3xl space-y-6 px-4 py-16">
    <h1 className="text-3xl font-bold">{t(receipt ? 'notifications.payment.subject' : 'checkout.title')}</h1>
    <p role="status" className="text-lg leading-relaxed text-slate-600">{t(verifying ? 'common.loading' : receipt ? 'process.description' : 'checkout.paymentFailed')}</p>
    {receipt && typeof receipt.amount_total === 'number' && <p className="text-2xl font-bold">{t('checkout.total')}: <bdi>{new Intl.NumberFormat(locale, { style: 'currency', currency: (receipt.currency || 'CAD').toUpperCase() }).format(receipt.amount_total / 100)}</bdi></p>}
    <p className="text-sm leading-relaxed text-slate-600">{t('common.noOutcomePromise')} {t('common.clientDecision')}</p>
    <div className="flex flex-wrap gap-3"><Button asChild><Link to={href('/contact')}>{t('nav.contact')}</Link></Button><Button asChild variant="outline"><Link to={href('/')}>{t('common.returnHome')}</Link></Button></div>
  </main><Footer /></div>;
}
