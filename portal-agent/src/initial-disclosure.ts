import type {Page} from '@cloudflare/puppeteer';
import {portalBody,portalGuard,portalPath,portalClick,portalChecked,portalFill,readSessionTerms} from './portal-form';
import {verifyInitialIdentity,existingDisclosure,disclosureReceipt} from './initial-disclosure-policy.mjs';
export interface InitialPacket {
 ticket_number:string;defendant:string;defendant_variants?:string[];fine_amount:number;verification:{kind:'plate'|'drivers_license'|'date_of_birth';value:string;fingerprint:string;record_id?:string};source_sha256:string;consent_sha256:string;case_fingerprint:string;
 consent:{name:string;data:string};representative:{first_name:string;last_name:string;business:string;email:string};
}
export async function executeInitialDisclosure(page:Page,packet:InitialPacket,session:{id:string;terms_sha256:string;browser_session_id:string},commit:(form:Record<string,unknown>)=>Promise<void>,complete:(receipt:Record<string,unknown>)=>Promise<void>){
 if(!session.id||!session.browser_session_id)throw new Error('ACCEPTED_SESSION_REQUIRED');
 if((await readSessionTerms(page)).sha256!==session.terms_sha256)throw new Error('GOVERNMENT_TERMS_CHANGED');await portalGuard(page);
 let current=new URL(page.url()).pathname;
 // A human-assisted resume starts from verified ticket information again.
 if(current==='/request-disclosure'){await portalClick(page,'Back');await portalPath(page,'/ticket-penalty-and-options');current='/ticket-penalty-and-options';}
 if(current==='/ticket-number-search'){
  await portalFill(page,'#ticketNumber',packet.ticket_number);await portalFill(page,'input[type=email]',packet.representative.email);
  await portalChecked(page,'I agree to the Terms and Conditions.');await portalClick(page,'Next');await portalPath(page,'/search-verification','input[name=verificationType]');current='/search-verification';
 }
 if(current==='/search-verification'){
  if(!(await portalBody(page)).includes(packet.ticket_number))throw new Error('LIVE_TICKET_IDENTITY_MISMATCH');
  const controls={plate:{label:'Licence plate',selector:'#licencePlate'},drivers_license:{label:"Driver's licence number",selector:'#driversLicence'},date_of_birth:{label:'Date of birth',selector:'#dateOfBirth'}};
  const control=controls[packet.verification.kind];if(!control||!packet.verification.value)throw new Error('VERIFICATION_DETAIL_REQUIRED');
  await portalChecked(page,control.label);await page.waitForSelector(control.selector,{timeout:10000});await portalFill(page,control.selector,packet.verification.value);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll<HTMLButtonElement>('main button')).some(button=>button.textContent?.trim()==='Find ticket'&&!button.disabled),{timeout:10000});
  await portalClick(page,'Find ticket');await portalPath(page,'/ticket-information');current='/ticket-information';
 }
 if(current==='/ticket-information'){verifyInitialIdentity(await portalBody(page),packet);await portalClick(page,'Next');await portalPath(page,'/ticket-penalty-and-options');current='/ticket-penalty-and-options';}
 if(current!=='/ticket-penalty-and-options')throw new Error('DISCLOSURE_FLOW_CHANGED');
 const information=await portalBody(page);verifyInitialIdentity(information,packet,true);
 if(existingDisclosure(information))throw new Error('EXISTING_DISCLOSURE_REQUIRES_RECONCILIATION');
 // The public portal exposes a direct disclosure option independent of the trial form.
 await portalClick(page,'Request Disclosure');await portalPath(page,'/request-disclosure','#isDriver0');
 if(!(await portalBody(page)).includes(packet.ticket_number))throw new Error('LIVE_TICKET_IDENTITY_MISMATCH');
 await portalChecked(page,'No, this is not my ticket, but I am an agent/lawyer acting on behalf of the defendant');await portalChecked(page,'Agent');
 await portalFill(page,'#firstName',packet.representative.first_name);await portalFill(page,'#surname',packet.representative.last_name);await portalFill(page,'#agency',packet.representative.business);
 await portalFill(page,'#notificationEmail',packet.representative.email);await portalChecked(page,'No email address');
 await page.evaluate(file=>{const input=document.querySelector<HTMLInputElement>('#disclosureUpload');if(!input)throw new Error('CONSENT_UPLOAD_CHANGED');const bytes=Uint8Array.from(atob(file.data),v=>v.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],file.name,{type:'application/pdf'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},packet.consent);
 await page.waitForFunction(name=>document.querySelector('main')?.textContent?.includes(name)&&!/Uploading Documents/i.test(document.body.innerText),{timeout:45000},packet.consent.name);await portalGuard(page);
 const form=await page.evaluate(()=>{
  const labels=Array.from(document.querySelectorAll<HTMLInputElement>('main input')).filter(e=>e.checked).flatMap(e=>Array.from(e.labels||[]).map(l=>l.textContent?.replace(/\s+/g,' ').trim()||''));
  const declarations=Array.from(document.querySelectorAll<HTMLInputElement>('main input[type=checkbox]')).filter(e=>e.getBoundingClientRect().width>0).flatMap(e=>Array.from(e.labels||[]).map(l=>l.textContent?.replace(/\s+/g,' ').trim()||''));
  return {representative_first_name:document.querySelector<HTMLInputElement>('#firstName')?.value||'',representative_last_name:document.querySelector<HTMLInputElement>('#surname')?.value||'',business:document.querySelector<HTMLInputElement>('#agency')?.value||'',representative_email:document.querySelector<HTMLInputElement>('#notificationEmail')?.value||'',defendant_no_email:labels.includes('No email address')&&document.querySelector<HTMLInputElement>('#defendantEmail')?.value==='',agent:labels.includes('Agent')&&labels.includes('No, this is not my ticket, but I am an agent/lawyer acting on behalf of the defendant'),comments:document.querySelector<HTMLTextAreaElement>('#disclosureNotes')?.value||'',declarations};
 });
 if(form.declarations.some(label=>label!=='No email address'))throw new Error('ADDITIONAL_DECLARATION_REQUIRES_APPROVAL');
 if(!form.agent||!form.defendant_no_email||form.representative_email!==packet.representative.email||form.business!==packet.representative.business||form.representative_first_name!==packet.representative.first_name||form.representative_last_name!==packet.representative.last_name||form.comments!=='')throw new Error('DISCLOSURE_FORM_CHANGED');
 if((await readSessionTerms(page)).sha256!==session.terms_sha256)throw new Error('GOVERNMENT_TERMS_CHANGED');
 await commit({ticket_number:packet.ticket_number,source_sha256:packet.source_sha256,consent_sha256:packet.consent_sha256,case_fingerprint:packet.case_fingerprint,lookup_kind:packet.verification.kind,lookup_fingerprint:packet.verification.fingerprint,lookup_record_id:packet.verification.record_id||null,session_record_id:session.id,browser_session_id:session.browser_session_id,terms_sha256:session.terms_sha256,representative_email:form.representative_email,agent:form.agent,defendant_no_email:form.defendant_no_email,consent_filename:packet.consent.name});
 await portalClick(page,'Submit Request');
 await portalPath(page,'/request-disclosure-confirmation');
 await page.waitForFunction(ticket=>document.querySelector('main')?.textContent?.includes(ticket)&&/received your disclosure request for/i.test(document.querySelector('main')?.textContent||''),{timeout:45000},packet.ticket_number);
 await complete(disclosureReceipt(page.url(),await portalBody(page),packet.ticket_number));
}
