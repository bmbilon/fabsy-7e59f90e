import puppeteer from '@cloudflare/puppeteer';
import {extractScheduleCandidate} from './offer-extraction.mjs';
import {portalTarget,inspectResult} from './portal-policy.mjs';
import {disclosureAsset} from './disclosure-policy.mjs';
import {executeApprovedReview} from './review-submit';
import {reviewReceipt,resumePageIndex} from './review-submit-policy.mjs';
import html from './phone.html';
import phoneJs from '../dist/phone.txt';
import serviceWorker from './sw.js.txt';
interface Env { BROWSER: Fetcher; PORTAL_RUNNER_SECRET:string; RUNS:Queue; BROKER_URL:string }
interface Job { id:string; lease_token:string; action:string; ticket_number:string; source_url:string; handoff_requested:boolean; result?:{session_id?:string;session_expires_at?:string;phase?:string;draft_sha256?:string;[key:string]:unknown} }
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function broker(env:Env,action:string,payload:Record<string,unknown>={}){
 const response=await fetch(env.BROKER_URL,{method:'POST',headers:{'x-runner-secret':env.PORTAL_RUNNER_SECRET,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(action==='review-packet'?65000:15000)});
 if(!response.ok){const failed=await response.json().catch(()=>({})) as {error?:string};throw new Error(failed.error&&/^[A-Z_]+$/.test(failed.error)?failed.error:'PORTAL_BROKER_UNAVAILABLE');}
 return await response.json() as {job:Job|null};
}
async function run(env:Env){
 const {job}=await broker(env,'claim');
 if(!job)return;
 let browser:Awaited<ReturnType<typeof puppeteer.launch>>|undefined;
 let keep=false;
 let committing=job.result?.phase==='committing';
 let reviewPacket:any;
 const keepAlive=job.handoff_requested?600000:60000;
 try{
  const target=portalTarget(job);
  let resume=!!job.result?.session_id&&Date.parse(job.result.session_expires_at||'')>Date.now();
  if(resume){const active=(await puppeteer.sessions(env.BROWSER)).find(s=>s.sessionId===job.result!.session_id);if(!active)resume=false;else if(active.connectionId)throw new Error('CLOUD_BROWSER_IN_USE');}
  if(committing&&!resume)throw new Error('UNCERTAIN_SUBMISSION_REQUIRES_RECONCILIATION');
  if(job.action==='submit_review_request'&&!committing)reviewPacket=await broker(env,'review-packet',{id:job.id,lease:job.lease_token});
  browser=resume?await puppeteer.connect(env.BROWSER,job.result!.session_id!):await puppeteer.launch(env.BROWSER,{keep_alive:keepAlive});
  const pages=await browser.pages();
  const page=resume?pages[resumePageIndex(pages.map(p=>p.url()))]:await browser.newPage();
  // A resumed session reads the human's current page; it never repeats their action.
  const response=resume?null:await page.goto(target,{waitUntil:'networkidle2',timeout:45000});
  if(new URL(page.url()).origin!=='https://traffictickets.alberta.ca')throw new Error('Browser left the official portal');
  if(job.action==='submit_review_request'){
   const complete=async(receipt:Record<string,unknown>)=>{await broker(env,'review-receipt',{id:job.id,lease:job.lease_token,hash:job.result!.draft_sha256,receipt});};
   if(committing){if(!resume)throw new Error('UNCERTAIN_SUBMISSION_REQUIRES_RECONCILIATION');await complete(reviewReceipt(page.url(),await page.evaluate(()=>document.querySelector('main')?.textContent||''),job.ticket_number));return;}
   const packet=reviewPacket;
   await executeApprovedReview(page,packet,async form=>{await broker(env,'review-commit',{id:job.id,lease:job.lease_token,hash:packet.draft_sha256,form});committing=true;},complete);
   return;
  }
  const text=await page.evaluate(()=>document.body.innerText);
  const outcome=inspectResult(job,{text,status:response?.status()||200,url:page.url(),title:await page.title()});
  if(job.action==='inspect_offer'&&outcome.result.portal_verified){
   // Read only already-open official pages in this verified cloud session.
   // Never navigate, accept an offer, or infer a trial from Court/Due date.
   const candidates=[];
   for(const openPage of await browser.pages()){
    const location=new URL(openPage.url());
    if(location.origin!=='https://traffictickets.alberta.ca'||!['/ticket-penalty-and-options','/dispute-response'].includes(location.pathname))continue;
    const visible=await openPage.evaluate(()=>document.body.innerText);
    const candidate=extractScheduleCandidate(job.ticket_number,visible,location.href,outcome.result.observed_at);
    if(candidate)candidates.push(candidate);
   }
   Object.assign(outcome.result,{schedule_candidate:candidates.length===1?candidates[0]:null,schedule_conflict:candidates.length>1});
  }
  if(job.action==='inspect_disclosure'&&new URL(page.url()).pathname==='/disclosure-detail'&&text.includes(`Ticket number: ${job.ticket_number}`)){
   const links=await page.evaluate(()=>Array.from(document.querySelectorAll('table a[href]')).map(a=>({name:(a.textContent||'').trim(),href:(a as HTMLAnchorElement).href})));
   if(!links.length||links.length>30||new Set(links.map(l=>l.name)).size!==links.length)throw new Error('Invalid disclosure manifest');
   const manifest=[];
   for(const link of links){
    const asset=disclosureAsset(job.ticket_number,link.name,link.href);
    const response=await fetch(asset.url,{redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok||Number(response.headers.get('Content-Length'))>10485760)throw new Error('Disclosure download failed');
    const buffer=new Uint8Array(await response.arrayBuffer());if(!buffer.length||buffer.length>10485760)throw new Error('Disclosure size invalid');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');
    let binary='';for(let i=0;i<buffer.length;i+=8192)binary+=String.fromCharCode(...buffer.subarray(i,i+8192));
    await broker(env,'disclosure-evidence',{id:job.id,lease:job.lease_token,name:asset.name,mime:asset.mime,source_path:asset.source_path,sha256:hash,data:btoa(binary)});
    manifest.push({name:asset.name,sha256:hash});
   }
   manifest.sort((a,b)=>a.name.localeCompare(b.name));
   const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(manifest))))].map(b=>b.toString(16).padStart(2,'0')).join('');
   const saved=await broker(env,'disclosure-package',{id:job.id,lease:job.lease_token,manifest,sha256:digest}) as any;
   Object.assign(outcome.result,{portal_verified:true,disclosure_package_id:saved.id,downloaded_files:manifest.length});
   outcome.reason='All listed disclosure files saved to the case. Automated review is queued; its proposed request will require staff approval.';
  }
  if(job.handoff_requested){
   const cdp=await page.createCDPSession();
   const live=await (cdp as any).send('Cloudflare.getLiveView',{mode:'tab',expiresInMs:600000});
   const liveUrl=new URL(live.devtoolsFrontendUrl);
   if(liveUrl.origin!=='https://live.browser.run')throw new Error('Unexpected live browser URL');
   Object.assign(outcome.result,{session_id:browser.sessionId(),session_expires_at:new Date(Date.now()+600000).toISOString(),live_url:liveUrl.href});
   outcome.reason='Cloud browser ready for ticket verification. Open it within 10 minutes, complete verification, then return and choose Read verified page. No automated submission is enabled.';
   keep=true;
  }
  await broker(env,'finish',{id:job.id,lease:job.lease_token,...outcome});
 }catch(error){
  keep=false;
  const isReview=job.action==='submit_review_request';
  const result:Record<string,unknown>={...job.result,error_detail:error instanceof Error?error.message.split('\n')[0].replace(/https?:\/\/\S+/g,'[URL]').replace(/[A-Z0-9]{5,}/g,'[redacted]').slice(0,240):'Unknown browser failure',portal_verified:false,observed_at:new Date().toISOString(),...(isReview?{phase:committing?'committing':'verification'}:{})};
  if(!(error instanceof Error&&error.message==='CLOUD_BROWSER_IN_USE')){result.session_id=null;result.session_expires_at=null;result.live_url=null;}
  if(isReview&&!committing&&error instanceof Error&&(/Unable to create new browser: code: 429/.test(error.message)||error.message==='CLOUD_BROWSER_IN_USE')){await broker(env,'defer-review-browser',{id:job.id,lease:job.lease_token,seconds:300,reason:error.message==='CLOUD_BROWSER_IN_USE'?'CLOUD_BROWSER_IN_USE':'BROWSER_RATE_LIMIT'});return;}
  if(isReview&&browser){try{const pages=await browser.pages();const page=pages[resumePageIndex(pages.map(p=>p.url()))];result.observed_path=new URL(page.url()).pathname;result.controls=await page.evaluate(()=>Array.from(document.querySelectorAll<HTMLInputElement>('main input,main button')).map(e=>({tag:e.tagName,id:e.id,type:e.type,disabled:e.disabled,labels:Array.from(e.labels||[]).map(l=>l.textContent?.replace(/\s+/g,' ').trim())})));const cdp=await page.createCDPSession();const live=await (cdp as any).send('Cloudflare.getLiveView',{mode:'tab',expiresInMs:keepAlive});if(new URL(live.devtoolsFrontendUrl).origin==='https://live.browser.run'){Object.assign(result,{session_id:browser.sessionId(),session_expires_at:new Date(Date.now()+keepAlive).toISOString(),live_url:live.devtoolsFrontendUrl});keep=true;}}catch{/* retain the durable job if a live view cannot be provided */}}
  const code=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'PORTAL_CHECK_INCOMPLETE';
  await broker(env,'finish',{id:job.id,lease:job.lease_token,status:committing?'uncertain':'needs_review',result,reason:isReview?(committing?'Submission may have occurred. Inspect the current browser and receipt; no automatic resubmission. ': 'Approved review requires attention before submission. ')+code:'The cloud browser check could not finish. It did not automatically submit a request. If the browser session expired, start a new verification session.'});
 }finally{
  if(browser){if(keep)await browser.disconnect();else await browser.close();}
 }
}
const pageHeaders={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://gcasbisxfrssonllpqrw.supabase.co wss://gcasbisxfrssonllpqrw.supabase.co; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&(path==='/admin/portal'||path==='/admin/portal/'))return new Response(html,{headers:{...pageHeaders,'Content-Type':'text/html;charset=UTF-8'}});
  if(request.method==='GET'&&path==='/admin/portal/app.js')return new Response(phoneJs,{headers:{...pageHeaders,'Content-Type':'text/javascript;charset=UTF-8'}});
  if(request.method==='GET'&&path==='/admin/portal/sw.js')return new Response(serviceWorker,{headers:{...pageHeaders,'Content-Type':'text/javascript;charset=UTF-8','Service-Worker-Allowed':'/admin/portal'}});
  if(request.method==='GET'&&path==='/admin/portal/manifest.webmanifest')return new Response(JSON.stringify({id:'/admin/portal',name:'Fabsy Admin',short_name:'Fabsy Admin',start_url:'/admin/portal',scope:'/admin/',display:'standalone',theme_color:'#0f172a',background_color:'#f3f6fa',icons:[{src:'/apple-touch-icon.png',sizes:'180x180',type:'image/png'},{src:'/icon-192.svg',sizes:'192x192',type:'image/svg+xml'},{src:'/icon-512.svg',sizes:'512x512',type:'image/svg+xml'}]}),{headers:{...pageHeaders,'Content-Type':'application/manifest+json'}});
  if(request.method!=='POST')return json({error:'Not found'},404);
  if(path==='/admin/portal/api'){
   if(request.headers.get('Origin')!=='https://fabsy.ca')return json({error:'Origin not allowed'},403);
   if(!request.headers.get('Authorization')?.startsWith('Bearer '))return json({error:'Unauthorized'},401);
   const body=await request.text();if(body.length>4096)return json({error:'Request too large'},413);
   const response=await fetch(env.BROKER_URL,{method:'POST',headers:{Authorization:request.headers.get('Authorization')!,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(55000)});
   return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  if(!env.PORTAL_RUNNER_SECRET||request.headers.get('Authorization')!==`Bearer ${env.PORTAL_RUNNER_SECRET}`)return json({error:'Unauthorized'},401);
  if(path==='/browser-status'){const limits=await puppeteer.limits(env.BROWSER);const sessions=await puppeteer.sessions(env.BROWSER);return json({maxConcurrentSessions:limits.maxConcurrentSessions,activeSessions:sessions.length,allowedBrowserAcquisitions:limits.allowedBrowserAcquisitions,timeUntilNextAllowedBrowserAcquisition:limits.timeUntilNextAllowedBrowserAcquisition});}
  if(path==='/health-browser'){
   let browser:Awaited<ReturnType<typeof puppeteer.launch>>|undefined;
   try{
    browser=await puppeteer.launch(env.BROWSER);
    const page=await browser.newPage();
    const response=await page.goto('https://traffictickets.alberta.ca/',{waitUntil:'networkidle2',timeout:45000});
    const cdp=await page.createCDPSession();
    const live=await (cdp as any).send('Cloudflare.getLiveView',{mode:'tab',expiresInMs:60000});
    return json({portal_http_status:response?.status(),live_view_supported:new URL(live.devtoolsFrontendUrl).origin==='https://live.browser.run',title:await page.title()});
   }catch(error){return json({available:false,error:/429|rate limit/i.test(String(error))?'BROWSER_RATE_LIMIT':'BROWSER_HEALTH_UNAVAILABLE'},/429|rate limit/i.test(String(error))?429:503);}
   finally{await browser?.close();}
  }
  if(path!=='/run')return json({error:'Not found'},404);
  await env.RUNS.send({requested_at:new Date().toISOString()});
  return json({queued:true},202);
 },
 async scheduled(_event:ScheduledController,env:Env){await env.RUNS.send({requested_at:new Date().toISOString()});},
 async queue(batch:MessageBatch,env:Env){for(const item of batch.messages){await run(env);item.ack();}}
} satisfies ExportedHandler<Env>;
