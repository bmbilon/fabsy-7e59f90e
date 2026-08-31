import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Clock3, Mail, MessageCircle, ShieldCheck, XCircle } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import FeeRefundNotice from '@/components/FeeRefundNotice';
import InsuranceContextSection from '@/components/InsuranceContextSection';
import ProDriverSection from '@/components/ProDriverSection';
import StaticJsonLd from '@/components/StaticJsonLd';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useLocale } from '@/i18n/locale-context';
import { registry, review } from '@/i18n/config';
import { localizePath, WAVE_ONE_LOCALES } from '@/i18n/locale-policy.mjs';
import useSafeHead from '@/hooks/useSafeHead';
import { RAPID_RESOLUTION } from '@/config/offers';
import TicketFormPage from './TicketFormPage';
import LocalizedPaymentReturn from './LocalizedPaymentReturn';
import NotFound from './NotFound';

function ProcessSection() {
  const { t } = useTranslation();
  return <section className="space-y-8" aria-labelledby="localized-process-heading">
    <div className="max-w-3xl space-y-3"><h2 id="localized-process-heading" className="text-3xl font-bold">{t('process.title')}</h2><p className="leading-relaxed text-slate-600">{t('process.description')}</p></div>
    <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {['intake', 'disclosure', 'review', 'action', 'decision'].map((key, index) => <li key={key} className="rounded-xl border border-slate-200 bg-white p-6">
        <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{index + 1}</span>
        <h3 className="mb-3 text-lg font-bold">{t(`process.steps.${key}.title`)}</h3><p className="text-sm leading-relaxed text-slate-600">{t(`process.steps.${key}.body`)}</p>
      </li>)}
    </ol>
  </section>;
}

function FaqSection() {
  const { t } = useTranslation();
  const keys = ['fee', 'speed', 'deadline', 'trial', 'approval', 'outcome', 'language'];
  return <section className="mx-auto max-w-4xl space-y-6" aria-labelledby="localized-faq-heading">
    <h2 id="localized-faq-heading" className="text-3xl font-bold">{t('faq.title')}</h2>
    <StaticJsonLd dataAttr="localized-faq" schema={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: keys.map(key => ({
      '@type': 'Question', name: t(`faq.items.${key}.question`), acceptedAnswer: { '@type': 'Answer', text: t(`faq.items.${key}.answer`) },
    })) }} />
    <Accordion type="single" collapsible>{keys.map(key => <AccordionItem value={key} key={key}>
      <AccordionTrigger className="text-start text-base leading-relaxed">{t(`faq.items.${key}.question`)}</AccordionTrigger>
      <AccordionContent className="text-base leading-relaxed text-slate-600">{t(`faq.items.${key}.answer`)}</AccordionContent>
    </AccordionItem>)}</Accordion>
  </section>;
}

function ServicePrinciples() {
  const { t } = useTranslation();
  return <div className="grid gap-4 md:grid-cols-3">
    {['notLawFirm', 'noOutcomePromise', 'clientDecision'].map(key => <div key={key} className="flex items-start gap-3 rounded-xl border bg-white p-5">
      <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><p className="text-sm leading-relaxed text-slate-700">{t(`common.${key}`)}</p>
    </div>)}
  </div>;
}

function ContactSection() {
  const { t } = useTranslation();
  const { locale, isReleased } = useLocale();
  const number: unknown = review.contact.whatsappNumber;
  const serviceReady = locale !== 'en' && review.locales[locale]?.serviceReady === true;
  const whatsapp = isReleased && serviceReady && typeof number === 'string' && /^[1-9]\d{7,14}$/.test(number) ? `https://wa.me/${number}` : null;
  return <div className="mx-auto max-w-3xl space-y-6">
    <h1 className="text-4xl font-bold">{t('contact.title')}</h1><p className="text-lg leading-relaxed text-slate-600">{t('contact.description')}</p>
    <Card className="space-y-4 p-6">
      <p className="text-sm leading-relaxed text-slate-600">{t('contact.messageHint')}</p>
      <Button asChild size="lg" className="h-auto min-h-12 whitespace-normal py-3"><a href="mailto:hello@fabsy.ca"><Mail className="me-2 h-5 w-5 shrink-0" aria-hidden="true" />{t('contact.emailCta')}</a></Button>
      {whatsapp && <Button asChild size="lg" variant="outline" className="h-auto min-h-12 whitespace-normal py-3"><a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="me-2 h-5 w-5 shrink-0" aria-hidden="true" />{t('contact.whatsappCta')}</a></Button>}
      <p className="text-sm leading-relaxed text-slate-600">{t(whatsapp ? 'contact.staffAvailability' : 'contact.availability')}</p>
    </Card>
  </div>;
}

function TermsSection() {
  const { t } = useTranslation();
  const { href } = useLocale();
  return <article className="mx-auto max-w-3xl space-y-8">
    <h1 className="text-4xl font-bold">{t('terms.title')}</h1><p className="text-lg leading-relaxed text-slate-600">{t('terms.intro')}</p>
    <aside className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-5 leading-relaxed text-amber-950">
      <p>{t('terms.englishControls')}</p>
      <div className="flex flex-wrap gap-4">
        <Link to="/terms-of-service" className="font-semibold underline">{t('language.readEnglish')}</Link>
        <Link to={href('/terms-of-purchase')} className="font-semibold underline" lang="en" dir="ltr">Terms of Purchase (English)</Link>
      </div>
    </aside>
    <section id="fee-refund-guarantee" className="space-y-3" aria-label={t('feeRefund.details')}>
      <FeeRefundNotice />
      <p className="text-sm leading-relaxed text-slate-600">{t('feeRefund.scope')}</p>
    </section>
    {['service', 'practice', 'eligibility', 'pricing', 'payment', 'rapid', 'report', 'responsibilities', 'outcomes', 'privacy', 'liability', 'cancellation', 'website', 'law', 'changes', 'contact'].map(key => <section className="space-y-3" key={key}>
      <h2 className="text-2xl font-bold">{t(`terms.sections.${key}.title`)}</h2><p className="leading-8 text-slate-700">{t(`terms.sections.${key}.body`)}</p>
    </section>)}
  </article>;
}

function PurchaseTermsHandoff() {
  const { t } = useTranslation();
  const { isReleased } = useLocale();
  const location = useLocation();
  return <article className="mx-auto max-w-3xl space-y-6" data-purchase-terms-handoff="english">
    <h1 className="text-4xl font-bold" lang="en" dir="ltr">Terms of Purchase (English)</h1>
    {!isReleased && <aside className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-5 leading-relaxed text-amber-950" data-translation-status="draft">
      <strong>{t('language.draftTitle')}</strong><p>{t('language.draftBody')}</p>
    </aside>}
    <p className="text-lg leading-relaxed text-slate-600" lang="en" dir="ltr">
      Purchase terms are currently available in English. They are a separate document from the
      translated Terms of Service. Read the English purchase terms before paying.
    </p>
    <Button asChild size="lg" className="h-auto min-h-12 whitespace-normal py-3">
      <Link to={'/terms-of-purchase' + location.search + location.hash} state={location.state}>{t('language.readEnglish')}<ArrowRight className="ms-2 h-5 w-5 shrink-0 rtl:rotate-180" aria-hidden="true" /></Link>
    </Button>
  </article>;
}

function LocalizedContent() {
  const { t } = useTranslation();
  const { basePath, locale, href, isReleased } = useLocale();
  const location = useLocation();
  const isHome = basePath === '/';
  const isRapid = basePath === '/rapid-resolution';
  const isPurchaseHandoff = basePath === '/terms-of-purchase';
  const prefix = isHome ? 'home' : isRapid ? 'rapid' : basePath === '/how-it-works' ? 'process' : basePath === '/faq' ? 'faq' : basePath === '/contact' ? 'contact' : basePath === '/terms-of-service' ? 'terms' : 'checkout';
  useSafeHead({
    title: isPurchaseHandoff ? 'Terms of Purchase (English) | Fabsy' : t(`${prefix}.metaTitle`, { defaultValue: t('home.metaTitle') }),
    description: isPurchaseHandoff ? 'The purchase terms are available in English. Read the English document before paying.' : t(`${prefix}.metaDescription`, { defaultValue: t('home.metaDescription') }),
    canonical: `https://fabsy.ca${localizePath(basePath, locale)}`,
    robots: !isPurchaseHandoff && isReleased && registry.indexableRoutes.includes(basePath) ? 'index, follow' : 'noindex, follow',
  });
  const known = registry.phase1Routes.includes(basePath);
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <Header />
    <main>
      {(isHome || isRapid) && <>
        <section className="bg-gradient-hero px-4 py-14 text-white sm:py-20">
          <div className="container mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="space-y-6">
              <p className="text-sm font-semibold text-emerald-200">{t(`${prefix}.eyebrow`)}</p>
              <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">{t(`${prefix}.title`)}</h1>
              <p className="max-w-2xl text-lg leading-relaxed text-slate-200">{t(`${prefix}.description`)}</p>
              <FeeRefundNotice tone="dark" />
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-auto min-h-12 whitespace-normal py-3"><Link to={href('/submit-ticket')}>{t('home.primaryCta')}<ArrowRight className="ms-2 h-5 w-5 shrink-0 rtl:rotate-180" aria-hidden="true" /></Link></Button>
                <Button asChild size="lg" variant="outline" className="h-auto min-h-12 whitespace-normal border-slate-500 bg-transparent py-3 text-white hover:bg-slate-800 hover:text-white"><Link to={href('/how-it-works')}>{t('home.secondaryCta')}</Link></Button>
              </div>
              <p className="text-sm leading-relaxed text-slate-300">{t('home.scope')}</p>
            </div>
            <Card className="space-y-5 p-7 text-slate-900">
              <p className="text-sm font-semibold text-primary">{t('common.serviceName')}</p>
              <p className="text-5xl font-bold" dir="ltr">${RAPID_RESOLUTION.priceCad}<span className="ms-2 text-base font-medium text-slate-500">{' '}CAD + GST</span></p>
              <p className="text-sm leading-relaxed text-slate-600">{t('common.noSuccessFee')}</p>
              <ul className="space-y-3">{['intake', 'disclosure', 'analysis', 'decision'].map(key => <li key={key} className="flex items-start gap-3 text-sm leading-relaxed"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{t(`rapid.included.${key}`)}</li>)}</ul>
              <p className="border-t pt-4 text-sm leading-relaxed text-slate-600">{t('common.noOutcomePromise')}</p>
            </Card>
          </div>
        </section>
        {isHome && <><InsuranceContextSection /><ProDriverSection /></>}
        <div className="container mx-auto max-w-6xl space-y-14 px-4 py-14">
          {isHome && <section className="max-w-3xl space-y-4"><h2 className="text-3xl font-bold">{t('home.educationTitle')}</h2><p className="text-lg leading-relaxed text-slate-600">{t('home.educationBody')}</p></section>}
          {isRapid && <div className="grid gap-8 lg:grid-cols-2">{['included', 'excluded'].map((kind) => <section key={kind} className="space-y-5"><h2 className="text-2xl font-bold">{t(`rapid.${kind}Title`)}</h2><ul className="space-y-4">{Object.values(t(`rapid.${kind}`, { returnObjects: true }) as Record<string, string>).map(text => <li key={text} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">{kind === 'included' ? <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /> : <XCircle className="mt-1 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />}{text}</li>)}</ul></section>)}</div>}
          <section className="flex items-start gap-4 rounded-2xl border border-primary/20 bg-white p-6 sm:p-8"><Clock3 className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" /><div className="space-y-3"><h2 className="text-2xl font-bold">{t('rapid.speedTitle')}</h2><p className="leading-relaxed text-slate-700">{t('rapid.speedBody')}</p><p className="text-sm leading-relaxed text-slate-600">{t('rapid.speedDisclaimer')}</p></div></section>
          <ProcessSection /><ServicePrinciples /><FaqSection />
        </div>
      </>}
      {!isHome && !isRapid && <div className="container mx-auto max-w-6xl px-4 py-12 sm:py-16">
        {basePath === '/how-it-works' && <><h1 className="mb-8 text-4xl font-bold">{t('nav.howItWorks')}</h1><ProcessSection /></>}
        {basePath === '/faq' && <><h1 className="mb-8 text-4xl font-bold">{t('nav.faq')}</h1><FaqSection /></>}
        {basePath === '/contact' && <ContactSection />}
        {basePath === '/terms-of-service' && <TermsSection />}
        {isPurchaseHandoff && <PurchaseTermsHandoff />}
        {basePath === '/payment-canceled' && <div className="mx-auto max-w-2xl space-y-6"><h1 className="text-3xl font-bold">{t('checkout.paymentFailed')}</h1><Button asChild><Link to={href('/submit-ticket')}>{t('nav.start')}</Link></Button></div>}
        {!known && <div className="mx-auto max-w-2xl space-y-6"><h1 className="text-3xl font-bold">{t('common.notFound')}</h1><Link className="text-primary underline" to={localizePath(basePath + location.search + location.hash, 'en')}>{t('language.readEnglish')}</Link></div>}
      </div>}
    </main>
    <Footer />
  </div>;
}

export default function LocalizedPage() {
  const params = useParams();
  const { basePath, href } = useLocale();
  const location = useLocation();
  if (!params.locale || params.locale === 'en' || !WAVE_ONE_LOCALES.includes(params.locale as typeof WAVE_ONE_LOCALES[number])) return <NotFound />;
  if (basePath === '/ticket-form') return <Navigate replace to={href('/submit-ticket') + location.search + location.hash} state={location.state} />;
  if (basePath === '/submit-ticket') return <TicketFormPage />;
  if (basePath === '/thank-you') return <LocalizedPaymentReturn />;
  return <LocalizedContent />;
}
