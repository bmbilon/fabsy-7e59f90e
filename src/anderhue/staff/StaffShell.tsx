import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { CalendarCheck2, LogOut, Menu, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PracticeArea } from './catalog';
import CommandPalette from './CommandPalette';
import NewFileDialog from './dialogs/NewFileDialog';
import { isTypingTarget, searchShortcutLabel } from './format';
import { useWorkspace } from './hooks';
import { AREA_LIST, AREA_PAGE_TITLE, boardHref } from './model';
import { StaffUiContext, useStaffSession, type StaffUiValue } from './session';
import { AreaIcon, Button, CrestMark, Kbd, StaffSheet } from './ui';

function currentArea(pathname: string): PracticeArea | null {
  if (pathname.startsWith('/admin/landlord') || pathname.startsWith('/admin/files/ltb/')) return 'ltb';
  if (pathname.startsWith('/admin/traffic') || pathname.startsWith('/admin/files/traffic/')) return 'traffic';
  if (pathname.startsWith('/admin/other') || pathname.startsWith('/admin/files/general/')) return 'general';
  return null;
}

interface NavCounts { today: number; ltb: number; traffic: number; general: number }

function SidebarContent({ counts, loading, onNewFile, onSearch }: {
  counts: NavCounts; loading: boolean; onNewFile: () => void; onSearch: () => void;
}) {
  const { email, roleLabel, signOut } = useStaffSession();
  const { pathname } = useLocation();
  const area = currentArea(pathname);
  const shortcut = searchShortcutLabel();
  const items = [
    { href: '/admin/today', label: 'Today', icon: <CalendarCheck2 aria-hidden="true" />, count: counts.today, alert: true,
      active: pathname.startsWith('/admin/today'), exact: pathname.startsWith('/admin/today'),
      hint: 'files need attention' },
    ...AREA_LIST.map(item => ({
      href: boardHref(item), label: { ltb: 'Landlord', traffic: 'Traffic', general: 'Other' }[item],
      icon: <AreaIcon area={item} />, count: counts[item], alert: false,
      active: area === item, exact: pathname === boardHref(item), hint: 'active files',
    })),
  ];
  return <div className="flex h-full min-h-0 flex-col">
    <Link to="/admin/today" className="mx-3 mt-4 flex items-center gap-3 rounded-[6px] px-2 py-2 no-underline" aria-label="AnderHue Paralegal, Today">
      <CrestMark className="h-10 w-10 shrink-0" />
      <span className="min-w-0">
        <span className="ahs-brand-name block">AnderHue Paralegal</span>
        <span className="ahs-brand-sub mt-1 block">Practice workspace</span>
      </span>
    </Link>
    <div className="mt-4 space-y-2 px-3">
      <Button variant="gold" block onClick={onNewFile}><Plus aria-hidden="true" />New file</Button>
      <button type="button" className="ahs-search-trigger" onClick={onSearch} aria-keyshortcuts="Meta+K Control+K"
        aria-label={`Search files (${shortcut})`}>
        <Search aria-hidden="true" /><span className="flex-1">Search files</span><Kbd>{shortcut}</Kbd>
      </button>
    </div>
    <nav aria-label="Workspace" className="mt-5 px-3">
      <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[rgb(213_180_124/0.7)]">Workspace</p>
      <ul className="space-y-0.5">
        {items.map(item => <li key={item.href}>
          <Link to={item.href} className="ahs-nav-link" data-active={item.active ? 'true' : undefined}
            aria-current={item.exact ? 'page' : item.active ? 'location' : undefined}>
            {item.icon}
            <span className="flex-1 truncate">{item.label}</span>
            {!loading && <span className={cn('ahs-nav-count', item.alert && item.count > 0 && 'ahs-nav-count-alert')}
              aria-label={`${item.count} ${item.hint}`}>{item.count}</span>}
          </Link>
        </li>)}
      </ul>
    </nav>
    <div className="ahs-sidebar-rule mt-auto px-5 pb-5 pt-4">
      <p className="truncate text-[13px] font-semibold text-[color:var(--ah-ivory-50)]" title={email}>{email}</p>
      <p className="mt-0.5 text-[11.5px] font-medium text-[color:var(--ah-gold-300)]">{roleLabel}</p>
      <button type="button" onClick={() => void signOut()}
        className="mt-3 inline-flex h-8 items-center gap-2 rounded-[6px] px-2.5 -ml-2.5 text-[12.5px] font-semibold text-[rgb(247_241_232/0.78)] transition-colors hover:bg-[rgb(255_255_255/0.08)] hover:text-[color:var(--ah-ivory-50)]">
        <LogOut className="h-4 w-4" aria-hidden="true" />Sign out
      </button>
    </div>
  </div>;
}

/** Workspace frame: sidebar (desktop), top bar and menu sheet (mobile), command palette and New file. */
export default function StaffShell() {
  const workspace = useWorkspace();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newFile, setNewFile] = useState<{ open: boolean; area: PracticeArea | null }>({ open: false, area: null });
  const area = currentArea(location.pathname);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(open => !open);
        return;
      }
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !isTypingTarget(event.target)
        && !document.querySelector('[role="dialog"]')) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => { setMenuOpen(false); setSearchOpen(false); }, [location.pathname]);

  const counts = useMemo<NavCounts>(() => {
    const next: NavCounts = { today: 0, ltb: 0, traffic: 0, general: 0 };
    for (const file of workspace.files) {
      if (file.signals.attention) next.today += 1;
      if (!file.terminal) next[file.area] += 1;
    }
    return next;
  }, [workspace.files]);

  const ui = useMemo<StaffUiValue>(() => ({
    openNewFile: (next?: PracticeArea) => { setMenuOpen(false); setSearchOpen(false); setNewFile({ open: true, area: next || null }); },
    openSearch: () => { setMenuOpen(false); setSearchOpen(true); },
  }), []);

  const sidebar = (mobile: boolean) => <SidebarContent counts={counts} loading={workspace.loading}
    onNewFile={() => ui.openNewFile(area || undefined)} onSearch={ui.openSearch} key={mobile ? 'mobile' : 'desktop'} />;

  const pageTitle = area ? AREA_PAGE_TITLE[area] : 'Today';

  return <StaffUiContext.Provider value={ui}>
    <div className="ahs-root ahs-shell">
      <a href="#ahs-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-[6px] focus:bg-white focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold">
        Skip to content
      </a>
      <aside className="ahs-sidebar fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block" aria-label="Workspace navigation">
        {sidebar(false)}
      </aside>
      <header className="ahs-topbar sticky top-0 z-40 flex h-14 items-center gap-1 px-2 lg:hidden">
        <button type="button" className="ahs-icon-btn-dark" aria-label="Open the menu" onClick={() => setMenuOpen(true)}>
          <Menu aria-hidden="true" />
        </button>
        <Link to="/admin/today" className="flex min-w-0 flex-1 items-center gap-2 px-1 no-underline">
          <CrestMark className="h-8 w-8 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold leading-tight text-[color:var(--ah-ivory-50)]">AnderHue Paralegal</span>
            <span className="block truncate text-[11px] text-[color:var(--ah-gold-300)]">{pageTitle}</span>
          </span>
        </Link>
        <button type="button" className="ahs-icon-btn-dark" aria-label="Search files" onClick={ui.openSearch}>
          <Search aria-hidden="true" />
        </button>
        <button type="button" className="ahs-icon-btn-dark" aria-label="New file" onClick={() => ui.openNewFile(area || undefined)}>
          <Plus aria-hidden="true" />
        </button>
      </header>
      <StaffSheet open={menuOpen} onOpenChange={setMenuOpen} side="left" title="Menu" description="Workspace navigation" hideHeader
        className="ahs-sidebar">
        {sidebar(true)}
      </StaffSheet>
      <main id="ahs-main" className="min-w-0 lg:pl-[248px]" tabIndex={-1}>
        <Outlet />
      </main>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} files={workspace.files}
        loading={workspace.loading} onNewFile={next => ui.openNewFile(next)} />
      <NewFileDialog open={newFile.open} initialArea={newFile.area || area || 'ltb'}
        onOpenChange={open => setNewFile(current => ({ ...current, open }))} />
    </div>
  </StaffUiContext.Provider>;
}
