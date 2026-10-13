import { useState } from 'react';
import { History } from 'lucide-react';
import { formatDateTime, plural, relativeTime } from '../format';
import { describeEvent } from '../model';
import { Button, Card, CardHead, EmptyState } from '../ui';
import type { FileView } from './types';

const ACTOR_LABEL = { staff: 'Staff', client: 'Client', system: 'System' } as const;

export default function ActivityCard({ view }: { view: FileView }) {
  const [expanded, setExpanded] = useState(false);
  const events = view.events;
  const shown = expanded ? events : events.slice(0, 8);
  return <Card labelledBy="activity-title">
    <CardHead id="activity-title" title="Activity" icon={<History />} sub={events.length ? `${plural(events.length, 'event')}, newest first` : undefined} />
    {events.length ? <div className="ahs-card-body">
      <ol className="ahs-timeline space-y-3.5">
        {shown.map(event => {
          const summary = describeEvent(view.area, event);
          return <li key={event.id} className="ahs-timeline-item">
            <span className="ahs-timeline-dot" data-actor={summary.actor} aria-hidden="true" />
            <p className="text-[13px] font-semibold leading-5 text-[color:var(--ah-ink)]">{summary.title}</p>
            {summary.detail && <p className="text-[12.5px] leading-5 text-[color:var(--ah-ink-2)]">{summary.detail}</p>}
            {summary.quote && <p className="mt-1 line-clamp-3 border-l-2 border-[color:var(--ah-gold-300)] pl-2.5 text-[12.5px] italic leading-5 text-[color:var(--ah-ink-2)]">{summary.quote}</p>}
            <p className="mt-0.5 text-[11.5px] text-[color:var(--ah-muted)]">
              <span title={formatDateTime(event.at)}>{relativeTime(event.at)}</span> · {ACTOR_LABEL[summary.actor]}
            </p>
          </li>;
        })}
      </ol>
      {events.length > 8 && <Button size="xs" variant="ghost" className="mt-3" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
        {expanded ? 'Show fewer' : `Show all ${events.length}`}
      </Button>}
    </div>
      : <EmptyState compact icon={<History />} title="No activity yet">Changes to this file are logged here.</EmptyState>}
  </Card>;
}
