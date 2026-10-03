import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { ANDERHUE_PRACTICE } from '../../config';
import { ApiError } from '../api';
import type { PracticeArea } from '../catalog';
import { Alert, Button } from '../components/ui';
import { cx } from '../lib/cx';
import type { PickedFile } from '../lib/files';
import { useLeaveWarning } from '../lib/hooks';
import { runUploads, waitForHumanPace, withRetry, type TransferState, type UploadJob } from '../lib/uploads';
import { AREA_COPY } from './content';
import ContactStep from './ContactStep';
import DetailsStep from './DetailsStep';
import DocumentsStep from './DocumentsStep';
import {
  EMPTY_FIELDS, STEP_IDS, clearDraft, firstInvalidStep, isStepId, loadDraft, saveDraft, serverErrorTarget, stepFields,
  stepIndex, stepPath, validateStep, type FieldErrors, type FieldName, type IntakeFields, type SentSummary, type StepId,
} from './intake';
import ReviewStep from './ReviewStep';
import { finalizeFile, openFile, type OpenedFile } from './send';
import SendingPanel, { type SendPhase } from './SendingPanel';
import Stepper from './Stepper';

interface WizardProps {
  area: PracticeArea;
  files: PickedFile[];
  onFilesChange: (next: PickedFile[]) => void;
  onSent: (summary: SentSummary) => void;
}

interface Banner {
  title: string;
  message?: string;
  /** Add "Call ... or email ..." ('direct'), or "You can also call ..." ('also'). */
  contact?: 'direct' | 'also';
  /** Scroll the banner into view (errors on the step the person is already on). */
  reveal?: boolean;
}

function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export default function Wizard({ area, files, onFilesChange, onSent }: WizardProps) {
  const copy = AREA_COPY[area];
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const draft = useMemo(() => loadDraft(area), [area]);
  const [fields, setFields] = useState<IntakeFields>(() => draft?.fields ?? { ...EMPTY_FIELDS });
  const [lostFiles, setLostFiles] = useState(() => Boolean(draft && draft.fileCount > 0 && files.length === 0));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [company, setCompany] = useState('');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [phase, setPhase] = useState<SendPhase>('idle');
  const [transfers, setTransfers] = useState<Record<string, TransferState> | null>(null);
  const sendingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const firstStepRender = useRef(true);
  /** Field to focus after the next step change (instead of the heading). */
  const pendingFocus = useRef<string | null>(null);

  const requested = params.get('step');
  const step: StepId = isStepId(requested) ? requested : 'documents';
  const index = stepIndex(step);
  const firstInvalid = firstInvalidStep(area, fields);
  const reachable = firstInvalid ? stepIndex(firstInvalid) : STEP_IDS.length - 1;
  const sending = phase !== 'idle';
  const fromStep = (location.state as { from?: string } | null)?.from;

  useLeaveWarning(sending);

  // Unknown ?step= values fall back to the first step; steps ahead of a missing answer go back to it.
  useEffect(() => {
    if (sending || requested === 'sent') return;
    if (requested && !isStepId(requested)) {
      navigate(stepPath(area, 'documents'), { replace: true });
      return;
    }
    if (firstInvalid && index > stepIndex(firstInvalid)) {
      setErrors(validateStep(firstInvalid, area, fields));
      navigate(stepPath(area, firstInvalid), { replace: true });
    }
  }, [area, fields, firstInvalid, index, navigate, requested, sending]);

  // Typed answers survive a reload (files cannot).
  const rememberedCount = files.length || (lostFiles && draft ? draft.fileCount : 0);
  useEffect(() => {
    // These small text drafts must be stored before navigation. A delayed save
    // can be lost when a browser reloads or suspends the page without pagehide.
    if (!sending) saveDraft(area, fields, rememberedCount);
  }, [area, fields, rememberedCount, sending]);

  // Also flush on pagehide and when a mobile browser backgrounds the page.
  const latestDraft = useRef({ area, fields, rememberedCount, sending });
  latestDraft.current = { area, fields, rememberedCount, sending };
  useEffect(() => {
    const flush = () => {
      const draft = latestDraft.current;
      if (!draft.sending) saveDraft(draft.area, draft.fields, draft.rememberedCount);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (files.length) setLostFiles(false);
  }, [files.length]);

  // Move focus to the new step's heading so keyboard and screen reader users follow along.
  useEffect(() => {
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    const field = pendingFocus.current ? document.getElementById(pendingFocus.current) : null;
    pendingFocus.current = null;
    window.scrollTo({ top: 0 });
    if (field) field.focus();
    else headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // A problem with the step on screen appears beside the buttons; make sure it is seen.
  useEffect(() => {
    if (!banner?.reveal) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bannerRef.current?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [banner]);

  // While sending, the panel replaces the review; keep focus on its heading.
  useEffect(() => {
    if (!sending) return;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [sending]);

  const setField = useCallback((name: FieldName, value: string) => {
    setFields(previous => (previous[name] === value ? previous : { ...previous, [name]: value }));
    setErrors(previous => (previous[name] ? { ...previous, [name]: undefined } : previous));
  }, []);

  const focusFirstError = (target: StepId, found: FieldErrors) => {
    const first = stepFields(target, area).find(name => found[name]);
    if (!first) return;
    if (target !== step) {
      pendingFocus.current = `f-${first}`;
      return;
    }
    window.requestAnimationFrame(() => document.getElementById(`f-${first}`)?.focus());
  };

  const goTo = (target: StepId) => {
    if (sending || target === step) return;
    setBanner(null);
    navigate(stepPath(area, target), { state: { from: step } });
  };

  const goBack = () => {
    if (sending) return;
    setBanner(null);
    setErrors({});
    if (index === 0) {
      if (fromStep === 'chooser') navigate(-1);
      else navigate('/start');
      return;
    }
    const previous = STEP_IDS[index - 1];
    if (fromStep === previous) navigate(-1);
    else navigate(stepPath(area, previous), { replace: true });
  };

  const handleSubmitError = (error: unknown) => {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : '';
    if (status === 422 || status === 400) {
      const target = serverErrorTarget(message);
      setErrors(target.errors);
      const moves = target.step !== step;
      const focusesField = Object.keys(target.errors).length > 0;
      setBanner({ title: target.message, reveal: !moves || !focusesField });
      if (moves) navigate(stepPath(area, target.step), { state: { from: step } });
      focusFirstError(target.step, target.errors);
      return;
    }
    if (status === 429) {
      setBanner({ title: 'Please wait a few minutes', message: 'There have been too many attempts from this connection. Try again shortly.', contact: 'also', reveal: true });
    } else if (status === 403) {
      setBanner({ title: 'We could not accept this from this page', message: 'We can open your file for you instead.', contact: 'direct', reveal: true });
    } else if (status === 0) {
      setBanner({ title: 'Your file was not sent', message: 'We could not reach our server. Check your connection and try again. Your answers are still here.', reveal: true });
    } else if (status === 502 && message) {
      setBanner({ title: 'Your file may not have opened', message, contact: 'direct', reveal: true });
    } else {
      setBanner({ title: 'Your file was not sent', message: 'Something went wrong on our side. Please try again in a minute.', contact: 'also', reveal: true });
    }
  };

  const send = async () => {
    if (sendingRef.current) return;
    const invalid = firstInvalidStep(area, fields);
    if (invalid) {
      const found = validateStep(invalid, area, fields);
      setErrors(found);
      navigate(stepPath(area, invalid), { state: { from: step } });
      focusFirstError(invalid, found);
      return;
    }
    sendingRef.current = true;
    const batch = files;
    setBanner(null);
    setTransfers(batch.length ? Object.fromEntries(batch.map(file => [file.id, { status: 'waiting', fraction: 0 } as TransferState])) : null);
    setPhase('opening');
    try {
      const elapsedMs = await waitForHumanPace();
      const specs = batch.map(file => ({ name: file.name, contentType: file.contentType, size: file.size }));
      let opened: OpenedFile;
      try {
        opened = await openFile(area, fields, specs, company, elapsedMs);
      } catch (error) {
        setPhase('idle');
        setTransfers(null);
        handleSubmitError(error);
        return;
      }

      const failedNames: string[] = [];
      const uploadedIds: string[] = [];
      let unconfirmed = false;
      if (batch.length) {
        setPhase('uploading');
        const targets = new Map(opened.uploads.map(target => [target.index, target]));
        const jobs: UploadJob[] = [];
        const documentFor = new Map<string, string>();
        batch.forEach((file, position) => {
          const target = targets.get(position);
          if (!target) return;
          documentFor.set(file.id, target.documentId);
          jobs.push({ key: file.id, signedUrl: target.signedUrl, file: file.file, name: file.name, contentType: target.contentType || file.contentType });
        });
        const missing = batch.filter(file => !documentFor.has(file.id));
        if (missing.length) {
          setTransfers(previous => ({ ...(previous || {}), ...Object.fromEntries(missing.map(file => [file.id, { status: 'failed', fraction: 0 } as TransferState])) }));
        }
        const outcome = await runUploads(jobs, (key, state) => setTransfers(previous => ({ ...(previous || {}), [key]: state })));
        for (const file of batch) {
          if (outcome.succeeded.includes(file.id)) uploadedIds.push(documentFor.get(file.id) as string);
          else failedNames.push(file.name);
        }
        setPhase('finishing');
        try {
          await withRetry(() => finalizeFile(area, opened, uploadedIds));
        } catch {
          unconfirmed = uploadedIds.length > 0;
        }
      }

      clearDraft(area);
      onSent({
        area,
        number: opened.fileNumber,
        email: fields.email.trim(),
        sentCount: uploadedIds.length,
        failedNames,
        unconfirmed,
      });
    } finally {
      sendingRef.current = false;
    }
  };

  const goNext = () => {
    if (sending) return;
    if (step === 'review') {
      void send();
      return;
    }
    const found = validateStep(step, area, fields);
    if (hasErrors(found)) {
      setErrors(found);
      focusFirstError(step, found);
      return;
    }
    setErrors({});
    setBanner(null);
    navigate(stepPath(area, STEP_IDS[index + 1]), { state: { from: step } });
  };

  const skipping = step === 'documents' && !files.length;
  const continueLabel = step === 'review' ? 'Send my file' : skipping ? 'Skip for now' : 'Continue';

  return (
    <div className="ahc-col px-4 pb-16 pt-5 sm:px-6 sm:pt-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="ahc-eyebrow">{copy.eyebrow}</p>
        {!sending ? <Link to="/start" className="ahc-link text-[14px]">Change</Link> : null}
      </div>
      <h1 className="ah-display mt-1.5 text-[28px] sm:mt-2 sm:text-[40px]">Start your file</h1>
      <Stepper current={step} reachable={reachable} disabled={sending} onSelect={goTo} />

      <form
        className="ahc-card ahc-card-pad mt-4 sm:mt-5"
        noValidate
        onSubmit={event => {
          event.preventDefault();
          goNext();
        }}
      >
        {lostFiles && (step === 'documents' || step === 'review') && !sending ? (
          <Alert tone="info" className="mb-6">
            Your answers were kept, but files are not saved when the page reloads. Please add your documents again.
          </Alert>
        ) : null}

        {sending ? (
          <SendingPanel phase={phase} files={files} transfers={transfers} headingRef={headingRef} />
        ) : step === 'documents' ? (
          <DocumentsStep area={area} files={files} onFilesChange={onFilesChange} headingRef={headingRef} />
        ) : step === 'details' ? (
          <DetailsStep area={area} fields={fields} errors={errors} setField={setField} headingRef={headingRef} />
        ) : step === 'contact' ? (
          <ContactStep fields={fields} errors={errors} setField={setField} company={company} setCompany={setCompany} headingRef={headingRef} />
        ) : (
          <ReviewStep area={area} fields={fields} files={files} onEdit={goTo} headingRef={headingRef} />
        )}

        {banner && !sending ? (
          <div ref={bannerRef} className="mt-8 scroll-mb-28">
            <Alert tone="error" title={banner.title}>
              {banner.message || banner.contact ? (
                <p>
                  {banner.message}
                  {banner.contact ? (
                    <>
                      {banner.contact === 'also' ? ' You can also call ' : ' Call '}
                      <a href={ANDERHUE_PRACTICE.phoneHref} className="whitespace-nowrap">{ANDERHUE_PRACTICE.phoneDisplay}</a> or email{' '}
                      <a href={`mailto:${ANDERHUE_PRACTICE.publicEmail}`} className="whitespace-nowrap">{ANDERHUE_PRACTICE.publicEmail}</a>.
                    </>
                  ) : null}
                </p>
              ) : null}
            </Alert>
          </div>
        ) : null}

        {sending ? null : (
          <div className={cx('ahc-actions ahc-actions--sticky', banner ? 'mt-4' : 'mt-8')}>
            <Button variant="secondary" icon={ArrowLeft} onClick={goBack}>Back</Button>
            <Button
              type="submit"
              variant={skipping ? 'secondary' : 'primary'}
              className="ahc-actions-main"
              iconAfter={step === 'review' ? Send : ArrowRight}
            >
              {continueLabel}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
