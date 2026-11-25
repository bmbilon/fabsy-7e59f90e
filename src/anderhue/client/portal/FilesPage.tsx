import { Link, Navigate } from 'react-router-dom';
import { FolderOpen, Plus, RefreshCw } from 'lucide-react';
import { ANDERHUE_PRACTICE } from '../../config';
import type { PortalFileSummary, PortalSessionResponse } from '../api';
import { AREAS } from '../catalog';
import { Alert, Button, ButtonLink, Pill, Skeleton } from '../components/ui';
import { formatDate, plural } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import AccountBar, { DeviceNote } from './AccountBar';
import { filePath, usePortal } from './PortalContext';
import SignInCard from './SignInCard';

function FileCard({ file }: { file: PortalFileSummary }) {
  const areaLabel = AREAS[file.area]?.clientLabel || 'File';
  return (
    <Link to={filePath(file)} className="ahc-filecard" data-attention={file.requestOpen ? 'true' : undefined}>
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="ahc-eyebrow">{areaLabel}</span>
        <span className="ahc-filenum">{file.number}</span>
      </span>
      <span className="mt-2 block font-[family-name:var(--ah-font-display)] text-[22px] leading-tight text-[color:var(--ah-plum-950)]">{file.title}</span>
      <span className="mt-3 flex flex-wrap items-center gap-2">
        <Pill tone={file.closed ? 'closed' : 'default'}>{file.stageLabel}</Pill>
        {file.requestOpen ? <Pill tone="action"><span className="ahc-dot" aria-hidden="true" />Action needed</Pill> : null}
        <span className="ml-auto text-[13px] text-[color:var(--ah-muted)]">Updated {formatDate(file.updatedAt)}</span>
      </span>
    </Link>
  );
}

function FileList({ data }: { data: PortalSessionResponse }) {
  const files = [...data.files].sort((a, b) => Number(b.requestOpen) - Number(a.requestOpen));
  const waiting = files.filter(file => file.requestOpen).length;
  const name = data.client.firstName?.trim();
  return (
    <div className="ahc-col px-4 pb-16 pt-3 sm:px-6 sm:pt-5">
      <AccountBar />
      <p className="ahc-eyebrow mt-8">Your files</p>
      <h1 className="ah-display mt-2 text-[32px] sm:text-[40px]">{name ? `Hello, ${name}` : 'Your files'}</h1>
      {files.length ? (
        <>
          <p className="ahc-lead mt-2">
            You have {plural(files.length, 'file', 'files')} with {data.practice?.displayName || ANDERHUE_PRACTICE.name}.
          </p>
          {waiting ? (
            <Alert tone="warn" className="mt-6" live={false}>
              {waiting === 1 ? 'One file needs something from you.' : `${waiting} files need something from you.`} Open it to see what we asked for.
            </Alert>
          ) : null}
          <ul className="mt-6 grid gap-3">
            {files.map(file => <li key={`${file.area}-${file.id}`}><FileCard file={file} /></li>)}
          </ul>
        </>
      ) : (
        <section className="ahc-card ahc-card-pad mt-6 text-center">
          <span className="ahc-drop-icon mx-auto" aria-hidden="true"><FolderOpen size={24} /></span>
          <h2 className="mt-4 text-[22px]">No files to show yet</h2>
          <p className="mx-auto mt-2 max-w-[28rem] text-[color:var(--ah-ink-2)]">
            We could not find a file for this link. If you think that is wrong, call {ANDERHUE_PRACTICE.phoneDisplay} or email {ANDERHUE_PRACTICE.publicEmail}.
          </p>
        </section>
      )}
      <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-[color:var(--ah-ink-2)]">
        <span>Need help with something new?</span>
        <ButtonLink to="/start" variant="quiet" size="sm" icon={Plus}>Start a file</ButtonLink>
      </div>
      <DeviceNote />
    </div>
  );
}

function FileListSkeleton() {
  return (
    <div className="ahc-col px-4 pb-16 pt-3 sm:px-6 sm:pt-5" role="status" aria-label="Loading your files">
      <div className="ahc-account border-b border-[color:var(--ah-line)]"><Skeleton className="h-5 w-60 max-w-full" /><Skeleton className="h-9 w-24" /></div>
      <Skeleton className="mt-8 h-3 w-24" />
      <Skeleton className="mt-3 h-10 w-56" />
      <Skeleton className="mt-3 h-5 w-72 max-w-full" />
      <div className="mt-6 grid gap-3">
        {[0, 1].map(item => (
          <div key={item} className="ahc-card p-5">
            <div className="flex justify-between"><Skeleton className="h-3 w-40" /><Skeleton className="h-6 w-28" /></div>
            <Skeleton className="mt-3 h-6 w-48" />
            <div className="mt-4 flex gap-2"><Skeleton className="h-6 w-28" /><Skeleton className="ml-auto h-4 w-32" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** /files: sign-in card without a token, otherwise the list (or straight to the only file). */
export default function FilesPage() {
  const { token, notice, session, reloadSession } = usePortal();
  useDocumentTitle(token ? 'Your files' : 'Open your file');

  if (!token) return <SignInCard notice={notice} />;
  if (session.status === 'ready' && session.data) {
    if (session.data.files.length === 1) return <Navigate to={filePath(session.data.files[0])} replace />;
    return <FileList data={session.data} />;
  }
  if (session.status === 'error') {
    return (
      <div className="ahc-col px-4 pb-16 pt-3 sm:px-6 sm:pt-5">
        <AccountBar />
        <Alert tone="error" title="We could not load your files" className="mt-8">
          <p>{session.error?.message}</p>
          <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-3" onClick={() => reloadSession()}>Try again</Button>
        </Alert>
      </div>
    );
  }
  return <FileListSkeleton />;
}
