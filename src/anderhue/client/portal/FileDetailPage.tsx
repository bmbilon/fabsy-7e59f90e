import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, RefreshCw } from 'lucide-react';
import { ANDERHUE_PRACTICE } from '../../config';
import { portal, type ApiError, type PortalFile } from '../api';
import { AREAS, areaFromParam } from '../catalog';
import { Alert, Button, ButtonLink, Skeleton } from '../components/ui';
import { formatDate } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import AccountBar, { DeviceNote } from './AccountBar';
import DocumentsCard from './DocumentsCard';
import { ContactCard, HistoryCard, KeyDatesCard, RequestBanner, StatusCard } from './FileCards';
import { usePortal } from './PortalContext';
import PortalUploader from './PortalUploader';
import SignInCard from './SignInCard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LoadState {
  status: 'loading' | 'ready' | 'error' | 'missing';
  file: PortalFile | null;
  error: ApiError | null;
}

function DetailSkeleton() {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8" role="status" aria-label="Loading your file">
      <div className="grid gap-6">
        <div className="ahc-card ahc-card-pad">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-8 w-56" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
          <div className="mt-8 grid grid-cols-4 gap-4">{[0, 1, 2, 3].map(item => <Skeleton key={item} className="h-8" />)}</div>
        </div>
        <div className="ahc-card ahc-card-pad">
          <Skeleton className="h-6 w-32" />
          {[0, 1, 2].map(item => <div key={item} className="mt-5 flex items-center gap-3"><Skeleton className="h-10 w-10" /><Skeleton className="h-4 flex-1" /></div>)}
        </div>
      </div>
      <div className="grid content-start gap-6">
        <div className="ahc-card ahc-card-pad"><Skeleton className="h-6 w-28" /><Skeleton className="mt-4 h-4 w-full" /><Skeleton className="mt-3 h-4 w-3/4" /></div>
        <div className="ahc-card ahc-card-pad"><Skeleton className="h-6 w-24" /><Skeleton className="mt-4 h-4 w-full" /><Skeleton className="mt-3 h-4 w-2/3" /></div>
      </div>
    </div>
  );
}

function Missing() {
  return (
    <section className="ahc-card ahc-card-pad mx-auto mt-8 max-w-[560px] text-center">
      <span className="ahc-drop-icon mx-auto" aria-hidden="true"><Lock size={22} /></span>
      <h1 className="ah-display mt-4 text-[28px]">We could not find that file</h1>
      <p className="mx-auto mt-2 max-w-[26rem] text-[color:var(--ah-ink-2)]">
        It may belong to a different email address, or the link may be incomplete. Your other files are still available.
      </p>
      <ButtonLink to="/files" variant="primary" className="mt-6">See your files</ButtonLink>
    </section>
  );
}

/** /files/:area/:id: status, request, dates, documents both ways, upload more, history and contact. */
export default function FileDetailPage() {
  const params = useParams();
  const area = areaFromParam(params.area);
  const id = (params.id || '').toLowerCase();
  const valid = Boolean(area && UUID.test(id));
  const { token, notice, session, reloadSession, handleError } = usePortal();
  const [state, setState] = useState<LoadState>({ status: 'loading', file: null, error: null });
  const requestId = useRef(0);

  const load = useCallback(async (quiet = false) => {
    if (!token || !area || !valid) return;
    const current = ++requestId.current;
    if (!quiet) setState(previous => ({ status: 'loading', file: previous.file && previous.file.id === id ? previous.file : null, error: null }));
    try {
      const response = await portal.file(token, area, id);
      if (current === requestId.current) setState({ status: 'ready', file: response.file, error: null });
    } catch (caught) {
      if (current !== requestId.current) return;
      const apiError = handleError(caught);
      if (apiError.status === 401) return;
      if (apiError.status === 404 || apiError.status === 403) setState({ status: 'missing', file: null, error: apiError });
      else setState(previous => ({ status: quiet && previous.file ? 'ready' : 'error', file: previous.file, error: apiError }));
    }
  }, [token, area, id, valid, handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  const file = state.file;
  useDocumentTitle(file ? `${file.number} · ${file.title}` : 'Your file');

  const refresh = useCallback(() => {
    void load(true);
    reloadSession(true);
  }, [load, reloadSession]);

  if (!token) return <SignInCard notice={notice} />;

  const fileCount = session.data?.files.length ?? 0;
  const requestOpen = Boolean(file?.request && !file.request.answered);

  return (
    <div className="ahc-wrap pb-16 pt-3 sm:pt-5">
      <AccountBar />
      {fileCount > 1 || (!valid || state.status === 'missing') ? (
        <Link to="/files" className="ahc-btn ahc-btn--ghost ahc-btn--sm -ml-3 mt-4">
          <ArrowLeft size={16} aria-hidden="true" />
          All files
        </Link>
      ) : <div className="mt-4" />}

      {!valid || state.status === 'missing' ? <Missing /> : null}

      {valid && state.status === 'error' && !file ? (
        <Alert tone="error" title="We could not load your file" className="mt-6">
          <p>{state.error?.message}</p>
          <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-3" onClick={() => void load()}>Try again</Button>
        </Alert>
      ) : null}

      {valid && !file && state.status === 'loading' ? (
        <>
          <div className="mt-2"><Skeleton className="h-3 w-40" /><Skeleton className="mt-3 h-10 w-72 max-w-full" /><Skeleton className="mt-3 h-6 w-64 max-w-full" /></div>
          <DetailSkeleton />
        </>
      ) : null}

      {file && area ? (
        <>
          <header className="mt-1">
            <p className="ahc-eyebrow">{file.areaLabel || AREAS[area].clientLabel}</p>
            <h1 className="ah-display mt-2 text-[32px] sm:text-[42px]">{file.title}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-[color:var(--ah-muted)]">
              <span className="ahc-filenum">{file.number}</span>
              <span className="whitespace-nowrap">Opened {formatDate(file.createdAt)}</span>
              <span className="whitespace-nowrap">Updated {formatDate(file.updatedAt)}</span>
            </p>
          </header>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
            <div className="grid min-w-0 gap-6">
              {requestOpen ? <RequestBanner file={file} onUploaded={refresh} /> : null}
              <StatusCard file={file} />
              {requestOpen ? null : <RequestBanner file={file} onUploaded={refresh} />}
              <KeyDatesCard file={file} idSuffix="main" className="lg:hidden" />
              <DocumentsCard file={file} />
              {requestOpen ? null : (
                <section className="ahc-card ahc-card-pad" aria-labelledby="add-title">
                  <h2 id="add-title" className="ahc-card-title">Add documents</h2>
                  {file.canUpload ? (
                    <>
                      <p className="mt-1 text-[15px] text-[color:var(--ah-ink-2)]">Send anything new, such as a notice you received or a document we asked for.</p>
                      <div className="mt-5">
                        <PortalUploader area={file.area} id={file.id} limits={file.limits} idPrefix="add-upload" onUploaded={refresh} />
                      </div>
                    </>
                  ) : (
                    <Alert tone="info" title={file.closed ? 'This file is closed' : 'Uploads are not available right now'} className="mt-4" live={false}>
                      {file.closed ? 'New documents cannot be added to a closed file.' : 'New documents cannot be added to this file at the moment.'}
                      {' '}If you need to send us something, email {ANDERHUE_PRACTICE.publicEmail} or call {ANDERHUE_PRACTICE.phoneDisplay}.
                    </Alert>
                  )}
                </section>
              )}
            </div>
            <aside className="grid min-w-0 gap-6" aria-label="File details">
              <KeyDatesCard file={file} idSuffix="side" className="hidden lg:block" />
              <HistoryCard file={file} />
              <ContactCard number={file.number} practice={session.data?.practice} />
            </aside>
          </div>
          <DeviceNote />
        </>
      ) : null}
    </div>
  );
}
