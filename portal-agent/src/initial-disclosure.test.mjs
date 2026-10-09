import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {verifyInitialIdentity,disclosureReceipt} from './initial-disclosure-policy.mjs';
const built=await build({entryPoints:[new URL('./initial-disclosure.ts',import.meta.url).pathname],bundle:true,keepNames:true,write:false,format:'esm',platform:'node'});
const {executeInitialDisclosure}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const terms=JSON.parse(readFileSync(new URL('../../docs/alberta-portal-terms-2025-03-13.json',import.meta.url)));
const packet={ticket_number:'T12345678Z',defendant:'FIXTURE DEFENDANT',fine_amount:373,verification:{kind:'plate',value:'FIXTUREPLATE',fingerprint:'lookup-proof'},source_sha256:'source',consent_sha256:'consent',case_fingerprint:'snapshot',consent:{name:'Signed consent - T12345678Z.pdf',data:Buffer.from('%PDF-test').toString('base64')},representative:{first_name:'Brett',last_name:'Bilon',business:'Fabsy Traffic Ticket Services',email:'hello@fabsy.ca'}};
const session={id:'record',browser_session_id:'browser',terms_sha256:terms.sha256};
const radio=(label,name,id='')=>`<label><input type=radio name="${name}" id="${id}">${label}</label>`;
const check=label=>`<label><input type=checkbox>${label}</label>`;
class Page{
 constructor(options={},stage='/ticket-number-search',owner){this.options=options;this.owner=owner||this;this.clicks=[];this.snapshots=[];this.termReads=0;this.load(stage);}
 load(stage){
  this.stage=stage;this.dom?.window.close();
  const identity=`Ticket T12345678Z Name / Registered Owner ${this.options.wrongCase?'ANOTHER PERSON':'FIXTURE DEFENDANT'} Penalty $${this.options.wrongFine?'372.00':'373.00'}`;
  const form=`Ticket Number: T12345678Z ${radio('Yes, this is my ticket','driver','isDriver0')}${radio('No, this is not my ticket, but I am an agent/lawyer acting on behalf of the defendant','driver','isDriver1')}${radio('Agent','requester')}${radio('Lawyer','requester')}<input id=firstName><input id=surname><input id=agency><input id=notificationEmail>${check('No email address')}<input id=defendantEmail><textarea id=disclosureNotes></textarea><input id=disclosureUpload type=file>${this.options.newDeclaration?check('I accept a plea'):''}<a>Back</a><button> Submit Request </button>`;
  const findLabel=this.options.wrongFindLabel?'Find another ticket':'Find ticket';
  const findControl=this.options.submitInput?`<input type=submit value="${findLabel}" ${this.options.disabledFind?'disabled':''}>`:`<button ${this.options.disabledFind?'disabled':''}>${findLabel}</button>`;
  const html=stage==='/terms-of-use'?`<pre>${terms.text}${this.options.changedTerms||this.owner.options.termsChangedAtCommit&&this.owner.termReads>=3?' Changed terms':''}</pre>`:stage==='/ticket-number-search'?`<input id=ticketNumber><input type=email>${check('I agree to the Terms and Conditions.')}<button>Next</button>`:stage==='/search-verification'?`Ticket T12345678Z ${radio('Licence plate','verificationMethod')}${radio("Driver's licence number",'verificationMethod')}${radio('Date of birth','verificationMethod')}<input id=licencePlate><input id=driversLicence><input id=dateOfBirth>${findControl}${this.options.duplicateFind?findControl:''}`:stage==='/ticket-information'?identity+'<button>Next</button>':stage==='/ticket-penalty-and-options'?identity+(this.options.existing?'Disclosure requested on October 1, 2026':'')+'<button>Request Disclosure</button>':stage==='/request-disclosure'?form:`We have received your disclosure request for ${this.options.wrongReceipt?'T99999999Z':'T12345678Z'}`;
  this.dom=new JSDOM('<main>'+html+'</main>',{url:'https://traffictickets.alberta.ca'+stage,runScripts:'dangerously'});
  const w=this.dom.window;Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});w.Element.prototype.getBoundingClientRect=()=>({width:100,height:60});
  w.DataTransfer=class{constructor(){this.files=[];this.items={add:file=>this.files.push(file)};}};
  const upload=w.document.querySelector('#disclosureUpload');if(upload){Object.defineProperty(upload,'files',{value:[],writable:true});upload.addEventListener('change',()=>{const item=w.document.createElement('p');item.textContent=upload.files[0].name;w.document.querySelector('main').append(item);});}
  for(const element of w.document.querySelectorAll('button,a,input[type=submit]'))element.addEventListener('click',()=>{
   const label=(element.textContent||element.value).trim();this.clicks.push(label);
   if(label==='Submit Request'){
    this.snapshots.push({first:w.document.querySelector('#firstName').value,last:w.document.querySelector('#surname').value,email:w.document.querySelector('#notificationEmail').value,defendantEmail:w.document.querySelector('#defendantEmail').value,comments:w.document.querySelector('#disclosureNotes').value,file:upload.files[0].name});
    if(!this.options.interrupted)this.load('/request-disclosure-confirmation');
   }else {if(label==='Find ticket')this.lookup={label:w.document.querySelector('input[type=radio]:checked')?.parentElement.textContent,value:[...w.document.querySelectorAll('#licencePlate,#driversLicence,#dateOfBirth')].find(input=>input.value)?.value};this.load({'Next':stage==='/ticket-number-search'?'/search-verification':'/ticket-penalty-and-options','Find ticket':'/ticket-information','Request Disclosure':'/request-disclosure','Back':'/ticket-penalty-and-options'}[label]);}
  });
 }
 url(){return 'https://traffictickets.alberta.ca'+this.stage;}
 async evaluate(fn,arg){this.dom.window.__arg=arg;return this.dom.window.eval('('+fn.toString()+')(__arg)');}
 async waitForFunction(fn,_opts,arg){if(!await this.evaluate(fn,arg))throw new Error('WAIT_FAILED');}
 async waitForSelector(selector){if(!this.dom.window.document.querySelector(selector))throw new Error('WAIT_FAILED');}
 async $(selector){const element=this.dom.window.document.querySelector(selector);return element?{click:async()=>{element.value='';},type:async value=>{element.value=value;},press:async()=>{element.dispatchEvent(new this.dom.window.Event('change',{bubbles:true}));}}:null;}
 browser(){return {newPage:async()=>{this.termReads++;return new Page(this.options,'/terms-of-use',this);}};}
 async goto(){return {status:()=>200};}async close(){this.dom.window.close();}
}
test('direct disclosure files once after commit, uploads signed consent and never enters defendant email',async()=>{
 const page=new Page(),calls=[];
 try{await executeInitialDisclosure(page,packet,session,async form=>{assert.equal(page.clicks.includes('Submit Request'),false);calls.push(['commit',form]);},async receipt=>calls.push(['receipt',receipt]));
  assert.deepEqual(calls.map(row=>row[0]),['commit','receipt']);assert.equal(page.clicks.filter(label=>label==='Submit Request').length,1);
  assert.deepEqual(page.snapshots,[{first:'Brett',last:'Bilon',email:'hello@fabsy.ca',defendantEmail:'',comments:'',file:packet.consent.name}]);
  assert.equal(calls[0][1].session_record_id,session.id);assert.equal(calls[1][1].ticket_number,packet.ticket_number);assert.equal(page.termReads,2);
 }finally{await page.close();}
});
test('the government input submit control works for a new or resumed verification page',async()=>{
 for(const stage of ['/ticket-number-search','/search-verification']){
  const page=new Page({submitInput:true},stage),calls=[];
  try{await executeInitialDisclosure(page,packet,session,async form=>{assert.equal(page.clicks.includes('Submit Request'),false);calls.push(['commit',form]);},async receipt=>calls.push(['receipt',receipt]));
   assert.deepEqual(calls.map(row=>row[0]),['commit','receipt']);assert.equal(calls[1][1].ticket_number,packet.ticket_number);
   assert.equal(page.clicks.filter(label=>label==='Find ticket').length,1);assert.equal(page.clicks.filter(label=>label==='Submit Request').length,1);
   assert.deepEqual(page.lookup,{label:'Licence plate',value:packet.verification.value});
  }finally{await page.close();}
 }
});
test('a disabled, duplicated or mismatched verification submit control holds before committing',async()=>{
 for(const options of [{disabledFind:true},{duplicateFind:true},{wrongFindLabel:true}]){
  const page=new Page({submitInput:true,...options});let commits=0,receipts=0;
  try{await assert.rejects(executeInitialDisclosure(page,packet,session,async()=>commits++,async()=>receipts++));assert.equal(commits,0);assert.equal(receipts,0);assert.equal(page.clicks.includes('Find ticket'),false);assert.equal(page.clicks.includes('Submit Request'),false);}finally{await page.close();}
 }
});
test('identity, fine, duplicate disclosure, terms and extra declarations hold before committing',async()=>{
 for(const options of [{wrongCase:true},{wrongFine:true},{existing:true},{changedTerms:true},{newDeclaration:true}]){
  const page=new Page(options);let commits=0;try{await assert.rejects(executeInitialDisclosure(page,packet,session,async()=>commits++,async()=>{}));assert.equal(commits,0);assert.equal(page.clicks.includes('Submit Request'),false);}finally{await page.close();}
 }
});
test('lost final response does not retry and cannot manufacture a receipt',async()=>{
 for(const options of [{interrupted:true},{wrongReceipt:true}]){const page=new Page(options);let commits=0,receipts=0;
  try{await assert.rejects(executeInitialDisclosure(page,packet,session,async()=>commits++,async()=>receipts++));assert.equal(commits,1);assert.equal(receipts,0);assert.equal(page.clicks.filter(label=>label==='Submit Request').length,1);}finally{await page.close();}
 }
});
test('resumed disclosure form re-verifies the actual defendant',async()=>{const page=new Page({wrongCase:true},'/request-disclosure');let commits=0;try{await assert.rejects(executeInitialDisclosure(page,packet,session,async()=>commits++,async()=>{}),/LIVE_TICKET_IDENTITY_MISMATCH/);assert.equal(page.clicks[0],'Back');assert.equal(commits,0);}finally{await page.close();}});
test('final commit refusal prevents the final click',async()=>{const page=new Page();try{await assert.rejects(executeInitialDisclosure(page,packet,session,async()=>{throw new Error('CASE_CHANGED');},async()=>{}),/CASE_CHANGED/);assert.equal(page.clicks.includes('Submit Request'),false);}finally{await page.close();}});
test('an arbitrary dollar amount does not verify the current fine',()=>{assert.throws(()=>verifyInitialIdentity('Ticket T12345678Z Name / Registered Owner FIXTURE DEFENDANT Penalty $372.00. Service $373.00',packet,true),/LIVE_FINE_CHANGED/);});
test('plate, DL and DOB fill their exact portal controls and freeze the identifier proof before submission',async()=>{
 for(const [kind,label,value] of [['plate','Licence plate','FIXTUREPLATE'],['drivers_license',"Driver's licence number",'123456789'],['date_of_birth','Date of birth','1990-02-28']]){
  const page=new Page();try{let committed;await executeInitialDisclosure(page,{...packet,verification:{kind,value,fingerprint:'proof',record_id:'lookup-record'}},session,async form=>{committed=form;},async()=>{});assert.deepEqual(page.lookup,{label,value});assert.equal(committed.lookup_kind,kind);assert.equal(committed.lookup_fingerprint,'proof');assert.equal(committed.lookup_record_id,'lookup-record');assert.equal(JSON.stringify(committed).includes(value),false);}finally{await page.close();}
 }
});
test('the verified surname-first display is retained while the portal may show given names first',()=>{assert.doesNotThrow(()=>verifyInitialIdentity('Ticket T12345678Z Name / Registered Owner FIXTURE DEFENDANT Penalty $373.00',{...packet,defendant:'DEFENDANT, FIXTURE',defendant_variants:['FIXTURE DEFENDANT','DEFENDANT, FIXTURE']},true));});
test('a ticket in navigation cannot substitute for a different ticket’s success sentence',()=>{
 const url='https://traffictickets.alberta.ca/request-disclosure-confirmation';
 assert.throws(()=>disclosureReceipt(url,'Ticket T12345678Z. We have received your disclosure request for ticket T99999999Z',packet.ticket_number),/DISCLOSURE_RECEIPT_NOT_CONFIRMED/);
 assert.equal(disclosureReceipt(url,'We have received your disclosure request for ticket\u00a0T12345678Z',packet.ticket_number).ticket_number,packet.ticket_number);
});
test('receipt requires the official confirmation route and exact ticket',()=>{for(const [url,text] of [['https://example.test/request-disclosure-confirmation','We have received your disclosure request for T12345678Z'],['https://traffictickets.alberta.ca/request-disclosure','We have received your disclosure request for T12345678Z'],['https://traffictickets.alberta.ca/request-disclosure-confirmation','We have received your disclosure request for T99999999Z']])assert.throws(()=>disclosureReceipt(url,text,packet.ticket_number),/DISCLOSURE_RECEIPT_NOT_CONFIRMED/);});
