import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck2, CornerDownLeft, Plus, Search } from 'lucide-react';
import type { PracticeArea } from './catalog';
import {
  AREA_LIST, AREA_PAGE_TITLE, boardHref, compareRecent, compareUrgency, fileHref, matchesQuery, type FileWithSignals,
} from './model';
import { AreaIcon, Kbd, StagePill } from './ui';

interface Action {
  id: string;
  label: string;
  keywords: string;
  icon: ReactNode;
  run: () => void;
}

function FileItem({ file, onSelect }: { file: FileWithSignals; onSelect: () => void }) {
  return <Command.Item value={file.key} onSelect={onSelect} className="group">
    <span className={`ahs-area ahs-area-${file.area} !h-8 !w-8 !justify-center !p-0 shrink-0 [&_svg]:!h-4 [&_svg]:!w-4`} aria-hidden="true">
      <AreaIcon area={file.area} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="ahs-mono shrink-0 text-[12px] text-[color:var(--ah-ink-2)]">{file.number}</span>
        <span className="truncate font-semibold">{file.clientName}</span>
      </span>
      <span className="block truncate text-[12px] text-[color:var(--ah-muted)]">
        {[file.title, file.city, file.email].filter(Boolean).join(' · ')}
      </span>
    </span>
    <StagePill area={file.area} stage={file.stage} className="max-sm:!hidden" />
    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[color:var(--ah-muted)] opacity-0 group-data-[selected=true]:opacity-100" aria-hidden="true" />
  </Command.Item>;
}

/** ⌘K / Ctrl+K: every loaded file (number, client, email, phone, city, matter) plus workspace actions. */
export default function CommandPalette({ open, onOpenChange, files, loading, onNewFile }: {
  open: boolean; onOpenChange: (open: boolean) => void; files: FileWithSignals[]; loading: boolean;
  onNewFile: (area?: PracticeArea) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const go = (path: string) => { onOpenChange(false); navigate(path); };
  const trimmed = query.trim();

  const results = useMemo(() => {
    if (!trimmed) return files.filter(file => file.signals.attention).sort(compareUrgency).slice(0, 6);
    return files.filter(file => matchesQuery(file, trimmed))
      .sort((a, b) => Number(a.terminal) - Number(b.terminal) || compareRecent(a, b))
      .slice(0, 30);
  }, [files, trimmed]);

  const actions: Action[] = useMemo(() => [
    { id: 'new', label: 'New file', keywords: 'new file open create add matter client phone walk-in', icon: <Plus />, run: () => { onOpenChange(false); onNewFile(); } },
    ...AREA_LIST.map(area => ({
      id: `new-${area}`, label: `New ${({ ltb: 'landlord file', traffic: 'traffic ticket', general: 'other matter' })[area]}`,
      keywords: `new create ${area} ${AREA_PAGE_TITLE[area]}`, icon: <Plus />, run: () => { onOpenChange(false); onNewFile(area); },
    })),
    { id: 'today', label: 'Go to Today', keywords: 'today attention queue dashboard home', icon: <CalendarCheck2 />, run: () => go('/admin/today') },
    ...AREA_LIST.map(area => ({
      id: `board-${area}`, label: `Go to ${AREA_PAGE_TITLE[area]}`, keywords: `board list ${area} ${AREA_PAGE_TITLE[area]}`,
      icon: <AreaIcon area={area} />, run: () => go(boardHref(area)),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [onNewFile, onOpenChange]);

  const visibleActions = trimmed
    ? actions.filter(action => `${action.label} ${action.keywords}`.toLocaleLowerCase('en-CA').includes(trimmed.toLocaleLowerCase('en-CA')))
    : actions.filter(action => !action.id.startsWith('new-'));

  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ahs-overlay" />
      <DialogPrimitive.Content className="ahs-dialog ahs-palette overflow-hidden" aria-describedby="ahs-palette-help">
        <DialogPrimitive.Title className="sr-only">Search files and actions</DialogPrimitive.Title>
        <DialogPrimitive.Description id="ahs-palette-help" className="sr-only">
          Search by file number, client name, email, phone, city or matter. Use the arrow keys and Enter to open.
        </DialogPrimitive.Description>
        <Command shouldFilter={false} loop label="Search files and actions" className="flex min-h-0 flex-col">
          <div className="flex items-center gap-3 border-b border-[color:var(--ahs-line-soft)] px-4">
            <Search className="h-[18px] w-[18px] shrink-0 text-[color:var(--ah-gold-600)]" aria-hidden="true" />
            <Command.Input value={query} onValueChange={setQuery} maxLength={120} autoFocus
              placeholder="Search by number, client, email, phone or city" aria-label="Search files" />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List>
            {loading && !files.length && <Command.Loading><p className="px-3 py-6 text-center text-[13px] text-[color:var(--ah-muted)]">Loading files…</p></Command.Loading>}
            <Command.Empty>No files or actions match “{trimmed}”.</Command.Empty>
            {results.length > 0 && <Command.Group heading={trimmed ? `Files · ${results.length}${results.length === 30 ? '+' : ''}` : 'Needs attention'}>
              {results.map(file => <FileItem key={file.key} file={file} onSelect={() => go(fileHref(file.area, file.id))} />)}
            </Command.Group>}
            {visibleActions.length > 0 && <Command.Group heading="Actions">
              {visibleActions.map(action => <Command.Item key={action.id} value={`action-${action.id}`} onSelect={action.run}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[color:var(--ah-ivory-100)] text-[color:var(--ah-plum-600)] [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{action.icon}</span>
                <span className="flex-1 font-medium">{action.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-[color:var(--ah-muted)]" aria-hidden="true" />
              </Command.Item>)}
            </Command.Group>}
          </Command.List>
          <div className="hidden items-center gap-4 border-t border-[color:var(--ahs-line-soft)] bg-[color:var(--ah-ivory-50)] px-4 py-2 text-[11.5px] text-[color:var(--ah-muted)] sm:flex">
            <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
            <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd> to open</span>
            <span className="ml-auto">{files.length} files loaded</span>
          </div>
        </Command>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
