import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
const html=await readFile(new URL('./phone.html',import.meta.url),'utf8');
const built=await build({entryPoints:[new URL('./mobile-app.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'Mobile'});
function fixture({ios=false,installed=false,device=false,denied=false,configError=false,enrollError=false}={}){
 const dom=new JSDOM(html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,''),{url:'https://fabsy.ca/admin/portal',runScripts:'dangerously'});
 const w=dom.window,calls=[],badges=[],messages=[];
 Object.defineProperty(w.navigator,'userAgent',{value:ios?'iPhone':'Android'});
 w.matchMedia=()=>({matches:installed});
 w.navigator.setAppBadge=async value=>badges.push(value);
 w.navigator.clearAppBadge=async()=>badges.push(0);
 let permissionCalls=0;
 w.Notification={permission:denied?'denied':'default',requestPermission:async()=>{permissionCalls++;return 'granted';}};
 w.PushManager=function(){};
 const subscription={toJSON:()=>({endpoint:'fixture',keys:{}}),unsubscribe:async()=>{calls.push('unsubscribe');}};
 let inTap=false,subscribeCalls=0;
 const registration={active:true,pushManager:{getSubscription:async()=>device?subscription:null,subscribe:()=>{assert.equal(inTap,true,'subscribe must run synchronously during the tap');subscribeCalls++;return Promise.resolve(subscription);}}};
 w.navigator.serviceWorker={register:async()=>registration,getRegistration:async()=>registration};
 if(device)w.localStorage.setItem('fabsy-portal-push-device','device-fixture');
 let count=3;
 const api=async(action,values)=>{calls.push({action,values});if(action==='push-config'&&configError)throw new w.Error('Server setup unavailable');if(action==='push-subscribe'&&enrollError)throw new w.Error('Device registration failed');return action==='badge-status'?{badgeCount:count}:action==='push-config'?{publicKey:'AAAA'}:action==='push-device'?{active:true}:action==='push-test'?{delivery:{status:'sent'}}:{id:'device-fixture'};};
 w.eval(built.outputFiles[0].text+'\nwindow.Mobile=Mobile;');
 const mobile=w.Mobile.mountMobileApp(api,text=>messages.push(text));
 return {dom,w,mobile,calls,badges,messages,permissionCalls:()=>permissionCalls,subscribeCalls:()=>subscribeCalls,tap:()=>{inTap=true;w.document.getElementById('push-enable').click();inTap=false;},setCount:value=>{count=value;}};
}
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
test('iPhone browser guides installation and never requests permission on page load',async()=>{
 const f=fixture({ios:true});try{
  assert.equal(f.permissionCalls(),0);assert.equal(f.w.document.getElementById('app-install-steps').hidden,false);
  f.w.document.getElementById('push-enable').click();await settle();
  assert.equal(f.permissionCalls(),0);assert.match(f.messages[0],/Add to Home Screen/);assert.equal(f.calls.length,0);
 }finally{f.dom.window.close();}
});
test('installed app enrolls only on a tap and synchronizes the real attention badge',async()=>{
 const f=fixture({ios:true,installed:true});try{
  assert.equal(f.w.document.getElementById('app-install-steps').hidden,true);
  await f.mobile.prepare();assert.equal(f.subscribeCalls(),0);f.tap();await settle();
  assert.equal(f.permissionCalls(),0);assert.equal(f.subscribeCalls(),1);assert.deepEqual(f.calls.map(c=>c.action),['push-config','push-subscribe','badge-status']);
  assert.deepEqual(f.badges,[3]);assert.equal(f.w.document.getElementById('push-test').hidden,false);
  f.setCount(0);await f.mobile.syncBadge();assert.deepEqual(f.badges,[3,0]);
 }finally{f.dom.window.close();}
});
test('an early tap prepares setup and requires a fresh tap to subscribe',async()=>{
 const f=fixture({ios:true,installed:true});try{
  f.tap();await settle();assert.equal(f.subscribeCalls(),0);
  assert.match(f.w.document.getElementById('push-feedback').textContent,/Setup is ready/);
  f.tap();await settle();assert.equal(f.subscribeCalls(),1);
 }finally{f.dom.window.close();}
});
test('setup and enrollment failures are visible beside the notification controls',async()=>{
 for(const option of [{configError:true},{enrollError:true},{denied:true}]){
  const f=fixture({ios:true,installed:true,...option});try{
   await f.mobile.prepare().catch(()=>{});f.tap();await settle();
   const feedback=f.w.document.getElementById('push-feedback');assert.equal(feedback.hidden,false);
   assert.match(feedback.textContent,/Server setup unavailable|Device registration failed|Allow notifications/);
   assert.equal(f.w.localStorage.getItem('fabsy-portal-push-device'),null);
  }finally{f.dom.window.close();}
 }
});
test('turning off notifications clears the badge and stops foreground re-badging',async()=>{
 const f=fixture({installed:true,device:true});try{
  await f.mobile.syncBadge();f.w.document.getElementById('push-disable').click();await settle();
  await f.mobile.syncBadge();assert.deepEqual(f.badges,[3,0]);
  assert.equal(f.calls.filter(c=>c.action==='push-unsubscribe').length,1);assert.equal(f.w.localStorage.getItem('fabsy-portal-push-device'),null);
 }finally{f.dom.window.close();}
});
const sw=await readFile(new URL('./sw.js.txt',import.meta.url),'utf8');
function worker({badgeFails=false}={}){
 const listeners={},badges=[],notifications=[],opened=[];
 const self={navigator:{setAppBadge:async count=>{badges.push(count);if(badgeFails)throw Error('disabled');},clearAppBadge:async()=>badges.push(0)},location:{origin:'https://fabsy.ca'},addEventListener:(name,fn)=>{listeners[name]=fn;},registration:{showNotification:async(title,options)=>notifications.push({title,...options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(sw,{self,URL,Number});
 async function push(data){let pending;listeners.push({data:{json:()=>data},waitUntil:value=>{pending=value;}});await pending;}
 return {listeners,badges,notifications,opened,push};
}
test('background pushes replace the badge count, including duplicate deliveries and zero',async()=>{
 const f=worker();await f.push({badgeCount:4});await f.push({badgeCount:4});await f.push({badgeCount:0});
 assert.deepEqual(f.badges,[4,4,0]);assert.equal(f.notifications.length,3);
});
test('badge failure still shows the alert and off-site links never leave Fabsy',async()=>{
 const f=worker({badgeFails:true});await f.push({badgeCount:2,url:'https://evil.test/'});
 assert.equal(f.notifications.length,1);assert.equal(f.notifications[0].data.url,'/admin/portal');
});
test('opening an attention alert navigates without clearing its unresolved badge',async()=>{
 const f=worker();const url='/admin/portal?job=11111111-2222-3333-4444-555555555555';await f.push({badgeCount:1,url});
 let pending;f.listeners.notificationclick({notification:{data:{url},close(){}},waitUntil:value=>{pending=value;}});await pending;
 assert.deepEqual(f.badges,[1]);assert.deepEqual(f.opened,['https://fabsy.ca'+url]);
});
