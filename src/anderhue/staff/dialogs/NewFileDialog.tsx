import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ANDERHUE_INTAKE_AREAS, GENERAL_CATEGORIES, LTB_ISSUES, TICKET_TYPES, torontoToday, type PracticeArea } from '../catalog';
import { createMatter, friendlyError } from '../api';
import { usePracticeSettings, useRefreshAfterWrite } from '../hooks';
import { fileHref } from '../model';
import { notifySuccess } from '../notify';
import { AreaIcon, Button, Field, SelectInput, StaffDialog, TextArea, TextInput } from '../ui';

const AREA_CHOICES: Record<PracticeArea, { label: string; hint: string }> = {
  ltb: { label: 'Landlord', hint: 'Landlord and Tenant Board' },
  traffic: { label: 'Traffic', hint: 'Ticket or court notice' },
  general: { label: 'Other', hint: 'Small claims, tribunals, more' },
};

const ORG_HELP: Record<PracticeArea, string> = {
  ltb: 'For a corporate landlord or property manager.',
  traffic: 'For a company vehicle or fleet.',
  general: 'For a business or organization.',
};

const EMPTY = {
  email: '', firstName: '', lastName: '', organizationName: '', phone: '',
  issue: 'arrears', city: '', ticketType: 'speeding', ticketCity: '', ticketReceivedOn: '',
  category: 'small_claims', deadline: '', otherParty: '', notes: '',
};

type FormState = typeof EMPTY;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Staff-opened file for a phone or walk-in client (practice_create_matter). */
export default function NewFileDialog({ open, onOpenChange, initialArea }: {
  open: boolean; onOpenChange: (open: boolean) => void; initialArea: PracticeArea;
}) {
  const navigate = useNavigate();
  const refresh = useRefreshAfterWrite();
  const practice = usePracticeSettings();
  const updatesOn = practice.data?.client_updates_enabled === true;
  const uid = useId();
  const [area, setArea] = useState<PracticeArea>(initialArea === 'general' ? 'ltb' : initialArea);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [invite, setInvite] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'form', string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setArea(initialArea === 'general' ? 'ltb' : initialArea);
    setForm(EMPTY);
    setErrors({});
    setInvite(true);
  }, [open, initialArea]);

  const set = (key: keyof FormState) => (event: { target: { value: string } }) => {
    const value = event.target.value;
    setForm(current => ({ ...current, [key]: value }));
    if (errors[key]) setErrors(current => ({ ...current, [key]: undefined }));
  };
  const id = (name: string) => `${uid}-${name}`;
  const today = torontoToday();

  const validate = () => {
    const next: typeof errors = {};
    if (!EMAIL.test(form.email.trim())) next.email = 'Enter the client’s email address.';
    if (!form.firstName.trim() && !form.lastName.trim() && !form.organizationName.trim()) {
      next.firstName = 'Add the client’s name or an organization.';
    }
    if (area === 'traffic' && form.ticketReceivedOn && form.ticketReceivedOn > today) next.ticketReceivedOn = 'This date is in the future.';
    if (form.notes.length > 2000) next.notes = 'Keep notes under 2,000 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const details = area === 'ltb'
        ? { issue: form.issue, city: form.city, notes: form.notes }
        : area === 'traffic'
          ? { ticketType: form.ticketType, ticketCity: form.ticketCity, ticketReceivedOn: form.ticketReceivedOn, notes: form.notes }
          : { category: form.category, deadline: form.deadline, otherParty: form.otherParty, notes: form.notes };
      const sendInvite = updatesOn && invite;
      const result = await createMatter({
        area,
        client: {
          email: form.email, firstName: form.firstName, lastName: form.lastName,
          organizationName: form.organizationName, phone: form.phone,
        },
        details,
        sendInvite,
      });
      refresh(area);
      onOpenChange(false);
      notifySuccess(`${result.caseNumber} opened`, sendInvite && result.noticeId
        ? 'The client gets an email with a secure upload link.'
        : 'The file is ready for review.');
      navigate(fileHref(area, result.caseId));
    } catch (cause) {
      setErrors({ form: friendlyError(cause, 'The file could not be opened. Try again.') });
    } finally {
      setBusy(false);
    }
  };

  return <StaffDialog open={open} onOpenChange={onOpenChange} title="New file" busy={busy} onSubmit={submit} className="!max-w-[600px]"
    description="Open a file for a phone or walk-in client. It starts in New intake, marked for review."
    footer={<>
      <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
      <Button type="submit" variant="primary" busy={busy}>Open file</Button>
    </>}>
    <fieldset className="min-w-0">
      <legend className="ahs-label">Practice area</legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Practice area">
        {ANDERHUE_INTAKE_AREAS.map(item => {
          const checked = area === item;
          return <label key={item} className={`relative flex cursor-pointer flex-col gap-0.5 rounded-[6px] border px-3 py-2 transition-colors ${checked
            ? 'border-[color:var(--ah-plum-900)] bg-[color:var(--ah-ivory-50)] shadow-[0_0_0_1px_var(--ah-plum-900)]'
            : 'border-[color:var(--ah-line-strong)] bg-white hover:border-[#b4a3b1]'}`}>
            <input type="radio" name={`${uid}-area`} value={item} checked={checked} onChange={() => setArea(item)}
              className="peer sr-only" />
            <span className={`flex items-center gap-1.5 text-[13.5px] font-semibold ${checked ? 'text-[color:var(--ah-plum-900)]' : 'text-[color:var(--ah-ink)]'}`}>
              <AreaIcon area={item} className="h-4 w-4 text-[color:var(--ah-gold-600)]" />{AREA_CHOICES[item].label}
            </span>
            <span className="hidden text-[11.5px] leading-4 text-[color:var(--ah-muted)] sm:block">{AREA_CHOICES[item].hint}</span>
            <span className="pointer-events-none absolute inset-0 rounded-[6px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--ah-gold-500)]" aria-hidden="true" />
          </label>;
        })}
      </div>
    </fieldset>

    <h3 className="mt-5 text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--ah-muted)]">Client</h3>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field id={id('email')} label="Email" error={errors.email} className="sm:col-span-2"
        help="Clients are shared across areas. An existing client with this email is reused.">
        <TextInput id={id('email')} type="email" autoComplete="off" value={form.email} onChange={set('email')} data-autofocus
          aria-invalid={!!errors.email} aria-describedby={errors.email ? `${id('email')}-error` : `${id('email')}-help`} required />
      </Field>
      <Field id={id('first')} label="First name" error={errors.firstName}>
        <TextInput id={id('first')} value={form.firstName} onChange={set('firstName')} maxLength={100} aria-invalid={!!errors.firstName} />
      </Field>
      <Field id={id('last')} label="Last name">
        <TextInput id={id('last')} value={form.lastName} onChange={set('lastName')} maxLength={100} />
      </Field>
      <Field id={id('org')} label="Organization" help={ORG_HELP[area]}>
        <TextInput id={id('org')} value={form.organizationName} onChange={set('organizationName')} maxLength={200} />
      </Field>
      <Field id={id('phone')} label="Phone">
        <TextInput id={id('phone')} type="tel" value={form.phone} onChange={set('phone')} maxLength={40} />
      </Field>
    </div>

    <h3 className="mt-5 text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--ah-muted)]">Matter</h3>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {area === 'ltb' && <>
        <Field id={id('issue')} label="Issue">
          <SelectInput id={id('issue')} value={form.issue} onChange={set('issue')}>
            {LTB_ISSUES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectInput>
        </Field>
        <Field id={id('city')} label="Rental unit city">
          <TextInput id={id('city')} value={form.city} onChange={set('city')} maxLength={100} />
        </Field>
      </>}
      {area === 'traffic' && <>
        <Field id={id('ticket-type')} label="Ticket type">
          <SelectInput id={id('ticket-type')} value={form.ticketType} onChange={set('ticketType')}>
            {TICKET_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectInput>
        </Field>
        <Field id={id('ticket-city')} label="Ticket city">
          <TextInput id={id('ticket-city')} value={form.ticketCity} onChange={set('ticketCity')} maxLength={100} />
        </Field>
        <Field id={id('received')} label="Received on" error={errors.ticketReceivedOn} className="sm:col-span-2"
          help="Sets an estimated response deadline 15 days later.">
          <div className="sm:max-w-[calc(50%-6px)]">
            <TextInput id={id('received')} type="date" max={today} value={form.ticketReceivedOn} onChange={set('ticketReceivedOn')}
              aria-invalid={!!errors.ticketReceivedOn} />
          </div>
        </Field>
      </>}
      {area === 'general' && <>
        <Field id={id('category')} label="Category">
          <SelectInput id={id('category')} value={form.category} onChange={set('category')}>
            {GENERAL_CATEGORIES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectInput>
        </Field>
        <Field id={id('deadline')} label="Deadline">
          <TextInput id={id('deadline')} type="date" value={form.deadline} onChange={set('deadline')} />
        </Field>
        <Field id={id('other-party')} label="Other party" className="sm:col-span-2">
          <TextInput id={id('other-party')} value={form.otherParty} onChange={set('otherParty')} maxLength={200} />
        </Field>
      </>}
      <Field id={id('notes')} label="Notes" error={errors.notes} className="sm:col-span-2"
        help="What the client told you. Staff only.">
        <TextArea id={id('notes')} rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} aria-invalid={!!errors.notes} />
      </Field>
    </div>

    <label className={`mt-5 flex items-start gap-3 rounded-[6px] border border-[color:var(--ahs-line-soft)] bg-[color:var(--ah-ivory-50)] p-3 ${updatesOn ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}>
      <input type="checkbox" className="ahs-check mt-0.5" checked={updatesOn && invite} disabled={!updatesOn}
        onChange={event => setInvite(event.target.checked)} aria-describedby={`${uid}-invite-help`} />
      <span>
        <span className="block text-[13.5px] font-semibold text-[color:var(--ah-ink)]">Email the client an upload link</span>
        <span id={`${uid}-invite-help`} className="mt-0.5 block text-[12.5px] leading-5 text-[color:var(--ah-muted)]">
          {updatesOn ? 'They get a secure link to add documents to this file.' : 'Client emails are off for this practice. Nothing will be sent.'}
        </span>
      </span>
    </label>
    {errors.form && <p role="alert" className="mt-4 rounded-[6px] bg-[color:var(--ah-danger-soft)] px-3 py-2 text-[13px] text-[#7d1a12]">{errors.form}</p>}
  </StaffDialog>;
}
