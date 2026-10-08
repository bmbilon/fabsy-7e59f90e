import { Input } from './ui/input';
import { Label } from './ui/label';
import { portalLookupLabels, type PortalLookupKind } from '../../supabase/functions/_shared/portal-lookup-values';

export interface PortalLookupInput { kind: PortalLookupKind; value: string; confirmed: boolean }
export const emptyPortalLookup = (): PortalLookupInput => ({ kind: 'plate', value: '', confirmed: false });

export default function PortalLookupFields({ lookup, onChange, disabled = false }: {
  lookup: PortalLookupInput; onChange: (value: PortalLookupInput) => void; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="space-y-4">
    <legend className="mb-3 text-lg font-semibold">Ticket lookup detail</legend>
    <p className="text-sm text-muted-foreground">Provide one detail for the person or vehicle on this ticket: a licence plate, driver’s licence number, or date of birth. The Alberta portal needs it to find the ticket, even when it is missing from your photo.</p>
    <div className="space-y-2"><Label htmlFor="service-lookup-kind">Use</Label><select id="service-lookup-kind" className="h-12 w-full rounded-md border bg-background px-3 text-sm" value={lookup.kind} onChange={event => onChange({ kind: event.target.value as PortalLookupKind, value: '', confirmed: false })}>
      {(['plate', 'drivers_license', 'date_of_birth'] as const).map(kind => <option key={kind} value={kind}>{portalLookupLabels[kind]}</option>)}
    </select></div>
    <div className="space-y-2"><Label htmlFor="service-lookup-value">{portalLookupLabels[lookup.kind]}</Label><Input id="service-lookup-value" type={lookup.kind === 'date_of_birth' ? 'date' : 'text'} autoComplete="off" required maxLength={60} value={lookup.value} onChange={event => onChange({ ...lookup, value: event.target.value, confirmed: false })} /></div>
    <label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><input id="service-lookup-confirm" type="checkbox" required className="mt-1 h-5 w-5 shrink-0" checked={lookup.confirmed} onChange={event => onChange({ ...lookup, confirmed: event.target.checked })} /><span>I confirm that this detail belongs to the person or vehicle on the ticket covered by this request.</span></label>
  </fieldset>;
}
