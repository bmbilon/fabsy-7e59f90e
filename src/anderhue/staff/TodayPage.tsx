import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, ChevronRight, FileSearch, FolderOpen, Inbox, Plus, RefreshCw,
  Upload, UserRound,
} from 'lucide-react';
import useSafeHead from '@/hooks/useSafeHead';
import { cn } from '@/lib/utils';
import { formatClock, formatTableDate, longTodayLine, relativeTime } from './format';
import { useAttentionQueue, useWorkspace } from './hooks';
import {
  AREA_LIST, compareUrgency, describeEvent, fileHref, type FileWithSignals,
} from './model';
import { useStaffUi } from './session';
import { AreaIcon, Button, Card, CardHead, EmptyState, ReasonChips, Skeleton, StagePill } from './ui';

type QueueFilter = 'attention' | 'needs_review' | 'client_uploaded' | 'due' | 'active';

const FILTERS: { value: QueueFilter; label: string }[] = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'client_uploaded', label: 'Client uploads' },
  { value: 'due', label: 'Due soon' },
  { value: 'active', label: 'All active' },
];

function KpiTile({ label, value, note, icon, pressed, onClick, loading }: {
  label: string; value: number; note: ReactNode; icon: ReactNode; pressed: boolean; onClick: () => void; loading: boolean;
}) {
  return <button type="button" className="ahs-kpi" aria-pressed={pressed} onClick={onClick}>
    <span className="ahs-kpi-label"><span className="min-w-0 sm:truncate">{label}</span>{icon}</span>
    {loading ? <Skeleton className="my-1 h-8 w-12" /> : <span className="ahs-kpi-value">{value}</span>}
    <span className="ahs-kpi-note">{loading ? ' ' : note}</span>
  </button>;
}

function QueueRow({ file, today }: { file: FileWithSignals; today: string }) {
  const { keyDate } = file.signals;
  const meta = [file.title, file.city, keyDate ? `${keyDate.label} ${formatTableDate(keyDate.date, today)}` : '']
    .filter(Boolean).join(' · ');
  return <li>
    <Link to={fileHref(file.area, file.id)} className="ahs-row-link group px-4 py-3.5 sm:px-5"
      aria-label={`${file.number}, ${file.clientName}: ${file.signals.reasons.filter(reason => reason.attention).map(reason => reason.label).join(', ') || 'open file'}`}>
      <div className="flex items-start gap-3.5">
        <span className={`ahs-area ahs-area-${file.area} mt-0.5 !hidden !h-9 !w-9 shrink-0 !justify-center !p-0 sm:!inline-flex [&_svg]:!h-4 [&_svg]:!w-4`} aria-hidden="true">
          <AreaIcon area={file.area} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className="min-w-0 truncate text-[14px] font-semibold text-[color:var(--ah-ink)]">{file.clientName}</span>
            <span className="ahs-mono text-[12px] text-[color:var(--ah-ink-2)]">{file.number}</span>
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-[color:var(--ah-muted)]">{meta}</p>
          <ReasonChips reasons={file.signals.reasons} max={4} className="mt-2" />
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1.5 md:flex">
          <StagePill area={file.area} stage={file.stage} outcome={file.outcome} />
          <span className="text-[11.5px] text-[color:var(--ah-muted)]">Updated {relativeTime(file.updatedAt)}</span>
        </div>
        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-[color:var(--ah-line-strong)] transition-colors group-hover:text-[color:var(--ah-plum-600)]" aria-hidden="true" />
      </div>
    </Link>
  </li>;
}

function QueueSkeleton() {
  return <ul className="ahs-divide" aria-hidden="true">
    {[0, 1, 2, 3, 4].map(index => <li key={index} className="flex items-start gap-3.5 px-5 py-4">
      <Skeleton className="hidden h-9 w-9 rounded-[6px] sm:block" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="h-3 w-72 max-w-full" />
        <div className="flex gap-1.5"><Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-20" /></div>
      </div>
    </li>)}
  </ul>;
}

export default function TodayPage() {
  useSafeHead({ title: 'Today | AnderHue Paralegal', robots: 'noindex, nofollow' });
  const workspace = useWorkspace();
  const { openNewFile } = useStaffUi();
  const [filter, setFilter] = useState<QueueFilter>('attention');
  const attention = useAttentionQueue(workspace.files);
  const today = workspace.today;

  const kpis = useMemo(() => {
    const active = workspace.files.filter(file => !file.terminal);
    const review = active.filter(file => file.signals.needsReview);
    const uploads = active.filter(file => file.signals.clientUploadWaiting);
    const due = active.filter(file => file.signals.dueSoon);
    const overdue = due.filter(file => (file.signals.keyDays ?? 0) < 0).length;
    const oldestReview = review.reduce<string | null>((oldest, file) => !oldest || file.createdAt < oldest ? file.createdAt : oldest, null);
    const latestUpload = uploads.reduce<string | null>((latest, file) => !latest || (file.clientUploadedAt || '') > latest ? file.clientUploadedAt : latest, null);
    const next = [...due].sort((a, b) => (a.signals.keyDays ?? 0) - (b.signals.keyDays ?? 0)).find(file => (file.signals.keyDays ?? -1) >= 0);
    const byArea = AREA_LIST.map(area => active.filter(file => file.area === area).length);
    return {
      active, review, uploads, due,
      reviewNote: review.length ? `Oldest arrived ${relativeTime(oldestReview)}` : 'All intakes reviewed',
      uploadNote: uploads.length ? `Latest arrived ${relativeTime(latestUpload)}` : 'Nothing new from clients',
      dueNote: [overdue ? `${overdue} overdue` : '',
        next?.signals.keyDate ? `Next ${formatTableDate(next.signals.keyDate.date, today)}, ${next.signals.keyDate.label.toLowerCase()}` : '']
        .filter(Boolean).join(' · ') || 'No dates this week',
      activeNote: `Landlord ${byArea[0]} · Traffic ${byArea[1]} · Other ${byArea[2]}`,
    };
  }, [workspace.files, today]);

  const queue = useMemo(() => {
    switch (filter) {
      case 'needs_review': return [...kpis.review].sort(compareUrgency);
      case 'client_uploaded': return [...kpis.uploads].sort(compareUrgency);
      case 'due': return [...kpis.due].sort((a, b) => (a.signals.keyDays ?? 0) - (b.signals.keyDays ?? 0));
      case 'active': return [...kpis.active].sort(compareUrgency);
      default: return attention;
    }
  }, [filter, kpis, attention]);

  const fileById = useMemo(() => new Map(workspace.files.map(file => [file.id, file])), [workspace.files]);
  const activity = useMemo(() => workspace.events
    .filter(item => item.row.event !== 'documents_uploaded')
    .map(item => ({ item, file: fileById.get(item.fileId) }))
    .filter(entry => entry.file)
    .slice(0, 14), [workspace.events, fileById]);

  const counts: Record<QueueFilter, number> = {
    attention: attention.length, needs_review: kpis.review.length, client_uploaded: kpis.uploads.length,
    due: kpis.due.length, active: kpis.active.length,
  };
  const loading = workspace.loading;

  return <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-9">
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="ahs-eyebrow">{longTodayLine()} · Toronto</p>
        <h1 className="ahs-display ahs-page-title mt-2">Today</h1>
      </div>
      <div className="flex items-center gap-2">
        {workspace.updatedAt > 0 && <span className="hidden text-[12px] text-[color:var(--ah-muted)] sm:inline">Updated {formatClock(workspace.updatedAt)}</span>}
        <Button size="sm" variant="secondary" icon onClick={workspace.refetch} aria-label="Refresh" title="Refresh">
          <RefreshCw className={cn(workspace.fetching && 'animate-spin')} aria-hidden="true" />
        </Button>
        <Button size="sm" variant="primary" onClick={() => openNewFile()} className="max-sm:!hidden"><Plus aria-hidden="true" />New file</Button>
      </div>
    </header>

    {workspace.error && <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 rounded-[6px] border border-[#ead88f] bg-[#fbf3d4] px-4 py-3 text-[13px] text-[color:var(--ah-warn-ink)]">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">Some files could not be loaded, so counts may be incomplete.</span>
      <Button size="xs" variant="secondary" onClick={workspace.refetch}>Try again</Button>
    </div>}

    <section aria-label="Key numbers" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile label="Needs review" value={kpis.review.length} note={kpis.reviewNote} icon={<FileSearch aria-hidden="true" />}
        pressed={filter === 'needs_review'} onClick={() => setFilter(filter === 'needs_review' ? 'attention' : 'needs_review')} loading={loading} />
      <KpiTile label="Client uploads waiting" value={kpis.uploads.length} note={kpis.uploadNote} icon={<Upload aria-hidden="true" />}
        pressed={filter === 'client_uploaded'} onClick={() => setFilter(filter === 'client_uploaded' ? 'attention' : 'client_uploaded')} loading={loading} />
      <KpiTile label="Due within 7 days" value={kpis.due.length} note={kpis.dueNote} icon={<CalendarClock aria-hidden="true" />}
        pressed={filter === 'due'} onClick={() => setFilter(filter === 'due' ? 'attention' : 'due')} loading={loading} />
      <KpiTile label="Active files" value={kpis.active.length} note={kpis.activeNote} icon={<FolderOpen aria-hidden="true" />}
        pressed={filter === 'active'} onClick={() => setFilter(filter === 'active' ? 'attention' : 'active')} loading={loading} />
    </section>

    <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_384px]">
      <Card labelledBy="queue-title">
        <CardHead id="queue-title" title={<span className="flex items-center gap-2">Attention queue
          {!loading && <span className="ahs-count">{attention.length}</span>}</span>}
          sub="Across Landlord, Traffic and Other, most urgent first." />
        <div className="ahs-scroll-x border-b border-[color:var(--ahs-line-soft)] px-4 py-2.5 sm:px-5" role="group" aria-label="Queue filters">
          <div className="flex w-max gap-1.5">
            {FILTERS.map(item => <button key={item.value} type="button" className="ahs-filter" aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}>
              {item.label}<span className="ahs-count">{loading ? '·' : counts[item.value]}</span>
            </button>)}
          </div>
        </div>
        {loading ? <QueueSkeleton />
          : queue.length ? <ul className="ahs-divide" aria-label={FILTERS.find(item => item.value === filter)?.label}>
            {queue.map(file => <QueueRow key={file.key} file={file} today={today} />)}
          </ul>
          : !workspace.files.length && !workspace.error
            ? <EmptyState icon={<FolderOpen />} title="No files yet"
              action={<Button variant="primary" onClick={() => openNewFile()}><Plus aria-hidden="true" />New file</Button>}>
              New intakes from anderhue.ca appear here. You can also open a file for a phone or walk-in client.
            </EmptyState>
            : <EmptyState icon={<CheckCircle2 />} title={filter === 'attention' ? 'Nothing needs attention right now' : 'No files here'}>
              {filter === 'attention'
                ? 'New intakes, client uploads, open requests and close dates appear here as they happen.'
                : 'Pick another filter to see more files.'}
            </EmptyState>}
      </Card>

      <Card labelledBy="activity-title">
        <CardHead id="activity-title" title="Recent activity" sub="Latest events across all files." />
        {workspace.eventsLoading ? <div className="space-y-4 px-5 py-4" aria-hidden="true">
          {[0, 1, 2, 3].map(index => <div key={index} className="flex gap-3"><Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-44" /><Skeleton className="h-3 w-32" /></div></div>)}
        </div>
          : workspace.eventsError ? <p role="alert" className="px-5 py-6 text-[13px] text-[color:var(--ah-muted)]">Activity could not be loaded.</p>
          : activity.length ? <ul className="ahs-divide">
            {activity.map(({ item, file }) => {
              const summary = describeEvent(file!.area, item.row);
              const Icon = summary.actor === 'client' ? Inbox : summary.actor === 'staff' ? UserRound : ArrowUpRight;
              return <li key={`${item.table}-${item.row.id}`}>
                <Link to={fileHref(file!.area, file!.id)} className="ahs-row-link px-4 py-3 sm:px-5">
                  <div className="flex items-start gap-3">
                    <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      summary.actor === 'client' ? 'bg-[#f4e8d0] text-[#644a1e]' : summary.actor === 'staff' ? 'bg-[#efe8f2] text-[#4f2c69]' : 'bg-[color:var(--ah-ivory-200)] text-[color:var(--ah-ink-2)]')}
                      aria-hidden="true"><Icon className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold leading-5 text-[color:var(--ah-ink)]">{summary.title}</p>
                      <p className="truncate text-[12px] text-[color:var(--ah-muted)]">
                        <span className="ahs-mono text-[11.5px]">{file!.number}</span> · {file!.clientName}
                        {summary.detail ? ` · ${summary.detail}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap pt-0.5 text-[11.5px] text-[color:var(--ah-muted)]">{relativeTime(item.row.at)}</span>
                  </div>
                </Link>
              </li>;
            })}
          </ul>
          : <EmptyState compact icon={<Inbox />} title="No activity yet">Stage changes, uploads and requests appear here.</EmptyState>}
      </Card>
    </div>
  </div>;
}
