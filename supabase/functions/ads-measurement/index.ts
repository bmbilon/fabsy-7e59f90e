import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {ADS_CONSENT_VERSION,cleanAttribution} from '../../../ads-engine/measurement.ts';
import {digest} from '../../../ads-engine/core.ts';
import {saveEvent} from '../../../ads-engine/platform/store.ts';
import {intakeAccessTokenHash} from '../_shared/ticket-completion.ts';
import {ticketCompletionSecret} from '../_shared/ticket-completion-secret.ts';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://fabsy.ca','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export async function handler(req:Request):Promise<Response>{
 if(req.method==='OPTIONS')return reply(null);
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 try{
  const input=await req.json();const draftMode=typeof input.draftId==='string';const id=draftMode?input.draftId:input.submissionId;
  if(!uuid.test(id||'')||typeof input.accessToken!=='string'||input.accessToken.length<32||input.accessToken.length>220)return reply({error:'PRIVATE_RECEIPT_REQUIRED'},403);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const hash=await intakeAccessTokenHash(input.accessToken,input.accessToken.startsWith('c1.')?ticketCompletionSecret():'',id);
  const r=draftMode
   ? await db.from('ticket_intake_drafts').select('id,access_token_hash,email,phone,draft_data,ticket_uploaded_at,ticket_document_path,pending_ticket_document_path,converted_submission_id,expires_at,resume_delivery_status,resume_delivery_channel').eq('id',id).is('deleted_at',null).single()
   : await db.from('ticket_submissions').select('id,ticket_type,intake_review_status,consent_form_path,ticket_document_path,email,phone,representation_access_token_hash').eq('id',id).is('deleted_at',null).single();
  const ticket=r.data as Record<string,any>|null;
  if(r.error||!ticket||!hash||(draftMode?ticket.access_token_hash:ticket.representation_access_token_hash)!==hash||!ticket.ticket_document_path||(draftMode?(!ticket.ticket_uploaded_at||ticket.pending_ticket_document_path||Date.parse(ticket.expires_at)<=Date.now()):!ticket.consent_form_path))return reply({error:'PRIVATE_RECEIPT_REQUIRED'},403);
  const table=draftMode?'ads_draft_attribution':'ads_attribution',key=draftMode?'draft_id':'submission_id';
  const consented=input.consentVersion===ADS_CONSENT_VERSION;
  const fields=consented?cleanAttribution(input.attribution):{};
  // A converted draft and its case are linked by the server, never by contact matching.
  const source=!draftMode?await db.from('ads_draft_attribution').select('*').eq('draft_id',id).maybeSingle():null;
  if(consented||source?.data){const a=source?.data;const saved=await db.from(table).upsert({[key]:id,fields:a?.fields||fields,consent_version:a?.consent_version||(consented?ADS_CONSENT_VERSION:null),...(a?{readable_at:a.readable_at,readable_by:a.readable_by,contact_verified_at:a.contact_verified_at,contact_verified_by:a.contact_verified_by,contact_evidence:a.contact_evidence,contact_hash:a.contact_hash,readable_document_hash:a.readable_document_hash}:{})},{onConflict:key,ignoreDuplicates:true});if(saved.error)throw new Error('ATTRIBUTION_SAVE_FAILED');}
  const currentContactHash=await digest([ticket.email?.trim().toLowerCase()||'',ticket.phone?.replace(/\D/g,'')||'']);
  const currentDocumentHash=await digest(ticket.ticket_document_path);
  const current=await db.from(table).select('*').eq(key,id).maybeSingle();if(current.error)throw new Error('ATTRIBUTION_READ_FAILED');
  const authToken=req.headers.get('Authorization')?.replace(/^Bearer /,'');
  let contactConfirmed=Boolean(draftMode&&input.accessToken.startsWith('c1.')&&ticket.resume_delivery_status==='sent'&&ticket.resume_delivery_channel==='email'&&ticket.email);
  let contactEvidence=contactConfirmed?'Opened the current signed resume link sent to the recorded email contact':'';
  if(authToken){const auth=await db.auth.getUser(authToken);const u=auth.data?.user;
   if(u&&(u.email_confirmed_at&&u.email?.toLowerCase()===ticket.email?.toLowerCase()||u.phone_confirmed_at&&u.phone?.replace(/\D/g,'')===ticket.phone?.replace(/\D/g,''))){
    contactConfirmed=true;contactEvidence='Confirmed Supabase Auth contact matches intake';
   }
  }
  if(contactConfirmed){const saved=await db.from(table).upsert({[key]:id,fields:current.data?.fields||fields,consent_version:current.data?.consent_version||(consented?ADS_CONSENT_VERSION:null),readable_at:current.data?.readable_at||null,readable_by:current.data?.readable_by||null,readable_document_hash:current.data?.readable_document_hash||null,contact_verified_at:new Date().toISOString(),contact_hash:currentContactHash,contact_evidence:contactEvidence},{onConflict:key});if(saved.error)throw new Error('CONTACT_VERIFICATION_SAVE_FAILED');current.data={...current.data,contact_verified_at:new Date().toISOString(),contact_hash:currentContactHash};}
  const service=(draftMode?ticket.draft_data?.ticketType:ticket.ticket_type)==='photo_radar'?'camera':'officer';
  const attribution=current.data?.fields||{},receipt=draftMode?{draft_id:id}:{submission_id:id};
  const qualified=Boolean((!draftMode&&ticket.intake_review_status==='ready'||current.data?.readable_at&&current.data?.readable_document_hash===currentDocumentHash)&&current.data?.contact_verified_at&&current.data?.contact_hash===currentContactHash);
  // Conversion preserves the draft UUID. Stable event IDs prevent double counting.
  const eventId=`upload:${id}`,qualifiedEventId=qualified?`qualified:${id}`:null;
  if(!draftMode&&source?.data){const linked=await db.from('ads_funnel_events').update({submission_id:id,draft_id:null}).eq('draft_id',id);if(linked.error)throw new Error('EVENT_LINK_FAILED');}
  await saveEvent(db,{event_id:eventId,...receipt,event_type:'ticket_uploaded',service,attribution});
  if(qualified)await saveEvent(db,{event_id:qualifiedEventId,...receipt,event_type:'qualified_ticket_upload',service,attribution});
  return reply({eventId,qualifiedEventId,service,qualificationHold:qualified?null:'Readable image and verified contact evidence required'});
 }catch{return reply({error:'MEASUREMENT_UNAVAILABLE'},503);}
}
if(import.meta.main)Deno.serve(handler);
