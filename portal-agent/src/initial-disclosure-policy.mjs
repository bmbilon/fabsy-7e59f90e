import {compact,digest} from './review-submit-policy.mjs';
export {digest};
export const normalized = value => String(value).toUpperCase().replace(/[^A-Z0-9]/g,'');
const normalizedName = value => String(value).normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
export function verifyInitialIdentity(text,packet,withFine=false){
 const value=normalizedName(text);
 const names=packet.defendant_variants?.length?packet.defendant_variants:[packet.defendant];
 if(!value.includes(packet.ticket_number)||!names.some(name=>normalizedName(name)&&value.includes('NAMEREGISTEREDOWNER'+normalizedName(name))))throw new Error('LIVE_TICKET_IDENTITY_MISMATCH');
 if(withFine){
  const amount=Number(packet.fine_amount);
  const totals=[...compact(text).matchAll(/\b(?:Penalty(?: \(total\))?|Fine|Total)\s*\$\s*(\d+(?:\.\d{1,2})?)(?![\d.])/gi)].map(match=>Number(match[1]));
  if(!Number.isFinite(amount)||amount<=0||totals.length===0||totals.some(total=>total!==amount))throw new Error('LIVE_FINE_CHANGED');
 }
}
export function existingDisclosure(text){
 return /disclosure requested on|disclosure (?:already |has been )?(?:requested|submitted|available)|view (?:your )?disclosure|received your disclosure request/i.test(text);
}
export function disclosureReceipt(url,text,ticket){
 const location=new URL(url);
 const confirmed=new RegExp('received your disclosure request for\\s+(?:ticket\\s+)?'+ticket+'(?![A-Z0-9])','i');
 if(location.origin!=='https://traffictickets.alberta.ca'||location.pathname!=='/request-disclosure-confirmation'
  ||!/^[A-Z][0-9]{8}[A-Z]$/.test(ticket)||!confirmed.test(compact(text)))throw new Error('DISCLOSURE_RECEIPT_NOT_CONFIRMED');
 return {ticket_number:ticket,url:location.href,confirmation:String(text).slice(0,12000),recorded_at:new Date().toISOString(),source:'cloud_verified_disclosure'};
}
