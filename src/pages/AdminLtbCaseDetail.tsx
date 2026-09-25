import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useDashboardAuth } from '@/hooks/useAdminDashboard';
import useSafeHead from '@/hooks/useSafeHead';
import { ltbDb, setLtbCaseStage, stageErrorMessage } from '@/lib/admin/ltbApi';
import {
  LTB_ISSUE_LABELS, LTB_OUTCOMES, LTB_STAGES, formatCents, l1FileFrom, ltbStageLabel, torontoToday,
} from '@/lib/admin/ltbFunnel';

type Source = { source: 'form' | 'document' | 'staff'; documentId?: string; kind?: string; confidence?: 'high' | 'low' };
type Sources = Record<string, Source>;

interface ClientRecord {
  id: string;
  client_type: 'individual' | 'organization';
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  business_number: string | null;
  contact_title: string | null;
  email: string;
  phone: string | null;
  mailing_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  occupation: string | null;
  registration_status: 'provisional' | 'registered' | 'verified';
  registered_at: string | null;
  identity_verified_at: string | null;
  identity_document_type: string | null;
  field_sources: Sources;
}

interface CaseRecord {
  id: string;
  practice_id: string;
  case_number: string;
  stage: string;
  outcome: string | null;
  issue: string;
  notice_served: string;
  rental_unit_address: string | null;
  unit_city: string | null;
  tenant_names: string[];
  rent_amount_cents: number | null;
  rent_period: string | null;
  rent_due_day: number | null;
  lease_start_date: string | null;
  arrears_claimed_cents: number | null;
  arrears_reported_text: string | null;
  notice_form: string | null;
  notice_served_on: string | null;
  notice_service_method: string | null;
  notice_termination_date: string | null;
  hearing_date: string | null;
  intake_review_status: 'pending_scan' | 'scanning' | 'needs_review' | 'ready';
  review_notes: string | null;
  client_notes: string | null;
  returning_client: boolean;
  field_sources: Sources;
  created_at: string;
  ltb_clients: ClientRecord;
}

interface DocumentRecord {
  id: string;
  storage_path: string;
  original_name: string | null;
  content_type: string;
  size_bytes: number;
  uploaded_at: string | null;
  kind: string | null;
  extraction_status: string;
  extracted: { fields?: Record<string, unknown>; lowConfidence?: string[]; notes?: string } | null;
}

interface EventRecord { id: number; event: string; detail: Record<string, unknown>; at: string }

const CLIENT_FIELDS: [keyof ClientRecord, string][] = [
  ['first_name', 'First name'], ['last_name', 'Last name'], ['organization_name', 'Organization'],
  ['business_number', 'Business / incorporation no.'], ['contact_title', 'Title of person instructing'],
  ['phone', 'Phone'], ['mailing_address', 'Mailing address'], ['city', 'City'], ['province', 'Province'],
  ['postal_code', 'Postal code'], ['occupation', 'Occupation / business type'],
];

type CaseField = { key: keyof CaseRecord; label: string; type: 'text' | 'date' | 'money' | 'int' | 'list' | 'select'; options?: string[] };
const CASE_FIELDS: CaseField[] = [
  { key: 'rental_unit_address', label: 'Rental unit address', type: 'text' },
  { key: 'unit_city', label: 'Rental unit city', type: 'text' },
  { key: 'tenant_names', label: 'Tenants (comma separated)', type: 'list' },
  { key: 'rent_amount_cents', label: 'Rent ($)', type: 'money' },
  { key: 'rent_period', label: 'Rent period', type: 'select', options: ['', 'monthly', 'weekly', 'daily', 'yearly'] },
  { key: 'rent_due_day', label: 'Rent due day', type: 'int' },
  { key: 'lease_start_date', label: 'Lease start', type: 'date' },
  { key: 'arrears_claimed_cents', label: 'Arrears claimed ($)', type: 'money' },
  { key: 'notice_form', label: 'Notice form', type: 'select', options: ['', 'N4', 'N5', 'N7', 'N8', 'N12', 'N13', 'other'] },
  { key: 'notice_served_on', label: 'Notice served on', type: 'date' },
  { key: 'notice_service_method', label: 'Service method', type: 'select', options: ['', 'hand', 'mailbox', 'mail', 'courier', 'email', 'other'] },
  { key: 'notice_termination_date', label: 'Termination date', type: 'date' },
  { key: 'hearing_date', label: 'Hearing date', type: 'date' },
];

const toFormValue = (field: CaseField, value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (field.type === 'money') return typeof value === 'number' ? (value / 100).toFixed(2) : '';
  if (field.type === 'list') return Array.isArray(value) ? value.join(', ') : '';
  return String(value);
};

const fromFormValue = (field: CaseField, value: string): unknown => {
  const text = value.trim();
  if (field.type === 'list') return text ? text.split(',').map(item => item.trim()).filter(Boolean).slice(0, 10) : [];
  if (!text) return null;
  if (field.type === 'money') {
    const amount = Number(text.replace(/[$,\s]/g, ''));
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
  }
  if (field.type === 'int') {
    const day = Number(text);
    return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
  }
  return text;
};

function SourceTag({ source }: { source?: Source }) {
  if (!source) return null;
  const label = source.source === 'document'
    ? `From ${source.kind?.replace('_', ' ') || 'document'}${source.confidence === 'low' ? ' · low confidence' : ''}`
    : source.source === 'form' ? 'Typed by client' : 'Staff';
  const tone = source.confidence === 'low' ? 'bg-amber-100 text-amber-900'
    : source.source === 'document' ? 'bg-sky-100 text-sky-900' : 'bg-slate-100 text-slate-600';
  return <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>{label}</span>;
}

export default function AdminLtbCaseDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const auth = useDashboardAuth();
  useSafeHead({ title: 'LTB file | Fabsy admin', robots: 'noindex, nofollow' });

  useEffect(() => {
    if (auth.ready && !auth.session) navigate('/admin');
  }, [auth.ready, auth.session, navigate]);

  const validId = /^[0-9a-f-]{36}$/i.test(id);
  const detail = useQuery({
    queryKey: ['ltb-case', id],
    enabled: !!auth.session && validId,
    retry: false,
    queryFn: async () => {
      const [caseResult, docResult, eventResult] = await Promise.all([
        ltbDb.from('ltb_cases').select('*, ltb_clients(*)').eq('id', id).maybeSingle(),
        ltbDb.from('ltb_case_documents').select('id,storage_path,original_name,content_type,size_bytes,uploaded_at,kind,extraction_status,extracted')
          .eq('case_id', id).order('created_at'),
        ltbDb.from('ltb_case_events').select('id,event,detail,at').eq('case_id', id).order('at', { ascending: false }).limit(100),
      ]);
      if (caseResult.error || docResult.error || eventResult.error) throw new Error('File could not be loaded.');
      return {
        record: caseResult.data as CaseRecord | null,
        documents: (docResult.data || []) as DocumentRecord[],
        events: (eventResult.data || []) as EventRecord[],
      };
    },
  });
  const record = detail.data?.record;
  const client = record?.ltb_clients;
  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ['ltb-case', id] });
    void queryClient.invalidateQueries({ queryKey: ['ltb-board'] });
  };

  const [clientForm, setClientForm] = useState<Record<string, string>>({});
  const [caseForm, setCaseForm] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [stage, setStage] = useState('');
  const [outcome, setOutcome] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [idType, setIdType] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!record || !client) return;
    setClientForm(Object.fromEntries([
      ['client_type', client.client_type],
      ...CLIENT_FIELDS.map(([key]) => [key, (client[key] as string | null) || '']),
    ]));
    setCaseForm(Object.fromEntries(CASE_FIELDS.map(field => [field.key, toFormValue(field, record[field.key])])));
    setNotes(record.review_notes || '');
    setStage(record.stage);
    setOutcome(record.outcome || '');
    setIdType(client.identity_document_type || '');
  }, [record, client]);

  const n4 = useMemo(() => {
    if (!record || record.notice_form !== 'N4') return null;
    const fileFrom = l1FileFrom(record.notice_termination_date);
    return { fileFrom, open: Boolean(fileFrom && torontoToday() >= fileFrom) };
  }, [record]);

  const run = async (label: string, task: () => Promise<void>, success: string) => {
    setBusy(label);
    try {
      await task();
      toast({ title: success });
      reload();
    } catch (error) {
      toast({ title: 'Not saved', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  if (!validId) return <main className="p-6 text-sm text-slate-600">That file link is not valid.</main>;
  if (detail.isLoading || !auth.ready) return <main className="p-6 text-sm text-slate-500">Loading file…</main>;
  if (detail.isError || !record || !client) {
    return <main className="p-6">
      <Link to="/admin/ltb" className="inline-flex items-center text-sm text-blue-700"><ArrowLeft className="mr-1 h-4 w-4" />All LTB files</Link>
      <p className="mt-4 text-sm text-slate-600">This file is not available to your account.</p>
    </main>;
  }

  const saveClient = () => run('client', async () => {
    const patch: Record<string, unknown> = {};
    const sources: Sources = { ...client.field_sources };
    if (clientForm.client_type !== client.client_type) patch.client_type = clientForm.client_type;
    for (const [key] of CLIENT_FIELDS) {
      const next = (clientForm[key] || '').trim() || null;
      if (next !== ((client[key] as string | null) || null)) {
        patch[key] = next;
        sources[key] = { source: 'staff' };
      }
    }
    if (!Object.keys(patch).length) return;
    const { error } = await ltbDb.from('ltb_clients').update({ ...patch, field_sources: sources }).eq('id', client.id);
    if (error) throw new Error('Client details could not be saved.');
  }, 'Client details saved');

  const saveCase = () => run('case', async () => {
    const patch: Record<string, unknown> = {};
    const sources: Sources = { ...record.field_sources };
    for (const field of CASE_FIELDS) {
      const next = fromFormValue(field, caseForm[field.key] || '');
      if (JSON.stringify(next) !== JSON.stringify(record[field.key] ?? (field.type === 'list' ? [] : null))) {
        patch[field.key] = next;
        sources[field.key] = { source: 'staff' };
      }
    }
    if (!Object.keys(patch).length) return;
    const { error } = await ltbDb.from('ltb_cases').update({ ...patch, field_sources: sources }).eq('id', record.id);
    if (error) throw new Error('Tenancy details could not be saved. Wait until document reading finishes.');
  }, 'Tenancy details saved');

  const saveReview = (markReviewed: boolean) => run('review', async () => {
    const { error } = await ltbDb.from('ltb_cases').update({
      review_notes: notes.slice(0, 4000) || null,
      ...(markReviewed ? { intake_review_status: 'ready' } : {}),
    }).eq('id', record.id);
    if (error) throw new Error('Review could not be saved.');
  }, markReviewed ? 'Marked reviewed' : 'Notes saved');

  const setRegistration = (status: 'registered' | 'verified') => run('registration', async () => {
    const { error } = await ltbDb.rpc('ltb_set_client_registration', {
      p_client_id: client.id, p_status: status, p_identity_document_type: status === 'verified' ? idType.trim() || null : null,
    });
    if (error) throw new Error(stageErrorMessage(error.message));
  }, status === 'verified' ? 'Identity verified' : 'Registration confirmed');

  const openDocument = async (doc: DocumentRecord) => {
    const { data, error } = await ltbDb.storage.from('ltb-documents').createSignedUrl(doc.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast({ title: 'Document unavailable', variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const reviewTone = record.intake_review_status === 'ready' ? 'bg-emerald-100 text-emerald-900'
    : record.intake_review_status === 'needs_review' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900';
  const reviewLabel = { pending_scan: 'Waiting for documents', scanning: 'Reading documents', needs_review: 'Needs review', ready: 'Reviewed / ready' }[record.intake_review_status];
  const name = client.organization_name || [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Name pending';

  return <main className="px-4 py-6 sm:px-6">
    <Link to="/admin/ltb" className="inline-flex items-center text-sm text-blue-700"><ArrowLeft className="mr-1 h-4 w-4" />All LTB files</Link>
    <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400">{record.case_number}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {LTB_ISSUE_LABELS[record.issue] || 'Something else'} · {ltbStageLabel(record.stage)}
          {record.returning_client ? ' · Returning client' : ''}
        </p>
      </div>
      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${reviewTone}`}>{reviewLabel}</span>
    </div>

    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review</CardTitle>
            <CardDescription>Read automatically from the uploads and checked against the rules in force. Confirm against the originals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {record.client_notes && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700"><span className="font-semibold">Client wrote:</span> {record.client_notes}</p>}
            {record.arrears_reported_text && <p className="text-sm text-slate-600">Client estimated arrears: {record.arrears_reported_text}</p>}
            <Textarea aria-label="Review notes" rows={7} value={notes} onChange={event => setNotes(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => saveReview(false)}>Save notes</Button>
              {record.intake_review_status === 'needs_review' &&
                <Button size="sm" disabled={busy !== null} onClick={() => saveReview(true)}><CheckCircle2 className="mr-1 h-4 w-4" />Mark reviewed</Button>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client registration</CardTitle>
            <CardDescription>
              {client.registration_status === 'provisional' && 'Provisional. Confirm identity details with the client before registering.'}
              {client.registration_status === 'registered' && `Registered ${client.registered_at ? new Date(client.registered_at).toLocaleDateString('en-CA') : ''}. Later form submissions cannot change these details.`}
              {client.registration_status === 'verified' && `Identity verified (${client.identity_document_type || 'document'}) ${client.identity_verified_at ? new Date(client.identity_verified_at).toLocaleDateString('en-CA') : ''}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium text-slate-700">{client.email}</span>
              <label className="flex items-center gap-2 text-slate-600">Type
                <select className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm" value={clientForm.client_type || 'individual'}
                  onChange={event => setClientForm(form => ({ ...form, client_type: event.target.value }))}>
                  <option value="individual">Individual</option>
                  <option value="organization">Organization</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {CLIENT_FIELDS.map(([key, label]) => <label key={key} className="block text-xs font-medium text-slate-600">
                {label}<SourceTag source={client.field_sources?.[key]} />
                <Input className="mt-1" value={clientForm[key] || ''} onChange={event => setClientForm(form => ({ ...form, [key]: event.target.value }))} />
              </label>)}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={saveClient}>Save client details</Button>
              {client.registration_status === 'provisional' &&
                <Button size="sm" disabled={busy !== null} onClick={() => setRegistration('registered')}>Confirm registration</Button>}
              {client.registration_status !== 'verified' && <>
                <Input aria-label="ID document checked" placeholder="ID checked, e.g. Ontario driver's licence" className="h-9 max-w-xs" value={idType} onChange={event => setIdType(event.target.value)} />
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setRegistration('verified')}><ShieldCheck className="mr-1 h-4 w-4" />Mark ID verified</Button>
              </>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenancy and notice</CardTitle>
            {n4?.fileFrom && <CardDescription className={n4.open ? 'text-emerald-700' : ''}>
              {n4.open ? `L1 can be filed now (from ${n4.fileFrom}), unless the tenant paid all arrears first.` : `Earliest L1 filing: ${n4.fileFrom}.`}
            </CardDescription>}
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {CASE_FIELDS.map(field => <label key={field.key} className="block text-xs font-medium text-slate-600">
                {field.label}<SourceTag source={record.field_sources?.[field.key]} />
                {field.type === 'select'
                  ? <select className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm" value={caseForm[field.key] || ''}
                      onChange={event => setCaseForm(form => ({ ...form, [field.key]: event.target.value }))}>
                      {field.options?.map(option => <option key={option} value={option}>{option || 'Not set'}</option>)}
                    </select>
                  : <Input className="mt-1" type={field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'money' || field.type === 'int' ? 'decimal' : undefined}
                      value={caseForm[field.key] || ''} onChange={event => setCaseForm(form => ({ ...form, [field.key]: event.target.value }))} />}
              </label>)}
            </div>
            <Button className="mt-4" size="sm" variant="outline" disabled={busy !== null || ['pending_scan', 'scanning'].includes(record.intake_review_status)} onClick={saveCase}>Save tenancy details</Button>
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Stage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <select aria-label="Stage" className="h-10 w-full rounded-md border border-input bg-white px-2 text-sm" value={stage} onChange={event => setStage(event.target.value)}>
              {LTB_STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {stage === 'closed' && <select aria-label="Outcome" className="h-10 w-full rounded-md border border-input bg-white px-2 text-sm" value={outcome} onChange={event => setOutcome(event.target.value)}>
              <option value="">Choose outcome</option>
              {LTB_OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>}
            <Input aria-label="Stage note" placeholder="Note (optional)" value={stageNote} maxLength={1000} onChange={event => setStageNote(event.target.value)} />
            <Button size="sm" className="w-full" disabled={busy !== null || (stage === record.stage && (outcome || null) === record.outcome)}
              onClick={() => run('stage', () => setLtbCaseStage(record.id, stage, stage === 'closed' ? outcome : null, stageNote).then(() => setStageNote('')), 'Stage updated')}>
              Update stage
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!detail.data?.documents.length && <p className="text-sm text-slate-500">No documents uploaded.</p>}
            {detail.data?.documents.map(doc => <div key={doc.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-medium text-slate-800"><FileText className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate">{doc.original_name || doc.kind || 'Document'}</span></p>
                  <p className="mt-1 text-xs text-slate-500">{doc.kind?.replace('_', ' ') || 'unclassified'} · {doc.extraction_status.replace('_', ' ')} · {Math.max(1, Math.round(doc.size_bytes / 1024))} KB</p>
                </div>
                {doc.uploaded_at && <Button size="sm" variant="ghost" onClick={() => openDocument(doc)} aria-label={`Open ${doc.original_name || 'document'}`}><ExternalLink className="h-4 w-4" /></Button>}
              </div>
              {doc.extracted?.fields && <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-600">What was read</summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  {Object.entries(doc.extracted.fields).filter(([, value]) => value !== null && !(Array.isArray(value) && !value.length)).map(([key, value]) => <div key={key} className="contents">
                    <dt className="text-slate-500">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}{doc.extracted?.lowConfidence?.includes(key) ? ' (low)' : ''}</dt>
                    <dd className="text-slate-800">{/cents$/i.test(key) ? formatCents(value as number) : Array.isArray(value) ? value.join(', ') : String(value)}</dd>
                  </div>)}
                </dl>
                {doc.extracted.notes && <p className="mt-2 text-xs text-slate-600">{doc.extracted.notes}</p>}
              </details>}
            </div>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-2 text-xs">
              {detail.data?.events.map(event => <li key={event.id} className="border-b border-slate-100 pb-2">
                <p className="font-medium text-slate-800">{event.event.replace(/_/g, ' ')}</p>
                <p className="text-slate-500">{new Date(event.at).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}
                  {typeof event.detail.stage === 'string' ? ` · ${ltbStageLabel(event.detail.stage)}` : ''}
                  {typeof event.detail.note === 'string' ? ` · ${event.detail.note}` : ''}
                  {Array.isArray(event.detail.fields) ? ` · ${(event.detail.fields as string[]).join(', ')}` : ''}</p>
              </li>)}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  </main>;
}
