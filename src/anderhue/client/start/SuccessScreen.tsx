import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Mail, Plus } from 'lucide-react';
import { ANDERHUE_PRACTICE } from '../../config';
import { STAGES } from '../catalog';
import { Alert, Button } from '../components/ui';
import { plural } from '../lib/format';
import { AREA_COPY } from './content';
import type { SentSummary } from './intake';

interface SuccessScreenProps {
  summary: SentSummary;
  onStartAnother: () => void;
}

export default function SuccessScreen({ summary, onStartAnother }: SuccessScreenProps) {
  const copy = AREA_COPY[summary.area];
  const received = STAGES[summary.area].find(stage => stage.value === 'new_intake')?.clientNext || '';
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(summary.number);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="ahc-col px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <section className="ahc-card ahc-card-pad" aria-labelledby="sent-title">
        <div className="flex flex-col items-center text-center">
          <span className="ahc-success-mark" aria-hidden="true"><Check size={36} strokeWidth={2.4} /></span>
          <p className="ahc-eyebrow mt-6">{copy.eyebrow}</p>
          <h1 id="sent-title" ref={heading} tabIndex={-1} className="ah-display mt-2 text-[32px] sm:text-[40px]">Your file is open</h1>
          <p className="mt-5 text-[13px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ah-muted)]">File number</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="ahc-filenum ahc-filenum--lg" data-testid="file-number">{summary.number}</span>
            {canCopy ? (
              <Button variant="quiet" size="sm" icon={copied ? Check : Copy} onClick={copyNumber} aria-label={copied ? 'File number copied' : `Copy file number ${summary.number}`}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            ) : null}
          </div>
          <p className="mt-6 max-w-[30rem] text-[17px] leading-relaxed text-[color:var(--ah-ink-2)]">
            We will email a secure link to <strong className="font-semibold text-[color:var(--ah-ink)] [overflow-wrap:anywhere]">{summary.email}</strong> so you can follow your file and add documents.
          </p>
        </div>

        <div className="mt-8 grid gap-6">
          {summary.failedNames.length ? (
            <Alert tone="warn" title={summary.failedNames.length === 1 ? 'One document did not upload' : `${summary.failedNames.length} documents did not upload`}>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {summary.failedNames.map(name => <li key={name} className="[overflow-wrap:anywhere]">{name}</li>)}
              </ul>
              <p className="mt-2">Your file is open without {summary.failedNames.length === 1 ? 'it' : 'them'}. You can add {summary.failedNames.length === 1 ? 'it' : 'them'} from the link in your email.</p>
            </Alert>
          ) : null}
          {summary.unconfirmed ? (
            <Alert tone="info" title="We could not confirm your documents">
              Your file is open. If {plural(summary.sentCount, 'document', 'documents')} {summary.sentCount === 1 ? 'is' : 'are'} missing from your file, add {summary.sentCount === 1 ? 'it' : 'them'} from the link in your email.
            </Alert>
          ) : null}

          <p className="ahc-note">{received}</p>

          <div>
            <h2 className="text-[21px]">What happens next</h2>
            <ol className="ahc-numbered mt-4">
              {copy.nextSteps.map(item => <li key={item}><span className="pt-0.5">{item}</span></li>)}
            </ol>
          </div>

          <p className="flex gap-3 rounded-[6px] bg-[color:var(--ah-ivory-100)] p-4 text-[15px] leading-relaxed text-[color:var(--ah-ink-2)]">
            <Mail size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[color:var(--ah-plum-600)]" />
            <span>
              The email comes from {ANDERHUE_PRACTICE.name}. If you do not see it, check your spam or junk folder.
            </span>
          </p>

          <div className="flex flex-col-reverse gap-3 border-t border-[color:var(--ah-line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" icon={Plus} onClick={onStartAnother}>Start another file</Button>
            <a className="ahc-btn ahc-btn--primary" href={`${ANDERHUE_PRACTICE.siteUrl}/`}>
              Back to anderhue.ca
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
