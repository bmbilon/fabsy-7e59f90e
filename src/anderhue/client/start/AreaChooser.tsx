import { Link } from 'react-router-dom';
import { ChevronRight, FileCheck2, ListChecks, Lock } from 'lucide-react';
import { AREAS } from '../catalog';
import { AREA_COPY, AREA_ORDER } from './content';

const PROMISES = [
  { icon: Lock, title: 'Private', text: 'Documents go straight into your file, not an inbox.' },
  { icon: ListChecks, title: 'Three short steps', text: 'Documents, a few details, then how to reach you.' },
  { icon: FileCheck2, title: 'No retainer yet', text: 'We reply with your next step and the fee in writing.' },
];

export default function AreaChooser() {
  return (
    <div className="ahc-col px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <p className="ahc-eyebrow">Start a file</p>
      <h1 className="ah-display mt-2 text-[34px] sm:text-[44px]">What can we help with?</h1>
      <p className="ahc-lead mt-3 max-w-[36rem]">
        Choose the closest match. You add your documents and a few details, and we reply with your next step and the fee in writing.
      </p>
      <ul className="mt-8 grid gap-3" aria-label="Kinds of matter">
        {AREA_ORDER.map(area => {
          const copy = AREA_COPY[area];
          const Icon = copy.icon;
          return (
            <li key={area}>
              <Link to={`/start?area=${AREAS[area].startParam}`} state={{ from: 'chooser' }} className="ahc-area">
                <span className="ahc-area-icon" aria-hidden="true"><Icon size={24} /></span>
                <span className="min-w-0">
                  <span className="ahc-area-title block">{copy.title}</span>
                  <span className="mt-1 block text-[15px] leading-snug text-[color:var(--ah-ink-2)]">{copy.summary}</span>
                </span>
                <ChevronRight size={20} className="ahc-area-chev" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      <ul className="mt-8 grid gap-4 border-t border-[color:var(--ah-line)] pt-6 sm:grid-cols-3 sm:gap-6">
        {PROMISES.map(item => (
          <li key={item.title} className="flex gap-3">
            <item.icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[color:var(--ah-plum-600)]" />
            <span>
              <span className="block font-semibold text-[color:var(--ah-ink)]">{item.title}</span>
              <span className="mt-0.5 block text-[14px] leading-snug text-[color:var(--ah-muted)]">{item.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-[15px] text-[color:var(--ah-ink-2)]">
        Already started a file? <Link to="/files" className="ahc-link">Open your file</Link>
      </p>
    </div>
  );
}
