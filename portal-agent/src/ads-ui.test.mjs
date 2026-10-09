import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const compiled=await build({entryPoints:[new URL('./ads-ui.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'Ads'});
function fixture(){
 const dom=new JSDOM('<section id="ads"></section>',{url:'https://fabsy.ca/admin/portal?ads=officer',runScripts:'dangerously'});
 const w=dom.window,calls=[];let scrolls=0;w.HTMLElement.prototype.scrollIntoView=()=>scrolls++;
 w.eval(compiled.outputFiles[0].text+'\nwindow.Ads=Ads;');
 return {dom,w,calls,root:w.document.getElementById('ads'),scrolls:()=>scrolls,render:data=>w.Ads.renderAds(w.document.getElementById('ads'),async action=>{calls.push(action);return data;},()=>{})};
}
const officer={id:'officer',status:'approved',payload_hash:'frozen',payload:{config:{currency:'CAD',timezone:'America/Edmonton',campaigns:{'G-Search-Officer':{dailyBudgetCad:20}},learningSpendLimitCad:300,startDate:'2026-10-01'},holds:[]}};
const data=batches=>({state:{paused:false},batches,reports:[]});
test('the live Officer-only launch renders without inventing a Camera budget',async()=>{
 const f=fixture();try{await f.render(data([officer]));assert.match(f.root.textContent,/G-Search-Officer: \$20\/day/);assert.doesNotMatch(f.root.textContent,/G-Search-Camera|unavailable|undefined/);assert.equal(f.scrolls(),0);assert.deepEqual(f.calls,['ads-status']);}finally{f.dom.window.close();}
});
test('measurement-only and malformed historical batches do not hide later campaigns',async()=>{
 const f=fixture();try{
  await f.render(data([{id:'bad',status:'pending',payload:{}},{id:'measurement',status:'pending',payload:{kind:'measurement_setup',config:{},holds:[]}},officer]));
  assert.equal(f.root.querySelectorAll('article').length,3);
  assert.match(f.root.textContent,/Approve conversion setup/);assert.match(f.root.textContent,/G-Search-Officer: \$20/);
  assert.equal(f.root.querySelector('#ads-bad button'),null);assert.doesNotMatch(f.root.textContent,/undefined/);
 }finally{f.dom.window.close();}
});
test('a slow campaign request keeps the existing open review mounted until it completes',async()=>{
 const f=fixture();try{
  await f.render(data([officer]));const details=f.root.querySelector('details');details.open=true;
  let finish;const pending=f.w.Ads.renderAds(f.root,()=>new Promise(resolve=>{finish=resolve;}),()=>{});
  assert.equal(f.root.querySelector('details'),details);assert.equal(details.open,true);
  finish(data([officer]));await pending;assert.equal(f.scrolls(),0);
 }finally{f.dom.window.close();}
});
