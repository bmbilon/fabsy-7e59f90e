import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, FileSearch, Loader2 } from 'lucide-react';
import type { FormData } from './TicketForm';
import LeadCaptureFields from './form-steps/LeadCaptureFields';
import PaymentStep from './form-steps/PaymentStep';
import FeeRefundNotice from './FeeRefundNotice';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { useLocale } from '@/i18n/locale-context';
import { LOCALIZED_INTAKE_FIELD_LIMITS, validateLocalizedIntakeStep, type IntakeErrors } from '@/i18n/intake-validation';
import { TICKET_CAPTURE_BROWSE_ACCEPT, validateTicketCaptureFile } from '@/lib/ticket/ticketCapture';
import { resetTicketTypeForUpload } from '@/lib/ticket/ticketType';
import type { IntakeDraftCapability } from '@/lib/ticket/intakeDraft';
import { supabase } from '@/integrations/supabase/client';

const stepKeys = ['ticket', 'personal', 'account', 'consent', 'review', 'payment'];
type UpdateFormData = (updates: Partial<FormData>) => void;

function LocalizedField({ name, data, update, errors, type = 'text', required = false, multiline = false, maxLength = 200 }: {
  name: keyof FormData; data: FormData; update: UpdateFormData; errors: IntakeErrors;
  type?: string; required?: boolean; multiline?: boolean; maxLength?: number;
}) {
  const { t } = useTranslation();
  const value = data[name];
  const id = `localized-${name}`;
  const error = errors[name];
  const updateValue = (value: string) => update({
    [name]: type === 'date' ? (value ? new Date(`${value}T12:00:00Z`) : undefined) : value,
  });
  const shared = {
    id, name, required, maxLength,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? `${id}-error` : undefined,
    value: value instanceof Date ? (Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '') : typeof value === 'string' ? value : '',
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updateValue(event.target.value),
    // Native date editors can emit input before change; retain that value when
    // the user moves to another field or continues to the next step.
    onInput: type === 'date' ? (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => updateValue(event.currentTarget.value) : undefined,
  };
  return <div className={`min-w-0 space-y-2 ${multiline ? 'sm:col-span-2' : ''}`}>
    <Label htmlFor={id} className="leading-relaxed">{t(`intake.fields.${name}`)}{required ? <span aria-hidden="true"> *</span> : <span className="ms-2 text-xs font-normal text-slate-500">{' '}{t('common.optional')}</span>}</Label>
    {multiline ? <Textarea {...shared} rows={4} dir="auto" /> : <Input {...shared} type={type} dir={['email', 'tel', 'date'].includes(type) || /ticketNumber|postalCode|driversLicense|fineAmount/.test(name) ? 'ltr' : 'auto'} />}
    {error && <p className="text-sm text-red-700" id={`${id}-error`}>{t(error)}</p>}
  </div>;
}

function LocalizedCheck({ name, data, update, label }: { name: keyof FormData; data: FormData; update: UpdateFormData; label?: string }) {
  const { t } = useTranslation();
  return <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm leading-relaxed" htmlFor={`localized-${name}`}>
    <input className="mt-1 h-4 w-4 shrink-0 accent-emerald-700" id={`localized-${name}`} type="checkbox" checked={data[name] === true} onChange={event => update({ [name]: event.target.checked })} />
    <span>{label || t(`intake.fields.${name}`)}</span>
  </label>;
}

export default function LocalizedTicketJourney({ formData, updateFormData, currentStep, nextStep, prevStep, intakeDraft = null, hasStoredTicket = false, hasPendingTicketUpload = false, allowReplacement = false, onTicketFileSelection, replacementReady = false, replacementSaving = false, onSaveReplacement, resumeAccess = null, leadSaved, leadReady, leadSaving, leadError, onSaveLead }: {
  formData: FormData; updateFormData: (updates: Partial<FormData> | ((current: FormData) => Partial<FormData>)) => void; currentStep: number; nextStep: () => void; prevStep: () => void; intakeDraft?: IntakeDraftCapability | null; hasStoredTicket?: boolean;
  hasPendingTicketUpload?: boolean;
  allowReplacement?: boolean;
  onTicketFileSelection?: (file: File | null) => void;
  replacementReady?: boolean;
  replacementSaving?: boolean;
  onSaveReplacement?: () => void;
  resumeAccess?: ReactNode;
  leadSaved: boolean;
  leadReady: boolean;
  leadSaving: boolean;
  leadError?: string;
  onSaveLead: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { isReleased, locale, href } = useLocale();
  const [errors, setErrors] = useState<IntakeErrors>({});
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [replacementMessage, setReplacementMessage] = useState('');
  const [leadValidationAttempted, setLeadValidationAttempted] = useState(false);
  const scanId = useRef(0);
  const editedDuringScan = useRef(new Set<keyof FormData>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const update: UpdateFormData = values => {
    if (scanning) Object.keys(values).forEach(key => editedDuringScan.current.add(key as keyof FormData));
    updateFormData(values);
    setErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) => !(key in values))));
  };
  const field = (name: keyof FormData, options: { type?: string; required?: boolean; multiline?: boolean } = {}) => (
    <LocalizedField key={name} name={name} data={formData} update={update} errors={errors} maxLength={LOCALIZED_INTAKE_FIELD_LIMITS[name] ?? 200} {...options} />
  );
  const summaryFields = (keys: (keyof FormData)[]) => <dl className="grid gap-4 sm:grid-cols-2">{keys.map(key => {
    const value = formData[key];
    const text = value instanceof Date ? (Number.isFinite(value.getTime()) ? new Intl.DateTimeFormat(locale).format(value) : '—') : String(value || '—');
    return <div key={key} className="min-w-0 rounded-lg bg-slate-50 p-4"><dt className="text-xs text-slate-500">{t(`intake.fields.${key}`)}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm" dir="auto">{text}</dd></div>;
  })}</dl>;
  const moveNext = async () => {
    if (currentStep === 1 && (hasPendingTicketUpload || (hasStoredTicket && formData.ticketImage))) {
      setReplacementMessage('Save or remove the replacement ticket before continuing.');
      return;
    }
    const nextErrors = validateLocalizedIntakeStep(currentStep, formData);
    if (currentStep === 1 && hasStoredTicket) delete nextErrors.ticketImage;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById(`localized-${Object.keys(nextErrors)[0]}`)?.focus();
      return;
    }
    if (currentStep === 1 && !leadSaved) {
      setLeadValidationAttempted(true);
      if (!leadReady || !await onSaveLead()) return;
    }
    nextStep();
    headingRef.current?.focus();
  };

  // Same existing English-ticket OCR endpoint. Preview mode never uploads a
  // document or invokes it; a deliberate click is required after release.
  const scanTicket = async () => {
    if (!isReleased || !formData.ticketImage || scanning) return;
    const file = formData.ticketImage;
    const descriptor = validateTicketCaptureFile(file);
    if (!descriptor.valid || descriptor.kind !== 'image') {
      setScanMessage('intake.validation.scanFailed');
      return;
    }
    const requestId = ++scanId.current;
    editedDuringScan.current.clear();
    setScanning(true);
    setScanMessage('');
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid document'));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke('ocr-ticket', { body: { imageBase64 } });
      if (error || !data || data.success === false) throw new Error('OCR unavailable');
      if (requestId !== scanId.current) return;
      const extracted = data.success === true ? data.data : data;
      if (!extracted || typeof extracted !== 'object') throw new Error('OCR returned no fields');
      const updates: Partial<FormData> = {};
      for (const key of ['ticketNumber', 'location', 'officer', 'officerBadge', 'offenceSection', 'offenceSubSection', 'offenceDescription', 'violation'] as const) {
        if (typeof extracted[key] === 'string') updates[key] = extracted[key].slice(0, 500);
      }
      for (const key of ['issueDate', 'courtDate'] as const) {
        if (typeof extracted[key] === 'string') {
          const date = new Date(extracted[key]);
          if (Number.isFinite(date.getTime())) updates[key] = date;
        }
      }
      const amount = extracted.fineAmount ?? extracted.fine;
      if (typeof amount === 'number' || typeof amount === 'string') updates.fineAmount = String(amount);
      updateFormData(current => Object.fromEntries(Object.entries(updates).filter(([key]) =>
        !current[key as keyof FormData] && !editedDuringScan.current.has(key as keyof FormData),
      )));
      setScanMessage('intake.validation.scanReview');
    } catch {
      if (requestId === scanId.current) setScanMessage('intake.validation.scanFailed');
    } finally {
      if (requestId === scanId.current) setScanning(false);
    }
  };

  return <section className="mx-auto max-w-4xl space-y-6 py-8 text-slate-900" id="ticket-form-container">
    <div className="space-y-4 rounded-2xl bg-white p-6 sm:p-8">
      <h1 className="text-3xl font-bold sm:text-4xl">{t('intake.title')}</h1><p className="leading-relaxed text-slate-600">{t('intake.description')}</p>
      {!isReleased && <aside className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
        {t('language.paymentBlocked')}{' '}<Link to="/submit-ticket" state={{ prefillTicketData: { ...formData, consentGiven: false, digitalSignature: '' }, startAtStep: Math.min(currentStep, 4), ticketImage: formData.ticketImage }} className="font-semibold underline">{t('language.continueEnglish')}</Link>
      </aside>}
      <ol className="grid grid-cols-3 gap-3 sm:grid-cols-6" aria-label={t('intake.title')}>
        {stepKeys.map((key, index) => <li className={`rounded-lg border px-2 py-3 text-center text-xs leading-relaxed ${currentStep === index + 1 ? 'border-primary bg-primary/10 font-bold text-primary' : 'border-slate-200 text-slate-600'}`} key={key} aria-current={currentStep === index + 1 ? 'step' : undefined}>
          <span className="mb-1 block font-bold">{index + 1}</span>{t(`intake.steps.${key}`)}
        </li>)}
      </ol>
    </div>
    <Card className="space-y-6 p-5 sm:p-8">
      <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">{t(`intake.steps.${stepKeys[currentStep - 1]}`)}</h2>
      {currentStep === 1 && <>
        <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-5">
          {hasStoredTicket ? <><p className="font-medium">{t('intake.fields.ticketImage')}</p><p className="text-sm text-slate-600" lang="en" dir="ltr">Your ticket is stored privately and linked to this intake.</p>{allowReplacement ? <div className="space-y-3" lang="en" dir="ltr">
            <Label htmlFor="localized-ticketImage">Replace the saved ticket PDF or clear image</Label>
            <Input type="file" id="localized-ticketImage" accept={TICKET_CAPTURE_BROWSE_ACCEPT} className="h-auto cursor-pointer py-2" aria-invalid={Boolean(errors.ticketImage)} aria-describedby="localized-ticketImage-error" onChange={event => {
              const file = event.target.files?.[0] ?? null;
              scanId.current += 1;
              setScanning(false);
              setScanMessage('');
              setReplacementMessage('');
              if (!file) {
                onTicketFileSelection?.(null);
                return;
              }
              if (!validateTicketCaptureFile(file).valid) {
                setErrors(value => ({ ...value, ticketImage: 'intake.validation.fileFormat' }));
                event.target.value = '';
                return;
              }
              onTicketFileSelection?.(file);
              updateFormData(current => ({
                ...resetTicketTypeForUpload(current),
                ticketImage: file,
                ticketNumber: '', plateNumber: '', issueDate: undefined,
                location: '', officer: '', officerBadge: '', offenceSection: '',
                offenceSubSection: '', offenceDescription: '', violation: '', fineAmount: '',
                courtDate: undefined, courtJurisdiction: '', agentRepresentationPermitted: null,
                vehicleSeized: false, sourceAssessmentId: '', sourceAssessmentAccessToken: '',
              }));
            }} />
            {formData.ticketImage ? <Button type="button" disabled={!replacementReady || replacementSaving} onClick={onSaveReplacement}>
              {replacementSaving ? 'Saving replacement…' : 'Save replacement ticket'}
            </Button> : null}
          </div> : null}</> : <><Label htmlFor="localized-ticketImage">{t('intake.fields.ticketImage')} *</Label><Input type="file" id="localized-ticketImage" accept={TICKET_CAPTURE_BROWSE_ACCEPT} className="h-auto cursor-pointer py-2" aria-invalid={Boolean(errors.ticketImage)} aria-describedby="localized-ticketImage-error" onChange={event => {
            const file = event.target.files?.[0];
            scanId.current += 1;
            setScanning(false);
            setScanMessage('');
            if (!file) return;
            if (!validateTicketCaptureFile(file).valid) {
              updateFormData({ ticketImage: null });
              setErrors(value => ({ ...value, ticketImage: 'intake.validation.fileFormat' }));
              event.target.value = '';
              return;
            }
            update({ ticketImage: file });
          }} /></>}
          <p className="text-xs text-slate-500" dir="ltr">PDF · JPG · PNG · WebP · HEIC · HEIF · ≤ 10 MB</p>
          {formData.ticketImage && <p className="break-all text-sm" dir="auto">{formData.ticketImage.name}</p>}
          {errors.ticketImage && <p id="localized-ticketImage-error" className="text-sm text-red-700">{t(errors.ticketImage)}</p>}
          {isReleased && (!hasStoredTicket || Boolean(formData.ticketImage)) && <Button type="button" variant="outline" onClick={scanTicket} disabled={!formData.ticketImage || scanning} className="h-auto whitespace-normal py-2">
            {scanning ? <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <FileSearch className="me-2 h-4 w-4" aria-hidden="true" />}{t(scanning ? 'common.loading' : 'intake.scanTicket')}
          </Button>}
          {scanMessage && <p role="status" className="text-sm leading-relaxed">{t(scanMessage)}</p>}
          {replacementMessage && <p role="alert" className="text-sm leading-relaxed text-red-700" lang="en" dir="ltr">{replacementMessage}</p>}
        </div>
        {!leadSaved && <div>
          <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
            {t('language.englishControls')}
          </p>
          <div lang="en" dir="ltr">
            <LeadCaptureFields formData={formData} updateFormData={update} error={leadError} />
            {leadValidationAttempted && !leadReady ? <p className="mt-3 text-sm text-red-700" role="alert">
              Add a valid email or phone number and select both confirmations before saving.
            </p> : null}
          </div>
        </div>}
        <div className="grid gap-5 sm:grid-cols-2">
          {field('ticketNumber', { required: true })}{field('issueDate', { required: true, type: 'date' })}
          {field('location', { required: true })}{field('fineAmount', { required: true })}
          {field('offenceDescription', { required: true, multiline: true })}{field('offenceSection')}{field('offenceSubSection')}
          {field('officer')}{field('officerBadge')}{field('courtDate', { type: 'date' })}{field('courtJurisdiction')}
        </div>
        <LocalizedCheck name="vehicleSeized" data={formData} update={update} />
        {errors.vehicleSeized && <p className="text-sm text-red-700">{t(errors.vehicleSeized)} <Link className="underline" to={href('/contact')}>{t('nav.contact')}</Link></p>}
      </>}
      {currentStep === 2 && <><div className="grid gap-5 sm:grid-cols-2">
        {field('firstName', { required: true })}{field('lastName', { required: true })}
        {field('email', { required: true, type: 'email' })}{field('phone', { required: true, type: 'tel' })}
        {field('dateOfBirth', { required: true, type: 'date' })}{field('driversLicense', { required: true })}
        {field('address', { required: true })}{field('city', { required: true })}{field('province', { required: true })}{field('postalCode', { required: true })}
      </div><LocalizedCheck name="smsOptIn" data={formData} update={update} /><p className="text-sm leading-relaxed text-slate-600">{t('contact.availability')}</p></>}
      {currentStep === 3 && <><p className="text-sm leading-relaxed text-slate-600">{t('intake.review.languageNote')}</p><div className="grid gap-5 sm:grid-cols-2">
        {field('pleaType', { required: true })}{field('explanation', { required: true, multiline: true })}
        {field('circumstances', { multiline: true })}{field('additionalNotes', { multiline: true })}
      </div></>}
      {currentStep === 4 && <>
        {summaryFields(['firstName', 'lastName', 'email', 'phone', 'driversLicense', 'ticketNumber', 'issueDate', 'location'])}
        <div className="space-y-4 text-sm leading-7 text-slate-700">
          {['scope', 'approval', 'exclusions', 'fee'].map(key => <p key={key}>{t(`intake.consent.${key}`)}</p>)}
          <p>{t('rapid.speedBody')}</p><p>{t('rapid.speedDisclaimer')}</p>
          {['data', 'withdrawal'].map(key => <p key={key}>{t(`intake.consent.${key}`)}</p>)}
        </div>
        <aside className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">{t('language.englishControls')}{' '}<Link className="font-semibold underline" to="/terms-of-service" target="_blank" rel="noopener noreferrer">{t('language.readEnglish')}</Link></aside>
        <FeeRefundNotice compact openTermsInNewTab />
        <LocalizedCheck name="consentGiven" data={formData} update={update} label={t('intake.consent.confirm')} />
        {errors.consentGiven && <p className="text-sm text-red-700">{t(errors.consentGiven)}</p>}
        {field('digitalSignature', { required: true })}
      </>}
      {currentStep === 5 && <>
        <p className="leading-relaxed text-slate-600">{t('intake.review.description')}</p>
        {summaryFields(['ticketNumber', 'issueDate', 'offenceDescription', 'fineAmount', 'location', 'courtDate', 'firstName', 'lastName', 'email', 'phone', 'address', 'city', 'province', 'postalCode', 'dateOfBirth', 'driversLicense', 'pleaType', 'explanation', 'circumstances', 'additionalNotes', 'digitalSignature'])}
        <p className="text-sm leading-relaxed text-slate-600">{t('intake.review.languageNote')}</p>
      </>}
      {currentStep === 6 && (hasPendingTicketUpload
        ? <p role="alert" lang="en" dir="ltr" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">Keep your last confirmed ticket or finish its replacement before checkout.</p>
        : <PaymentStep formData={formData} updateFormData={update} intakeDraft={intakeDraft} />)}
      {resumeAccess}
      <div className="flex items-center justify-between gap-3 border-t pt-6">
        <Button type="button" variant="outline" disabled={currentStep === 1 || scanning} onClick={() => { setErrors({}); prevStep(); headingRef.current?.focus(); }}><ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('common.back')}</Button>
        {currentStep < 6 && <Button type="button" disabled={scanning || leadSaving} onClick={() => void moveNext()}>{leadSaving ? t('common.loading') : t('common.next')}<ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" aria-hidden="true" /></Button>}
      </div>
    </Card>
  </section>;
}
