import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const compiled=await build({entryPoints:[new URL('./phone.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'test-auth',setup(b){
 b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'auth',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export function createClient(){ const channel={on(){return this},subscribe(){return this}};return {auth:{getSession:async()=>({data:{session:{access_token:'fixture-only',user:{id:'staff'}}}})},channel:()=>channel,removeChannel:async()=>{}};}`,loader:'js'}));
}}]});
const html=await readFile(new URL('./phone.html',import.meta.url),'utf8');
const id='11111111-2222-4333-8444-555555555555';
async function fixture(statusOverrides={},draftRows,adsResult){
 const dom=new JSDOM(html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,''),{url:'https://fabsy.ca/admin/portal?draft='+id,runScripts:'dangerously'});
 const win=dom.window,scrollTargets=[];win.HTMLElement.prototype.scrollIntoView=function(){scrollTargets.push({id:this.id,workspaceHidden:win.document.getElementById('workspace').hidden});};let tick;win.setInterval=callback=>{tick=callback;return 1;};Object.defineProperty(win.document,'hidden',{value:false});
 const calls=[];
 const draft={id,status:'pending_approval',payload_hash:'reviewed-fingerprint',ticket_number:'T12345678Z',payload:{from:'hello@fabsy.ca',to:['fixture@example.test'],subject:'Ticket T12345678Z — Fixture',html:'<p>Fixture body</p><script>window.untrustedScriptRan=true</script>'}};
 win.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);calls.push(body);
  if(body.action==='approve-email'){draft.status='sent';draft.provider_email_id='fake-provider-id';draft.sent_at='2026-09-26T13:00:00Z';}
  if(body.action==='reject-email')draft.status='rejected';
  const result=body.action==='status'?{emailApprover:true,state:{enabled:true},jobs:[],mail:{drafts_enabled:true},offers:[],notices:[],crown:{},payments:[],...statusOverrides}:
   body.action==='ads-status'?(adsResult||{state:{paused:true},batches:[],runs:[],reports:[]}):
   body.action==='email-drafts'?{drafts:draftRows||[structuredClone(draft)],devices:0}:{draft:structuredClone(draft)};
  return {ok:true,json:async()=>result};
 };
 win.eval(compiled.outputFiles[0].text);
 for(let i=0;i<20&&!win.document.querySelector('.email-review');i++)await new Promise(r=>setImmediate(r));
 if(!win.document.querySelector('.email-review')){const reason=win.document.getElementById('message').textContent+' '+JSON.stringify(calls);dom.window.close();assert.fail(reason);}
 return {dom,win,calls,draft,scrollTargets,tick:()=>tick()};
}
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
test('notification deep link opens full frozen draft without authorizing a send',async()=>{
 const {dom,win,calls,scrollTargets}=await fixture();try{
  assert.deepEqual(calls.map(c=>c.action),['status','ads-status','email-drafts','email-draft']);
  assert.equal(win.document.querySelector('#email-templates').hidden,false);
  assert.equal(win.document.querySelector('#email-templates button').textContent,'Review email templates');
  assert.equal(calls.some(c=>c.action.includes('email-template')),false);
  assert.match(win.document.querySelector('.email-review').textContent,/fixture@example.test/);
  assert.ok(scrollTargets.some(target=>target.id==='email-draft-detail'&&!target.workspaceHidden),'Focus the deep-linked draft after the workspace becomes visible');
  const frame=win.document.querySelector('.email-preview');
  assert.equal(frame.getAttribute('sandbox'),'');assert.match(frame.srcdoc,/default-src 'none'/);
  assert.equal(win.untrustedScriptRan,undefined);
  assert.match(win.document.querySelector('#email-device-status').textContent,/No device is enrolled/);
 }finally{dom.window.close();}
});
test('explicit approval sends the displayed hash once and shows its saved receipt',async()=>{
 const {dom,win,calls}=await fixture();try{
  const button=[...win.document.querySelectorAll('button')].find(b=>b.textContent==='Approved to send');
  button.click();button.click();await settle();
  const approvals=calls.filter(c=>c.action==='approve-email');
  assert.equal(approvals.length,1);assert.deepEqual(approvals[0],{action:'approve-email',id,hash:'reviewed-fingerprint'});
  assert.match(win.document.querySelector('.email-review').textContent,/fake-provider-id/);
  assert.equal([...win.document.querySelectorAll('button')].some(b=>b.textContent==='Approved to send'),false);
 }finally{dom.window.close();}
});
test('rejecting a draft never calls approval',async()=>{
 const {dom,win,calls}=await fixture();try{
  [...win.document.querySelectorAll('button')].find(b=>b.textContent==='Do not send').click();await settle();
  assert.equal(calls.some(c=>c.action==='approve-email'),false);assert.equal(calls.filter(c=>c.action==='reject-email').length,1);
  assert.match(win.document.querySelector('.email-review').textContent,/rejected/);
 }finally{dom.window.close();}
});
test('ticket queue shows one case and navigates to its filing while retaining related tasks',async()=>{
 const {dom,win,calls}=await fixture({jobs:[{id:'retrieval',ticket_number:'B21052916C',status:'needs_review',action:'inspect_disclosure',result:{disclosure_package_id:'review'}},{id:'filing',ticket_number:'b210-52916c',status:'queued',action:'submit_review_request',result:{}}],disclosureReviews:[{id:'review',job_id:'retrieval',ticket_number:'B21052916C',status:'approved',manifest:[],review_submission_job_id:'filing'}]},[]);
 try{
  assert.equal(win.document.getElementById('pending').textContent,'1');assert.equal(win.document.getElementById('attention').textContent,'0');assert.equal(win.document.getElementById('done').textContent,'0');
  win.document.getElementById('tile-pending').click();await settle();
  assert.equal(win.document.querySelectorAll('#queue-items .queue-case').length,1);
  assert.equal(win.document.querySelectorAll('#queue-items strong').length,1);
  assert.match(win.document.querySelector('#queue-items strong').textContent,/B21052916C/);
  assert.equal(win.location.search,'?job=filing');
  const related=win.document.querySelector('#queue-items details');assert.equal(related.querySelectorAll('button').length,3);
  [...related.querySelectorAll('button')].find(b=>b.textContent.startsWith('Review request approved')).click();await settle();
  assert.equal(win.location.search,'?disclosure=review');assert.equal(calls.some(c=>['approve-email','approve-disclosure-review','run'].includes(c.action)),false);
 }finally{dom.window.close();}
});
test('an incompatible ad batch cannot hide portal verification or email review',async()=>{
 const {dom,win,calls}=await fixture({jobs:[{id:'offer',ticket_number:'B21052916C',status:'needs_review',action:'inspect_offer',result:{}}]},[],{state:{paused:true},batches:[{status:'pending',payload:{config:{campaigns:{}},holds:[]}}],reports:[]});
 try{
  assert.match(win.document.getElementById('ads-launch').textContent,/This saved batch is incomplete/);
  assert.equal(win.document.getElementById('attention').textContent,'1');
  assert.ok([...win.document.querySelectorAll('#jobs button')].some(b=>b.textContent==='Start cloud verification'));
  assert.ok(calls.some(c=>c.action==='email-drafts'));
  assert.equal(calls.some(c=>['ads-approve','approve-email','handoff','run'].includes(c.action)),false);
 }finally{dom.window.close();}
});

test('background updates retain open reviews, form values and DOM nodes',async()=>{
 const status={jobs:[]};const f=await fixture(status,[],{state:{paused:false},batches:[{id:'pending',status:'pending',payload_hash:'frozen',payload:{config:{campaigns:{'G-Search-Officer':{dailyBudgetCad:20}}},holds:['DESTINATION_AND_DIAGNOSTICS_VERIFICATION_REQUIRED']}}],reports:[]});
 try{
  const root=f.win.document.getElementById('ads-launch'),details=root.querySelector('details'),input=root.querySelector('textarea'),review=f.win.document.querySelector('.email-review');
  details.open=true;input.value='Work in progress';input.focus();
  status.jobs=[{id:'new-job',ticket_number:'T12345678Z',status:'queued',action:'inspect_offer',result:{}}];
  f.tick();await settle();
  assert.equal(f.win.document.getElementById('updates').hidden,false);
  assert.equal(root.querySelector('details'),details);assert.equal(details.open,true);
  assert.equal(root.querySelector('textarea'),input);assert.equal(input.value,'Work in progress');assert.equal(f.win.document.activeElement,input);
  assert.equal(f.win.document.querySelector('.email-review'),review);
  assert.equal(f.calls.some(c=>['ads-approve','ads-reject','ads-pause','run'].includes(c.action)),false);
 }finally{f.dom.window.close();}
});
