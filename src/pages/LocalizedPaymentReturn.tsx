import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useLocale } from '@/i18n/locale-context';
import useSafeHead from '@/hooks/useSafeHead';
import { usePaidPurchaseTracking } from '@/hooks/usePaidPurchaseTracking';
import { paidCheckoutSummary, type CheckoutReceipt } from '@/lib/checkoutReceipt';

export default function LocalizedPaymentReturn() {
  const { t } = useTranslation();
  const { locale, href, isReleased } = useLocale();
  const location = useLocation();
  // Read React Router's retained location, never the scrubbed window URL.
  const sessionId = new URLSearchParams(location.search).get('session_id');
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const [verifying, setVerifying] = useState(false);
  usePaidPurchaseTracking(isReleased ? receipt : null, sessionId);
  useSafeHead({ title: `${t('checkout.title')} | Fabsy`, description: t('checkout.scope'), canonical: `https://fabsy.ca${href('/thank-you')}`, robots: 'noindex, nofollow' });

  useEffect(() => {
    let cancelled = false;
    setReceipt(null);
    setVerifying(false);
    if (!isReleased || !sessionId || !/^cs_(?:test_|live_)[A-Za-z0-9]+$/.test(sessionId)) return;
    setVerifying(true);
    void supabase.functions.invoke<CheckoutReceipt>('get-checkout-session', { body: { sessionId } }).then(({ data, error }) => {
      if (cancelled || error || data?.id !== sessionId || !paidCheckoutSummary(data)) return;
      setReceipt(data);
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
