import { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { friendlyError, updateFile } from '../api';
import { formatShortDate } from '../format';
import { l1FileFrom, type FieldSources } from '../model';
import { notifyError, notifySuccess } from '../notify';
import { Button, Card, CardHead, Chip, Field, SelectInput, SourceTag, TextInput } from '../ui';
import { DETAILS_TITLE, MATTER_FIELDS, fieldError, fromFormValue, toFormValue, type FieldDef } from './fields';
import type { FileView } from './types';
import { torontoToday } from '../catalog';
import { useEditableForm } from '../hooks';

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export default function DetailsCard({ view }: { view: FileView }) {
  const { area, id, record, reading } = view;
  const fields = MATTER_FIELDS[area];
  const sources = (record.field_sources || {}) as FieldSources;
  const initial = useMemo(() => Object.fromEntries(fields.map(field => [field.key, toFormValue(field, record[field.key])])),
    [fields, record]);
  const { values: form, set: setField, reset, dirtyKeys, dirty } = useEditableForm(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const patch: Record<string, unknown> = {};
    const nextSources: FieldSources = { ...sources };
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      if (!dirtyKeys.includes(field.key)) continue;
      const value = fromFormValue(field, form[field.key] || '');
      if (value === undefined) { nextErrors[field.key] = fieldError(field); continue; }
      const current = record[field.key] ?? (field.type === 'list' ? [] : null);
      if (sameValue(value, current)) continue;
      patch[field.key] = value;
      nextSources[field.key] = { source: 'staff' };
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (!Object.keys(patch).length) { reset(); return; }
    setBusy(true);
    try {
      await updateFile(area, id, { ...patch, field_sources: nextSources });
      notifySuccess(`${DETAILS_TITLE[area]} saved`);
      view.refresh();
    } catch (cause) {
      notifyError('Not saved', friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  const n4 = useMemo(() => {
    if (area !== 'ltb' || record.notice_form !== 'N4') return null;
    const from = l1FileFrom(record.notice_termination_date as string | null);
    return from ? { from, open: torontoToday() >= from } : null;
  }, [area, record]);

  const groups = Array.from(new Set(fields.map(field => field.group)));
  const estimate = (key: string) => key === 'option_deadline'
    && (['form', 'document'].includes(sources.option_deadline?.source || '') || sources.option_deadline?.confidence === 'low');

  const control = (field: FieldDef) => {
    const fieldId = `detail-${field.key}`;
    const common = {
      id: fieldId,
      value: form[field.key] ?? '',
      disabled: reading || busy,
      'aria-invalid': errors[field.key] ? true : undefined,
      'aria-describedby': errors[field.key] ? `${fieldId}-error` : undefined,
      onChange: (event: { target: { value: string } }) => {
        setField(field.key, event.target.value);
        if (errors[field.key]) setErrors(current => { const next = { ...current }; delete next[field.key]; return next; });
      },
    };
    if (field.type === 'select') {
      return <SelectInput {...common}>
        {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </SelectInput>;
    }
    return <TextInput {...common} type={field.type === 'date' ? 'date' : 'text'} maxLength={field.max}
      inputMode={field.type === 'money' ? 'decimal' : field.type === 'int' ? 'numeric' : undefined}
      className={field.mono ? 'ahs-mono !text-[13px]' : undefined} />;
  };

  return <Card labelledBy="details-title">
    <CardHead id="details-title" title={DETAILS_TITLE[area]} icon={<ClipboardList />}
      sub={reading ? 'Editing opens when document reading finishes.' : 'Tags show where each value came from. Your edits are tagged Staff.'}
      actions={n4 ? <Chip tone={n4.open ? 'success' : 'neutral'} large>{n4.open ? 'L1 can be filed now' : `L1 from ${formatShortDate(n4.from)}`}</Chip> : undefined} />
    <div className="ahs-card-body space-y-5">
      {n4?.open && <p className="rounded-[6px] bg-[color:var(--ah-success-soft)] px-3 py-2 text-[12.5px] leading-5 text-[#22533c]">
        The N4 termination date has passed. The L1 can be filed from {formatShortDate(n4.from)}, unless the tenant paid all arrears first.
      </p>}
      {groups.map(group => <fieldset key={group} className="min-w-0">
        {groups.length > 1 && <legend className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-[color:var(--ah-muted)]">{group}</legend>}
        <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
          {fields.filter(field => field.group === group).map(field => <Field key={field.key} id={`detail-${field.key}`}
            className={field.wide ? 'sm:col-span-2' : undefined}
            label={<>{field.label}{estimate(field.key) && <span className="font-normal text-[color:var(--ah-muted)]"> (estimate)</span>}</>}
            extra={<SourceTag source={sources[field.key]} />}
            error={errors[field.key]}>
            {control(field)}
          </Field>)}
        </div>
      </fieldset>)}
    </div>
    <div className="ahs-card-foot">
      <Button size="sm" variant="primary" onClick={() => void save()} disabled={!dirty || reading} busy={busy}>Save details</Button>
      {dirty && <Button size="sm" variant="ghost" onClick={() => { reset(); setErrors({}); }} disabled={busy}>Discard changes</Button>}
      {dirty && <span className="ml-auto text-[12px] text-[color:var(--ah-muted)]">{dirtyKeys.length} unsaved {dirtyKeys.length === 1 ? 'change' : 'changes'}</span>}
    </div>
  </Card>;
}
