import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Scale, X } from 'lucide-react';
import { useLocale } from '@/i18n/locale-context';
import LanguageSelector from './LanguageSelector';
import LanguageMessages from './LanguageMessages';

const navigation = [
  ['home', '/'], ['rapid', '/rapid-resolution'], ['howItWorks', '/how-it-works'], ['faq', '/faq'], ['contact', '/contact'],
] as const;

export function LocalizedHeader() {
  const { t } = useTranslation();
  const { href, basePath } = useLocale();
  const [open, setOpen] = useState(false);
  return <>
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="container mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2">
        <Link to={href('/')} className="flex items-center gap-2 font-script text-2xl font-bold text-primary" aria-label="Fabsy">
          <Scale className="h-6 w-6" aria-hidden="true" />Fabsy
        </Link>
        <nav aria-label={t('nav.home')} className="hidden items-center gap-5 xl:flex">
          {navigation.map(([key, path]) => <Link key={key} to={href(path)} aria-current={basePath === path ? 'page' : undefined}
            className="text-sm font-medium text-slate-800 hover:text-primary aria-[current=page]:text-primary">{t(`nav.${key}`)}</Link>)}
        </nav>
        <div className="flex min-w-0 items-center gap-3">
          <LanguageSelector />
          <button type="button" className="rounded-md p-2 text-slate-900 xl:hidden" aria-label={open ? t('common.close') : t('nav.menu')}
            aria-expanded={open} aria-controls="locale-mobile-navigation" onClick={() => setOpen(value => !value)}>
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && <nav id="locale-mobile-navigation" className="container mx-auto flex flex-col gap-1 border-t px-4 py-3 xl:hidden">
        {navigation.map(([key, path]) => <Link key={key} to={href(path)} onClick={() => setOpen(false)}
          className="rounded px-3 py-3 text-slate-900 hover:bg-slate-50">{t(`nav.${key}`)}</Link>)}
      </nav>}
    </header>
    <LanguageMessages />
  </>;
}

export function LocalizedFooter() {
  const { t } = useTranslation();
  const { href } = useLocale();
  return <footer className="border-t bg-white px-4 py-10 text-slate-700">
    <div className="container mx-auto max-w-6xl space-y-5">
      <Link to={href('/')} className="font-script text-2xl font-bold text-primary">Fabsy</Link>
      <p className="max-w-3xl text-sm leading-relaxed">{t('common.notLawFirm')}</p>
      <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <Link className="underline underline-offset-4" to={href('/terms-of-service')}>{t('nav.terms')}</Link>
        <Link className="underline underline-offset-4" to={href('/contact')}>{t('nav.contact')}</Link>
        <Link className="underline underline-offset-4" to={href('/faq')}>{t('nav.faq')}</Link>
        <a className="underline underline-offset-4" href="mailto:hello@fabsy.ca" dir="ltr">hello@fabsy.ca</a>
      </nav>
      <p className="max-w-3xl text-xs leading-relaxed">{t('language.englishControls')}</p>
      <p className="text-xs" dir="ltr">© {new Date().getFullYear()} Fabsy · Alberta, Canada</p>
    </div>
  </footer>;
}
