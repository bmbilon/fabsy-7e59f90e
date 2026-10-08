import {PDFDocument} from 'https://esm.sh/pdf-lib@1.17.1';
import {embeddedConsent,validateConsentRecord,validateInitialFacts} from './initial-disclosure-material.ts';
import {parsePhotoUploadConsent} from './intake-consent.ts';
const assert=(ok:boolean)=>{if(!ok)throw new Error('Assertion failed');};
const rejects=(run:()=>unknown,code:string)=>{try{run();}catch(error){assert(error instanceof Error&&error.message===code);return;}throw new Error('Expected '+code);};
function fixture(){
 const ticket={id:'synthetic-case',ticket_number:'T12345678Z',first_name:'FIXTURE',last_name:'DEFENDANT',fine_amount:373,ticket_document_path:'source/synthetic.jpg',intake_consent:parsePhotoUploadConsent({version:'photo-upload-consent-v3',accepted:true,method:'checkbox',pleadNotGuilty:true},'synthetic-case','source/synthetic.jpg',new Date('2026-10-08T12:00:00Z'))};
 const record={schemaVersion:'fabsy-consent-original-fields-v1',fields:{submissionId:ticket.id,firstName:'',lastName:'',ticketNumber:'',intakeConsent:structuredClone(ticket.intake_consent)}};
 return {ticket,record};
}
Deno.test('photo consent is bound to the original upload and preserves unknown signer name',()=>{const {ticket,record}=fixture();const verified=validateConsentRecord(record,ticket);assert(verified.signer_name===null);assert(verified.basis==='signed_named_person_declaration_bound_to_original_upload');});
Deno.test('changed client instruction, source and signed event cannot authorize filing',()=>{
 for(const patch of [{pleadNotGuilty:false},{ticketDocumentPath:'different/source.jpg'},{pleaInstruction:'I want to pay this ticket.'}]){const {ticket,record}=fixture();Object.assign(record.fields.intakeConsent,patch);Object.assign(ticket.intake_consent,patch);rejects(()=>validateConsentRecord(record,ticket),'CLIENT_INSTRUCTION_REQUIRED');}
 const {ticket,record}=fixture();record.fields.intakeConsent.acceptedAt='2026-10-08T13:00:00Z';rejects(()=>validateConsentRecord(record,ticket),'SIGNED_CONSENT_EVENT_MISMATCH');
});
Deno.test('different ticket, defendant and organization hold for evidence',()=>{
 const {ticket,record}=fixture();record.fields.ticketNumber='T99999999Z';rejects(()=>validateConsentRecord(record,ticket),'CONSENT_TICKET_MISMATCH');
 record.fields.ticketNumber='';record.fields.firstName='Another';rejects(()=>validateConsentRecord(record,ticket),'CONSENT_DEFENDANT_MISMATCH');
 record.fields.firstName='';ticket.last_name='COMPANY INC';rejects(()=>validateConsentRecord(record,ticket),'ORGANIZATIONAL_SIGNER_AUTHORITY_REQUIRED');
});
Deno.test('signed PDF attachment is read from saved bytes and missing attachment holds',async()=>{
 const {ticket,record}=fixture();const pdf=await PDFDocument.create();pdf.addPage();await pdf.attach(new TextEncoder().encode(JSON.stringify(record)),'consent-original-fields.json',{mimeType:'application/json'});
 const saved=await pdf.save();assert(validateConsentRecord(await embeddedConsent(saved),ticket).signer_name===null);
 const empty=await PDFDocument.create();empty.addPage();let held=false;try{await embeddedConsent(await empty.save());}catch(error){held=error instanceof Error&&error.message==='SIGNED_CONSENT_REQUIRES_VERIFICATION';}assert(held);
});
Deno.test('source extraction must independently match every page, legal defendant and fine',()=>{
 const {ticket}=fixture();const facts={all_pages_read:true,page_count:1,ticket_number:'T12345678Z',defendant:'FIXTURE DEFENDANT',fine_amount:'373.00',plate:'TEST-PLATE',plate_quote:'Licence plate TEST-PLATE',defendant_is_organization:false,ticket_quote:'T12345678Z',defendant_quote:'FIXTURE DEFENDANT',fine_quote:'373.00'};
 assert(validateInitialFacts(facts,ticket,1)[0].value==='TESTPLATE');
 for(const patch of [{all_pages_read:false},{page_count:2},{ticket_number:'T99999999Z'},{defendant:'ANOTHER PERSON'},{fine_amount:'372.00'}])rejects(()=>validateInitialFacts({...facts,...patch},ticket,1),'SOURCE_TICKET_FACTS_MISMATCH');
 rejects(()=>validateInitialFacts({...facts,defendant_is_organization:true},ticket,1),'ORGANIZATIONAL_SIGNER_AUTHORITY_REQUIRED');
 assert(validateInitialFacts({...facts,defendant:'DEFENDANT, FIXTURE',defendant_quote:'DEFENDANT, FIXTURE',fine_amount:'$373.00 CAD'},ticket,1).length===1);
 rejects(()=>validateInitialFacts({...facts,defendant:'DEFENDANT FIXTURE'},ticket,1),'SOURCE_TICKET_FACTS_MISMATCH');
 rejects(()=>validateInitialFacts({...facts,defendant:'OTHER, FIXTURE'},ticket,1),'SOURCE_TICKET_FACTS_MISMATCH');
 assert(validateInitialFacts({...facts,plate:'',plate_quote:''},ticket,1).length===0);
 rejects(()=>validateInitialFacts({...facts,plate_quote:'Officer number 12345'},ticket,1),'VERIFICATION_SOURCE_QUOTE_REQUIRED');
});
Deno.test('distinct Unicode defendants cannot collapse to the same identity',()=>{
 const {ticket}=fixture();ticket.first_name='小明';ticket.last_name='王';
 const facts={all_pages_read:true,page_count:1,ticket_number:ticket.ticket_number,defendant:'王, 小明',fine_amount:'373.00',plate:'',plate_quote:'',defendant_is_organization:false,ticket_quote:ticket.ticket_number,defendant_quote:'王, 小明',fine_quote:'373.00'};
 assert(validateInitialFacts(facts,ticket,1).length===0);
 rejects(()=>validateInitialFacts({...facts,defendant:'李, 小明'},ticket,1),'SOURCE_TICKET_FACTS_MISMATCH');
});
