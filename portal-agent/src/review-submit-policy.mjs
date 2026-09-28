export const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
export const compact=v=>String(v).replace(/\s+/g,' ').trim();
export function canonicalTerms(text){
 const raw=String(text);const version=raw.match(/This version in effect since (\d{4}-\d{2}-\d{2})/);const start=raw.indexOf('The Traffic Tickets Digital Service');
 if(!version||start<0)throw new Error('TERMS_LAYOUT_CHANGED');
 return compact(`Terms of Use Traffic Tickets Digital Service This version in effect since ${version[1]} `+raw.slice(start).replace(/\s*Back\s*$/,''));
}
const key=v=>String(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
export function verifyTicketPage(text,packet,withFine=false){
 const value=key(text);
 if(!value.includes(packet.ticket_number)||!value.includes('NAMEREGISTEREDOWNER'+key(packet.defendant)))throw new Error('LIVE_TICKET_IDENTITY_MISMATCH');
 if(withFine&&packet.proposal?.original_total!==undefined){const n=Number(packet.proposal.original_total);if(!new RegExp('\\$'+n.toFixed(2).replace('.','[.]')+'(?!\\d)|\\$'+String(n)+'(?![\\d.])').test(text))throw new Error('LIVE_FINE_CHANGED');}
}
export function existingReview(text){return /\b(?:view|cancel) (?:your )?review\b|review (?:already |has been )?(?:requested|submitted|pending)|request for review.{0,60}(?:pending|received)|prosecutor review.{0,60}(?:pending|requested)/i.test(text);}
export function reviewReceipt(url,text,ticket){
 const u=new URL(url);
 if(u.origin!=='https://traffictickets.alberta.ca'||u.pathname!=='/dispute-received'||!key(text).includes(ticket)||!/(review|request|submission)[\s\S]{0,140}(submitted|received|complete)/i.test(text))throw new Error('REVIEW_RECEIPT_NOT_CONFIRMED');
 return {ticket_number:ticket,url:u.href,confirmation:String(text).slice(0,12000),recorded_at:new Date().toISOString(),source:'cloud_verified_review'};
}

export function resumePageIndex(urls){
 const eligible=urls.map((url,index)=>({url,index})).filter(({url})=>{try{const u=new URL(url);return u.origin==='https://traffictickets.alberta.ca'&&u.pathname!=='/terms-of-use';}catch{return false;}});
 if(eligible.length!==1)throw new Error('VERIFIED_BROWSER_PAGE_REQUIRED');return eligible[0].index;
}
