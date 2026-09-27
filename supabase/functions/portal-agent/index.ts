import {handler as adsEngineHandler} from '../ads-engine/index.ts';
import {reviewSubmissionPacket,freezeReviewMaterial,processReviewSubmissionUpdates} from '../_shared/review-submission.ts';
import { processApprovedEmails } from "../_shared/outbound-email-approval.ts";
import { registerEmailTemplates } from "../_shared/email-template-registry.ts";
import { verifyDisclosureServiceOperator } from "../_shared/disclosure-operator-auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getWorkspaceMessage } from "../_shared/google-workspace-email.ts";
import { gmailMessageToIncomingEmail } from "../_shared/gmail-disclosure-inbox.ts";
import { emailBodyText } from "../_shared/disclosure-confirmation.ts";
import { listOfferMessages } from "../_shared/gmail-offer-api.ts";
import { workspaceAccessToken } from "../_shared/google-workspace-email.ts";
import { verifyOfferMailbox } from "../_shared/gmail-offer-api.ts";
import { processProsecutorOffers } from "../_shared/gmail-prosecutor-offers.ts";
import { processCrownNotices } from "../_shared/gmail-crown-notices.ts";
import { processClientOfferDecisions } from "../_shared/gmail-client-decisions.ts";
import { formatOfferDraft } from "../_shared/prosecutor-offer.ts";
import { validPushSubscription, processPortalPush } from "../_shared/portal-push.ts";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import {saveDisclosureEvidence} from '../_shared/disclosure-evidence.ts';
import {sha256} from '../_shared/disclosure-review.ts';
import {processDisclosureReview} from '../_shared/disclosure-review-worker.ts';

const headers = {"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"https://fabsy.ca","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-runner-secret","Access-Control-Allow-Methods":"POST,OPTIONS"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
export async function handler(req: Request): Promise<Response> {
 if(req.method==='OPTIONS') return new Response(null,{headers});
 if(req.method!=='POST') return reply({error:'METHOD_NOT_ALLOWED'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const runner=await secretMatches(req.headers.get('x-runner-secret')||'',Deno.env.get('PORTAL_RUNNER_SECRET')||'');
 let staff=false;
 let staffId:string|null=null;
 let emailApprover=false;
 const maintenance=!runner && await verifyDisclosureServiceOperator(req.headers.get('Authorization')||'',{supabaseUrl:Deno.env.get('SUPABASE_URL')!,anonKey:Deno.env.get('SUPABASE_ANON_KEY')!});
 const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!runner && !maintenance && token){
  const {data,error}=await db.auth.getUser(token);
  if(!error&&data.user){
   const scoped=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}}});
   const role=await scoped.rpc('idr_staff_role');
   staff=!role.error&&['admin','case_manager'].includes(role.data);
   if(staff)staffId=data.user.id;
   emailApprover=!role.error&&role.data==='admin';
  }
 }
 if(!runner&&!staff&&!maintenance) return reply({error:'UNAUTHORIZED'},401);
 try {
  const input=await req.json();
  if(staff && emailApprover && typeof input.action==='string' && input.action.startsWith('ads-'))return adsEngineHandler(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(input)}));
  if((staff||maintenance) && input.action==='scan-crown')return reply(await processCrownNotices(db));
  if((staff||maintenance) && input.action==='review-disclosure')return reply(await processDisclosureReview(db));
  if((staff||maintenance) && input.action==='review-material'){await freezeReviewMaterial(db,input.id);return reply({ok:true});}
  if((staff||maintenance) && input.action==='review-updates')return reply(await processReviewSubmissionUpdates(db));
  if(runner && input.action==='defer-review-browser'){const r=await db.rpc('defer_review_browser',{p_job:input.id,p_lease:input.lease,p_seconds:input.seconds,p_reason:input.reason});if(r.error)return reply({error:'PRE_SUBMISSION_RETRY_ONLY'},409);if(input.reason==='BROWSER_RATE_LIMIT')await db.from('portal_agent_state').update({last_error:'Cloud browser unavailable: Cloudflare is returning HTTP 429. Approved filings wait with bounded retries; a government receipt is required for completion.'}).eq('id',true);return reply({ok:true});}
  if(runner && input.action==='review-packet')return reply(await reviewSubmissionPacket(db,input.id,input.lease));
  if(runner && input.action==='review-commit'){
   const packet=await reviewSubmissionPacket(db,input.id,input.lease,false);
   if(input.hash!==packet.draft_sha256||input.form?.consent_sha256!==packet.consent_sha256||input.form?.source_sha256!==packet.source_sha256)return reply({error:'APPROVED_DOCUMENT_CHANGED'},409);
   const {error}=await db.rpc('begin_review_submission',{p_job:input.id,p_lease:input.lease,p_hash:input.hash,p_form:input.form});
   if(error)return reply({error:'SUBMISSION_APPROVAL_CHANGED'},409);return reply({ok:true});
  }
  if(runner && input.action==='review-receipt'){
   const {error}=await db.rpc('complete_review_submission',{p_job:input.id,p_lease:input.lease,p_hash:input.hash,p_receipt:input.receipt});
   if(error)return reply({error:'CONFIRMED_REVIEW_RECEIPT_REQUIRED'},409);
   try{return reply({ok:true,clientUpdate:await processReviewSubmissionUpdates(db)});}catch{return reply({ok:true,clientUpdate:{pending:true}});}
  }
  if(runner && input.action==='disclosure-evidence')return reply(await saveDisclosureEvidence(db,input));
  if(runner && input.action==='disclosure-package'){
   if(!Array.isArray(input.manifest)||await sha256(JSON.stringify(input.manifest))!==input.sha256)return reply({error:'INVALID_MANIFEST'},400);
   const {data,error}=await db.rpc('queue_disclosure_package',{p_job:input.id,p_lease:input.lease,p_manifest:input.manifest,p_sha:input.sha256});
   if(error)throw new Error('PACKAGE_SAVE_FAILED');return reply({id:data});
  }
  if(staff && ['approve-disclosure-review','record-review-receipt'].includes(input.action)){
   const scoped=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}}});
   const approved=input.action==='approve-disclosure-review';
   if(approved)await freezeReviewMaterial(db,input.id);
   const {error}=approved?await scoped.rpc('approve_disclosure_review',{p_id:input.id,p_hash:input.hash,p_attestations:input.attestations})
    :await scoped.rpc('record_disclosure_review_receipt',{p_id:input.id,p_hash:input.hash,p_receipt:input.receipt});
   if(error)return reply({error:approved?'Review changed or evidence/authority checks are incomplete. Refresh and verify the request.':'An approved request and exact-ticket portal confirmation are required.'},409);
   if(approved){
    const queued=await db.from('disclosure_packages').select('review_submission_job_id').eq('id',input.id).single();
    if(queued.data?.review_submission_job_id){try{await fetch(Deno.env.get('PORTAL_RUNNER_URL')!,{method:'POST',headers:{Authorization:`Bearer ${Deno.env.get('PORTAL_RUNNER_SECRET')}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});}catch{/* durable queue remains available to the scheduled runner */}return reply({ok:true,queued:true});}
   }
   return reply({ok:true});
  }
  if(staff && input.action==='disclosure-document'){
   const d=await db.from('disclosure_documents').select('storage_path').eq('id',input.id).single();
   if(d.error)throw new Error('DOCUMENT_UNAVAILABLE');
   const signed=await db.storage.from('disclosure-evidence').createSignedUrl(d.data.storage_path,120);
   if(signed.error)throw new Error('DOCUMENT_UNAVAILABLE');return reply({url:signed.data.signedUrl});
  }
  if (['email-templates','approve-email-template','revoke-email-template'].includes(input.action)) {
   if(!staff || !emailApprover) return reply({error:'Administrator template access is required.'},403);
   if(input.action==='email-templates') await registerEmailTemplates(db);
   else {
    const scoped=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const reviewed=await scoped.rpc('review_email_template',{p_id:input.id,p_hash:input.hash,p_approve:input.action==='approve-email-template'});
    if(reviewed.error)return reply({error:'This template revision cannot be approved or revoked. Refresh and review it again.'},409);
   }
   const templates=await db.from('email_templates').select('*').order('template_key').order('version',{ascending:false});
   if(templates.error)throw new Error('EMAIL_TEMPLATES_UNAVAILABLE');
   return reply({templates:templates.data});
  }
  if (['email-drafts','email-draft','approve-email','reject-email'].includes(input.action)) {
   if(!staff || !emailApprover) return reply({error:'Administrator approval access is required.'},403);
   if(input.action==='email-drafts') {
    const [pending,recent,devices]=await Promise.all([
     db.from('outbound_email_drafts').select('id,ticket_number,status,payload_hash,created_at,sent_at,last_error,source_kind,approval_basis,template_id').in('status',['pending_template','pending_approval','approved','sending','needs_review','uncertain']).order('created_at').limit(100),
     db.from('outbound_email_drafts').select('id,ticket_number,status,payload_hash,created_at,sent_at,last_error,source_kind').in('status',['sent','rejected']).order('updated_at',{ascending:false}).limit(20),
     db.from('portal_push_subscriptions').select('id',{count:'exact',head:true}).eq('user_id',staffId).eq('active',true),
    ]);
    if(pending.error||recent.error||devices.error)throw new Error('EMAIL_QUEUE_UNAVAILABLE');
    return reply({drafts:[...pending.data,...recent.data],devices:devices.count});
   }
   if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.id||'')) return reply({error:'Invalid draft.'},400);
   if(input.action==='approve-email'||input.action==='reject-email') {
    const scoped=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const reviewed=await scoped.rpc('review_outbound_email',{p_id:input.id,p_hash:input.hash,p_approve:input.action==='approve-email'});
    if(reviewed.error)return reply({error:'This draft cannot be approved in its current state. Refresh and review it again.'},409);
    if(reviewed.data?.status==='approved') {
     // The durable approval survives disconnects; the cloud worker can finish it.
     try { await processApprovedEmails(db,input.id); } catch { /* Read the durable state below. Never retry a Gmail write here. */ }
    }
   }
   const {data,error}=await db.from('outbound_email_drafts').select('*').eq('id',input.id).single();
   if(error) return reply({error:'Draft not found.'},404);
   return reply({draft:data});
  }
  if((staff||maintenance) && input.action==='scan-client-decisions')return reply(await processClientOfferDecisions(db));
  if(staff && input.action==='push-config')return reply({publicKey:Deno.env.get('PORTAL_PUSH_PUBLIC_KEY')||null});
  if(staff && input.action==='push-subscribe'){
   if(!validPushSubscription(input.subscription))return reply({error:'Unsupported notification subscription.'},400);
   const scoped=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}}});
   const {data,error}=await scoped.rpc('register_portal_push',{p_endpoint:input.subscription.endpoint,p_key:input.subscription.keys.p256dh,p_auth:input.subscription.keys.auth});
   if(error)throw new Error('PUSH_ENROLLMENT_FAILED');
   return reply({id:data});
  }
  if(staff && ['push-test','push-unsubscribe'].includes(input.action)){
   const {data:device,error}=await db.from('portal_push_subscriptions').select('id').eq('id',input.id).eq('user_id',staffId).eq('active',true).maybeSingle();
   if(error||!device)return reply({error:'Enable notifications on this device first.'},409);
   if(input.action==='push-unsubscribe'){
    const saved=await db.from('portal_push_subscriptions').update({active:false,updated_at:new Date().toISOString()}).eq('id',device.id).eq('user_id',staffId);
    if(saved.error)throw new Error('PUSH_UNSUBSCRIBE_FAILED');
   }else{
    const dedupe='test/'+Math.floor(Date.now()/60000);
    const saved=await db.from('portal_push_outbox').upsert({subscription_id:device.id,dedupe_key:dedupe},{onConflict:'subscription_id,dedupe_key',ignoreDuplicates:true});
    if(saved.error)throw new Error('PUSH_TEST_FAILED');
    await processPortalPush(db);
    const delivery=await db.from('portal_push_outbox').select('status,last_error').eq('subscription_id',device.id).eq('dedupe_key',dedupe).single();
    if(delivery.error)throw new Error('PUSH_TEST_STATUS_UNAVAILABLE');
    return reply({ok:true,delivery:delivery.data});
   }
   return reply({ok:true});
  }
  if(maintenance && input.action==='notice-preview'){
   if(!/^[A-Z]{1,3}\d{6,12}[A-Z]?$/.test(input.ticket||'')) return reply({error:'EXACT_TICKET_REQUIRED'},400);
   await verifyOfferMailbox();
   const items=await listOfferMessages(`from:noreply@gov.ab.ca to:hello@fabsy.ca "${input.ticket}" newer_than:60d`);
   const results=[];
   for(const item of items.slice(0,12)){
    const mail=gmailMessageToIncomingEmail(await getWorkspaceMessage(item.id));
    const text=emailBodyText(mail);
    if(!text.includes(input.ticket))continue;
    const links=[...(mail.html||'').matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1].replaceAll('&amp;','&')).filter(link=>{try{return new URL(link).origin==='https://traffictickets.alberta.ca';}catch{return false;}});
    results.push({id:item.id,subject:mail.subject,date:mail.date,text:text.slice(0,10000),links});
   }
   return reply({notices:results});
  }
  if((staff||maintenance) && input.action==='gmail-capabilities'){
   await verifyOfferMailbox();
   const access=await workspaceAccessToken();
   const response=await fetch('https://oauth2.googleapis.com/tokeninfo?'+new URLSearchParams({access_token:access}),{signal:AbortSignal.timeout(15000)});
   const info=await response.json();
   if(!response.ok)throw new Error('SCOPE_CHECK_FAILED');
   const scopes=String(info.scope||'').split(' ');
   const compose=scopes.some((s:string)=>['https://www.googleapis.com/auth/gmail.compose','https://www.googleapis.com/auth/gmail.modify','https://mail.google.com/'].includes(s));
   return reply({mailbox:'hello@fabsy.ca',compose,scopes});
  }

  if(runner && input.action==='claim'){
   const {data,error}=await db.rpc('claim_portal_agent_job');
   if(error) throw new Error('CLAIM_FAILED');
   const job=data?.[0]||null;
   if(job){
    // Source notices do not authorize opening another client's private portal.
    const matched=await db.rpc('offer_draft_case',{p_ticket:job.ticket_number});
    if(matched.error||(job.action==='submit_review_request'&&matched.data?.submission_id!==job.submission_id)){
     await db.rpc('finish_portal_agent_job',{p_id:job.id,p_lease:job.lease_token,p_status:'needs_review',p_result:{portal_verified:false},p_reason:'Exact active paid case could not be verified. Review the case before portal access.'});
     return reply({job:null,held:true});
    }
    const {error:saveError}=await db.from('portal_agent_jobs').update({submission_id:matched.data.submission_id,...(job.action==='submit_review_request'?{lease_expires_at:new Date(Date.now()+8*60000).toISOString()}: {})}).eq('id',job.id).eq('lease_token',job.lease_token);
    if(saveError) throw new Error('CASE_LINK_FAILED');
   }
   return reply({job});
  }
  if(runner && input.action==='finish'){
   if(!input.result || JSON.stringify(input.result).length>80000) return reply({error:'INVALID_RESULT'},400);
   const current=await db.from('portal_agent_jobs').select('action,result').eq('id',input.id).eq('lease_token',input.lease).single();
   if(current.error)return reply({error:'LEASE_LOST'},409);
   if(current.data.action==='submit_review_request'){
    if(input.status==='completed')return reply({error:'CONFIRMED_REVIEW_RECEIPT_REQUIRED'},409);
    input.result={...current.data.result,...input.result,disclosure_package_id:current.data.result.disclosure_package_id,draft_sha256:current.data.result.draft_sha256};
    if(current.data.result.phase==='committing'){input.result.phase='committing';input.status='uncertain';}
   }
   const {error}=await db.rpc('finish_portal_agent_job',{p_id:input.id,p_lease:input.lease,p_status:input.status,p_result:input.result,p_reason:input.reason||null});
   if(error) throw new Error('RESULT_SAVE_FAILED');
   return reply({ok:true});
  }
  if(staff && input.action==='status'){
   const [decisionState,clientDecisions]=await Promise.all([
    db.from('client_offer_decision_state').select('*').single(),
    db.from('client_offer_decisions').select('id,ticket_number,sender,decision,accepted_amount_cents,reply_text,received_at,status,review_reason,portal_job_id').order('received_at',{ascending:false}).limit(30),
   ]);
   if(decisionState.error||clientDecisions.error)throw new Error('CLIENT_DECISION_STATUS_UNAVAILABLE');
   const [state,jobs,mail,offers,notices,crown]=await Promise.all([db.from('portal_agent_state').select('*').single(),db.from('portal_agent_jobs').select('id,submission_id,offer_event_id,ticket_number,action,status,review_reason,result,created_at,updated_at,source_url').order('created_at',{ascending:false}).limit(100),db.from('prosecutor_offer_automation').select('enabled,drafts_enabled,last_scan_at,last_worker_at,last_error').single(),db.from('prosecutor_offer_events').select('id,ticket_number,status,review_reason,terms,draft_id,submission_id').order('created_at',{ascending:false}).limit(100),db.from('crown_notice_events').select('id,ticket_number,kind,subject,status,review_reason,created_at').order('created_at',{ascending:false}).limit(30),db.from('crown_notice_state').select('last_scan_at,last_error').single()]);
   if(state.error||jobs.error||mail.error||offers.error||notices.error||crown.error) throw new Error('STATUS_UNAVAILABLE');
   const ids=[...new Set(jobs.data.map(j=>j.submission_id).filter(Boolean))];
   const stages=ids.length?await db.from('admin_ticket_case_status').select('ticket_id,stage').eq('kind','submission').in('ticket_id',ids):{data:[],error:null};
   if(stages.error) throw new Error('CASE_STAGE_UNAVAILABLE');
   const payments=await db.rpc('portal_recent_payments');
   if(payments.error)throw new Error('PAYMENTS_UNAVAILABLE');
   const reconciliation=await db.rpc('portal_case_reconciliation');
   if(reconciliation.error)throw new Error('RECONCILIATION_UNAVAILABLE');
   const [reviews,documents,terms]=await Promise.all([db.from('disclosure_packages').select('id,job_id,submission_id,ticket_number,status,manifest,review,draft_text,draft_sha256,approved_at,approval_evidence,review_submission_job_id,client_update_draft_id,receipt,last_error,complete_at,updated_at').order('updated_at',{ascending:false}).limit(40),db.from('disclosure_documents').select('id,job_id,name,sha256,bytes').order('created_at',{ascending:false}).limit(300),db.from('portal_review_terms').select('sha256,url,effective_date,text,verified_at').eq('active',true).maybeSingle()]);
   if(reviews.error||documents.error||terms.error)throw new Error('DISCLOSURE_STATUS_UNAVAILABLE');
   return reply({portalTerms:terms.data,disclosureReviews:reviews.data,disclosureDocuments:documents.data,emailApprover,state:state.data,jobs:jobs.data.map(j=>({...j,case_stage:stages.data?.find(s=>s.ticket_id===j.submission_id)?.stage||null})),mail:mail.data,offers:offers.data,notices:notices.data,crown:crown.data,payments:payments.data,reconciliation:reconciliation.data,decisionState:decisionState.data,clientDecisions:clientDecisions.data});
  }
  if(staff && input.action==='prepare-draft'){
   const {data:event,error}=await db.from('prosecutor_offer_events').select('ticket_number,status').eq('id',input.id).single();
   if(error||event.status!=='needs_review')return reply({error:'This offer has already advanced. Refresh before continuing.'},409);
   const matched=await db.rpc('offer_draft_case',{p_ticket:event.ticket_number});
   if(matched.error)return reply({error:'Verify the paid case and client email first.'},409);
   formatOfferDraft(event.ticket_number,matched.data.recipient,input.terms);
   const scoped=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}}});
   const saved=await scoped.rpc('prepare_prosecutor_offer_draft',{p_id:input.id,p_terms:input.terms});
   if(saved.error)return reply({error:'The offer could not be queued. Check its terms and deadline.'},409);
   return reply({ok:true});
  }
  if(staff && input.action==='handoff'){
   const scoped=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}}});
   const {error}=await scoped.rpc('request_portal_handoff',{p_id:input.id,p_resume:input.resume===true});
   if(error) return reply({error:'This job or cloud session is no longer available. Refresh and try again.'},409);
   input.action='run';
  }
  if(staff && input.action==='scan'){
   await processCrownNotices(db);
   await processProsecutorOffers(db);
   await processClientOfferDecisions(db);
   input.action='run';
  }
  if((staff||maintenance) && input.action==='browser-status'){const url=new URL(Deno.env.get('PORTAL_RUNNER_URL')!);url.pathname='/browser-status';const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${Deno.env.get('PORTAL_RUNNER_SECRET')}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('BROWSER_STATUS_UNAVAILABLE');return reply(await r.json());}
  if(maintenance && input.action==='browser-health'){const url=new URL(Deno.env.get('PORTAL_RUNNER_URL')!);url.pathname='/health-browser';const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${Deno.env.get('PORTAL_RUNNER_SECRET')}`},signal:AbortSignal.timeout(55000)});await db.from('portal_agent_state').update({last_error:r.ok?null:r.status===429?'Cloud browser unavailable: Cloudflare is returning HTTP 429. Approved filings wait with bounded retries; a government receipt is required for completion.':'Cloud browser health check failed; approved filings require attention.'}).eq('id',true);if(!r.ok)return reply({available:false,provider_status:r.status},r.status);return reply(await r.json());}
  if((staff||maintenance) && input.action==='run'){
   const response=await fetch(Deno.env.get('PORTAL_RUNNER_URL')!,{method:'POST',headers:{Authorization:`Bearer ${Deno.env.get('PORTAL_RUNNER_SECRET')}`,'Content-Type':'application/json'},body:JSON.stringify({action:'run'}),signal:AbortSignal.timeout(10000)});
   if(!response.ok) throw new Error('RUNNER_UNAVAILABLE');
   return reply({ok:true});
  }
  if(staff && input.action==='retry'){
   const scoped=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}}});
   const {error}=await scoped.rpc('retry_portal_inspection',{p_id:input.id});
   if(error) return reply({error:'This item cannot be retried yet.'},409);
   return reply({ok:true});
  }
  return reply({error:'ACTION_NOT_ALLOWED'},403);
 } catch(error) { const code=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'PORTAL_AGENT_OPERATION_FAILED';return reply({error:code},503); }
}
if(import.meta.main) Deno.serve(handler);
