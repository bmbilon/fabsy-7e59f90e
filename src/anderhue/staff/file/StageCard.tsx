import { ArrowRightLeft, Milestone } from 'lucide-react';
import { STAGES, stageDef } from '../catalog';
import { formatDate, relativeTime, torontoDateOf } from '../format';
import { laneStages, outcomeLabel } from '../model';
import { Button, Card, CardHead, StagePill } from '../ui';
import type { FileView } from './types';

export default function StageCard({ view, onChangeStage }: { view: FileView; onChangeStage: () => void }) {
  const { area, record } = view;
  const stage = record.stage;
  const def = stageDef(area, stage);
  const path = laneStages(area);
  const index = path.findIndex(item => item.value === stage);
  const terminal = Boolean(def?.terminal);
  const next = index >= 0 ? path[index + 1] : null;
  const changedAt = record.stage_changed_at;
  const outcome = terminal && record.outcome ? outcomeLabel(area, record.outcome) : '';

  return <Card labelledBy="stage-title">
    <CardHead id="stage-title" title="Stage" icon={<Milestone />} />
    <div className="ahs-card-body space-y-4">
      <div>
        <StagePill area={area} stage={stage} large />
        <p className="mt-2 text-[12.5px] text-[color:var(--ah-muted)]">
          Since {formatDate(torontoDateOf(changedAt))} · {relativeTime(changedAt)}
        </p>
        {outcome && <p className="mt-1 text-[13px] font-semibold text-[color:var(--ah-ink)]">Outcome: {outcome}</p>}
      </div>
      <div>
        <div className="ahs-path" role="img"
          aria-label={terminal ? `${def?.staffLabel}. The file is no longer on the active path.` : `Step ${index + 1} of ${path.length}: ${def?.staffLabel}`}>
          {path.map((item, position) => <span key={item.value} className="ahs-path-seg" title={item.staffLabel}
            data-state={terminal ? 'done' : position < index ? 'done' : position === index ? 'current' : 'todo'} />)}
        </div>
        <p className="mt-2 flex justify-between gap-3 text-[12px] text-[color:var(--ah-muted)]">
          {terminal ? <span>{STAGES[area].find(item => item.value === stage)?.staffLabel} · off the active path</span>
            : <><span>Step {index + 1} of {path.length}</span>{next && <span className="truncate">Next: {next.staffLabel}</span>}</>}
        </p>
      </div>
    </div>
    <div className="ahs-card-foot">
      <Button size="sm" variant="primary" block onClick={onChangeStage}><ArrowRightLeft aria-hidden="true" />Change stage</Button>
    </div>
  </Card>;
}
