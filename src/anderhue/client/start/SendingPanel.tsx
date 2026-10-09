import type { ReactNode, Ref } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import FileRow from '../components/FileRow';
import type { PickedFile } from '../lib/files';
import type { TransferState } from '../lib/uploads';
import StepHeading from './StepHeading';

export type SendPhase = 'idle' | 'opening' | 'uploading' | 'finishing';

interface SendingPanelProps {
  phase: SendPhase;
  files: PickedFile[];
  transfers: Record<string, TransferState> | null;
  headingRef: Ref<HTMLHeadingElement>;
}

const ORDER: SendPhase[] = ['opening', 'uploading', 'finishing'];

function Task({ state, children }: { state: 'todo' | 'current' | 'done'; children: ReactNode }) {
  return (
    <li className="ahc-task" data-state={state}>
      <span className="ahc-task-icon" aria-hidden="true">
        {state === 'done' ? <Check size={14} /> : state === 'current' ? <LoaderCircle size={14} className="ahc-spin" /> : null}
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function SendingPanel({ phase, files, transfers, headingRef }: SendingPanelProps) {
  const position = ORDER.indexOf(phase);
  const stateOf = (step: SendPhase) => {
    const index = ORDER.indexOf(step);
    return index < position ? 'done' : index === position ? 'current' : 'todo';
  };
  const done = files.filter(file => transfers?.[file.id]?.status === 'done').length;
  const failed = files.filter(file => transfers?.[file.id]?.status === 'failed').length;
  const announcement = phase === 'opening'
    ? 'Opening your file.'
    : phase === 'uploading'
      ? `Uploading documents. ${done} of ${files.length} uploaded${failed ? `, ${failed} did not upload` : ''}.`
      : 'Finishing up.';

  return (
    <section aria-labelledby="step-title" aria-busy="true">
      <StepHeading ref={headingRef} title="Sending your file" intro="Please keep this page open until it finishes." />
      <ol className="ahc-tasks mt-6">
        <Task state={stateOf('opening')}>Opening your file</Task>
        {files.length ? (
          <Task state={stateOf('uploading')}>
            Uploading documents
            {phase === 'uploading' || phase === 'finishing' ? <span className="ah-mono ml-2 text-[14px] font-normal">{done} of {files.length}</span> : null}
          </Task>
        ) : null}
        <Task state={stateOf('finishing')}>Finishing up</Task>
      </ol>
      {files.length ? (
        <ul className="ahc-files mt-6" aria-label="Upload progress">
          {files.map(file => <FileRow key={file.id} file={file} transfer={transfers?.[file.id] || { status: 'waiting', fraction: 0 }} />)}
        </ul>
      ) : null}
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </section>
  );
}
