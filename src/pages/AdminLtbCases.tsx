import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ChevronRight, FileText, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useDashboardAuth } from '@/hooks/useAdminDashboard';
import useSafeHead from '@/hooks/useSafeHead';
import { fetchLtbBoard, fetchMyLtbPractices, setLtbCaseStage } from '@/lib/admin/ltbApi';
import { LTB_STAGES, buildLtbBoard, filterLtbCards, type LtbCard, type LtbStage } from '@/lib/admin/ltbFunnel';

const tones: Record<LtbStage, string> = {
  new_intake: 'border-t-sky-500 bg-sky-50/60',
  under_review: 'border-t-cyan-500 bg-cyan-50/60',
  quoted: 'border-t-teal-500 bg-teal-50/60',
  retained: 'border-t-emerald-500 bg-emerald-50/60',
  notice_served: 'border-t-indigo-500 bg-indigo-50/60',
  filed: 'border-t-violet-500 bg-violet-50/60',
  hearing_scheduled: 'border-t-amber-500 bg-amber-50/60',
  order_issued: 'border-t-orange-500 bg-orange-50/60',
  closed: 'border-t-emerald-700 bg-emerald-50/60',
  declined: 'border-t-slate-400 bg-slate-200/70',
};

const flagTone = (flag: string) =>
  flag === 'Needs review' ? 'bg-amber-100 text-amber-900'
  : flag === 'Ready to file L1' ? 'bg-emerald-100 text-emerald-900'
  : flag === 'Reading documents' ? 'bg-sky-100 text-sky-900'
  : 'bg-slate-100 text-slate-700';

function StageSelect({ card, onMoved }: { card: LtbCard; onMoved: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  return <label className="block text-[11px] font-medium text-slate-500">
    Move to
    <select
      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
      value={card.stage}
      disabled={saving}
      aria-label={`Stage for ${card.caseNumber}`}
      onChange={async event => {
        const stage = event.target.value;
        setSaving(true);
        try {
          await setLtbCaseStage(card.id, stage);
          onMoved();
        } catch (error) {
          toast({ title: 'Stage not changed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
        } finally {
          setSaving(false);
        }
      }}
    >
      {LTB_STAGES.filter(([stage]) => stage !== 'closed' || card.stage === 'closed').map(([stage, label]) =>
        <option key={stage} value={stage}>{label}</option>)}
    </select>
    <span className="mt-1 block text-[10px] text-slate-400">Close a file from its detail page.</span>
  </label>;
}

function CaseCard({ card, onMoved }: { card: LtbCard; onMoved: () => void }) {
  return <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-label={`${card.caseNumber} · ${card.name}`}>
    <p className="text-[11px] font-medium text-slate-500">{card.caseNumber}</p>
    <h4 className="mt-1 break-words text-sm font-semibold leading-5 text-slate-900">{card.name}</h4>
    <p className="mt-1 text-xs font-medium text-blue-700">{card.issue}{card.city ? ` · ${card.city}` : ''}</p>
    <div className="mt-2 space-y-1 text-xs text-slate-600">
      {card.amount && <p>Arrears {card.amount}</p>}
      {card.email && <p className="break-all">{card.email}</p>}
      {card.phone && <p>{card.phone}</p>}
    </div>
    {card.flags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">
      {card.flags.map(flag => <span key={flag} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${flagTone(flag)}`}>{flag}</span>)}
    </div>}
    <details className="mt-3 border-t border-slate-100 pt-2">
      <summary className="cursor-pointer text-xs font-medium text-slate-600">Update stage</summary>
      <div className="pt-2"><StageSelect card={card} onMoved={onMoved} /></div>
    </details>
    <Link to={`/admin/ltb/cases/${card.id}`} className="mt-3 flex min-h-9 items-center justify-between rounded-md bg-slate-50 px-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700">
      Open file <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  </article>;
}

export default function AdminLtbCases() {
  useSafeHead({ title: 'Ontario LTB files | Fabsy admin', robots: 'noindex, nofollow' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useDashboardAuth();
  const [search, setSearch] = useState('');
  const board = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (auth.ready && !auth.session) navigate('/admin');
  }, [auth.ready, auth.session, navigate]);

  const practices = useQuery({
    queryKey: ['ltb-practices', auth.session?.user.id],
    enabled: !!auth.session,
    queryFn: fetchMyLtbPractices,
    retry: false,
  });
  const cases = useQuery({
    queryKey: ['ltb-board', auth.session?.user.id],
    enabled: !!practices.data?.length,
    queryFn: fetchLtbBoard,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const cards = useMemo(() => buildLtbBoard(cases.data || []), [cases.data]);
  const visible = filterLtbCards(cards, search);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ltb-board'] });
  const active = cards.filter(card => !['closed', 'declined'].includes(card.stage)).length;
  const attention = cards.filter(card => card.flags.includes('Needs review') || card.flags.includes('Ready to file L1')).length;

  if (practices.isLoading || !auth.ready) return <main className="p-6 text-sm text-slate-500">Loading LTB files…</main>;
  if (practices.isError || !practices.data?.length) {
    return <main className="p-6">
      <h1 className="text-xl font-semibold text-slate-900">Ontario LTB files</h1>
      <p className="mt-2 text-sm text-slate-600">Your account does not have access to an Ontario practice. Ask a Fabsy admin to add you.</p>
    </main>;
  }

  const lane = ([stage, label]: readonly [LtbStage, string], index: number) => {
    const items = visible.filter(card => card.stage === stage);
    return <section key={stage} aria-labelledby={`ltb-stage-${stage}`} className={`min-w-0 rounded-xl border border-slate-200 border-t-[3px] ${tones[stage]}`}>
      <div className="flex min-h-16 items-center gap-2 border-b border-slate-200/70 px-3 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-slate-500" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <h3 id={`ltb-stage-${stage}`} className="flex-1 text-xs font-semibold leading-4 text-slate-800">{label}</h3>
        <span aria-label={`${items.length} files`} className="rounded-md bg-white px-1.5 py-1 text-xs font-semibold text-slate-600">{items.length}</span>
        {index < 7 && <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />}
      </div>
      <div className="grid gap-3 p-2.5">
        {items.length ? items.map(card => <CaseCard key={card.id} card={card} onMoved={refresh} />)
          : <p className="py-7 text-center text-xs text-slate-500">No {search ? 'matching ' : ''}files</p>}
      </div>
    </section>;
  };

  return <main className="px-4 py-6 sm:px-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400">{practices.data.map(p => p.practice_name).join(' · ')}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Ontario LTB files</h1>
        <p className="mt-1 text-sm text-slate-500">{active} active · {attention} need attention · {cards.length - active} closed or declined</p>
      </div>
      <Button variant="outline" size="sm" onClick={refresh} disabled={cases.isFetching}>
        <RefreshCw className={`mr-2 h-4 w-4 ${cases.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh
      </Button>
    </div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
        <Input aria-label="Search LTB files" placeholder="Search name, file number, city…" value={search} onChange={event => setSearch(event.target.value)} className="bg-white pl-9" />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Scroll to earlier stages" onClick={() => board.current?.scrollBy({ left: -540, behavior: 'smooth' })}><ArrowLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Scroll to later stages" onClick={() => board.current?.scrollBy({ left: 540, behavior: 'smooth' })}><ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
    {cases.isError && <p role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Files could not be loaded. Refresh to try again.</p>}
    {!cases.isLoading && !cards.length && <p className="mb-3 flex items-center gap-2 rounded-lg border bg-white p-4 text-sm text-slate-600"><FileText className="h-4 w-4" />No files yet. New intakes from the practice page appear here.</p>}
    <div ref={board} role="region" aria-label="LTB file stages, scroll horizontally" tabIndex={0} className="overflow-x-auto rounded-xl pb-4">
      <div className="grid min-w-[2200px] grid-cols-10 items-start gap-3">
        {LTB_STAGES.map((stage, index) => lane(stage, index))}
      </div>
    </div>
  </main>;
}
