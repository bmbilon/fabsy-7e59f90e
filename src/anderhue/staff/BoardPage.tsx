import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, FolderOpen, List, Plus, RefreshCw,
  Search, SearchX, X,
} from 'lucide-react';
import useSafeHead from '@/hooks/useSafeHead';
import { cn } from '@/lib/utils';
import { STAGES, type PracticeArea } from './catalog';
import { formatTableDate, relativeTime } from './format';
import { useLocalStorageState, useWorkspace } from './hooks';
import {
  AREA_PAGE_TITLE, KEY_DATE_SHORT, PORTAL_HOLD_LABEL, compareRecent, compareUrgency, dateTone, fileHref, laneStages, matchesQuery,
  outcomeLabel, relativeDays, stageIndex, type FileWithSignals,
} from './model';
import { useStaffUi } from './session';
import { Button, DateChip, EmptyState, PortalHoldBadge, ReasonChips, Skeleton, StagePill } from './ui';

type Filter = 'all' | 'attention' | 'due' | 'uploaded';
type View = 'board' | 'list';
type SortKey = 'number' | 'client' | 'title' | 'stage' | 'flags' | 'date' | 'updated';

const FILTERS: { value: Filter; label: string; test: (file: FileWithSignals) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'attention', label: 'Needs attention', test: file => file.signals.attention },
  { value: 'due', label: 'Due soon', test: file => file.signals.dueSoon },
  { value: 'uploaded', label: 'Client uploaded', test: file => file.signals.clientUploadWaiting },
];

const EYEBROW: Record<PracticeArea, string> = {
  ltb: 'Landlord and Tenant Board', traffic: 'Provincial offences', general: 'Paralegal matters',
};

const NEW_LABEL: Record<PracticeArea, string> = { ltb: 'New landlord file', traffic: 'New traffic ticket', general: 'New matter' };

const EMPTY_COPY: Record<PracticeArea, { title: string; body: string }> = {
  ltb: { title: 'No landlord files yet', body: 'New intakes from anderhue.ca/landlords appear here. You can also open a file for a phone or walk-in client.' },
  traffic: { title: 'No traffic tickets yet', body: 'Tickets sent from anderhue.ca/traffic-tickets appear here. You can also open a file for a phone or walk-in client.' },
  general: { title: 'No other matters yet', body: 'Requests from anderhue.ca/other-matters appear here. You can also open a file for a phone or walk-in client.' },
};

/** Flags shown on cards and rows. Due and overdue are carried by the date chip. */
const cardReasons = (file: FileWithSignals) => file.signals.reasons.filter(reason => reason.key !== 'due' && reason.key !== 'overdue');

function FileCard({ file, today }: { file: FileWithSignals; today: string }) {
  const { keyDate, keyDays } = file.signals;
  const outcome = file.terminal ? outcomeLabel(file.area, file.outcome) : '';
  const spoken = [file.number, file.clientName, file.title, ...cardReasons(file).slice(0, 3).map(reason => reason.label),
    file.portalHidden ? PORTAL_HOLD_LABEL.toLowerCase() : ''].filter(Boolean).join(', ');
  return <Link to={fileHref(file.area, file.id)} className="ahs-file-card" data-attention={file.signals.attention ? 'true' : undefined}
    data-terminal={file.terminal ? 'true' : undefined} aria-label={spoken}>
    <div className="flex items-center justify-between gap-2">
      <span className="ahs-mono text-[11.5px] text-[color:var(--ah-ink-2)]">{file.number}</span>
      <span className="text-[11px] text-[color:var(--ah-muted)]" title={`Updated ${file.updatedAt}`}>{relativeTime(file.updatedAt)}</span>
    </div>
    <p className="mt-1 truncate text-[14px] font-semibold leading-5 text-[color:var(--ah-ink)]">{file.clientName}</p>
    <p className="truncate text-[12.5px] leading-5 text-[color:var(--ah-muted)]">{file.title}{file.city ? ` · ${file.city}` : ''}</p>
    {outcome && <p className="mt-1 text-[12px] font-medium text-[color:var(--ah-ink-2)]">{outcome}</p>}
    {(keyDate || cardReasons(file).length > 0) && <div className="mt-2 flex flex-wrap gap-1">
      {keyDate && <DateChip keyDate={keyDate} days={keyDays} today={today} />}
      {cardReasons(file).slice(0, 3).map(reason => <span key={reason.key} className={`ahs-chip ahs-tone-${reason.tone}`}>{reason.label}</span>)}
    </div>}
    {file.portalHidden && <div className="mt-1.5 flex"><PortalHoldBadge /></div>}
  </Link>;
}

function Lane({ area, stage, files, today, searching }: {
  area: PracticeArea; stage: string; files: FileWithSignals[]; today: string; searching: boolean;
}) {
  const def = STAGES[area].find(item => item.value === stage)!;
  const id = `lane-${area}-${stage}`;
  return <section className={`ahs-lane ahs-phase-${def.phase}`} aria-labelledby={id} data-empty={files.length ? undefined : 'true'}>
    <header className="ahs-lane-head">
      <h2 id={id} className="ahs-lane-title" title={def.staffLabel}>{def.staffLabel}</h2>
      <span className="ahs-count ml-auto" aria-label={`${files.length} files`}>{files.length}</span>
    </header>
    <div className="ahs-lane-body">
      {files.length ? files.map(file => <FileCard key={file.key} file={file} today={today} />)
        : <p className="ahs-lane-empty">{searching ? 'No matches' : 'No files'}</p>}
    </div>
  </section>;
}

function BoardView({ area, files, today, searching }: { area: PracticeArea; files: FileWithSignals[]; today: string; searching: boolean }) {
  const [closedOpen, setClosedOpen] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const lanes = laneStages(area);
  const grouped = useMemo(() => {
    const map = new Map<string, FileWithSignals[]>();
    for (const file of files) map.set(file.terminal ? '__closed' : file.stage, [...(map.get(file.terminal ? '__closed' : file.stage) || []), file]);
    for (const [key, list] of map) map.set(key, [...list].sort((a, b) => compareUrgency(a, b) || compareRecent(a, b)));
    return map;
  }, [files]);
  const closed = grouped.get('__closed') || [];
  const scroll = (direction: number) => board.current?.scrollBy({
    left: direction * 296, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
  return <div className="relative">
    <div className="mb-2 hidden items-center justify-end gap-1 md:flex">
      <Button size="xs" variant="ghost" icon onClick={() => scroll(-1)} aria-label="Scroll to earlier stages"><ChevronLeft aria-hidden="true" /></Button>
      <Button size="xs" variant="ghost" icon onClick={() => scroll(1)} aria-label="Scroll to later stages"><ChevronRight aria-hidden="true" /></Button>
    </div>
    <div ref={board} className="ahs-board" role="region" aria-label={`${AREA_PAGE_TITLE[area]} by stage, scroll sideways for more`} tabIndex={0}>
      {lanes.map(stage => <Lane key={stage.value} area={area} stage={stage.value} files={grouped.get(stage.value) || []} today={today} searching={searching} />)}
      {closedOpen
        ? <section className="ahs-lane ahs-phase-done" aria-labelledby={`lane-${area}-closed`}>
          <header className="ahs-lane-head">
            <h2 id={`lane-${area}-closed`} className="ahs-lane-title">Closed and declined</h2>
            <span className="ahs-count ml-auto">{closed.length}</span>
            <Button size="xs" variant="ghost" icon onClick={() => setClosedOpen(false)} aria-label="Collapse closed and declined files" aria-expanded="true">
              <ChevronLeft aria-hidden="true" />
            </Button>
          </header>
          <div className="ahs-lane-body">
            {closed.length ? closed.map(file => <FileCard key={file.key} file={file} today={today} />)
              : <p className="ahs-lane-empty">{searching ? 'No matches' : 'No closed files'}</p>}
          </div>
        </section>
        : <button type="button" className="ahs-closed-rail" onClick={() => setClosedOpen(true)} aria-expanded="false"
          aria-label={`Show ${closed.length} closed and declined files`}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span className="ahs-count">{closed.length}</span>
          <span className="ahs-closed-rail-label">Closed and declined</span>
        </button>}
    </div>
  </div>;
}

function SortHeader({ label, value, sort, onSort, className }: {
  label: string; value: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (key: SortKey) => void; className?: string;
}) {
  const active = sort.key === value;
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return <th scope="col" className={className} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className="ahs-sort" onClick={() => onSort(value)}>
      {label}<Icon aria-hidden="true" className={active ? 'text-[color:var(--ah-plum-600)]' : 'opacity-50'} />
    </button>
  </th>;
}

function ListView({ area, files, today }: { area: PracticeArea; files: FileWithSignals[]; today: string }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'updated', dir: -1 });
  const onSort = (key: SortKey) => setSort(current => current.key === key
    ? { key, dir: current.dir === 1 ? -1 : 1 }
    : { key, dir: key === 'updated' || key === 'flags' ? -1 : 1 });
  const rows = useMemo(() => {
    const value = (file: FileWithSignals): string | number => {
      switch (sort.key) {
        case 'number': return file.number;
        case 'client': return file.clientName.toLocaleLowerCase('en-CA');
        case 'title': return file.title.toLocaleLowerCase('en-CA');
        case 'stage': return stageIndex(area, file.stage);
        case 'flags': return file.signals.urgency;
        case 'date': return file.signals.keyDate?.date || (sort.dir === 1 ? '9999' : '0000');
        default: return Date.parse(file.updatedAt) || 0;
      }
    };
    return [...files].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
      return order * sort.dir || compareRecent(a, b);
    });
  }, [files, sort, area]);

  return <>
    <div className="ahs-card hidden overflow-hidden md:block">
      <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
        <table className="ahs-table ahs-table-fixed">
          <caption className="sr-only">{AREA_PAGE_TITLE[area]}. Select a column heading to sort.</caption>
          <thead>
            <tr>
              <SortHeader label="File" value="number" sort={sort} onSort={onSort} className="w-[12%]" />
              <SortHeader label="Client" value="client" sort={sort} onSort={onSort} className="w-[19%]" />
              <SortHeader label="Matter" value="title" sort={sort} onSort={onSort} className="hidden w-[16%] xl:table-cell" />
              <SortHeader label="Stage" value="stage" sort={sort} onSort={onSort} className="w-[21%]" />
              <SortHeader label="Flags" value="flags" sort={sort} onSort={onSort} className="hidden w-[14%] lg:table-cell" />
              <SortHeader label="Key date" value="date" sort={sort} onSort={onSort} className="w-[12%]" />
              <SortHeader label="Updated" value="updated" sort={sort} onSort={onSort} className="w-[9%] text-right" />
            </tr>
          </thead>
          <tbody>
            {rows.map(file => {
              const { keyDate, keyDays } = file.signals;
              const relative = relativeDays(keyDays);
              return <tr key={file.key} onClick={() => navigate(fileHref(file.area, file.id))}>
                <td>
                  <Link to={fileHref(file.area, file.id)} className="ahs-mono block truncate text-[12.5px] font-medium text-[color:var(--ah-plum-800)] no-underline hover:underline"
                    onClick={event => event.stopPropagation()}>{file.number}</Link>
                </td>
                <td>
                  <p className="truncate font-semibold text-[color:var(--ah-ink)]" title={file.clientName}>{file.clientName}</p>
                  <p className="truncate text-[12px] text-[color:var(--ah-muted)] xl:hidden">{file.title}{file.city ? ` · ${file.city}` : ''}</p>
                  <p className="hidden truncate text-[12px] text-[color:var(--ah-muted)] xl:block" title={file.email}>{file.email}</p>
                </td>
                <td className="hidden xl:table-cell">
                  <p className="truncate text-[color:var(--ah-ink-2)]" title={file.title}>{file.title}</p>
                  {file.city && <p className="truncate text-[12px] text-[color:var(--ah-muted)]">{file.city}</p>}
                </td>
                <td>
                  <StagePill area={file.area} stage={file.stage} outcome={file.outcome} className="max-w-full" />
                  {file.portalHidden && <div className="mt-1 flex min-w-0"><PortalHoldBadge /></div>}
                </td>
                <td className="hidden lg:table-cell"><ReasonChips reasons={cardReasons(file)} max={2} /></td>
                <td>
                  {keyDate ? <div className="min-w-0">
                    <p className={`ahs-mono truncate text-[12.5px] font-medium ahs-date-text ahs-tone-${dateTone(keyDays)}`}>{formatTableDate(keyDate.date, today)}</p>
                    <p className="truncate text-[11.5px] text-[color:var(--ah-muted)]" title={keyDate.label}>{KEY_DATE_SHORT[keyDate.kind]}{relative ? ` · ${relative}` : ''}</p>
                  </div> : <span className="text-[12px] text-[color:var(--ah-muted)]">None</span>}
                </td>
                <td className="truncate text-right text-[12px] text-[color:var(--ah-muted)]" title={file.updatedAt}>
                  {relativeTime(file.updatedAt)}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
    <ul className="ahs-card ahs-divide md:hidden" aria-label={AREA_PAGE_TITLE[area]}>
      {rows.map(file => <li key={file.key}>
        <Link to={fileHref(file.area, file.id)} className="ahs-row-link px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="ahs-mono text-[12px] text-[color:var(--ah-ink-2)]">{file.number}</span>
            <StagePill area={file.area} stage={file.stage} />
          </div>
          <p className="mt-1 truncate text-[14px] font-semibold">{file.clientName}</p>
          <p className="truncate text-[12.5px] text-[color:var(--ah-muted)]">{file.title}{file.city ? ` · ${file.city}` : ''}</p>
          {(file.signals.keyDate || cardReasons(file).length > 0 || file.portalHidden) && <div className="mt-2 flex flex-wrap gap-1">
            {file.signals.keyDate && <DateChip keyDate={file.signals.keyDate} days={file.signals.keyDays} today={today} />}
            {cardReasons(file).slice(0, 3).map(reason => <span key={reason.key} className={`ahs-chip ahs-tone-${reason.tone}`}>{reason.label}</span>)}
            {file.portalHidden && <PortalHoldBadge />}
          </div>}
        </Link>
      </li>)}
    </ul>
  </>;
}

function BoardSkeleton({ view }: { view: View }) {
  if (view === 'list') return <div className="ahs-card space-y-0 overflow-hidden" aria-hidden="true">
    {[0, 1, 2, 3, 4, 5].map(index => <div key={index} className="flex items-center gap-6 border-b border-[color:var(--ahs-line-soft)] px-4 py-4">
      <Skeleton className="h-3.5 w-24" /><Skeleton className="h-3.5 w-40" /><Skeleton className="hidden h-3.5 w-32 md:block" /><Skeleton className="ml-auto h-5 w-24 rounded-full" />
    </div>)}
  </div>;
  return <div className="ahs-board" aria-hidden="true">
    {[0, 1, 2, 3].map(lane => <div key={lane} className="ahs-lane ahs-phase-done">
      <div className="ahs-lane-head"><Skeleton className="h-3.5 w-24" /></div>
      <div className="ahs-lane-body">
        {Array.from({ length: 3 - (lane % 2) }, (_, index) => <div key={index} className="ahs-file-card space-y-2">
          <Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-28" />
        </div>)}
      </div>
    </div>)}
  </div>;
}

export default function BoardPage({ area }: { area: PracticeArea }) {
  useSafeHead({ title: `${AREA_PAGE_TITLE[area]} | AnderHue Paralegal`, robots: 'noindex, nofollow' });
  const workspace = useWorkspace();
  const { openNewFile } = useStaffUi();
  const [view, setView] = useLocalStorageState<View>('anderhue.staff.boardView', 'board', ['board', 'list']);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const files = workspace.byArea[area];
  const state = workspace.areaState[area];

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: files.length, attention: 0, due: 0, uploaded: 0 };
    for (const item of FILTERS) if (item.value !== 'all') result[item.value] = files.filter(item.test).length;
    return result;
  }, [files]);
  const active = files.filter(file => !file.terminal).length;
  const closed = files.length - active;

  const visible = useMemo(() => {
    const test = FILTERS.find(item => item.value === filter)!.test;
    return files.filter(file => test(file) && matchesQuery(file, search));
  }, [files, filter, search]);

  const filtering = filter !== 'all' || search.trim().length > 0;
  const clear = () => { setFilter('all'); setSearch(''); };

  return <div className="mx-auto max-w-[1680px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-9">
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="ahs-eyebrow">{EYEBROW[area]}</p>
        <h1 className="ahs-display ahs-page-title mt-2">{AREA_PAGE_TITLE[area]}</h1>
        <p className="mt-2 text-[13px] text-[color:var(--ah-ink-2)]" aria-live="polite">
          {state.loading ? 'Loading files…' : <>
            <span className="font-semibold text-[color:var(--ah-ink)]">{active}</span> active
            <span className="mx-1.5 text-[color:var(--ah-line-strong)]">·</span>
            <span className="font-semibold text-[color:var(--ah-ink)]">{counts.attention}</span> need attention
            <span className="mx-1.5 text-[color:var(--ah-line-strong)]">·</span>
            <span className="font-semibold text-[color:var(--ah-ink)]">{closed}</span> closed
          </>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" icon onClick={workspace.refetch} aria-label="Refresh" title="Refresh">
          <RefreshCw className={cn(state.fetching && 'animate-spin')} aria-hidden="true" />
        </Button>
        <Button size="sm" variant="primary" onClick={() => openNewFile(area)} className="max-sm:!hidden"><Plus aria-hidden="true" />New file</Button>
      </div>
    </header>

    <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative w-full lg:max-w-[360px] lg:flex-none">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ah-muted)]" aria-hidden="true" />
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={120}
          className="ahs-input !pl-9 !pr-9" placeholder="Search name, number, email or city"
          aria-label={`Search ${AREA_PAGE_TITLE[area].toLowerCase()}`} />
        {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[5px] text-[color:var(--ah-muted)] hover:bg-[color:var(--ah-ivory-100)]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>}
      </div>
      <div className="ahs-scroll-x -mx-4 px-4 lg:mx-0 lg:px-0" role="group" aria-label="Filters">
        <div className="flex w-max gap-1.5">
          {FILTERS.map(item => <button key={item.value} type="button" className="ahs-filter" aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}>
            {item.label}<span className="ahs-count">{state.loading ? '·' : counts[item.value]}</span>
          </button>)}
        </div>
      </div>
      <div className="ahs-seg lg:ml-auto self-start" role="group" aria-label="View">
        <button type="button" className="ahs-seg-btn" aria-pressed={view === 'board'} onClick={() => setView('board')}>
          <Columns3 aria-hidden="true" />Board
        </button>
        <button type="button" className="ahs-seg-btn" aria-pressed={view === 'list'} onClick={() => setView('list')}>
          <List aria-hidden="true" />List
        </button>
      </div>
    </div>

    {state.error && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-[6px] border border-[#ead88f] bg-[#fbf3d4] px-4 py-3 text-[13px] text-[color:var(--ah-warn-ink)]">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">Files could not be loaded. Check your connection and try again.</span>
      <Button size="xs" variant="secondary" onClick={workspace.refetch}>Try again</Button>
    </div>}

    {filtering && !state.loading && <p className="mt-4 text-[12.5px] text-[color:var(--ah-ink-2)]" role="status">
      Showing {visible.length} of {files.length} files
      <button type="button" className="ahs-link ml-2" onClick={clear}>Clear filters</button>
    </p>}

    <div className="mt-4">
      {state.loading ? <BoardSkeleton view={view} />
        : !files.length && !state.error ? <div className="ahs-card">
          <EmptyState icon={<FolderOpen />} title={EMPTY_COPY[area].title}
            action={<Button variant="primary" onClick={() => openNewFile(area)}><Plus aria-hidden="true" />{NEW_LABEL[area]}</Button>}>
            {EMPTY_COPY[area].body}
          </EmptyState>
        </div>
        : filtering && !visible.length ? <div className="ahs-card">
          <EmptyState icon={<SearchX />} title="No files match"
            action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}>
            {search.trim() ? <>Nothing matches “{search.trim()}”{filter !== 'all' ? ' with this filter' : ''}.</> : 'No files have this flag right now.'}
          </EmptyState>
        </div>
        : view === 'board' ? <BoardView area={area} files={visible} today={workspace.today} searching={filtering} />
          : <ListView area={area} files={visible} today={workspace.today} />}
    </div>
  </div>;
}
