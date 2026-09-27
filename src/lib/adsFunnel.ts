import {supabase} from '@/integrations/supabase/client';
import {adsConsent} from './adsConsent';
import {readMarketingAttribution} from './adsMarketingAttribution';
import {ADS_CONSENT_VERSION} from '../../ads-engine/measurement';
import {currentGoogleMeasurementConfig,dispatchGoogleMeasurement,GOOGLE_MEASUREMENT_READY} from './googleMeasurement';
import {opaqueTransactionId} from './paidPurchaseMeasurement';
import {beginTicketUploadMeasurementHandoff} from './ticketUploadMeasurement';
import type {SavedTicketSubmission} from './ticket/submitIntake';
import type {IntakeDraftCapability} from './ticket/intakeDraft';
import {pendingKey,dispatchPendingAdsUploads,type UploadEvents} from './adsUploadMeasurement';
export {reportFunnelEvent,dispatchPendingAdsUploads} from './adsUploadMeasurement';
export async function rememberEnhancedContact(email:string,phone:string,sessionId?:string):Promise<void>{
 if(!adsConsent())return;
 const values:Record<string,string>={};
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){let normalized=email.trim().toLowerCase();const [local,domain]=normalized.split('@');if(['gmail.com','googlemail.com'].includes(domain))normalized=`${local.replace(/\./g,'')}@${domain}`;const hash=await opaqueTransactionId(normalized);if(hash)values.sha256_email_address=hash;}
 const digits=phone.replace(/\D/g,'');const e164=digits.length===10?`+1${digits}`:phone.startsWith('+')?`+${digits}`:digits.length===11&&digits.startsWith('1')?`+${digits}`:'';
 if(/^\+[1-9]\d{7,14}$/.test(e164)){const hash=await opaqueTransactionId(e164);if(hash)values.sha256_phone_number=hash;}
 // Receipt tokens and contact values never go to Google. Hash the scoped key too.
 const transactionId=sessionId?await opaqueTransactionId(sessionId):null;
 try{window.sessionStorage.setItem(transactionId?`fabsy_ads_contact:${transactionId}`:'fabsy_ads_contact',JSON.stringify(values));}catch{/* Optional enhanced conversions. */}
}
async function measureReceipt(body:Record<string,unknown>,email:string,phone:string,allowBridge:boolean){
 try{
  await rememberEnhancedContact(email,phone);
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const response=await Promise.race([
   supabase.functions.invoke('ads-measurement',{body:{...body,...(adsConsent()?{consentVersion:ADS_CONSENT_VERSION,attribution:readMarketingAttribution()}:{})}}),
   new Promise<null>(resolve=>{timeout=setTimeout(()=>resolve(null),3000);}),
  ]).finally(()=>clearTimeout(timeout));
  if(!response)return;
  const {data,error}=response;
  if(error||!data||!adsConsent()||typeof data.eventId!=='string'||!data.eventId||!['officer','camera'].includes(data.service))return;
  if(data.qualifiedEventId!=null&&typeof data.qualifiedEventId!=='string')return;
  const hash=await opaqueTransactionId(data.eventId);const qualifiedHash=data.qualifiedEventId?await opaqueTransactionId(data.qualifiedEventId):null;
  if(!hash)return;
  const pending:UploadEvents={eventId:`upload:${hash}`,qualifiedEventId:qualifiedHash?`qualified:${qualifiedHash}`:null,service:data.service};
  try{window.sessionStorage.setItem(pendingKey,JSON.stringify(pending));}catch{return;}
  const done=dispatchPendingAdsUploads();
  window.addEventListener(GOOGLE_MEASUREMENT_READY,dispatchPendingAdsUploads,{once:true});
  // Private intake documents never load Google. Use the existing clean bridge
  // only when qualification becomes available, and restore the saved draft.
  if(!done&&qualifiedHash&&allowBridge&&beginTicketUploadMeasurementHandoff(window.location.pathname))window.location.assign('/ticket-uploaded');
 }catch{/* Measurement must never block intake or checkout. */}
}
export function measureSavedTicket(saved:Pick<SavedTicketSubmission,'submissionId'|'accessToken'>,email='',phone='',allowBridge=true):Promise<void>{return measureReceipt({submissionId:saved.submissionId,accessToken:saved.accessToken},email,phone,allowBridge);}
export function measureDraftTicket(saved:Pick<IntakeDraftCapability,'draftId'|'accessToken'>,email='',phone=''):Promise<void>{return measureReceipt({draftId:saved.draftId,accessToken:saved.accessToken},email,phone,true);}
