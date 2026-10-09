import { BellRing, CircleCheck, Clock, Mail, Phone } from 'lucide-react';
import { ANDERHUE_PRACTICE } from '../../config';
import type { PortalFile, PortalPractice } from '../api';
import { daysUntil } from '../catalog';
import { Pill } from '../components/ui';
import { cx } from '../lib/cx';
import { formatDate, formatDateTime, formatKeyDate, relativeDays } from '../lib/format';
import PhaseStepper from './PhaseStepper';
import PortalUploader from './PortalUploader';

export function StatusCard({ file }: { file: PortalFile }) {
  return (
    <section className="ahc-card ahc-card-pad" aria-labelledby="status-title">
      <p className="ahc-section-label">Where things stand</p>
      <h2 id="status-title" className="ah-display mt-2 text-[27px] sm:text-[32px]">{file.stageLabel}</h2>
      {file.clientNext ? <p className="mt-3 max-w-[40rem] text-[17px] leading-relaxed text-[color:var(--ah-ink-2)]">{file.clientNext}</p> : null}
      {file.closed && file.outcomeLabel ? (
        <p className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-[color:var(--ah-ink)]">Result</span>
          <Pill tone="closed">{file.outcomeLabel}</Pill>
        </p>
      ) : null}
      <div className="mt-6 border-t border-[color:var(--ah-line)] pt-6">
        <PhaseStepper phase={file.phase} />
      </div>
    </section>
  );
}

/** "Action needed" with the practice's message and an upload zone, or a thank-you once answered. */
export function RequestBanner({ file, onUploaded }: { file: PortalFile; onUploaded: () => void }) {
  const request = file.request;
  if (!request) return null;
  if (request.answered) {
    const requestedAt = Date.parse(request.at);
    const latest = file.documents
      .filter(document => document.from === 'you' && document.uploadedAt && (!Number.isFinite(requestedAt) || Date.parse(document.uploadedAt) >= requestedAt))
      .map(document => document.uploadedAt as string)
      .sort()
      .pop();
    return (
      <section className="ahc-alert ahc-alert--success" aria-label="Documents received">
        <CircleCheck size={20} aria-hidden="true" />
        <div>
          <p className="ahc-alert-title">{latest ? `Thanks, we received your documents on ${formatDate(latest)}.` : 'Thanks, we received your documents.'}</p>
          <p className="mt-1">We will be in touch if we need anything else.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="ahc-request ahc-card-pad" aria-labelledby="request-title">
      <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] text-[color:var(--ah-warn-ink)]">
        <BellRing size={16} aria-hidden="true" />
        Action needed
      </p>
      <h2 id="request-title" className="mt-2 text-[24px] sm:text-[26px]">We need a document from you</h2>
      <blockquote className="ahc-quote mt-4">{request.message}</blockquote>
      <p className="mt-2 text-[13px] text-[color:var(--ah-muted)]">Requested {formatDate(request.at)}</p>
      <div className="mt-5">
        {file.canUpload ? (
          <PortalUploader
            area={file.area}
            id={file.id}
            limits={file.limits}
            idPrefix="request-upload"
            compact
            submitLabel={count => (count === 1 ? 'Send this document' : `Send ${count} documents`)}
            onUploaded={onUploaded}
          />
        ) : (
          <p className="text-[15px] text-[color:var(--ah-ink-2)]">Uploads are not available on this file right now. Email or call us to send it.</p>
        )}
      </div>
    </section>
  );
}

export function KeyDatesCard({ file, idSuffix, className }: { file: PortalFile; idSuffix: string; className?: string }) {
  const titleId = `dates-title-${idSuffix}`;
  return (
    <section className={cx('ahc-card ahc-card-pad', className)} aria-labelledby={titleId}>
      <h2 id={titleId} className="ahc-card-title">Key dates</h2>
      {file.keyDates.length ? (
        <dl className="ahc-dates mt-3">
          {file.keyDates.map(item => {
            const days = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? daysUntil(item.date) : null;
            const soon = days !== null && days >= 0 && days <= 7 && !file.closed;
            const estimate = /estimate/i.test(item.label);
            return (
              <div key={`${item.label}-${item.date}`} className="ahc-date">
                <dt>{item.label}</dt>
                <dd>
                  <span className="text-[16px] font-semibold text-[color:var(--ah-ink)]">{formatKeyDate(item.date)}</span>
                  {soon ? <Pill tone="soon">{relativeDays(item.date)}</Pill> : <span className="text-[13px] text-[color:var(--ah-muted)]">{relativeDays(item.date)}</span>}
                </dd>
                {estimate ? <p className="mt-1 text-[13px] text-[color:var(--ah-muted)]">An estimate. The date printed on your notice is the one that counts.</p> : null}
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="mt-2 text-[15px] text-[color:var(--ah-muted)]">No dates yet. We will add them here as your file moves forward.</p>
      )}
    </section>
  );
}

export function HistoryCard({ file }: { file: PortalFile }) {
  const items = [...file.history].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  return (
    <section className="ahc-card ahc-card-pad" aria-labelledby="history-title">
      <h2 id="history-title" className="ahc-card-title">History</h2>
      {items.length ? (
        <ol className="ahc-timeline mt-4">
          {items.map((item, index) => (
            <li key={`${item.at}-${index}`}>
              <p className="text-[15px] font-medium leading-snug text-[color:var(--ah-ink)]">{item.label}</p>
              <p className="mt-0.5 text-[13px] text-[color:var(--ah-muted)]"><time dateTime={item.at}>{formatDateTime(item.at)}</time></p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[15px] text-[color:var(--ah-muted)]">Updates to your file will appear here.</p>
      )}
    </section>
  );
}

export function ContactCard({ number, practice }: { number: string; practice?: PortalPractice | null }) {
  const phone = practice?.phone || ANDERHUE_PRACTICE.phoneDisplay;
  const phoneHref = practice?.phone ? `tel:+1${practice.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')}` : ANDERHUE_PRACTICE.phoneHref;
  const email = practice?.publicEmail || ANDERHUE_PRACTICE.publicEmail;
  const row = 'flex min-h-[44px] items-center gap-3 rounded-[6px] text-[15px]';
  return (
    <section className="ahc-card ahc-card-pad" aria-labelledby="contact-title">
      <h2 id="contact-title" className="ahc-card-title">Questions about your file?</h2>
      <p className="mt-1 text-[14px] text-[color:var(--ah-muted)]">Mention your file number, <span className="ah-mono whitespace-nowrap">{number}</span>.</p>
      <ul className="mt-3 grid gap-0.5">
        <li>
          <a className={cx(row, 'font-semibold text-[color:var(--ah-plum-800)] hover:underline')} href={phoneHref}>
            <Phone size={18} aria-hidden="true" className="shrink-0 text-[color:var(--ah-plum-600)]" />
            {phone}
          </a>
        </li>
        <li>
          <a className={cx(row, 'font-semibold text-[color:var(--ah-plum-800)] hover:underline [overflow-wrap:anywhere]')} href={`mailto:${email}?subject=${encodeURIComponent(`File ${number}`)}`}>
            <Mail size={18} aria-hidden="true" className="shrink-0 text-[color:var(--ah-plum-600)]" />
            {email}
          </a>
        </li>
        <li className={cx(row, 'text-[color:var(--ah-ink-2)]')}>
          <Clock size={18} aria-hidden="true" className="shrink-0 text-[color:var(--ah-plum-600)]" />
          {ANDERHUE_PRACTICE.hours}
        </li>
      </ul>
    </section>
  );
}
