import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const compiled=await build({entryPoints:[new URL('./email-templates-ui.ts',import.meta.url).pathname],bundle:true,format:'iife',globalName:'Templates',write:false});
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
function fixture(){
 const dom=new JSDOM('<div id="templates"></div>',{runScripts:'dangerously'}),win=dom.window;
 win.eval(compiled.outputFiles[0].text+';window.Templates=Templates;');
 const template={id:'fixture',title:'Disclosure confirmed',version:1,status:'draft',content_hash:'exact-version-hash',content:{subject:'Ticket {{ticket_number}} — Confirmed',text:'Fixture {{ticket_number}}',html:'<p>Fixture {{ticket_number}}</p><script>parent.injection=true</script>'},slots:{ticket_number:'Verified source ticket'}};
 const calls=[];let refreshes=0;
 win.Templates.mountEmailTemplates(win.document.getElementById('templates'),async(action,input)=>{calls.push({action,...input});if(action==='approve-email-template')template.status='approved';if(action==='revoke-email-template')template.status='revoked';return {templates:[template]};},async()=>{refreshes++;},()=>{});
 return {dom,win,calls,get refreshes(){return refreshes;}};
}
test('opening template review shows exact copy/slots without approval or active HTML',async()=>{
 const {dom,win,calls}=fixture();try{
  win.document.querySelector('button').click();await settle();
  assert.deepEqual(calls,[{action:'email-templates'}]);assert.match(win.document.body.textContent,/Verified source ticket/);
  const frame=win.document.querySelector('iframe');assert.equal(frame.getAttribute('sandbox'),'');assert.match(frame.srcdoc,/default-src 'none'/);assert.equal(win.injection,undefined);
 }finally{dom.window.close();}
});
test('one explicit approval carries the exact version hash; revocation disables future use',async()=>{
 const f=fixture();try{
  f.win.document.querySelector('button').click();await settle();
  const approve=[...f.win.document.querySelectorAll('button')].find(b=>b.textContent==='Approve template version');approve.click();approve.click();await settle();
  assert.deepEqual(f.calls.filter(c=>c.action==='approve-email-template'),[{action:'approve-email-template',id:'fixture',hash:'exact-version-hash'}]);
  assert.match(f.win.document.body.textContent,/Approved for automatic sends/);
  [...f.win.document.querySelectorAll('button')].find(b=>b.textContent==='Stop using this version').click();await settle();
  assert.match(f.win.document.body.textContent,/Revoked/);assert.equal(f.calls.some(c=>c.action==='approve-email'),false);assert.equal(f.refreshes,2);
 }finally{f.dom.window.close();}
});
