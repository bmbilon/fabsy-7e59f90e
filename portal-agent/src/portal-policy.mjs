import {extractOfferFields} from './offer-extraction.mjs';
export function portalTarget(job) {
 const url=new URL(job.source_url);
 if(url.protocol!=='https:' || url.hostname!=='traffictickets.alberta.ca' || url.port || url.username || url.password || url.hash) throw new Error('Invalid official portal link');
 if(['inspect_offer','prepare_offer_acceptance'].includes(job.action)) {
  if(url.pathname!=='/dispute-response' || [...url.searchParams.keys()].some(k=>k!=='uuid') || url.searchParams.getAll('uuid').length!==1 || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(url.searchParams.get('uuid')||'')) throw new Error('Invalid offer link');
 } else if(['inspect_disclosure','submit_review_request'].includes(job.action)) {
  if(url.pathname!=='/ticket-number-search' || url.searchParams.getAll('ticketNumber').length!==1 || [...url.searchParams.keys()].some(k=>k!=='ticketNumber') || url.searchParams.get('ticketNumber')!==job.ticket_number) throw new Error('Invalid disclosure ticket link');
 } else throw new Error('Disclosure preparation requires consent review and a supported portal flow');
 if(!/^[A-Z0-9]{5,20}$/.test(job.ticket_number)) throw new Error('Invalid ticket number');
 return url.href;
}
export function inspectResult(job,{text,status,url,title}) {
 const base={portal_verified:false,http_status:status,final_path:new URL(url).pathname,title:String(title).slice(0,300),observed_at:new Date().toISOString(),page_text:(new URL(url).pathname==='/' || text.includes(job.ticket_number))?String(text).slice(0,20000):''};
 if(status===403||status===429||/access denied|request (?:was )?blocked|verify (?:that )?you are human|captcha|unusual traffic/i.test(text)) return {status:'needs_review',reason:'The government portal blocked or challenged the cloud browser. Open the official link to continue; no request was submitted.',result:base};
 if(status<200||status>=300) return {status:'needs_review',reason:'The government portal did not return a successful page.',result:base};
 if(job.action==='inspect_disclosure') return {status:'needs_review',reason:'Disclosure is available. Complete ticket verification in the cloud browser, then download the evidence and attach it to the case. This notice never submits a new disclosure request.',result:base};
 if(new URL(url).origin!=='https://traffictickets.alberta.ca' || !text.includes(job.ticket_number) || new URL(url).pathname!=='/dispute-response' || new URL(url).searchParams.get('uuid')!==new URL(job.source_url).searchParams.get('uuid')) return {status:'needs_review',reason:'The portal needs sign-in or ticket verification. The expected ticket was not visible.',result:base};
 if(job.action==='prepare_offer_acceptance') return {status:'needs_review',reason:'Client acceptance requested. Verify the exact sent offer, signed consent, signer authority and latest reply against the current terms before accepting in the government portal. Save its acceptance receipt, fine/balance, payment deadline and attendance status before confirming to the client. This runner has not accepted the offer.',result:{...base,portal_verified:true}};
 // Record actual evidence, never guess numeric terms or dates from a screenshot/template.
 return {status:'needs_review',reason:'Offer page captured. Verify the terms and response deadline before preparing the client draft.',result:{...base,portal_verified:true,offer_fields:extractOfferFields(job.ticket_number,text,url,base.observed_at)}};
}
