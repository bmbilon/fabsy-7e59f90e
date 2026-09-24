import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync('public/reminder-preferences.html','utf8');
const script=readFileSync('public/reminder-preferences.js','utf8');
function page(fragment='',fetcher=async()=>({ok:true,json:async()=>({unsubscribed:true})})){
 const dom=new JSDOM(html,{url:'https://fabsy.ca/reminder-preferences.html'+fragment,runScripts:'outside-only'});
 const calls=[];dom.window.fetch=(...args)=>{calls.push(args);return fetcher(...args);};dom.window.eval(script);
 return {dom,calls,button:dom.window.document.getElementById('stop-reminders'),result:dom.window.document.getElementById('result'),submit:()=>dom.window.document.getElementById('preferences-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))};
}
const token='#id=00000000-0000-4000-8000-000000000001&signature='+'a'.repeat(64);
test('opening a valid link performs no mutation and removes the capability from the address bar',()=>{const p=page(token);assert.equal(p.calls.length,0);assert.equal(p.button.disabled,false);assert.equal(p.dom.window.location.hash,'');p.dom.window.close();});
test('missing or malformed links cannot submit',()=>{const p=page('#id=bad&signature=bad');assert.equal(p.button.disabled,true);assert.match(p.result.textContent,/Open the reminder/);assert.equal(p.calls.length,0);p.dom.window.close();});
test('confirmation posts exactly once, then reports successful suppression',async()=>{const p=page(token);p.submit();p.submit();await new Promise(r=>setImmediate(r));assert.equal(p.calls.length,1);assert.equal(p.calls[0][1].method,'POST');assert.match(p.calls[0][0],/action=unsubscribe/);assert.match(p.result.textContent,/have been stopped/);assert.equal(p.button.disabled,true);p.dom.window.close();});
test('provider failure leaves a retry button and never claims success',async()=>{const p=page(token,async()=>({ok:false,json:async()=>({error:'please_retry'})}));p.submit();await new Promise(r=>setImmediate(r));assert.equal(p.button.disabled,false);assert.match(p.result.textContent,/couldn’t save/);p.dom.window.close();});
