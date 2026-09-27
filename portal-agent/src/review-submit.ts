import type {Page} from '@cloudflare/puppeteer';
import {canonicalTerms,digest,compact,verifyTicketPage,existingReview,reviewReceipt} from './review-submit-policy.mjs';
type Packet={ticket_number:string;defendant:string;draft_text:string;draft_sha256:string;source_sha256:string;consent_sha256:string;plate:string;terms:{sha256:string};consent:{name:string;data:string};representative:{name:string;business:string;email:string};proposal:any};
const body=(page:Page)=>page.evaluate(()=>document.querySelector<HTMLElement>('main')?.innerText||document.body.innerText);
async function guard(page:Page){
 if(new URL(page.url()).origin!=='https://traffictickets.alberta.ca')throw new Error('OFFICIAL_PORTAL_REQUIRED');
 const blocked=await page.evaluate(()=>/verify (?:that )?you are human|access denied|unusual traffic|request (?:was )?blocked/i.test(document.body.innerText)||Array.from(document.querySelectorAll('iframe')).some(f=>(/bframe/.test(f.src)||/challenge/i.test(f.title))&&f.getBoundingClientRect().height>50&&f.getBoundingClientRect().width>100));
 if(blocked)throw new Error('HUMAN_VERIFICATION_REQUIRED');
}
async function path(page:Page,value:string){
 await page.waitForFunction(p=>{
  if(location.pathname!==p)return false;
  const root=document.querySelector('main');if(!root)return false;
  const text=root.textContent||'';
  if(p==='/search-verification')return !!root.querySelector('#licencePlate')&&/Ticket number/.test(text);
  if(p==='/ticket-information')return /Name\s*\/\s*Registered owner/i.test(text);
  const labels=Array.from(root.querySelectorAll('button,a,input[type=submit]')).map(e=>(e.textContent||(e as HTMLInputElement).value||'').trim());
  if(p==='/ticket-penalty-and-options')return labels.some(v=>v.startsWith('Additional Options'));
  if(p==='/dispute-options')return labels.some(v=>v.startsWith('Request a review'));
  if(p==='/submit-your-dispute')return !!root.querySelector('#disputeDetails');
  return false;
 },{timeout:45000},value);await guard(page);
}
async function click(page:Page,label:string){
 await guard(page);await page.evaluate(value=>{const matches=Array.from(document.querySelectorAll<HTMLButtonElement|HTMLAnchorElement|HTMLInputElement>('main button,main a,main input[type=submit]')).filter(e=>(e.textContent||('value'in e?e.value:'')).replace(/\s+/g,' ').trim().startsWith(value)&&e.getBoundingClientRect().width>0);if(matches.length!==1||('disabled'in matches[0]&&matches[0].disabled))throw new Error('PORTAL_CONTROL_CHANGED');matches[0].click();},label);
}
async function checked(page:Page,label:string){await page.evaluate(value=>{const matches=Array.from(document.querySelectorAll<HTMLInputElement>('main input[type=radio],main input[type=checkbox]')).filter(e=>Array.from(e.labels||[]).some(l=>l.textContent?.replace(/\s+/g,' ').trim()===value));if(matches.length!==1||matches[0].disabled)throw new Error('PORTAL_CONTROL_CHANGED');if(!matches[0].checked)matches[0].click();},label);}
async function fill(page:Page,selector:string,value:string){const input=await page.$(selector);if(!input)throw new Error('PORTAL_CONTROL_CHANGED');await input.click({clickCount:3});await input.type(value);}
async function terms(page:Page,expected:string){const tab=await page.browser().newPage();try{const response=await tab.goto('https://traffictickets.alberta.ca/terms-of-use',{waitUntil:'networkidle2',timeout:45000});if(response?.status()!==200)throw new Error('TERMS_UNAVAILABLE');await guard(tab);const text=await tab.evaluate(()=>document.querySelector<HTMLElement>('main')?.innerText||'');if(await digest(canonicalTerms(text))!==expected)throw new Error('GOVERNMENT_TERMS_CHANGED');}finally{await tab.close();}}
export async function executeApprovedReview(page:Page,packet:Packet,commit:(form:Record<string,unknown>)=>Promise<void>,complete:(receipt:Record<string,unknown>)=>Promise<void>){
 await terms(page,packet.terms.sha256);await guard(page);
 let current=new URL(page.url()).pathname;
 // A resumed form must recheck the legal defendant and fine before writing.
 if(current==='/submit-your-dispute'){await click(page,'Ticket penalty and payment options');await path(page,'/ticket-penalty-and-options');current='/ticket-penalty-and-options';}
 if(current==='/ticket-number-search'){
  await fill(page,'#ticketNumber',packet.ticket_number);await fill(page,'input[type=email]',packet.representative.email);await checked(page,'I agree to the Terms and Conditions.');await click(page,'Next');await path(page,'/search-verification');current='/search-verification';
 }
 if(current==='/search-verification'){
  const heading=await body(page);if(!heading.includes(packet.ticket_number))throw new Error('LIVE_TICKET_IDENTITY_MISMATCH');await checked(page,'Licence plate');await fill(page,'#licencePlate',packet.plate);await click(page,'Find ticket');await path(page,'/ticket-information');current='/ticket-information';
 }
 if(current==='/ticket-information'){verifyTicketPage(await body(page),packet);await click(page,'Next');await path(page,'/ticket-penalty-and-options');current='/ticket-penalty-and-options';}
 if(current==='/ticket-penalty-and-options'){const text=await body(page);verifyTicketPage(text,packet,true);if(existingReview(text))throw new Error('EXISTING_REVIEW_REQUIRES_RECONCILIATION');await click(page,'Additional Options');await path(page,'/dispute-options');current='/dispute-options';}
 if(current==='/dispute-options'){const text=await body(page);if(!text.includes(packet.ticket_number)||existingReview(text))throw new Error('LIVE_TICKET_STATE_CHANGED');await click(page,'Request a review');await path(page,'/submit-your-dispute');current='/submit-your-dispute';}
 if(current!=='/submit-your-dispute'||!compact(await body(page)).includes('Submit your review'))throw new Error('REVIEW_FLOW_CHANGED');
 await checked(page,'No, this is not my ticket, but I am an agent/lawyer acting on behalf of the defendant');await checked(page,'Agent');
 await fill(page,'#fullName',packet.representative.name);await fill(page,'input[name=lawFirm]',packet.representative.business);await fill(page,'#email',packet.representative.email);await checked(page,'No email address');await fill(page,'#disputeDetails',packet.draft_text);
 await page.evaluate(file=>{const input=document.querySelector<HTMLInputElement>('#disputeUpload');if(!input)throw new Error('CONSENT_UPLOAD_CHANGED');const bytes=Uint8Array.from(atob(file.data),v=>v.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],file.name,{type:'application/pdf'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},packet.consent);
 await page.waitForFunction(name=>document.querySelector('main')?.textContent?.includes(name),{timeout:45000},packet.consent.name);await guard(page);
 const known=['No email address','I confirm that all the information supplied is accurate and truthful.'];
 const unexpected=await page.evaluate(allowed=>Array.from(document.querySelectorAll<HTMLInputElement>('main input[type=checkbox]')).filter(e=>e.getBoundingClientRect().width>0).some(e=>!Array.from(e.labels||[]).some(l=>allowed.includes(l.textContent?.replace(/\s+/g,' ').trim()||''))),known);if(unexpected)throw new Error('ADDITIONAL_DECLARATION_REQUIRES_APPROVAL');
 await checked(page,known[1]);await terms(page,packet.terms.sha256);
 const form=await page.evaluate(()=>{
  const labels=Array.from(document.querySelectorAll<HTMLInputElement>('main input')).filter(e=>e.checked).flatMap(e=>Array.from(e.labels||[]).map(l=>l.textContent?.replace(/\s+/g,' ').trim()||''));
  return {draft:document.querySelector<HTMLTextAreaElement>('#disputeDetails')?.value||'',representative_name:document.querySelector<HTMLInputElement>('#fullName')?.value||'',business:document.querySelector<HTMLInputElement>('input[name=lawFirm]')?.value||'',representative_email:document.querySelector<HTMLInputElement>('#email')?.value||'',defendant_no_email:labels.includes('No email address')&&(document.querySelector<HTMLInputElement>('#defendantEmail')?.value||'')==='',agent:labels.includes('Agent')&&labels.includes('No, this is not my ticket, but I am an agent/lawyer acting on behalf of the defendant'),accurate_and_truthful:labels.includes('I confirm that all the information supplied is accurate and truthful.')};
 });
 if(form.draft!==packet.draft_text||form.representative_name!==packet.representative.name||form.business!==packet.representative.business||form.representative_email!==packet.representative.email||!form.defendant_no_email||!form.agent||!form.accurate_and_truthful||await digest(form.draft)!==packet.draft_sha256)throw new Error('REVIEW_FORM_CHANGED');
 await commit({ticket_number:packet.ticket_number,draft_sha256:packet.draft_sha256,source_sha256:packet.source_sha256,consent_sha256:packet.consent_sha256,representative_email:form.representative_email,defendant_no_email:form.defendant_no_email,agent:form.agent,accurate_and_truthful:form.accurate_and_truthful,consent_filename:packet.consent.name});
 // Commit once before either submission control. Never retry a final confirmation.
 await click(page,'Submit');
 await page.waitForFunction(()=>location.pathname!=='/submit-your-dispute'||Array.from(document.querySelectorAll<HTMLButtonElement>('main button')).some(b=>b.textContent?.trim()==='Confirm review'&&!b.disabled),{timeout:45000});await guard(page);
 if(new URL(page.url()).pathname==='/submit-your-dispute'){
  if(!compact(await body(page)).includes('Are you sure you want to submit this review?'))throw new Error('REVIEW_CONFIRMATION_CHANGED');
  await click(page,'Confirm review');
 }
 await page.waitForFunction(()=>location.pathname!=='/submit-your-dispute'&&!document.querySelector('main #disputeDetails')&&/submitted|received|complete/i.test(document.querySelector('main')?.textContent||''),{timeout:45000});await guard(page);
 await complete(reviewReceipt(page.url(),await body(page),packet.ticket_number));
}
