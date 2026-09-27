import {adsConsent} from './adsConsent';
import {currentGoogleMeasurementConfig,dispatchGoogleMeasurement} from './googleMeasurement';
const queued=new Set<string>();
export const pendingKey='fabsy:ads-pending-uploads:v1';
export type UploadEvents={eventId:string;qualifiedEventId:string|null;service:string};
export function reportFunnelEvent(event:string,id:string,service:string):boolean {
 if(!adsConsent()||!/^(?:upload|qualified):[a-f0-9]{64}$/.test(id)||!['officer','camera'].includes(service))return false;
 const config=currentGoogleMeasurementConfig();let reported=false;
 const send=(name:string,destination:string,extra:Record<string,unknown>={})=>{
  const key=`fabsy-funnel:${destination}:${id}`;
  try{if(queued.has(key)||window.sessionStorage.getItem(key)){reported=true;return;}}catch{/* Memory dedup remains. */}
  if(dispatchGoogleMeasurement(name,{send_to:destination,event_id:id,transaction_id:id,service,currency:'CAD',...extra})){
   reported=true;queued.add(key);try{window.sessionStorage.setItem(key,'1');}catch{/* Optional storage. */}
  }
 };
 if(config.ga4Id)send(event,config.ga4Id);
 if(event==='qualified_ticket_upload'&&config.adsId&&/^[A-Za-z0-9_-]+$/.test(config.qualifiedLabel||''))send('conversion',`${config.adsId}/${config.qualifiedLabel}`,{conversion_kind:event,value:0});
 return reported;
}
export function dispatchPendingAdsUploads():boolean {
 if(!adsConsent())return false;
 try{const pending:UploadEvents=JSON.parse(window.sessionStorage.getItem(pendingKey)||'null');if(!pending)return false;
  const upload=reportFunnelEvent('ticket_uploaded',pending.eventId,pending.service);
  const qualified=!pending.qualifiedEventId||reportFunnelEvent('qualified_ticket_upload',pending.qualifiedEventId,pending.service);
  if(upload&&qualified)window.sessionStorage.removeItem(pendingKey);
  return upload&&qualified;
 }catch{return false;}
}
