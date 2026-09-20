import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, FileText, Search, RefreshCw, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CaseStatusSelect from '@/components/admin/CaseStatusSelect';
import { caseStageLabel } from '@/lib/admin/caseStatus';
import { FUNNEL_STAGES, filterFunnelCases, type FunnelCase, type FunnelStage } from '@/lib/admin/caseFunnel';

const tones: Record<FunnelStage, string> = {
  ticket_submitted: 'border-t-sky-500 bg-sky-50/60',
  consent_submitted: 'border-t-cyan-500 bg-cyan-50/60',
  paid: 'border-t-teal-500 bg-teal-50/60',
  disclosure_requested: 'border-t-indigo-500 bg-indigo-50/60',
  crown_offer_received: 'border-t-violet-500 bg-violet-50/60',
  proceeding_to_trial: 'border-t-amber-500 bg-amber-50/60',
  closed_resolved: 'border-t-emerald-600 bg-emerald-50/60',
  closed_refunded: 'border-t-rose-400 bg-rose-50/60',
  expired_lapsed: 'border-t-slate-400 bg-slate-200/70',
};

function CaseCard({ item, openIntake, statusesReady }: { item: FunnelCase; openIntake: (id: string) => void; statusesReady: boolean }) {
  const label = item.ticketNumber ? `Ticket ${item.ticketNumber}` : 'Ticket number pending';
  return <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-label={`${item.name} · ${label}`}>
    <p className="text-[11px] font-medium text-slate-500">{item.detail}</p>
    <h4 className="mt-2 break-words text-sm font-semibold leading-5 text-slate-900">{item.name}</h4>
    <p className="mt-1 break-words text-xs font-medium text-blue-700">{label}</p>
    <div className="mt-3 space-y-1 text-xs text-slate-600">
      {item.email && <p className="break-all">{item.email}</p>}
      {item.phone && <p>{item.phone}</p>}
      {!item.email && !item.phone && <p>Contact details pending</p>}
      {item.violation && <p className="line-clamp-2" title={item.violation}>{item.violation}</p>}
    </div>
    <details className="mt-3 border-t border-slate-100 pt-2">
      <summary className="cursor-pointer text-xs font-medium text-slate-600 focus-visible:outline-blue-600">{caseStageLabel(item.caseStatus?.stage) || 'Update case status'}</summary>
      <div className="pt-2"><CaseStatusSelect kind={item.kind} ticketId={item.id} label={item.ticketNumber || item.name} initial={item.caseStatus} disabled={!statusesReady} compact /></div>
    </details>
    {item.href ? <Link to={item.href} className="mt-3 flex min-h-9 items-center justify-between rounded-md bg-slate-50 px-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-blue-600">Open case <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
      : <button type="button" onClick={() => openIntake(item.id)} className="mt-3 flex min-h-9 w-full items-center justify-between rounded-md bg-slate-50 px-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-blue-600">Manage intake <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>}
  </article>;
}

export default function CaseFunnelBoard({ cases, statusesReady, refreshing, refresh, openIntake }: {
  cases: FunnelCase[]; statusesReady: boolean; refreshing: boolean; refresh: () => void; openIntake: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const board = useRef<HTMLDivElement>(null);
  const visible = filterFunnelCases(cases, search);
  const groups = new Map(FUNNEL_STAGES.map(([stage]) => [stage, visible.filter(item => item.stage === stage)]));
  const active = cases.filter(item => !['closed_resolved', 'closed_refunded', 'expired_lapsed'].includes(item.stage)).length;
  const lane = (stage: FunnelStage, label: string, index: number) => <section key={stage} aria-labelledby={`stage-${stage}`} className={`min-w-0 rounded-xl border border-slate-200 border-t-[3px] ${tones[stage]} ${stage === 'expired_lapsed' ? 'col-span-2' : ''}`}>
    <div className="flex min-h-20 items-center gap-2 border-b border-slate-200/70 px-3 py-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-slate-500" aria-hidden="true">{stage === 'expired_lapsed' ? <Archive className="h-3 w-3" /> : String(index + 1).padStart(2, '0')}</span>
      <h3 id={`stage-${stage}`} className="flex-1 text-xs font-semibold leading-4 text-slate-800">{label}</h3>
      <span aria-label={`${groups.get(stage)?.length} cases`} className="rounded-md bg-white px-1.5 py-1 text-xs font-semibold text-slate-600">{groups.get(stage)?.length}</span>
      {index < 5 && <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />}
    </div>
    <div className={`grid gap-3 p-2.5 ${stage === 'expired_lapsed' ? 'grid-cols-2' : ''}`}>
      {groups.get(stage)?.length ? groups.get(stage)?.map(item => <CaseCard key={item.key} item={item} openIntake={openIntake} statusesReady={statusesReady} />)
        : <p className={`py-7 text-center text-xs text-slate-500 ${stage === 'expired_lapsed' ? 'col-span-2' : ''}`}>No {search ? 'matching ' : ''}cases</p>}
    </div>
  </section>;
  return <section aria-labelledby="case-pipeline-title" className="mb-8">
    <h2 id="case-pipeline-title" className="sr-only">Case stages</h2>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-slate-500">{active} active · {cases.length - active} closed or expired</p>
      <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh cases</Button>
    </div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><Input aria-label="Search all cases" placeholder="Search cases…" value={search} onChange={event => setSearch(event.target.value)} className="bg-white pl-9" /></div>
      <div className="flex items-center gap-2 text-xs text-slate-500"><Button variant="outline" size="icon" className="h-8 w-8" aria-label="Scroll to earlier stages" onClick={() => board.current?.scrollBy({ left: -540, behavior: 'smooth' })}><ArrowLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" className="h-8 w-8" aria-label="Scroll to later stages" onClick={() => board.current?.scrollBy({ left: 540, behavior: 'smooth' })}><ArrowRight className="h-4 w-4" /></Button></div>
    </div>
    {search && <p role="status" className="mb-3 text-sm text-slate-600">{visible.length} / {cases.length} cases <button className="ml-2 text-blue-700 underline" onClick={() => setSearch('')}>Clear search</button></p>}
    {!cases.length && <p className="mb-3 flex items-center gap-2 rounded-lg border bg-white p-4 text-sm text-slate-600"><FileText className="h-4 w-4" />No cases</p>}
    <div ref={board} role="region" aria-label="Case stages, scroll horizontally" tabIndex={0} className="overflow-x-auto rounded-xl pb-4 focus-visible:outline-blue-600">
      <div className="grid min-w-[1760px] grid-cols-8 items-start gap-3">
        {FUNNEL_STAGES.slice(0, 6).map(([stage, label], index) => lane(stage, label, index))}
        <div className="col-span-2 grid min-w-0 grid-cols-2 items-start gap-3">
          {FUNNEL_STAGES.slice(6).map(([stage, label], index) => lane(stage, label, index + 6))}
        </div>
      </div>
    </div>
  </section>;
}
