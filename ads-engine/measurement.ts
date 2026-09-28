import type {Json} from './core.ts';
export const ADS_CONSENT_VERSION='fabsy-measurement-2026-09-27-v1';
export const ATTRIBUTION_KEYS=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','gbraid','wbraid','fbclid','fbc','fbp','landing_page','variant_id'] as const;
const publicLanding=new Set(['/','/rapid-resolution','/rapid-resolution-alt','/photo-radar','/submit-ticket','/thank-you']);
export function cleanAttribution(value:unknown):Record<string,string> {
  if(!value||typeof value!=='object')return {};
  const input=value as Json;const output:Record<string,string>={};
  for(const key of ATTRIBUTION_KEYS){
    const v=input[key];if(typeof v!=='string')continue;
    if(key==='landing_page'){const path=v.replace(/^\/(?:en|pa|tl|zh-hans|zh-hant|ar|es|hi)(?=\/|$)/,'')||'/';if(publicLanding.has(path))output[key]=v;}
    else if(key==='fbc'||key==='fbp'){if(/^fb\.\d\.\d{10,13}\.[A-Za-z0-9_-]{1,512}$/.test(v))output[key]=v;}
    else if(key.startsWith('utm_')){if(/^[A-Za-z0-9_ -]{1,120}$/.test(v)&&!/(?:@|\b\d{7,}\b)/.test(v))output[key]=v;}
    else if(/^[A-Za-z0-9_-]{1,512}$/.test(v))output[key]=v;
  }
  return output;
}
/** Webhook-only monetary events. No hard-coded product amount and no client PII. */
export function paymentEvent(session:Json,attribution:Json={},items:Json[]=[]):Json|null {
  if(session.payment_status!=='paid'||session.mode!=='payment'||session.currency!=='cad'||!/^cs_(?:live_|test_)[A-Za-z0-9]+$/.test(session.id||''))return null;
  const total=session.amount_total,tax=session.total_details?.amount_tax,subtotal=session.amount_subtotal,discount=session.total_details?.amount_discount||0;
  if(![total,tax,subtotal,discount].every(Number.isSafeInteger)||total<0||tax<0||discount<0||tax>total||subtotal-discount+tax!==total)throw new Error('INVALID_PAYMENT_AMOUNTS');
  const id=session.metadata?.ticket_submission_id||session.metadata?.submission_id;
  if(!/^[a-f0-9-]{36}$/.test(id||''))return null;
  return {event_id:`paid:${session.id}`,submission_id:id,event_type:'client_paid',livemode:session.id.startsWith('cs_live_'),service:session.metadata?.fabsy_product==='photo_radar'?'camera':'officer',value_cents:total-tax,tax_cents:tax,currency:'CAD',attribution:cleanAttribution(attribution),line_items:items.map((i:Json,index:number)=>({item_id:`service_${index+1}`,quantity:i.quantity,amount_subtotal:i.amount_subtotal,amount_discount:i.amount_discount||0,amount_tax:i.amount_tax,amount_total:i.amount_total})),occurred_at:new Date((session.created||Date.now()/1000)*1000).toISOString()};
}
