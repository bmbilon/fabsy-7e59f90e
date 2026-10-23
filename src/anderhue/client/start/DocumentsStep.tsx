import type { Ref } from 'react';
import { Check, Info } from 'lucide-react';
import FilePicker from '../components/FilePicker';
import { INTAKE_LIMITS, type PickedFile } from '../lib/files';
import type { PracticeArea } from '../catalog';
import { AREA_COPY } from './content';
import StepHeading from './StepHeading';

interface DocumentsStepProps {
  area: PracticeArea;
  files: PickedFile[];
  onFilesChange: (next: PickedFile[]) => void;
  headingRef: Ref<HTMLHeadingElement>;
}

export default function DocumentsStep({ area, files, onFilesChange, headingRef }: DocumentsStepProps) {
  const copy = AREA_COPY[area];
  return (
    <section aria-labelledby="step-title">
      <StepHeading ref={headingRef} title="Add your documents" intro={copy.uploadIntro} />
      <ul className="ahc-checklist ahc-checklist--two mt-3">
        {copy.uploadItems.map(item => (
          <li key={item}>
            <Check size={16} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <FilePicker
          id="intake"
          files={files}
          onChange={onFilesChange}
          limits={INTAKE_LIMITS}
          overflowHint="You can add more later from your file link."
          listenForPaste
          label="Add your documents"
        />
      </div>
      <p className="mt-4 flex items-start gap-2 text-[14px] leading-normal text-[color:var(--ah-muted)]">
        <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>Optional, but documents help us give you an accurate next step. You can add documents later from your file link.</span>
      </p>
    </section>
  );
}
