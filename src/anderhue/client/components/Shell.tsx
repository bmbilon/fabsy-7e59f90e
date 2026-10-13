import type { ReactNode } from 'react';
import { Phone } from 'lucide-react';
import { ANDERHUE_PRACTICE } from '../../config';

const SITE_HOME = `${ANDERHUE_PRACTICE.siteUrl}/`;

/** Branded frame shared by the uploader and the portal. */
export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="ahc">
      <a href="#main" className="ahc-skip">Skip to content</a>
      <header className="ahc-header">
        <div className="ahc-wrap ahc-header-row">
          <a href={SITE_HOME} className="ahc-brand" aria-label={`${ANDERHUE_PRACTICE.name} home`}>
            <img src="/crest-mark.webp" alt="" width={36} height={36} decoding="async" />
            <span className="min-w-0">
              <span className="ahc-brand-name">{ANDERHUE_PRACTICE.name}</span>
              <span className="ahc-brand-sub hidden sm:block">Ontario paralegal services</span>
            </span>
          </a>
          <a href={ANDERHUE_PRACTICE.phoneHref} className="ahc-call" aria-label={`Call ${ANDERHUE_PRACTICE.phoneDisplay}`}>
            <Phone size={17} aria-hidden="true" />
            <span className="sm:hidden">Call</span>
            <span className="hidden sm:inline">{ANDERHUE_PRACTICE.phoneDisplay}</span>
          </a>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="ahc-footer">
        <div className="ahc-wrap flex flex-col gap-2 py-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <p className="max-w-2xl">
            <strong className="font-semibold text-[color:var(--ah-ink)]">{ANDERHUE_PRACTICE.legalName}</strong>
            {' '}· Paralegal services by {ANDERHUE_PRACTICE.licensee}, licensed by the Law Society of Ontario. Representation begins only after a written retainer.
          </p>
          <p className="flex shrink-0 flex-wrap gap-x-4 gap-y-1">
            <a href={SITE_HOME}>anderhue.ca</a>
            <a href={`mailto:${ANDERHUE_PRACTICE.publicEmail}`}>{ANDERHUE_PRACTICE.publicEmail}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
