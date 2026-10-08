import {useEffect,useRef,useState,type FormEvent} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {normalizePortalLookup,portalLookupLabels,type PortalLookupKind} from '../../supabase/functions/_shared/portal-lookup-values';

interface Props {submissionId:string;accessToken:string;ticketNumber:string;onSaved:(saved:boolean)=>void}
async function request(action:string,values:Record<string,unknown>){
  const {data,error}=await supabase.functions.invoke('initial-disclosure-agent',{body:{action,...values}});
  if(error||typeof data?.saved!=='boolean')throw new Error('Your lookup detail could not be confirmed. Please try again.');
  return data as {saved:boolean;ticket_number?:string};
}
export default function PortalLookupStep({submissionId,accessToken,ticketNumber,onSaved}:Props){
  const [loading,setLoading]=useState(true);
  const [saved,setSaved]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [kind,setKind]=useState<PortalLookupKind>('plate');
  const [value,setValue]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const inFlight=useRef(false);
  const caseKey=useRef(submissionId+'/'+accessToken);
  caseKey.current=submissionId+'/'+accessToken;
  useEffect(()=>{
    let cancelled=false;setLoading(true);setSaved(false);onSaved(false);setError('');
    void request('client-lookup-status',{submissionId,accessToken}).then(result=>{
      if(cancelled)return;
      if(result.ticket_number&&result.ticket_number.toUpperCase().replace(/[^A-Z0-9]/g,'')!==ticketNumber.toUpperCase().replace(/[^A-Z0-9]/g,''))throw new Error('The saved details belong to a different ticket. Reload your ticket submission.');
      setSaved(result.saved);onSaved(result.saved);
    }).catch(failure=>{if(!cancelled)setError((failure as Error).message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[submissionId,accessToken,ticketNumber,onSaved,retry]);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(inFlight.current||!confirmed)return;
    let normalized:string;try{normalized=normalizePortalLookup(kind,value);}catch{setError('Enter a valid '+portalLookupLabels[kind].toLowerCase()+'.');return;}
    const current=caseKey.current;inFlight.current=true;setBusy(true);setError('');
    try{
      const result=await request('client-lookup-save',{submissionId,accessToken,kind,value:normalized,verified:true});
      if(caseKey.current!==current)return;
      if(!result.saved)throw new Error('Your lookup detail was not saved. Please try again.');
      setValue('');setSaved(true);onSaved(true);
    }catch(failure){if(caseKey.current===current)setError((failure as Error).message);}
    finally{inFlight.current=false;if(caseKey.current===current)setBusy(false);}
  };
  if(saved)return <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">Your lookup detail is saved for ticket {ticketNumber}.</p>;
  return <section aria-labelledby="portal-lookup-heading" className="space-y-4 rounded-xl border p-4">
    <h2 id="portal-lookup-heading" className="text-lg font-semibold">How should we find ticket {ticketNumber}?</h2>
    <p className="text-sm text-muted-foreground">The Alberta portal needs one detail to find your ticket: your licence plate, driver’s licence number, or date of birth. Save one before payment so we can request disclosure.</p>
    {loading?<p role="status">Checking your saved lookup detail…</p>:<form onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        <legend className="sr-only">Ticket lookup identifier</legend>
        <div className="space-y-2"><Label htmlFor="client-lookup-kind">Use my</Label><select id="client-lookup-kind" className="h-12 w-full rounded-md border bg-background px-3" value={kind} onChange={event=>{setKind(event.target.value as PortalLookupKind);setValue('');setConfirmed(false);}}>{(['plate','drivers_license','date_of_birth'] as const).map(key=><option key={key} value={key}>{portalLookupLabels[key]}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="client-lookup-value">{portalLookupLabels[kind]}</Label><Input id="client-lookup-value" type={kind==='date_of_birth'?'date':'text'} autoComplete="off" required maxLength={60} value={value} onChange={event=>{setValue(event.target.value);setConfirmed(false);}} /></div>
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" required className="mt-1 h-5 w-5 shrink-0" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} /><span>This detail is mine or belongs to the vehicle on ticket {ticketNumber}.</span></label>
        <Button type="submit" className="min-h-12 w-full" disabled={busy||!confirmed||!value.trim()}>{busy?'Saving…':'Save lookup detail and continue'}</Button>
      </fieldset>
    </form>}
    {error&&<div role="alert" className="space-y-2"><p className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" disabled={busy||loading} onClick={()=>setRetry(current=>current+1)}>Check saved detail again</Button></div>}
  </section>;
}
