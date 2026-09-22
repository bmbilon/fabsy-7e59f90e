import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = resolve(import.meta.dirname, '..');
const compiled = await build({ absWorkingDir: root, stdin: { sourcefile: 'universal-test.tsx', resolveDir: root, loader: 'tsx', contents: `
import React, { act } from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
import Checkout from './src/pages/ServiceCheckout'; let root; export { act };
export async function mount() { root=createRoot(document.getElementById('root')); await act(async()=>root.render(<MemoryRouter><Checkout /></MemoryRouter>)); }
export async function change(el,value) { await act(async()=>{ Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype,'value').set.call(el,value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input',{bubbles:true})); }); }
export async function click(el) { await act(async()=>el.click()); }
export async function unmount() { await act(async()=>root.unmount()); }
` }, bundle: true, write: false, platform: 'browser', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'offline', setup(b) {
  b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'backend', namespace: 'offline' }));
  b.onResolve({ filter: /hooks\/useSafeHead$/ }, () => ({ path: 'head', namespace: 'offline' }));
  b.onLoad({ filter: /.*/, namespace: 'offline' }, ({ path }) => ({ loader: 'js', contents: path === 'backend' ? 'export const supabase={functions:{invoke:(...args)=>window.__invoke(...args)}};' : 'export default function(){}' }));
} }] });

async function runtime(t, path='/checkout') {
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: `https://fabsy.invalid${path}`, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:new VirtualConsole() });
  const w=dom.window; const calls=[]; const channels=[]; let saved;
  const state={ failPayment: false, paymentGate: null };
  w.fetch=()=>{throw new Error('Real network forbidden')}; w.IS_REACT_ACT_ENVIRONMENT=true;
  w.Response=Response; w.Headers=Headers; w.Request=Request;
  w.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};
  w.MessageChannel=class extends MessageChannel {constructor(){super();channels.push(this)}};
  w.__invoke=async(name,{body})=>{
    assert.equal(name,'service-checkout'); calls.push(body);
    if(body.action==='prepare') {
      saved={id:body.orderId,name:body.name,email:body.email,product:body.product,mode:body.mode,productName:'Synthetic service',totalCents:8295,consentSaved:body.mode!=='payment',paymentStatus:'not_started',ticketUploaded:false};
      return {data:{order:saved}};
    }
    if(body.action==='checkout') {
      if(state.paymentGate) await state.paymentGate;
      return state.failPayment ? {error:new w.Error('Payment unavailable')} : {data:{order:{...saved,paymentStatus:'open'},url:'https://checkout.stripe.com/c/pay/cs_test_SYNTHETIC'}};
    }
    throw new Error('Unexpected action '+body.action);
  };
  w.module={exports:{}};w.exports=w.module.exports;w.eval(compiled.outputFiles[0].text);
  const api=w.module.exports;await api.mount();
  t.after(async()=>{await api.unmount();for(const c of channels){c.port1.close();c.port2.close()}w.close()});
  const byId=id=>w.document.getElementById(id);
  const pay=()=>[...w.document.querySelectorAll('button')].find(b=>/Continue to secure payment|Save my consent/.test(b.textContent));
  async function identity(){await api.change(byId('service-product'),'photo_radar');await api.change(byId('service-name'),'Alex Example');await api.change(byId('service-email'),'alex@example.test')}
  async function consent(){await api.click(byId('service-consent'))}
  return {w,api,calls,state,byId,pay,identity,consent};
}
test('public link requires no case token; unchecked consent blocks submission',async t=>{
  const r=await runtime(t);assert.equal(r.calls.length,0);assert.equal(r.pay().disabled,true);
  await r.api.change(r.byId('service-product'),'photo_radar');
  for(const id of ['service-consent','service-plea']) assert.equal(r.byId(id).getAttribute('data-state'),'unchecked');
  assert.equal(r.byId('service-ticket').required,false);assert.equal(r.byId('service-file').required,false);
});
test('consent-only saves without creating a payment; ticket is optional',async t=>{
  const r=await runtime(t,'/consent');await r.identity();await r.consent();await r.api.click(r.pay());
  assert.deepEqual(r.calls.map(c=>c.action),['prepare']);assert.equal(r.calls[0].mode,'consent');assert.equal(r.calls[0].ticketNumber,'');assert.equal(r.calls[0].pleadNotGuilty,false);
  assert.match(r.w.document.body.textContent,/Consent saved/);
});
test('payment-only shows no representation/plea acceptance and submits none',async t=>{
  const r=await runtime(t,'/payment');await r.identity();assert.equal(r.byId('service-consent'),null);assert.equal(r.byId('service-plea'),null);
  await r.api.click(r.byId('service-terms'));await r.api.click(r.pay());
  assert.deepEqual(r.calls.map(c=>c.action),['prepare','checkout']);assert.equal(r.calls[0].consentAccepted,false);assert.equal(r.calls[0].pleadNotGuilty,false);
});
test('failed payment retries the saved order without resubmitting consent or creating another order',async t=>{
  const r=await runtime(t);r.state.failPayment=true;await r.identity();await r.consent();await r.api.click(r.pay());
  assert.match(r.w.document.body.textContent,/Payment unavailable/);const id=r.calls[0].orderId;
  r.state.failPayment=false;await r.api.click(r.pay());assert.deepEqual(r.calls.map(c=>c.action),['prepare','checkout','checkout']);
  assert.ok(r.calls.every(c=>c.orderId===id));
});
test('all four services show the correct GST totals and switching resets consent',async t=>{
  const r=await runtime(t);await r.api.change(r.byId('service-product'),'photo_radar');await r.api.click(r.byId('service-consent'));
  for(const [service,total] of [['rapid_resolution','$207.90'],['insurance_report','$51.45'],['bundle','$240.45'],['photo_radar','$82.95']]){
    await r.api.change(r.byId('service-product'),service);assert.match(r.w.document.body.textContent,new RegExp(total.replace(/[.$]/g,'\\$&')));
    assert.equal(r.byId('service-consent').getAttribute('data-state'),'unchecked');assert.equal(r.byId('service-plea')===null,service==='insurance_report');
  }
});
