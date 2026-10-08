import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {initialDisclosurePacket,initialHash,prepareInitialMaterial,savePortalLookup,portalLookupSourceHash} from '../_shared/initial-disclosure-material.ts';
import {normalizePortalLookup} from '../_shared/portal-lookup-values.ts';
import {serviceOrderLookup} from '../_shared/service-order-lookup.ts';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://fabsy.ca','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-runner-secret','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
async function secretMatches(value:string,expected:string){if(!value||!expected)return false;const a=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(expected)));let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
export async function handler(req:Request){
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const runner=await secretMatches(req.headers.get('x-runner-secret')||'',Deno.env.get('PORTAL_RUNNER_SECRET')||'');
 const authorization=req.headers.get('Authorization')||'';
 const scoped=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}});
 let staff=false,admin=false,staffId:string|undefined;
 if(!runner&&authorization.startsWith('Bearer ')){
  const user=await db.auth.getUser(authorization.slice(7));
  if(!user.error&&user.data.user){const role=await scoped.rpc('idr_staff_role');staff=!role.error&&['admin','case_manager'].includes(role.data);admin=staff&&role.data==='admin';if(staff)staffId=user.data.user.id;}
 }
 try{
  const input=await req.json();
  if(['order-lookup-status','order-lookup-save'].includes(input.action)) return reply(await serviceOrderLookup(db,input));
  if(['client-lookup-status','client-lookup-save'].includes(input.action)){
   if(typeof input.submissionId!=='string'||typeof input.accessToken!=='string'||!/^[A-Za-z0-9_-]{32,200}$/.test(input.accessToken))return reply({error:'UNAUTHORIZED'},401);
   const ticket=await db.from('ticket_submissions').select('id,ticket_number,ticket_document_path,representation_access_token_hash,date_of_birth,drivers_license').eq('id',input.submissionId).is('deleted_at',null).maybeSingle();
   if(ticket.error||!ticket.data||ticket.data.representation_access_token_hash!==await initialHash(input.accessToken))return reply({error:'UNAUTHORIZED'},401);
   if(input.action==='client-lookup-status'){
    const result=await db.from('case_portal_verifications').select('kind,source_path,source_sha256,ticket_number').eq('submission_id',input.submissionId).is('revoked_at',null).maybeSingle();
    if(result.error)throw new Error('LOOKUP_DETAILS_UNAVAILABLE');
    const current=result.data&&result.data.source_path===ticket.data.ticket_document_path&&result.data.ticket_number===String(ticket.data.ticket_number).toUpperCase().replace(/[^A-Z0-9]/g,'')&&result.data.source_sha256===await portalLookupSourceHash(db,ticket.data.ticket_document_path);
    let stored=false;
    for(const [kind,key] of [['drivers_license','drivers_license'],['date_of_birth','date_of_birth']] as const){try{normalizePortalLookup(kind,ticket.data[key]);stored=true;}catch{/* Missing and placeholder data cannot satisfy checkout. */}}
    return reply({saved:Boolean(current)||stored,ticket_number:ticket.data.ticket_number});
   }
   if(input.verified!==true)throw new Error('LOOKUP_CONFIRMATION_REQUIRED');
   const saved=await savePortalLookup(db,{submission_id:input.submissionId,kind:input.kind,value:input.value,access_token:input.accessToken});
   await wakeRunner();return reply(saved);
  }
  if(!runner&&!staff)return reply({error:'UNAUTHORIZED'},401);
  if(runner&&input.action==='discover'){const result=await db.rpc('discover_initial_disclosures');if(result.error)throw new Error('INITIAL_DISCOVERY_FAILED');return reply({queued:result.data});}
  if(runner&&input.action==='initial-packet')return reply(await initialDisclosurePacket(db,input.id,input.lease));
  if(runner&&input.action==='session-register'){
   const result=await db.rpc('register_portal_browser_session',{p_job:input.id,p_lease:input.lease,p_browser:input.browser_session_id,p_terms:input.terms.text,p_hash:input.terms.sha256,p_expires:input.expires_at});
   if(result.error)throw new Error('SESSION_TERMS_SAVE_FAILED');return reply({id:result.data});
  }
  if(runner&&input.action==='session-authorized'){
   const result=await db.rpc('assert_portal_browser_session',{p_job:input.id,p_browser:input.browser_session_id,p_hash:input.terms_sha256});
   if(result.error)throw new Error('ACCEPTED_SESSION_REQUIRED');const s=Array.isArray(result.data)?result.data[0]:result.data;return reply({id:s.id,terms_sha256:s.terms_sha256,browser_session_id:s.browser_session_id,expires_at:s.expires_at});
  }
  if(staff&&input.action==='session-status'){
   const result=await db.from('portal_browser_sessions').select('id,browser_session_id,terms_url,terms_text,terms_sha256,scope,status,expires_at,accepted_at').order('created_at',{ascending:false}).limit(100);
   const names=await db.rpc('verified_ticket_display_names');
   if(result.error)throw new Error('SESSION_STATUS_UNAVAILABLE');return reply({portalSessions:result.data,sessionAdministrator:admin,legalCaseNames:names.error?[]:names.data});
  }
  if(staff&&['lookup-details','lookup-save'].includes(input.action)){
   const result=await db.from('portal_agent_jobs').select('id,submission_id,ticket_number,action,status,result').eq('id',input.id).maybeSingle(),job=result.data;
   if(result.error||!job||job.action!=='submit_initial_disclosure'||job.status==='completed'||job.result?.phase==='committing')throw new Error('LOOKUP_FORM_LOCKED');
   if(job.status==='running'){if(input.action==='lookup-save')throw new Error('LOOKUP_FORM_LOCKED');return reply({loading:true,ticket_number:job.ticket_number});}
   const material=await prepareInitialMaterial(db,job);
   if(input.action==='lookup-details')return reply({ticket_number:job.ticket_number,defendant:material.defendant,details:material.details,missing:material.details.length===0,can_edit:!job.result?.session_id||Date.parse(job.result.session_expires_at)<=Date.now()});
   if(input.verified!==true)throw new Error('LOOKUP_CONFIRMATION_REQUIRED');
   const detail=material.details.find(item=>item.kind===input.kind);
   if(detail&&detail.value!==normalizePortalLookup(input.kind,input.value))throw new Error('VERIFICATION_DETAILS_CONFLICT');
   const saved=await savePortalLookup(db,{submission_id:job.submission_id,kind:input.kind,value:input.value,staff_id:staffId});
   let state=await db.from('portal_agent_jobs').select('status,result').eq('id',job.id).single();
   if(state.data?.status==='needs_review'&&state.data.result?.phase==='verification'&&!state.data.result?.session_id){
    await scoped.rpc('request_portal_handoff',{p_id:job.id,p_resume:false});state=await db.from('portal_agent_jobs').select('status,result').eq('id',job.id).single();
   }
   const queued=['queued','running'].includes(state.data?.status||'');if(queued)await wakeRunner();return reply({...saved,queued});
  }
  if(admin&&input.action==='session-accept'){
   const result=await scoped.rpc('accept_portal_browser_session',{p_id:input.id,p_hash:input.hash});
   if(result.error)return reply({error:'This cloud session expired or changed. Start a new session to review its current terms.'},409);
   await wakeRunner();
   return reply({accepted:true,job_id:result.data});
  }
  if(runner&&input.action==='initial-commit'){
   const packet=await initialDisclosurePacket(db,input.id,input.lease);
   if(packet.source_sha256!==input.form?.source_sha256||packet.consent_sha256!==input.form?.consent_sha256||packet.case_fingerprint!==input.form?.case_fingerprint)throw new Error('INITIAL_FILING_MATERIAL_CHANGED');
   if(packet.verification.kind!==input.form?.lookup_kind||packet.verification.fingerprint!==input.form?.lookup_fingerprint||(packet.verification.record_id||null)!==(input.form?.lookup_record_id||null))throw new Error('VERIFIED_LOOKUP_CHANGED');
   const result=await db.rpc('begin_initial_disclosure',{p_job:input.id,p_lease:input.lease,p_form:input.form});if(result.error)throw new Error('INITIAL_FILING_COMMIT_REJECTED');return reply({committing:true});
  }
  if(runner&&input.action==='initial-receipt'){
   const r=input.receipt;
   if(!r||r.source!=='cloud_verified_disclosure'||typeof r.confirmation!=='string'||r.confirmation.length>12000)throw new Error('CONFIRMED_DISCLOSURE_RECEIPT_REQUIRED');
   const result=await db.rpc('complete_initial_disclosure',{p_job:input.id,p_lease:input.lease,p_receipt:r,p_confirmation_hash:await initialHash(r.confirmation)});if(result.error)throw new Error('DISCLOSURE_RECEIPT_SAVE_FAILED');return reply(result.data);
  }
  if(runner&&input.action==='defer-initial-browser'){
   const result=await db.rpc('defer_initial_browser',{p_job:input.id,p_lease:input.lease,p_reason:input.reason});if(result.error)throw new Error('PRE_SUBMISSION_RETRY_ONLY');return reply({deferred:true});
  }
  return reply({error:'ACTION_NOT_ALLOWED'},403);
 }catch(error){const code=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'INITIAL_DISCLOSURE_OPERATION_FAILED';return reply({error:code},code==='PRIVATE_ORDER_ACCESS_REQUIRED'?401:['VERIFICATION_DETAIL_INVALID','LOOKUP_CONFIRMATION_REQUIRED','EXACT_TICKET_NUMBER_REQUIRED','REPRESENTATION_ORDER_REQUIRED'].includes(code)?400:503);}
}
async function wakeRunner(){
 const url=Deno.env.get('PORTAL_RUNNER_URL'),secret=Deno.env.get('PORTAL_RUNNER_SECRET');
 if(url&&secret){try{await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});}catch{/* The existing schedule recovers the durable queued job. */}}
}
if(import.meta.main)Deno.serve(handler);
