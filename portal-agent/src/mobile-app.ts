type Api=(action:string,values?:Record<string,unknown>)=>Promise<any>;
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const el=(id:string)=>document.getElementById(id)!;
const standalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const storageKey='fabsy-portal-push-device';

export function mountMobileApp(api:Api,message:(text:string)=>void){
 // The native app owns notification enrollment and removes the install panel.
 // Never bind web-push controls to DOM nodes that its bridge may remove.
 if((window as Window&{webkit?:{messageHandlers?:{fabsySession?:unknown}}}).webkit?.messageHandlers?.fabsySession){
  const hide=()=>{const install=document.getElementById('app-setup');if(install)install.hidden=true;const push=document.getElementById('push-enable')?.closest('section');if(push)push.hidden=true;};
  hide();
  return {syncBadge:async()=>{},syncDevice:async()=>{},clearBadge:async()=>{},prepare:async()=>{}};
 }
 let deviceId=localStorage.getItem(storageKey);
 let installEvent:InstallEvent|undefined;
 let badgeRequest:Promise<void>|undefined;
 let badgeVersion=0;
 let prepared:{registered:ServiceWorkerRegistration;key:Uint8Array<ArrayBuffer>;subscription:PushSubscription|null}|undefined;
 let preparing:Promise<void>|undefined;
 let setupError=false;
 const supported=()=>!(ios()&&!standalone())&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 function feedback(text:string,error=false){el('push-feedback').textContent=text;el('push-feedback').hidden=!text;el('push-feedback').className=error?'push-error':'';}
 function setup(){
  const installed=standalone();
  el('app-install-state').textContent=installed?'Home Screen app is installed.':'Install Fabsy for push alerts and an icon badge.';
  el('app-install-steps').hidden=installed;
  el('app-install').hidden=installed||!installEvent;
  el('push-test').hidden=!deviceId;el('push-disable').hidden=!deviceId;
  el('push-enable').textContent=preparing?'Preparing notifications…':setupError?'Retry notification setup':deviceId?'Reconnect notifications':'Enable notifications';
  (el('push-enable') as HTMLButtonElement).disabled=!!preparing;
  if(ios()&&!installed)el('push-status').textContent='Add Fabsy to your Home Screen, then open the Fabsy icon to enable notifications.';
  else if('Notification' in window&&Notification.permission==='denied')el('push-status').textContent='Notifications are blocked. In Settings → Notifications → Fabsy, turn on Allow Notifications and Badges.';
  else el('push-status').textContent=deviceId?'This device is connected. Send a test notification to check delivery.':'Enable alerts when a portal step or client message needs your attention.';
 }
 const clearBadge=async()=>{badgeVersion++;try{await navigator.clearAppBadge?.();}catch{}};
 async function syncBadge(){
  if(!navigator.setAppBadge||!deviceId)return;
  if(badgeRequest)return badgeRequest;
  badgeRequest=(async()=>{
   const version=badgeVersion;
   const {badgeCount}=await api('badge-status');
   if(version!==badgeVersion||!deviceId||!Number.isSafeInteger(badgeCount)||badgeCount<0)return;
   // Also call when unchanged: a background push may have set an earlier value.
   try{if(badgeCount===0)await navigator.clearAppBadge?.();else await navigator.setAppBadge(badgeCount);}catch{}
   el('badge-status').textContent=badgeCount===0?'Your Home Screen badge is clear.':`${badgeCount} attention item${badgeCount===1?'':'s'} on your Home Screen badge. Tickets count once; ad reviews count separately.`;
  })().finally(()=>{badgeRequest=undefined;});
  return badgeRequest;
 }
 async function registration(){
  const registered=await navigator.serviceWorker.register('/admin/portal/sw.js',{scope:'/admin/portal',updateViaCache:'none'});
  if(!registered.active)await new Promise<void>((resolve,reject)=>{
   const worker=registered.installing||registered.waiting;
   if(!worker){reject(new Error('Notification setup did not start. Refresh and try again.'));return;}
   const timer=setTimeout(()=>reject(new Error('Notification setup timed out. Refresh and try again.')),15000);
   const check=()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(new Error('Notification setup failed. Refresh and try again.'));}};
   worker.addEventListener('statechange',check);check();
  });
  return registered;
 }
 async function syncDevice(){
  if(!deviceId||!('serviceWorker' in navigator))return;
  const registered=await navigator.serviceWorker.getRegistration('/admin/portal');
  const subscription=await registered?.pushManager.getSubscription();
  const saved=subscription?await api('push-device',{id:deviceId}):{active:false};
  if(!saved.active){deviceId=null;localStorage.removeItem(storageKey);await clearBadge();}
  setup();
 }
 function prepare():Promise<void>{
  if(!supported()||prepared)return Promise.resolve();
  if(preparing)return preparing;
  preparing=(async()=>{
   const [config,registered]=await Promise.all([api('push-config'),registration()]);
   if(!config.publicKey)throw new Error('Notification delivery is not configured on the server.');
   const key=Uint8Array.from(atob(config.publicKey.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
   prepared={registered,key,subscription:await registered.pushManager.getSubscription()};setupError=false;
   feedback('');
  })().catch(error=>{setupError=true;feedback(error instanceof Error?error.message:'Notification setup failed. Tap Retry notification setup.',true);throw error;}).finally(()=>{preparing=undefined;setup();});
  setup();return preparing;
 }
 async function buttonAction(id:string,work:()=>Promise<void>){
  const button=el(id) as HTMLButtonElement;button.disabled=true;
  try{await work();}catch(error){const reason=error instanceof Error?error.message:'Notification setup failed.';feedback(reason,true);message(reason);}finally{button.disabled=false;}
 }
 el('push-enable').onclick=()=>buttonAction('push-enable',async()=>{
  if(!supported())throw new Error('Open this page in Safari, choose Share → Add to Home Screen, keep Open as Web App on, then open the Fabsy icon.');
  if(Notification.permission==='denied'){setup();throw new Error('Allow notifications in Settings → Notifications → Fabsy. Turn on Badges there too.');}
  if(!prepared){await prepare();feedback('Setup is ready. Tap Enable notifications to allow alerts.');return;}
  // Safari requires subscribe itself during the tap, before any await/network call.
  // subscribe requests permission; a separate requestPermission loses activation.
  const subscription=prepared.subscription||await prepared.registered.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:prepared.key});
  prepared.subscription=subscription;
  const saved=await api('push-subscribe',{subscription:subscription.toJSON()});
  deviceId=saved.id;localStorage.setItem(storageKey,saved.id);setup();
  await syncBadge().catch(()=>{});
  feedback('This device is enrolled. Tap Send test notification to check delivery.');
  message('Notifications are connected. Tap Send test notification, then check your phone.');
 });
 el('push-test').onclick=()=>buttonAction('push-test',async()=>{
  const result=await api('push-test',{id:deviceId});
  const status=result.delivery?.status;
  const text=status==='sent'?'Your notification service accepted the test. Check your phone for the alert and Fabsy badge.':status==='failed'?'The test could not be delivered. Reconnect notifications and try again.':'Test notification queued. Check your phone shortly.';
  feedback(text,status==='failed');message(text);
 });
 el('push-disable').onclick=()=>buttonAction('push-disable',async()=>{
  await api('push-unsubscribe',{id:deviceId});
  const registered=await navigator.serviceWorker.getRegistration('/admin/portal');
  await(await registered?.pushManager.getSubscription())?.unsubscribe();
  if(prepared)prepared.subscription=null;
  localStorage.removeItem(storageKey);deviceId=null;await clearBadge();setup();
  message('Notifications are off on this device.');
 });
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event as InstallEvent;setup();});
 window.addEventListener('appinstalled',()=>{installEvent=undefined;setup();});
 el('app-install').onclick=()=>buttonAction('app-install',async()=>{await installEvent?.prompt();await installEvent?.userChoice;installEvent=undefined;setup();});
 setup();
 // Update previously installed workers without requesting permission on page load.
 if('serviceWorker' in navigator)void registration().catch(()=>{});
 return {syncBadge,syncDevice,clearBadge,prepare};
}
