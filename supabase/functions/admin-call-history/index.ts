import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { classify, FABSY_NUMBER, HistoryError, parseFilters, provider, type Evidence, type Recording } from './service.ts';

export function createHandler(db: any, voice: ReturnType<typeof provider>) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin') || '';
    const allowed = new Set(['https://fabsy.ca','https://www.fabsy.ca','http://localhost:4173','http://localhost:5173']);
    const headers = {'Access-Control-Allow-Origin':allowed.has(origin)?origin:'https://fabsy.ca','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',Vary:'Origin'};
    const json = (data: unknown,status=200)=>Response.json(data,{status,headers});
    if(origin && !allowed.has(origin)) return json({error:'Origin not allowed.'},403);
    if(req.method==='OPTIONS') return new Response(null,{headers});
    if(req.method!=='POST') return json({error:'Use POST.'},405);
    try {
      const bearer=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
      if(!bearer) throw new HistoryError('Admin sign-in required.',401);
      const {data:auth,error:authError}=await db.auth.getUser(bearer);
      if(authError||!auth?.user) throw new HistoryError('Admin sign-in required.',401);
      const {data:role,error:roleError}=await db.from('user_roles').select('role').eq('user_id',auth.user.id).eq('role','admin').maybeSingle();
      if(roleError||!role) throw new HistoryError('Administrator access required for call history.',403);
      const raw=await req.json();
      if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new HistoryError('Invalid request.');
      if(raw.action==='audio') {
        if(typeof raw.callSid!=='string'||typeof raw.recordingSid!=='string'||!/^RE[0-9a-f]{32}$/i.test(raw.recordingSid)) throw new HistoryError('Invalid voicemail reference.');
        const call=await voice.call(raw.callSid);
        if(call.direction!=='inbound') throw new HistoryError('Voicemail not found.',404);
        const expectedPath=`voicemail/${FABSY_NUMBER.slice(1)}/${raw.recordingSid}.mp3`;
        const {data:archive,error:archiveError}=await db.from('call_logs').select('recording_path,structured').eq('vapi_call_id',`twilio:${raw.recordingSid}`).eq('phone_number_to',FABSY_NUMBER).maybeSingle();
        let bytes:ArrayBuffer|undefined;
        // Only use a cache whose original callback verified the same parent call.
        if(!archiveError&&archive?.recording_path===expectedPath&&archive.structured?.callSid===call.sid) {
          const saved=await db.storage.from('call-recordings').download(expectedPath);
          if(!saved.error&&saved.data) bytes=await saved.data.arrayBuffer();
        }
        if(!bytes) bytes=await voice.audio(call,raw.recordingSid);
        return new Response(bytes,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':'inline; filename="fabsy-voicemail.mp3"'}});
      }
      if(raw.action!=='list') throw new HistoryError('Unknown call-history action.');
      const filters=parseFilters(raw);
      const page=filters.callSid?{calls:[await voice.call(filters.callSid)],next:null}:await voice.list(filters);
      const sids=page.calls.map(c=>c.sid);
      const evidenceResult=sids.length?await db.from('voice_notification_events').select('call_sid,kind,recording_sid').in('call_sid',sids):{data:[],error:null};
      const evidence:Evidence[]=evidenceResult.error?[]:evidenceResult.data;
      const items=[];
      // Bound concurrent provider lookups to four, so a large history cannot fan out.
      for(let i=0;i<page.calls.length;i+=4) {
        items.push(...await Promise.all(page.calls.slice(i,i+4).map(async call=>{
          let recordings:Recording[]|null=[];
          if(call.direction==='inbound') {try{recordings=await voice.recordings(call);}catch{recordings=null;}}
          // A private archive can outlive a missing/late Twilio recording lookup.
          const archivedSid=evidence.find(e=>e.call_sid===call.sid&&e.kind==='voicemail'&&/^RE[0-9a-f]{32}$/i.test(e.recording_sid||''))?.recording_sid;
          if(call.direction==='inbound'&&archivedSid&&!recordings?.some(r=>r.sid===archivedSid)) {
            const archived=await db.from('call_logs').select('vapi_call_id,recording_path,structured,duration_seconds,transcript')
              .eq('vapi_call_id',`twilio:${archivedSid}`).eq('phone_number_to',FABSY_NUMBER).maybeSingle();
            if(!archived.error&&archived.data?.recording_path===`voicemail/${FABSY_NUMBER.slice(1)}/${archivedSid}.mp3`&&archived.data.structured?.callSid===call.sid) {
              recordings=[...(recordings||[]),{sid:archivedSid,call_sid:call.sid,account_sid:call.account_sid,source:'RecordVerb',status:'completed',duration:String(archived.data.duration_seconds||1)}];
            }
          }
          const voicemail=recordings?.filter(r=>r.status==='completed'&&Number(r.duration)>0)||[];
          const ids=voicemail.map(r=>`twilio:${r.sid}`);
          const cached=ids.length?await db.from('call_logs').select('vapi_call_id,transcript').eq('phone_number_to',FABSY_NUMBER).in('vapi_call_id',ids):{data:[],error:null};
          return {sid:call.sid,from:call.from,to:call.to,direction:call.direction==='inbound'?'incoming':'outgoing',startedAt:call.start_time||call.date_created,durationSeconds:Number(call.duration||0),providerStatus:call.status,
            outcome:classify(call,evidence,recordings),voicemailCheckFailed:recordings===null,
            recordings:voicemail.map(r=>({sid:r.sid,durationSeconds:Number(r.duration),transcript:cached.error?null:cached.data?.find((v:any)=>v.vapi_call_id===`twilio:${r.sid}`)?.transcript??null})),
            providerUrl:`https://console.twilio.com/us1/monitor/logs/calls/${call.sid}`};
        })));
      }
      return json({items,next:page.next,line:FABSY_NUMBER,checkedAt:new Date().toISOString(),warning:evidenceResult.error?'Answer confirmation records are temporarily unavailable. Some call outcomes may be unconfirmed.':null});
    } catch(error) {
      return json({error:error instanceof HistoryError?error.message:'Call history could not be loaded. Please try again.'},error instanceof HistoryError?error.status:503);
    }
  };
}
if(import.meta.main) {
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(15000)})}});
  // Validate provider configuration after authentication, without crashing OPTIONS/sign-in errors.
  const voice=new Proxy({} as ReturnType<typeof provider>,{get:(_,name)=> (...args:unknown[])=>{
    const instance=provider(Deno.env.get('TWILIO_ACCOUNT_SID')||'',Deno.env.get('TWILIO_AUTH_TOKEN')||'');
    return (instance[name as keyof typeof instance] as (...a:unknown[])=>unknown)(...args);
  }});
  Deno.serve(createHandler(db,voice));
}
