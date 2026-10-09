import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const output=await build({entryPoints:[new URL('./portal-lookup-ui.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'LookupUI',platform:'browser'});
const job={id:'synthetic-job',submission_id:'synthetic-case',ticket_number:'T12345678Z',action:'submit_initial_disclosure',status:'needs_review',result:{phase:'verification'},source_url:'https://traffictickets.alberta.ca/ticket-number-search?ticketNumber=T12345678Z'};
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(api){
 const dom=new JSDOM('<article></article>',{url:'https://fabsy.ca/admin/portal',runScripts:'dangerously'});dom.window.eval(output.outputFiles[0].text+';globalThis.LookupUI=LookupUI;');
 const card=dom.window.document.querySelector('article'),messages=[],copies=[];
 dom.window.document.execCommand=()=>{copies.push(dom.window.document.activeElement.value);return true;};
 dom.window.LookupUI.mountPortalLookup(card,job,api,value=>messages.push(value),async()=>{},true);
 return {dom,card,messages,copies};
}
test('opening a case loads only its lookup details and never copies, saves or accepts terms',async()=>{
 const calls=[],f=fixture(async(action,values)=>{calls.push({action,values});return {ticket_number:job.ticket_number,defendant:'DEFENDANT, FIXTURE',details:[{kind:'plate',value:'PLATE123',provenance:'source_ticket'}],can_edit:false};});
 try{await flush();assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{action:'lookup-details',values:{id:job.id}}]);assert.deepEqual(f.copies,[]);assert.match(f.card.textContent,/DEFENDANT, FIXTURE/);assert.equal(f.card.querySelector('a').href,job.source_url);f.card.querySelector('button').click();await flush();assert.deepEqual(f.copies,['PLATE123']);assert.equal(calls.length,1);}finally{f.dom.window.close();}
});
test('opening the separate portal copies the selected identifier and keeps it out of the URL',async()=>{
 const f=fixture(async()=>({ticket_number:job.ticket_number,defendant:'DEFENDANT, FIXTURE',details:[{kind:'drivers_license',value:'987654321',provenance:'staff_confirmation'}],can_edit:false}));
 try{await flush();const link=f.card.querySelector('a');let prevented;link.addEventListener('click',event=>{prevented=event.defaultPrevented;event.preventDefault();});link.click();assert.equal(prevented,false);assert.deepEqual(f.copies,['987654321']);assert.equal(link.href.includes('987654321'),false);}finally{f.dom.window.close();}
});
test('missing identifiers require an explicit verified value and save against the exact job',async()=>{
 const calls=[],f=fixture(async(action,values)=>{calls.push({action,values});return action==='lookup-save'?{saved:true,queued:true}:{ticket_number:job.ticket_number,defendant:'DEFENDANT, FIXTURE',details:[],can_edit:true};});
 try{await flush();const form=f.card.querySelector('form'),input=form.querySelector('input:not([type=checkbox])'),check=form.querySelector('input[type=checkbox]');input.value='abc-1234';form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));assert.equal(calls.length,1);check.checked=true;form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await flush();assert.deepEqual(JSON.parse(JSON.stringify(calls[1])),{action:'lookup-save',values:{id:job.id,kind:'plate',value:'ABC1234',verified:true}});assert.deepEqual(f.copies,[]);assert.equal(calls.some(call=>call.action==='session-accept'),false);}finally{f.dom.window.close();}
});
test('a mismatched or stale case response cannot expose or copy another ticket’s identifier',async()=>{
 const wrong=fixture(async()=>({ticket_number:'T99999999Z',details:[{kind:'plate',value:'OTHER123',provenance:'source_ticket'}],can_edit:false}));
 try{await flush();assert.equal(wrong.card.textContent.includes('OTHER123'),false);assert.equal(wrong.card.querySelector('a'),null);assert.deepEqual(wrong.copies,[]);}finally{wrong.dom.window.close();}
 let resolve;const stale=fixture(()=>new Promise(done=>resolve=done));await flush();stale.card.remove();resolve({ticket_number:job.ticket_number,details:[{kind:'plate',value:'STALE123',provenance:'source_ticket'}],can_edit:false});await flush();assert.equal(stale.card.textContent.includes('STALE123'),false);stale.dom.window.close();
});
test('a failed clipboard write holds navigation and leaves a selectable value',async()=>{
 const f=fixture(async()=>({ticket_number:job.ticket_number,defendant:'DEFENDANT, FIXTURE',details:[{kind:'plate',value:'PLATE123',provenance:'source_ticket'}],can_edit:false}));
 try{await flush();f.dom.window.document.execCommand=()=>false;Object.defineProperty(f.dom.window.navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Clipboard permission denied.');}}});const link=f.card.querySelector('a');const event=new f.dom.window.MouseEvent('click',{cancelable:true});link.dispatchEvent(event);await flush();assert.equal(event.defaultPrevented,true);assert.match(f.messages.at(-1),/Clipboard permission denied/);assert.equal(f.dom.window.document.activeElement.value,'PLATE123');}finally{f.dom.window.close();}
});
