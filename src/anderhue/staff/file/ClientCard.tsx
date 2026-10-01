import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Copy, ShieldCheck, UserRound } from 'lucide-react';
import { friendlyError, setClientRegistration, updateClient } from '../api';
import { formatDate, torontoDateOf } from '../format';
import { REGISTRATION_LABELS, fileHref, type FieldSources, type FileWithSignals } from '../model';
import { useEditableForm } from '../hooks';
import { notifyError, notifySuccess } from '../notify';
import { Button, Card, CardHead, Chip, Field, SelectInput, SourceTag, StagePill, TextInput } from '../ui';
import { CLIENT_FIELDS } from './fields';
import type { FileView } from './types';

const date = (timestamp: string | null) => formatDate(torontoDateOf(timestamp));

export default function ClientCard({ view, otherFiles }: { view: FileView; otherFiles: FileWithSignals[] }) {
  const { client } = view;
  const sources = (client.field_sources || {}) as FieldSources;
  const initial = useMemo(() => ({
    client_type: client.client_type || 'individual',
    ...Object.fromEntries(CLIENT_FIELDS.map(field => [field.key, ((client as unknown as Record<string, string | null>)[field.key]) || ''])),
  }) as Record<string, string>, [client]);
  const { values: form, set: setField, dirty } = useEditableForm(initial);
  const [idType, setIdType] = useState(client.identity_document_type || '');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setIdType(current => current || client.identity_document_type || ''); }, [client.identity_document_type]);

  const run = async (label: string, task: () => Promise<void>, success: string) => {
    setBusy(label);
    try {
      await task();
      notifySuccess(success);
      view.refresh();
    } catch (cause) {
      notifyError('Not saved', friendlyError(cause));
    } finally {
      setBusy(null);
    }
  };

  const save = () => run('save', async () => {
    const patch: Record<string, unknown> = {};
    const nextSources: FieldSources = { ...sources };
    if (form.client_type !== initial.client_type) patch.client_type = form.client_type;
    for (const field of CLIENT_FIELDS) {
      const next = (form[field.key] || '').trim().slice(0, field.max) || null;
      if (next !== (initial[field.key] || null)) {
        patch[field.key] = next;
        nextSources[field.key] = { source: 'staff' };
      }
    }
    if (!Object.keys(patch).length) return;
    await updateClient(client.id, { ...patch, field_sources: nextSources });
  }, 'Client details saved');

  const register = (status: 'registered' | 'verified') => run(status,
    () => setClientRegistration(client.id, status, idType),
    status === 'verified' ? 'Identity verified' : 'Registration confirmed');

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(client.email);
      notifySuccess('Email copied', client.email);
    } catch {
      notifyError('Copy failed', 'Select the address and copy it instead.');
    }
  };

  const status = client.registration_status;
  // Mirrors ltb_set_client_registration: a name or organization, a mailing address and a phone.
  const missing = [
    !client.first_name && !client.organization_name ? 'a name' : '',
    !client.mailing_address ? 'a mailing address' : '',
    !client.phone ? 'a phone number' : '',
  ].filter(Boolean);
  const description = status === 'provisional'
    ? 'Provisional. Confirm identity details with the client before registering.'
    : status === 'registered'
      ? `Registered ${date(client.registered_at)}. Later form submissions cannot change these details.`
      : `Identity verified (${client.identity_document_type || 'document'}) ${date(client.identity_verified_at)}.`;

  return <Card labelledBy="client-title">
    <CardHead id="client-title" title="Client" icon={<UserRound />} sub={description}
      actions={<Chip tone={status === 'verified' ? 'success' : status === 'registered' ? 'info' : 'warn'} large>
        {status === 'verified' && <BadgeCheck aria-hidden="true" />}{REGISTRATION_LABELS[status]}
      </Chip>} />
    <div className="ahs-card-body space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="ahs-label">Email</p>
          <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-medium text-[color:var(--ah-ink)]">
            <a href={`mailto:${client.email}`} className="truncate text-inherit no-underline hover:underline">{client.email}</a>
            <button type="button" onClick={() => void copyEmail()} aria-label="Copy email address"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] text-[color:var(--ah-muted)] hover:bg-[color:var(--ah-ivory-100)] hover:text-[color:var(--ah-ink)]">
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </p>
        </div>
        <Field id="client-type" label="Client type" className="w-44">
          <SelectInput id="client-type" small value={form.client_type} disabled={busy !== null}
            onChange={event => setField('client_type', event.target.value)}>
            <option value="individual">Individual</option>
            <option value="organization">Organization</option>
          </SelectInput>
        </Field>
      </div>
      <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
        {CLIENT_FIELDS.map(field => <Field key={field.key} id={`client-${field.key}`} label={field.label}
          className={field.wide ? 'sm:col-span-2' : undefined} extra={<SourceTag source={sources[field.key]} />}>
          <TextInput id={`client-${field.key}`} value={form[field.key] || ''} maxLength={field.max} disabled={busy !== null}
            onChange={event => setField(field.key, event.target.value)} />
        </Field>)}
      </div>
      <p className="text-[12px] text-[color:var(--ah-muted)]">The client record is shared by every file for this client.</p>
      {otherFiles.length > 0 && <div>
        <p className="ahs-label">Other files for this client</p>
        <ul className="ahs-inset ahs-divide">
          {otherFiles.map(file => <li key={file.key}>
            <Link to={fileHref(file.area, file.id)} className="ahs-row-link flex items-center gap-2 px-3 py-2">
              <span className="ahs-mono text-[12px] text-[color:var(--ah-plum-800)]">{file.number}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[color:var(--ah-ink-2)]">{file.title}</span>
              <StagePill area={file.area} stage={file.stage} />
            </Link>
          </li>)}
        </ul>
      </div>}
      {client.portal_revoked_before && <p className="text-[12px] text-[color:var(--ah-muted)]">
        Client links issued before {date(client.portal_revoked_before)} were revoked.
      </p>}
      {status !== 'verified' && <div className="ahs-inset p-3.5">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--ah-ink)]">
          <ShieldCheck className="h-4 w-4 text-[color:var(--ah-gold-600)]" aria-hidden="true" />Identity
        </p>
        <p className="mt-0.5 text-[12px] leading-5 text-[color:var(--ah-muted)]">Record the photo ID you checked to mark the client verified.</p>
        <div className="mt-2.5 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-[1_1_220px]">
            <Field id="client-id-type" label="ID document checked">
              <TextInput id="client-id-type" small placeholder="For example, Ontario driver’s licence"
                value={idType} maxLength={60} onChange={event => setIdType(event.target.value)} />
            </Field>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void register('verified')}
            disabled={busy !== null || dirty || missing.length > 0 || !idType.trim()} busy={busy === 'verified'}>
            {busy !== 'verified' && <ShieldCheck aria-hidden="true" />}Mark ID verified
          </Button>
        </div>
      </div>}
    </div>
    <div className="ahs-card-foot">
      <Button size="sm" variant="secondary" onClick={() => void save()} disabled={!dirty || busy !== null} busy={busy === 'save'}>Save client details</Button>
      {status === 'provisional' && <Button size="sm" variant="primary" onClick={() => void register('registered')}
        disabled={busy !== null || dirty || missing.length > 0} busy={busy === 'registered'}>
        Confirm registration
      </Button>}
      {status !== 'verified' && (dirty || missing.length > 0) && <p className="w-full text-[12px] text-[color:var(--ah-muted)] sm:ml-auto sm:w-auto">
        {dirty ? 'Save the client details first.' : `To register, add ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0]}.`}
      </p>}
    </div>
  </Card>;
}
