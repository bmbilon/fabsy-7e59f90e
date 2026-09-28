import {adsConsent} from './adsConsent';
import {ATTRIBUTION_KEYS,cleanAttribution} from '../../ads-engine/measurement';
export const MARKETING_STORAGE_KEY='fabsy_marketing_v2';
export const MARKETING_ATTRIBUTION_KEYS=[...ATTRIBUTION_KEYS,'llm_source','referrer_host','first_touch_at'] as const;
export type MarketingAttribution=Partial<Record<(typeof MARKETING_ATTRIBUTION_KEYS)[number],string>>;
const sources=[{source:'chatgpt',hosts:['chatgpt.com','chat.openai.com','openai']},{source:'perplexity',hosts:['perplexity.ai','perplexity']},{source:'claude',hosts:['claude.ai','claude']},{source:'gemini',hosts:['gemini.google.com','bard.google.com','gemini','bard']},{source:'copilot',hosts:['copilot.microsoft.com','copilot']}];
export function detectLlmSource(utmSource:string,referrerHost:string){return sources.find(s=>s.hosts.some(h=>[utmSource,referrerHost].some(v=>v.toLowerCase().includes(h))))?.source;}
function safeHost(value:string){try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
function internalFields(value:Record<string,unknown>):MarketingAttribution{
 const fields:MarketingAttribution=cleanAttribution(value);
 if(typeof value.first_touch_at==='string'&&Number.isFinite(Date.parse(value.first_touch_at))&&Date.parse(value.first_touch_at)<=Date.now())fields.first_touch_at=value.first_touch_at;
 if(typeof value.referrer_host==='string'&&/^[a-z0-9.-]{1,250}$/.test(value.referrer_host))fields.referrer_host=value.referrer_host;
 if(typeof value.llm_source==='string'&&sources.some(s=>s.source===value.llm_source))fields.llm_source=value.llm_source;
 return fields;
}
export function readMarketingAttribution():MarketingAttribution{
 if(typeof window==='undefined'||!adsConsent())return {};
 try{return internalFields(JSON.parse(window.sessionStorage.getItem(MARKETING_STORAGE_KEY)||'{}'));}catch{return {};}
}
/** Session attribution persists across SPA navigation and the payment return. */
export function captureMarketingAttribution(search:string,pathname:string,referrer:string):MarketingAttribution{
 if(typeof window==='undefined'||!adsConsent())return {};
 const params=new URLSearchParams(search),existing=readMarketingAttribution();
 const hasCampaign=ATTRIBUTION_KEYS.some(k=>!['landing_page','variant_id','fbc','fbp'].includes(k)&&params.has(k));
 if(existing.first_touch_at&&!hasCampaign){
  const variant=cleanAttribution({variant_id:params.get('variant_id')}).variant_id;
  if(variant){existing.variant_id=variant;try{window.sessionStorage.setItem(MARKETING_STORAGE_KEY,JSON.stringify(existing));}catch{/* Optional persistence. */}}
  return existing;
 }
 const captured:MarketingAttribution={};
 for(const key of ATTRIBUTION_KEYS){const value=params.get(key);if(value)captured[key]=value;}
 const host=safeHost(referrer);
 if(host&&host!==window.location.hostname.replace(/^www\./,''))captured.referrer_host=host;
 const llm=detectLlmSource(captured.utm_source||'',captured.referrer_host||'');if(llm)captured.llm_source=llm;
 for(const key of ['fbc','fbp'] as const){const cookie=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(`_${key}=`));if(cookie)captured[key]=cookie.slice(key.length+2);}
 captured.landing_page=pathname;captured.first_touch_at=new Date().toISOString();
 const safe=internalFields(captured);
 try{window.sessionStorage.setItem(MARKETING_STORAGE_KEY,JSON.stringify(safe));}catch{/* Attribution never blocks intake. */}
 return safe;
}
