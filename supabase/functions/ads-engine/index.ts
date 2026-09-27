import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {buildReport,digest,edmontonDate,lint,learningRecommendation,weeklyMemo,weekKey,type Json} from '../../../ads-engine/core.ts';
import {GoogleAds,planGoogle,planMeasurement,statusOperation} from '../../../ads-engine/platform/google.ts';
import {execute} from '../../../ads-engine/platform/actions.ts';
import {actionStore} from '../../../ads-engine/platform/store.ts';
import {reviewCopy} from '../../../ads-engine/ai/review.ts';
import {safetyStops} from '../../../ads-engine/core.ts';
import {secretMatches} from '../_shared/disclosure-confirmation.ts';
import offers from '../../../src/config/offers.json' with {type:'json'};
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://fabsy.ca','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-cron-secret,x-ads-operator-secret'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const env=(key:string)=>Deno.env.get(key);
async function checked(query:any){const r=await query;if(r.error)throw new Error('ADS_STORAGE_UNAVAILABLE');return r.data;}
async function destinationSnapshot(specs:Json[]):Promise<Json>{
 const pages:Json={};
 for(const spec of specs){
  if(!['https://fabsy.ca/rapid-resolution','https://fabsy.ca/photo-radar'].includes(spec.destination))throw new Error('DESTINATION_NOT_ALLOWED');
  const response=await fetch(spec.destination,{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('DESTINATION_UNAVAILABLE');
  const html=await response.text();
  const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  if(spec.service==='camera'&&(/covered by our fee refund guarantee|(?:or|and).{0,30}(?:your|the|service) fee refunded/i.test(text)))throw new Error('CAMERA_DESTINATION_REFUND_POLICY_CONFLICT');
  pages[spec.destination]={sha256:await digest(text),checkedAt:new Date().toISOString()};
 }
 return pages;
}
export async function handler(req:Request):Promise<Response>{
 if(req.method==='OPTIONS')return reply(null);
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 let db:any;let lease:string|null=null;
 try{
  const text=await req.text();if(text.length>150000)return reply({error:'REQUEST_TOO_LARGE'},413);
  const input=JSON.parse(text);const action=String(input.action||'').replace(/^ads-/,'');
  db=createClient(env('SUPABASE_URL')!,env('SUPABASE_SERVICE_ROLE_KEY')!);
  const cron=await secretMatches(req.headers.get('x-cron-secret')||'',env('IDR_CRON_SECRET')||'');
  const service=await secretMatches(req.headers.get('Authorization')||'',`Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')||''}`)||await secretMatches(req.headers.get('x-ads-operator-secret')||'',env('ADS_ENGINE_OPERATOR_SECRET')||'');
  let adminId:string|null=null;
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!cron&&!service&&token){const u=await db.auth.getUser(token);if(u.data.user&&!u.error){const role=await db.rpc('has_role',{_user_id:u.data.user.id,_role:'admin'});if(!role.error&&role.data===true)adminId=u.data.user.id;}}
  if(!cron&&!service&&!adminId)return reply({error:'ADMIN_AUTHENTICATION_REQUIRED'},401);
  if(cron&&!['monitor','report-scheduled'].includes(action))return reply({error:'CRON_SCOPE_INVALID'},403);
  const google=new GoogleAds(env);const store=actionStore(db);
  if(action==='status')return reply({state:await store.state(),batches:await checked(db.from('ads_batches').select('*').order('created_at',{ascending:false}).limit(5)),actions:await checked(db.from('ads_actions').select('id,kind,status,created_at').order('created_at',{ascending:false}).limit(10)),reports:await checked(db.from('ads_reports').select('*').order('date',{ascending:false}).limit(7))});
  if(action==='approve'||action==='reject'){
   if(!adminId||service||cron)return reply({error:'AUTHENTICATED_ADMIN_TAP_REQUIRED'},403);
   const scoped=createClient(env('SUPABASE_URL')!,env('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}}});
   await checked(scoped.rpc('ads_review_batch',{p_id:input.id,p_hash:input.hash,p_approve:action==='approve'}));return reply({ok:true});
  }
  if(action==='stage'){
   if(!service&&!adminId)return reply({error:'OPERATOR_REQUIRED'},403);
   const specs=input.specs,config=input.config;
   if(!Array.isArray(specs)||specs.length!==2||!config||typeof input.brief!=='string')return reply({error:'SPEC_AND_CONFIG_REQUIRED'},400);
   const holds=specs.flatMap(s=>lint(s,{officer:offers.rapidResolution.priceCad,camera:offers.photoRadar.priceCad}));
   if(config.currency!=='CAD'||config.timezone!=='America/Edmonton'||config.aiMax!==false||config.targetCpa!==null||config.durationDays!==30||config.meta?.active!==false)holds.push('DECIDED_SETTINGS_OR_DISABLED_META_CHANGED');
   if(['G-Search-Officer','G-Search-Camera'].some(name=>!Number.isFinite(config.campaigns?.[name]?.dailyBudgetCad)||config.campaigns[name].dailyBudgetCad<=0))holds.push('PROPOSE_POSITIVE_CAMPAIGN_BUDGETS');
   if(!(config.learningSpendLimitCad>0)||!config.spendingAuthorized||!/^\d{4}-\d{2}-\d{2}$/.test(config.startDate||''))holds.push('PROPOSE_LEARNING_LIMIT_START_DATE_AND_SPENDING_AUTHORIZATION');
   let live:Json|null=null,plan:Json|null=null;
   try{live=await google.snapshot();plan=planGoogle(specs,config,live);}catch(e){holds.push((e as Error).message);}
   // Verify the actual Alberta constant instead of trusting a supplied numeric ID.
   if(live&&config.albertaGeoTarget){try{const geo=await google.read(`SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.country_code, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.resource_name = '${config.albertaGeoTarget}'`);if(geo.length!==1||geo[0].geoTargetConstant.name!=='Alberta'||geo[0].geoTargetConstant.countryCode!=='CA'||geo[0].geoTargetConstant.targetType!=='Province')holds.push('ALBERTA_GEO_NOT_VERIFIED');}catch{holds.push('ALBERTA_GEO_READ_UNAVAILABLE');}}
   // Destination truth and diagnostics are evidence, not booleans supplied by a caller.
   holds.push('DESTINATION_AND_DIAGNOSTICS_VERIFICATION_REQUIRED');
   const aiReview=await reviewCopy(specs,input.brief,env('LOVABLE_API_KEY')||'');if(!aiReview.passed)holds.push(aiReview.hold||'COPY_REVIEW_FAILED');
   const payload={specs,config,brief:input.brief,offerHash:await digest(offers),aiReview,holds:[...new Set(holds)],plan,actionHashes:plan?{sync:await digest(plan)}:{},createdAt:new Date().toISOString()};
   const hash=await digest(payload);
   const batch=await checked(db.from('ads_batches').upsert({payload,payload_hash:hash},{onConflict:'payload_hash',ignoreDuplicates:true}).select('id,payload_hash,status').single());
   return reply({batch,holds:payload.holds,dryRun:true});
  }
  if(action==='stage-measurement'){
   if(!service&&!adminId)throw new Error('OPERATOR_REQUIRED');
   const live=await google.snapshot(),plan=planMeasurement(input.config,live);
   const payload={kind:'measurement_setup',specs:[],config:{...input.config,spendingAuthorized:false,paused:true},holds:[],plan,actionHashes:{measurement_setup:await digest(plan)},createdAt:new Date().toISOString()};
   const batch=await checked(db.from('ads_batches').insert({payload,payload_hash:await digest(payload)}).select('id,payload_hash,status').single());
   return reply({batch,dryRun:true,operations:plan.operations});
  }
  if(action==='apply-measurement'){
   const batch=await store.approval(input.id);
   if(batch.payload.kind!=='measurement_setup')throw new Error('MEASUREMENT_SETUP_BATCH_REQUIRED');
   const payload=batch.payload.plan;
   return reply(await execute(store,google,{batchId:input.id,kind:'measurement_setup',payload,idempotencyKey:`${input.id}:measurement_setup:${await digest(payload)}`,dryRun:input.dryRun!==false}));
  }
  if(action==='verify-readiness'){
   if(!adminId)return reply({error:'ADMIN_EVIDENCE_REQUIRED'},403);
   const batch=await store.approval(input.id);
   if(batch.status!=='pending')throw new Error('PENDING_BATCH_REQUIRED');
   // Keep the evidence with the exact frozen payload. A revision gets a new hash.
   if(typeof input.evidence!=='string'||input.evidence.trim().length<40||input.evidence.length>3000)throw new Error('DESCRIBE_UPLOAD_PAYMENT_DIAGNOSTICS_AND_DESTINATION_EVIDENCE');
   const destinations=await destinationSnapshot(batch.payload.specs);
   const payload={...batch.payload,readiness:{destinations,verifiedBy:adminId,verifiedAt:new Date().toISOString(),evidence:input.evidence},holds:batch.payload.holds.filter((h:string)=>h!=='DESTINATION_AND_DIAGNOSTICS_VERIFICATION_REQUIRED')};
   await checked(db.from('ads_batches').update({payload,payload_hash:await digest(payload)}).eq('id',input.id).eq('status','pending'));return reply({ok:true});
  }
  if(action==='qualify'){
   if(!adminId||typeof input.evidence!=='string'||input.evidence.trim().length<20)throw new Error('ADMIN_VERIFICATION_EVIDENCE_REQUIRED');
   const draft=typeof input.draftId==='string',id=draft?input.draftId:input.submissionId;
   if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id||''))throw new Error('VERIFIED_RECEIPT_REQUIRED');
   const table=draft?'ads_draft_attribution':'ads_attribution',key=draft?'draft_id':'submission_id';
   const receipt=await checked(db.from(draft?'ticket_intake_drafts':'ticket_submissions').select('email,phone,ticket_document_path').eq('id',id).is('deleted_at',null).single());
   if(!receipt.ticket_document_path||!receipt.email&&!receipt.phone)throw new Error('VERIFIED_RECEIPT_REQUIRED');
   const existing=await checked(db.from(table).select('*').eq(key,id).maybeSingle());
   await checked(db.from(table).upsert({[key]:id,fields:existing?.fields||{},consent_version:existing?.consent_version||null,readable_at:new Date().toISOString(),readable_by:adminId,contact_verified_at:new Date().toISOString(),contact_verified_by:adminId,contact_evidence:input.evidence,contact_hash:await digest([receipt.email?.trim().toLowerCase()||'',receipt.phone?.replace(/\D/g,'')||'']),readable_document_hash:await digest(receipt.ticket_document_path)},{onConflict:key}));return reply({ok:true});
  }
  if(action==='recheck'){
   if(!adminId)throw new Error('ADMIN_RECHECK_REQUIRED');
   const unresolved=await checked(db.from('ads_actions').select('id').in('status',['uncertain','committing']).limit(1));
   if(unresolved.length)throw new Error('RECONCILE_UNCERTAIN_ACTION_FIRST');
   await google.snapshot();await checked(db.from('ads_engine_state').update({frozen:false,last_error:null}).eq('id',true));return reply({ok:true});
  }
  if(action==='reconcile'){
   if(!adminId)throw new Error('ADMIN_RECONCILIATION_REQUIRED');
   const original=await checked(db.from('ads_actions').select('*').eq('id',input.actionId).eq('status','uncertain').single());
   const live=await google.snapshot();if(input.liveHash!==live.hash)throw new Error('LIVE_RECONCILIATION_SOURCE_CHANGED');
   let disposition:string|null=live.hash===original.before_state.hash?'not_applied':null;
   if(!disposition){
    const batch=await store.approval(original.batch_id);
    if(original.kind==='sync'&&(await google.approvedPlan(batch,'sync',live)).operations.length===0)disposition='applied';
    else if(original.payload.operations.every((o:Json)=>o.campaignOperation?.updateMask==='status'&&live.campaigns.some((r:Json)=>r.campaign.resourceName===o.campaignOperation.update.resourceName&&r.campaign.status===o.campaignOperation.update.status)))disposition='applied';
   }
   if(!disposition)throw new Error('LIVE_STATE_DOES_NOT_PROVE_ACTION_RESULT');
   await checked(db.from('ads_actions').update({status:'reconciled',completed_at:new Date().toISOString(),after_state:{snapshot:live,disposition,reconciledBy:adminId},rollback:{...original.rollback,sourceHash:live.hash}}).eq('id',original.id).eq('status','uncertain'));
   return reply({disposition,retry:false});
  }
  if(action==='sync'||action==='launch'||action==='revert'){
   const batch=await store.approval(input.id);
   if(batch.payload.offerHash!==await digest(offers))throw new Error('PRODUCT_FACTS_CHANGED_REAPPROVAL_REQUIRED');
   if(action!=='revert'){
    const destinations=await destinationSnapshot(batch.payload.specs);
    if(Object.entries(destinations).some(([url,page])=>batch.payload.readiness?.destinations?.[url]?.sha256!==(page as Json).sha256))throw new Error('DESTINATION_CHANGED_REAPPROVAL_REQUIRED');
   }
   const kind=action;
   const payload=['sync','launch'].includes(kind)?await google.approvedPlan(batch,kind,await google.snapshot()):batch.payload.proposedAction;
   if(!payload)throw new Error('STAGE_EXACT_ACTION_FIRST');
   if(!payload.operations.length)return reply({dryRun:input.dryRun!==false,changes:0});
   const result=await execute(store,google,{batchId:input.id,kind,payload,idempotencyKey:`${input.id}:${kind}:${await digest(payload)}`,dryRun:input.dryRun!==false});
   return reply(result);
  }
  if(action==='stage-revert'){
   const approved=await checked(db.from('ads_batches').select('*').eq('id',input.id).eq('status','approved').single());
   const live=await google.snapshot();let proposedAction:Json;
    const original=await checked(db.from('ads_actions').select('*').eq('id',input.actionId).in('status',['applied','reconciled']).single());
    if(original.status==='reconciled'&&original.after_state.disposition!=='applied')throw new Error('ACTION_ALREADY_NOT_APPLIED');
    if(original.rollback.sourceHash!==live.hash)throw new Error('REVERT_SOURCE_CHANGED');
    proposedAction={...original.rollback,rollback:original.payload.operations.filter((o:Json)=>!Object.values(o)[0].create)};
   const kind='revert';
   const payload={...approved.payload,proposedAction,actionHashes:{[kind]:await digest(proposedAction)},createdAt:new Date().toISOString()};
   const batch=await checked(db.from('ads_batches').insert({payload,payload_hash:await digest(payload)}).select('id,payload_hash').single());return reply({batch,dryRun:true});
  }
  if(action==='pause'){
   await checked(db.from('ads_engine_state').update({paused:true}).eq('id',true));
   const state=await store.state();if(!state.approved_batch_id)return reply({paused:true,platformPause:'No approved campaign batch'});
   const batch=await store.approval(state.approved_batch_id),live=await google.snapshot();
   const operations=live.campaigns.filter((r:Json)=>Object.keys(batch.payload.config.campaigns).includes(r.campaign.name)&&r.campaign.status==='ENABLED').map((r:Json)=>statusOperation(r.campaign.resourceName,'PAUSED'));
   if(!operations.length)return reply({paused:true});
   return reply(await execute(store,google,{batchId:batch.id,kind:'pause',payload:{operations},idempotencyKey:`pause:${live.hash}`,dryRun:false}));
  }
  if(['report','report-scheduled','monitor'].includes(action)){
   if(action==='report-scheduled'&&new Intl.DateTimeFormat('en-GB',{timeZone:'America/Edmonton',hour:'2-digit',hourCycle:'h23'}).format(new Date())!=='08')return reply({skipped:'Outside morning report hour'});
   lease=await checked(db.rpc('ads_claim_job',{p_kind:action}));if(!lease)return reply({held:'JOB_OVERLAP'});
   const state=await store.state();let snapshot:Json|null=null;
   if(state.config){try{snapshot=await google.spend(state.config);await checked(db.from('ads_spend_snapshots').insert({payload:snapshot}));}catch{await checked(db.from('ads_engine_state').update({frozen:true,last_error:'Live reporting unavailable. Discretionary actions frozen.'}).eq('id',true));}}
   if(action==='monitor'){
    if(!snapshot||!state.config||!state.approved_batch_id)return reply({held:'SPEND_ACCESS_OR_APPROVED_CONFIG_REQUIRED'});
    const stops=state.paused?snapshot.campaigns.filter((c:Json)=>c.status==='ENABLED').map((c:Json)=>({campaign:c.resourceName,reason:'OWNER_PAUSE'})):safetyStops(state.config,snapshot);
    await checked(db.from('ads_engine_state').update({lease_id:null,lease_until:null}).eq('id',true).eq('lease_id',lease));lease=null;
    for(const stop of stops)await execute(store,google,{batchId:state.approved_batch_id,kind:'safety_pause',payload:{operations:[statusOperation(stop.campaign,'PAUSED')],reason:stop.reason},idempotencyKey:`safety:${state.approved_batch_id}:${snapshot.date}:${stop.campaign}:${stop.reason}:${Math.floor(Date.now()/900000)}`,dryRun:false});
    return reply({checkedAt:snapshot.observedAt,stops});
   }
   const date=edmontonDate(Date.now()-86400000);
   const start=new Date(Date.now()-30*86400000).toISOString();
   const events=await checked(db.from('ads_funnel_events').select('event_id,event_type,service,attribution,value_cents,tax_cents,occurred_at,livemode').gte('occurred_at',start));
   let delivery:Json[]=[];
   if(state.config){try{const rows=await google.read(`SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date = '${date}'`);delivery=rows.filter(r=>state.config.campaigns[r.campaign.name]).map(r=>({name:r.campaign.name,service:state.config.campaigns[r.campaign.name].service,spendCad:Number(r.metrics.costMicros||0)/1e6,clicks:Number(r.metrics.clicks||0),impressions:Number(r.metrics.impressions||0)}));}catch{/* Unknown spend is null, never zero. */}}
   const report=buildReport(events,delivery,date);
   if(!state.config)report.nextAction="Complete conversion diagnostics and approve the frozen Search launch batch";
   const terms=state.config?await google.read(`SELECT search_term_view.search_term, metrics.clicks, metrics.cost_micros FROM search_term_view WHERE segments.date = '${date}'`).catch(()=>[]):[];
   report.irrelevantTerms=terms.filter(r=>/^(?:pay ticket online|ticket lookup|jobs)$/i.test(r.searchTermView.searchTerm)).map(r=>({term:r.searchTermView.searchTerm,clicks:Number(r.metrics.clicks||0)}));
   report.holds=state.last_error?[state.last_error]:[];
   if(state.config){
    const week=await google.read(`SELECT campaign.name, segments.date, metrics.impressions FROM campaign WHERE segments.date DURING LAST_7_DAYS`).catch(()=>[]);
    const next=learningRecommendation(events,week.map(r=>({name:r.campaign.name,date:r.segments.date,impressions:Number(r.metrics.impressions||0)})));
    if(next)report.nextAction=next;
    const ads=await google.read("SELECT campaign.name, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'").catch(()=>[]);
    report.disapprovals=ads.filter(r=>state.config.campaigns[r.campaign.name]&&r.adGroupAd.policySummary?.approvalStatus==='DISAPPROVED').map(r=>({campaign:r.campaign.name,status:'DISAPPROVED'}));
    const checks=await Promise.all(['https://fabsy.ca/rapid-resolution','https://fabsy.ca/photo-radar'].map(async url=>{try{const r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(5000)});return {url,status:r.status,ok:r.ok};}catch{return {url,status:null,ok:false};}}));
    report.landingPages=checks;
    if(checks.some(r=>!r.ok))report.nextAction='Repair the failing landing destination before changing targeting';
    else if(report.disapprovals.length)report.nextAction='Review the Google disapproval and stage a compliant correction';
   }
   report.memo=weeklyMemo(events,date,report.nextAction);
   if(new Date(`${date}T12:00:00Z`).getUTCDay()===0){const saved=await db.storage.from('ads-engine').upload(`learnings/${weekKey(date)}.md`,new Blob([report.memo],{type:'text/markdown'}),{upsert:true,contentType:'text/markdown'});if(saved.error)throw new Error('WEEKLY_MEMO_SAVE_FAILED');}
   await checked(db.from('ads_reports').upsert({date,payload:report,memo:report.memo},{onConflict:'date'}));
   return reply(report);
  }
  return reply({error:'UNKNOWN_ACTION'},400);
 }catch(e){const reason=e instanceof Error?e.message:'ADS_ENGINE_HELD';return reply({error:/^[A-Z_0-9]+$/.test(reason)?reason:'ADS_ENGINE_HELD'},409);}
 finally{if(db&&lease)await db.from('ads_engine_state').update({lease_id:null,lease_until:null}).eq('id',true).eq('lease_id',lease);}
}
if(import.meta.main)Deno.serve(handler);
