import type { ReactNode, Ref } from 'react';
import { Pencil, ShieldCheck } from 'lucide-react';
import FileRow from '../components/FileRow';
import type { PickedFile } from '../lib/files';
import type { PracticeArea } from '../catalog';
import { AREA_COPY, PRIVACY_STATEMENT, RETAINER_STATEMENT } from './content';
import { detailRows, type IntakeFields, type StepId } from './intake';
import StepHeading from './StepHeading';

interface ReviewStepProps {
  area: PracticeArea;
  fields: IntakeFields;
  files: PickedFile[];
  onEdit: (step: StepId) => void;
  headingRef: Ref<HTMLHeadingElement>;
}

function ReviewBlock({ title, step, onEdit, children }: { title: string; step: StepId; onEdit: (step: StepId) => void; children: ReactNode }) {
  return (
    <section className="border-t border-[color:var(--ah-line)] pt-5" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[19px]">{title}</h3>
        <button type="button" className="ahc-btn ahc-btn--ghost ahc-btn--sm -mr-2" onClick={() => onEdit(step)}>
          <Pencil size={16} aria-hidden="true" />
          Edit<span className="sr-only"> {title.toLowerCase()}</span>
        </button>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Only answered questions are listed; skipped optional ones stay out of the way. */
function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  const answered = rows.filter(row => row.value);
  if (!answered.length) return <p className="ahc-muted">Nothing added.</p>;
  return (
    <dl className="ahc-review">
      {answered.map(row => (
        <div key={row.label} className="ahc-review-row">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ReviewStep({ area, fields, files, onEdit, headingRef }: ReviewStepProps) {
  const copy = AREA_COPY[area];
  return (
    <section aria-labelledby="step-title">
      <StepHeading ref={headingRef} title="Review and send" intro="Check that everything looks right. You can change anything before you send it." />
      <div className="mt-6 grid gap-6">
        <ReviewBlock title="Documents" step="documents" onEdit={onEdit}>
          {files.length ? (
            <ul className="ahc-files">{files.map(file => <FileRow key={file.id} file={file} />)}</ul>
          ) : (
            <p className="ahc-muted">No documents yet. You can add them later from your file link.</p>
          )}
        </ReviewBlock>
        <ReviewBlock title={copy.detailsTitle} step="details" onEdit={onEdit}>
          <Rows rows={detailRows(area, fields)} />
        </ReviewBlock>
        <ReviewBlock title="Contact" step="contact" onEdit={onEdit}>
          <Rows rows={[
            { label: 'Full name', value: fields.name.trim() },
            { label: 'Email', value: fields.email.trim() },
            { label: 'Phone', value: fields.phone.trim() },
          ]} />
        </ReviewBlock>
        <div className="grid gap-3">
          <p className="ahc-retainer">
            <ShieldCheck size={20} aria-hidden="true" />
            <span>{RETAINER_STATEMENT}</span>
          </p>
          <p className="text-[14px] leading-normal text-[color:var(--ah-muted)]">{PRIVACY_STATEMENT}</p>
        </div>
      </div>
    </section>
  );
}
