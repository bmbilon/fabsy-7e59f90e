import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Phone, PhoneMissed, Voicemail, RefreshCw, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardAuth } from "@/hooks/useAdminDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Cursor { token: string; page: number }
interface Recording { sid: string; durationSeconds: number; transcript: string | null }
interface Call {
  sid: string; from: string; to: string; direction: "incoming" | "outgoing";
  startedAt: string; durationSeconds: number; providerStatus: string;
  outcome: string; voicemailCheckFailed: boolean; recordings: Recording[];
  providerUrl: string;
}
interface Page { items: Call[]; next: Cursor | null; line: string; checkedAt: string; warning: string | null }
const labels: Record<string, string> = {
  voicemail: "Voicemail left", voicemail_processing: "Voicemail processing", voicemail_unavailable: "Voicemail unavailable",
  answered: "Answered", missed_no_voicemail: "Missed · no voicemail", checking: "Checking for voicemail",
  voicemail_unknown: "Voicemail check unavailable", unconfirmed: "Answer unconfirmed", in_progress: "In progress",
  connected: "Connected", not_connected: "Not connected",
};
const date = (value: string) => new Intl.DateTimeFormat("en-CA", {dateStyle:"medium",timeStyle:"short",timeZone:"America/Edmonton"}).format(new Date(value));
async function invoke(body: Record<string, unknown>) {
  const {data,error,response} = await supabase.functions.invoke("admin-call-history", {body});
  if(error) {
    let message="Call history could not be loaded. Please try again.";
    try {const payload=await response?.json(); if(typeof payload?.error==='string')message=payload.error;} catch { /* keep general message */ }
    throw new Error(message);
  }
  return data;
}
export default function AdminCallHistory() {
  const auth=useDashboardAuth();
  const [params,setParams]=useSearchParams();
  const selected=params.get("call") || "";
  const selectedRecording=params.get("voicemail") || "";
  const [direction,setDirection]=useState<"incoming"|"outgoing">("incoming");
  const [days,setDays]=useState(30);
  const [phone,setPhone]=useState("");
  const [queryPhone,setQueryPhone]=useState("");
  const [cursor,setCursor]=useState<Cursor|null>(null);
  const [backStack,setBackStack]=useState<(Cursor|null)[]>([]);
  const [page,setPage]=useState<Page|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [playing,setPlaying]=useState("");
  const [audio,setAudio]=useState<Record<string,string>>({});
  const audioRef=useRef(audio);audioRef.current=audio;
  useEffect(()=>()=>{Object.values(audioRef.current).forEach(URL.revokeObjectURL);},[]);
  const refresh=useCallback(async()=>{
    if(auth.role.data!=="admin")return;
    setLoading(true);setError("");
    try {setPage(await invoke({action:"list",direction,days,phone:queryPhone,cursor,callSid:selected||null}) as Page);}
    catch(caught){setError(caught instanceof Error?caught.message:"Call history unavailable.");}
    finally{setLoading(false);}
  },[auth.role.data,direction,days,queryPhone,cursor,selected]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(selectedRecording&&page?.items.some(c=>c.recordings.some(r=>r.sid===selectedRecording))) document.getElementById(`voicemail-${selectedRecording}`)?.scrollIntoView({block:'center'});},[selectedRecording,page]);
  useEffect(()=>{
    const timer=window.setInterval(()=>{if(!document.hidden)void refresh();},60000);
    const visible=()=>{if(!document.hidden)void refresh();};
    document.addEventListener("visibilitychange",visible);window.addEventListener("online",visible);
    return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("online",visible);};
  },[refresh]);
  const chooseDirection=(value:"incoming"|"outgoing")=>{setDirection(value);setCursor(null);setBackStack([]);};
  const chooseDays=(value:number)=>{setDays(value);setCursor(null);setBackStack([]);};
  const closeSelected=()=>{setParams({}, {replace:true});setCursor(null);setBackStack([]);};
  const play=async(callSid:string,recordingSid:string)=>{
    setPlaying(recordingSid);setError("");
    try {
      const result=await invoke({action:"audio",callSid,recordingSid});
      if(!(result instanceof Blob))throw new Error("The voicemail audio could not be opened.");
      const url=URL.createObjectURL(new Blob([result],{type:"audio/mpeg"}));
      setAudio(previous=>{if(previous[recordingSid])URL.revokeObjectURL(previous[recordingSid]);return {...previous,[recordingSid]:url};});
    }catch(caught){setError(caught instanceof Error?caught.message:"Voicemail unavailable.");}
    finally{setPlaying("");}
  };
  const items=page?.items||[];
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
    <div><Link className="text-sm font-medium text-blue-700 underline" to="/admin/dashboard">← Main dashboard</Link>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Calls & voicemail</h1>
      <p className="mt-2 text-sm text-slate-600">Fabsy’s Twilio line · Times shown in Edmonton. Call and recording details are for administrators.</p></div>
    {auth.role.data!=="admin" ? <p role="status">{auth.role.isLoading?"Checking administrator access…":"Administrator access is required for call history."}</p> : <>
      {!selected&&<form className="rounded-xl border border-slate-200 bg-white p-4" onSubmit={event=>{event.preventDefault();setQueryPhone(phone);setCursor(null);setBackStack([]);}}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Call direction">
          {(["incoming","outgoing"] as const).map(value=><Button key={value} type="button" variant={direction===value?"default":"outline"} onClick={()=>chooseDirection(value)}>{value==="incoming"?"Incoming":"Outgoing"}</Button>)}
        </div><div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Date range">
          {([[7,"7 days"],[30,"30 days"],[90,"90 days"],[0,"All history"]] as const).map(([value,label])=><Button key={value} type="button" size="sm" variant={days===value?"secondary":"outline"} onClick={()=>chooseDays(value)}>{label}</Button>)}
        </div><div className="mt-4 flex flex-wrap gap-2"><Input className="max-w-xs" type="tel" aria-label="Filter by phone number" placeholder="Caller number" value={phone} onChange={event=>setPhone(event.target.value)} /><Button type="submit">Find number</Button><Button type="button" variant="outline" onClick={()=>void refresh()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
      </form>}
      {selected&&<Button variant="outline" onClick={closeSelected}>All calls</Button>}
      {error&&<p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {page?.warning&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">{page.warning}</p>}
      <p className="text-sm text-slate-600" role="status">{loading?"Loading calls…":page?`${items.length} calls on this page · Updated ${date(page.checkedAt)}`:"Loading calls…"}</p>
      {!loading&&page&&!items.length&&<p className="rounded-xl border border-slate-200 bg-white p-5">No calls on this page. Adjust the filters or open an older page.</p>}
      <div className="space-y-3">{items.map(call=>{
        const hasMessage=call.recordings.length>0;
        const isMissed=call.outcome==="missed_no_voicemail";
        return <article key={call.sid} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex items-start gap-3">
            {hasMessage?<Voicemail className="mt-1 h-5 w-5 text-blue-700" />:isMissed?<PhoneMissed className="mt-1 h-5 w-5 text-amber-700" />:<Phone className="mt-1 h-5 w-5 text-slate-600" />}
            <div><h2 className="font-semibold text-slate-900">{call.direction==="incoming"?call.from:call.to}</h2><p className="text-sm text-slate-600">{date(call.startedAt)} · {call.direction} · {call.durationSeconds}s</p></div></div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${hasMessage?"bg-blue-100 text-blue-900":isMissed?"bg-amber-100 text-amber-900":"bg-slate-100 text-slate-800"}`}>{labels[call.outcome]||"Call status unavailable"}</span>
          </div>
          {call.voicemailCheckFailed&&<p className="mt-2 text-sm text-amber-800">Twilio’s voicemail list could not be checked. Refresh to retry.</p>}
          {call.recordings.map(recording=><div key={recording.sid} id={`voicemail-${recording.sid}`} className="mt-4 rounded-lg bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium">Voicemail · {recording.durationSeconds}s</span><Button size="sm" variant="outline" disabled={playing===recording.sid} onClick={()=>void play(call.sid,recording.sid)}><Play className="mr-1 h-4 w-4" />{playing===recording.sid?"Opening…":"Listen"}</Button><Link className="text-sm text-blue-700 underline" to={`/admin/calls?call=${call.sid}&voicemail=${recording.sid}`}>Link to voicemail</Link></div>
            {audio[recording.sid]&&<audio className="mt-3 w-full" controls src={audio[recording.sid]} preload="none" aria-label={`Voicemail from ${call.from}`} />}
            {recording.transcript&&<details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Transcript</summary><p className="mt-2 whitespace-pre-wrap text-slate-700">{recording.transcript}</p></details>}
          </div>)}
          <div className="mt-3 flex flex-wrap gap-4 text-sm"><Link className="text-blue-700 underline" to={`/admin/calls?call=${call.sid}`}>Link to this call</Link><a className="text-blue-700 underline" href={call.providerUrl} target="_blank" rel="noopener noreferrer">Twilio details ↗</a></div>
        </article>;
      })}</div>
      {!selected&&<div className="flex gap-2"><Button variant="outline" disabled={!backStack.length||loading} onClick={()=>{setCursor(backStack[backStack.length-1]);setBackStack(backStack.slice(0,-1));}}>Newer calls</Button><Button variant="outline" disabled={!page?.next||loading} onClick={()=>{setBackStack([...backStack,cursor]);setCursor(page!.next);}}>Older calls</Button></div>}
      <p className="text-xs text-slate-500">A completed Twilio call can be an automated greeting. Calls without answer evidence are shown as unconfirmed.</p>
    </>}
  </main>;
}
