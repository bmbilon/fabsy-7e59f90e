import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowLeft, ArrowRightLeft, Copy, FileQuestion, Link2Off, MailQuestion, MoreHorizontal, RefreshCw, Upload } from 'lucide-react';
import useSafeHead from '@/hooks/useSafeHead';
import { isArea, type PracticeArea } from './catalog';
import { friendlyError, isUuid, revokePortalAccess } from './api';
import ChangeStageDialog from './dialogs/ChangeStageDialog';
import RequestDocumentsDialog from './dialogs/RequestDocumentsDialog';
import UploadDialog from './dialogs/UploadDialog';
import ActivityCard from './file/ActivityCard';
import ClientCard from './file/ClientCard';
import DetailsCard from './file/DetailsCard';
import DocumentsCard from './file/DocumentsCard';
import NoticesCard from './file/NoticesCard';
import RequestCard from './file/RequestCard';
import ReviewCard from './file/ReviewCard';
import StageCard from './file/StageCard';
import type { FileView } from './file/types';
import { useFileDetail, usePracticeSettings, useRefreshAfterWrite, useWorkspace } from './hooks';
import { AREA_PAGE_TITLE, boardHref, computeSignals, toStaffFile, type NoticeRow } from './model';
import { notifyError, notifySuccess } from './notify';
import { AreaChip, Button, ButtonLink, ConfirmDialog, DateChip, EmptyState, ReasonChips, ReviewPill, Skeleton, StagePill } from './ui';

type DialogName = 'stage' | 'request' | 'upload' | 'revoke' | null;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'sr-only';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function Unavailable({ area, message }: { area: PracticeArea | null; message: string }) {
  return <div className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-10">
    <Link to={area ? boardHref(area) : '/admin/today'} className="ahs-link inline-flex items-center gap-1.5 text-[13px]">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />{area ? AREA_PAGE_TITLE[area] : 'Today'}
    </Link>
    <div className="ahs-card mt-5">
      <EmptyState icon={<FileQuestion />} title={message} action={<ButtonLink to="/admin/today" variant="secondary">Go to Today</ButtonLink>}>
        Check the link, or search for the file with the search bar.
      </EmptyState>
    </div>
  </div>;
}

function FileSkeleton() {
  return <div aria-hidden="true">
    <div className="border-b border-[color:var(--ah-line)] bg-[color:var(--ah-ivory-100)] px-4 py-4 sm:px-6 lg:px-10">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-3 h-3.5 w-36" />
      <Skeleton className="mt-2 h-7 w-64 max-w-full" />
      <div className="mt-3 flex gap-2"><Skeleton className="h-6 w-28 rounded-full" /><Skeleton className="h-6 w-24" /></div>
    </div>
    <div className="mx-auto grid max-w-[1480px] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-10">
      <div className="space-y-5">{['h-40', 'h-72', 'h-56'].map(height => <div key={height} className="ahs-card p-5"><Skeleton className="h-4 w-32" /><Skeleton className={`mt-4 w-full ${height}`} /></div>)}</div>
      <div className="space-y-5">{[0, 1, 2].map(index => <div key={index} className="ahs-card space-y-3 p-5"><Skeleton className="h-4 w-24" /><Skeleton className="h-16 w-full" /></div>)}</div>
    </div>
  </div>;
}

export default function FilePage() {
  const params = useParams();
  const area = isArea(params.area) ? params.area : null;
  const id = params.id || '';
  const valid = Boolean(area) && isUuid(id);
  const detail = useFileDetail(area || 'ltb', id, valid);
  const practice = usePracticeSettings();
  const workspace = useWorkspace();
  const refreshAfterWrite = useRefreshAfterWrite();
  const [dialog, setDialog] = useState<DialogName>(null);
  const [revoking, setRevoking] = useState(false);
  const data = detail.data;
  const number = data ? (area === 'ltb' ? (data.record as { case_number?: string }).case_number : (data.record as { matter_number?: string }).matter_number) || '' : '';
  useSafeHead({ title: number ? `${number} | AnderHue Paralegal` : 'File | AnderHue Paralegal', robots: 'noindex, nofollow' });

  const refresh = useCallback(() => { if (area) refreshAfterWrite(area, id); }, [area, id, refreshAfterWrite]);

  const view = useMemo<FileView | null>(() => {
    if (!data || !area) return null;
    const file = toStaffFile(area, data.record);
    const staffTouchAt = data.events.find(event => event.actor_id)?.at || null;
    const latestClientNotice = data.notices.find((notice: NoticeRow) => notice.status !== 'cancelled' && notice.status !== 'superseded') || null;
    return {
      area, id, number: file.number, record: data.record, client: data.client, documents: data.documents,
      events: data.events, notices: data.notices, file,
      signals: computeSignals(file, { staffTouchAt, latestClientNotice }),
      reading: data.record.intake_review_status === 'pending_scan' || data.record.intake_review_status === 'scanning',
      updatesOn: practice.data?.client_updates_enabled === true,
      refresh,
    };
  }, [data, area, id, practice.data, refresh]);

  const otherFiles = useMemo(() => view
    ? workspace.files.filter(file => file.clientId === view.client.id && file.key !== view.file.key).slice(0, 6)
    : [], [workspace.files, view]);

  if (!valid) return <Unavailable area={area} message="That file link is not valid." />;
  if (detail.isPending) return <FileSkeleton />;
  if (detail.isError) {
    return <div className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-10">
      <div className="ahs-card">
        <EmptyState icon={<RefreshCw />} title="This file could not be loaded"
          action={<Button variant="primary" onClick={() => void detail.refetch()} busy={detail.isFetching}>Try again</Button>}>
          {friendlyError(detail.error, 'Check your connection and try again.')}
        </EmptyState>
      </div>
    </div>;
  }
  if (!view || !area) return <Unavailable area={area} message="This file is not available to your account." />;

  const { record, client, file, signals } = view;
  const practiceName = practice.data?.display_name || 'AnderHue Paralegal';

  const copyNumber = async () => {
    if (await copyText(view.number)) notifySuccess('File number copied', view.number);
    else notifyError('Copy failed', 'Select the file number and copy it instead.');
  };

  const revoke = async () => {
    setRevoking(true);
    try {
      await revokePortalAccess(client.id);
      setDialog(null);
      notifySuccess('Client links revoked', 'Links sent before now no longer open the file. The client can ask for a fresh link.');
      refresh();
    } catch (cause) {
      notifyError('Links not revoked', friendlyError(cause));
    } finally {
      setRevoking(false);
    }
  };

  return <div key={view.file.key}>
    <header className="sticky top-14 z-20 border-b border-[color:var(--ah-line)] bg-[rgb(247_241_232/0.97)] backdrop-blur-md lg:top-0">
      <div className="mx-auto max-w-[1480px] px-4 pb-3.5 pt-3 sm:px-6 lg:px-10 lg:pb-4 lg:pt-4">
        <Link to={boardHref(area)} className="ahs-link inline-flex items-center gap-1.5 text-[12.5px]">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{AREA_PAGE_TITLE[area]}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="ahs-mono text-[13px] font-medium text-[color:var(--ah-ink-2)]">{view.number}</span>
              <AreaChip area={area} />
              <span className="hidden text-[12.5px] text-[color:var(--ah-muted)] sm:inline">{file.title}{file.city ? ` · ${file.city}` : ''}</span>
            </div>
            <h1 className="ahs-display mt-1 truncate text-[26px] leading-tight text-[color:var(--ah-plum-950)] sm:text-[30px]">{file.clientName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StagePill area={area} stage={record.stage} outcome={record.outcome} large />
              <ReviewPill status={record.intake_review_status} large />
              {signals.keyDate && <DateChip keyDate={signals.keyDate} days={signals.keyDays} short={false} large />}
              <ReasonChips reasons={signals.reasons.filter(reason => reason.attention && !['needs_review', 'reading', 'due', 'overdue'].includes(reason.key))} max={3} />
            </div>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button variant="primary" onClick={() => setDialog('stage')} className="flex-1 sm:flex-none">
              <ArrowRightLeft aria-hidden="true" />Change stage
            </Button>
            <Button variant="secondary" onClick={() => setDialog('request')} aria-label="Request documents"
              disabled={file.terminal} title={file.terminal ? 'Closed files do not take client uploads' : undefined}>
              <MailQuestion aria-hidden="true" /><span className="hidden md:inline">Request documents</span>
            </Button>
            <Button variant="secondary" onClick={() => setDialog('upload')} aria-label="Upload">
              <Upload aria-hidden="true" /><span className="hidden md:inline">Upload</span>
            </Button>
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <Button variant="secondary" icon aria-label="More actions"><MoreHorizontal aria-hidden="true" /></Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="ahs-menu z-50">
                  <DropdownMenu.Item className="ahs-menu-item" onSelect={() => void copyNumber()}>
                    <Copy aria-hidden="true" />Copy file number
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1 h-px bg-[color:var(--ahs-line-soft)]" />
                  <DropdownMenu.Item className="ahs-menu-item ahs-menu-item-danger" onSelect={() => setDialog('revoke')}>
                    <Link2Off aria-hidden="true" />Revoke client links
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-6">
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] lg:items-start">
        <div className="order-2 min-w-0 space-y-5 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <ReviewCard view={view} />
          <DetailsCard view={view} />
          <ClientCard view={view} otherFiles={otherFiles} />
        </div>
        <div className="order-1 min-w-0 space-y-5 lg:order-none lg:col-start-2 lg:row-start-1">
          <StageCard view={view} onChangeStage={() => setDialog('stage')} />
          <RequestCard view={view} onRequest={() => setDialog('request')} />
          <DocumentsCard view={view} />
        </div>
        <div className="order-3 min-w-0 space-y-5 lg:order-none lg:col-start-2 lg:row-start-2">
          <NoticesCard view={view} />
          <ActivityCard view={view} />
        </div>
      </div>
    </div>

    <ChangeStageDialog open={dialog === 'stage'} onOpenChange={open => setDialog(open ? 'stage' : null)} view={view} practiceName={practiceName} />
    <RequestDocumentsDialog open={dialog === 'request'} onOpenChange={open => setDialog(open ? 'request' : null)} view={view} />
    <UploadDialog open={dialog === 'upload'} onOpenChange={open => setDialog(open ? 'upload' : null)} view={view} />
    <ConfirmDialog open={dialog === 'revoke'} onOpenChange={open => setDialog(open ? 'revoke' : null)} busy={revoking}
      title="Revoke client links?" confirmLabel="Revoke links" danger onConfirm={() => void revoke()}>
      <p>Every secure link already sent to <strong className="font-semibold text-[color:var(--ah-ink)]">{client.email}</strong> stops working right away, for all of this client’s files.</p>
      <p className="mt-2">The client can ask for a fresh link from anderhue.ca/files at any time.</p>
    </ConfirmDialog>
  </div>;
}
