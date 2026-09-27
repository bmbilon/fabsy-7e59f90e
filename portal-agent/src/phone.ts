import {renderAds} from './ads-ui';
import {mountEmailTemplates} from './email-templates-ui';
import {createClient} from '@supabase/supabase-js';
import {renderDisclosureReviews} from './disclosure-review-ui';
import {caseQueue,groupQueueTasks,type QueueCase,type QueueTask} from './case-queue';
const db=createClient('https://gcasbisxfrssonllpqrw.supabase.co','sb_publishable_KEo-G1wij9RC_IDDzblisw_VISRvwrX');
const el=(id:string)=>document.getElementById(id)!;
const message=(text:string)=>{el('message').textContent=text;};
async function api(action:string,values:Record<string,unknown>={}){
 const {data:{session}}=await db.auth.getSession();
 if(!session) throw new Error('Please sign in.');
 const response=await fetch('/admin/portal/api',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...values})});
 const result=await response.json() as any;
 if(!response.ok) throw new Error(response.status===401?'This account does not have staff access.':result.error||'The request could not be completed.');
 return result;
}
const when=(value:string|null)=>value?new Date(value).toLocaleString():'Not yet recorded';
function node(tag:string,text:string,className=''){const item=document.createElement(tag);item.textContent=text;item.className=className;return item;}
type QueueGroup='pending'|'attention'|'done'|'emails';
type QueueItem=QueueTask;
let queueStatus:any=null;
let queueDrafts:any[]=[];
let selectedQueue:QueueGroup|null=null;
function queueItems():QueueCase[]{return caseQueue(queueStatus,queueDrafts);}
function focusQueueTarget(target:HTMLElement){
 document.querySelectorAll('.queue-target').forEach(item=>item.classList.remove('queue-target'));
 target.classList.add('queue-target');target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'start'});
}
async function openQueueItem(item:QueueItem){
 if(item.kind==='draft'){
  history.replaceState(null,'','/admin/portal?draft='+encodeURIComponent(item.id));
  await openEmailDraft(item.id);
  focusQueueTarget(el('email-draft-detail'));
 }else{
  const key=item.kind==='job'?'job':'disclosure';
  const target=document.getElementById(key+'-'+item.id);
  if(!target)throw new Error('This item has moved. Refresh the queue to find its current status.');
  history.replaceState(null,'','/admin/portal?'+key+'='+encodeURIComponent(item.id));
  focusedJob=true;focusQueueTarget(target);
 }
}
function renderQueueChoices(group:QueueGroup){
 const root=el('queue-items');root.replaceChildren();root.hidden=false;
 const label={pending:'Waiting to run',attention:'Need attention',done:'Completed',emails:'Email approvals'}[group];
 const cases=queueItems();
 const items=group==='emails'?groupQueueTasks(cases.flatMap(item=>item.tasks).filter(task=>task.kind==='draft'&&task.status==='pending_approval')):cases.filter(item=>item.group===group);
 const header=node('div','','row between');header.append(node('h2',label));
 const close=node('button','Close list') as HTMLButtonElement;close.type='button';
 close.onclick=()=>{selectedQueue=null;root.hidden=true;el(group==='emails'?'email-count':'tile-'+group).focus();};header.append(close);root.append(header);
 if(!items.length)root.append(node('p','No items in this queue right now.','subtle'));
 for(const item of items){
  const button=node('button','','queue-choice') as HTMLButtonElement;button.type='button';
  const row=node('div','','queue-case');row.dataset.ticket=item.ticket;
  button.append(node('strong',item.ticket?`Ticket ${item.ticket}`:'Ticket identification needed'),node('span',`${item.primary.label} · ${item.primary.status.replaceAll('_',' ')} →`));
  button.onclick=()=>navigateQueue(button,()=>openQueueItem(item.primary));row.append(button);
  if(item.tasks.length>1){
   const details=node('details','');details.append(node('summary',`Related tasks (${item.tasks.length})`));
   for(const task of item.tasks){const related=node('button',`${task.label} · ${task.status.replaceAll('_',' ')}`,'queue-choice') as HTMLButtonElement;related.type='button';related.onclick=()=>navigateQueue(related,()=>openQueueItem(task));details.append(related);}
   row.append(details);
  }
  root.append(row);
 }
 return items;
}
async function navigateQueue(button:HTMLButtonElement,open:()=>Promise<void>){
 button.disabled=true;
 try{await open();}catch(error){const reason=error instanceof Error?error.message:'Unable to open this item.';message(reason);el('queue-items').append(node('p',reason,'error'));}finally{button.disabled=false;}
}
async function openQueue(group:QueueGroup){
 selectedQueue=group;
 const items=renderQueueChoices(group);
 if(items.length===1)await openQueueItem(items[0].primary);else focusQueueTarget(el('queue-items'));
}
function updateQueueTiles(){
 const items=queueItems();
 for(const group of ['pending','attention','done'] as const)el(group).textContent=String(items.filter(item=>item.group===group).length);
 if(selectedQueue)renderQueueChoices(selectedQueue);
}
let liveChannel:ReturnType<typeof db.channel>|undefined;
let liveUser:string|undefined;
let liveTimer:ReturnType<typeof setTimeout>|undefined;
let rendering=false;
let refreshAgain=false;
function queueLiveRefresh(){
 clearTimeout(liveTimer);
 liveTimer=setTimeout(()=>{if(!document.hidden&&!document.querySelector('.offer-form[open], .email-review, .disclosure-approval[data-edited=true]'))refresh().catch(error=>message(error.message));},200);
}
function connectLive(userId:string){
 if(liveUser===userId)return;
 if(liveChannel)void db.removeChannel(liveChannel);
 liveUser=userId;
 liveChannel=db.channel('portal-payments-'+userId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'admin_workspace_updates'},queueLiveRefresh)
 .subscribe(status=>{
  el('payment-live').textContent=status==='SUBSCRIBED'?'Live payment updates connected.':'Live connection reconnecting; automatic refresh remains active.';
  if(status==='SUBSCRIBED')queueLiveRefresh();
 });
}
async function refresh(){
 if(rendering){refreshAgain=true;return;}
 rendering=true;
 try{await loadStatus();}finally{rendering=false;if(refreshAgain){refreshAgain=false;queueLiveRefresh();}}
}
async function loadStatus(){
 const {data:{session}}=await db.auth.getSession();
 el('login').hidden=!!session;el('workspace').hidden=!session;
 if(!session){if(liveChannel)void db.removeChannel(liveChannel);liveChannel=undefined;liveUser=undefined;return;}
 const data=await api('status');
 renderDisclosureReviews(data,api,refresh,message);
 connectLive(session.user.id);
 el('email-approvals').hidden=!data.emailApprover;
 el('email-templates').hidden=!data.emailApprover;
 el('ads-launch').hidden=!data.emailApprover;
 if(data.emailApprover)await renderAds(el('ads-launch'),api,message);
 queueStatus=data;
 if(data.emailApprover)await loadEmailDrafts();else queueDrafts=[];
 const payments=el('payments');payments.replaceChildren();
 const confirmations=el('payment-confirmations');confirmations.replaceChildren();
 const stripePayments=(data.payments||[]).filter((payment:any)=>payment.source==='stripe_checkout');
 const otherPayments=(data.payments||[]).filter((payment:any)=>payment.source!=='stripe_checkout');
 if(!stripePayments.length)payments.append(node('p','No recent Stripe-backed payments are recorded.','subtle'));
 if(!otherPayments.length)confirmations.append(node('p','No recent staff or external payment confirmations.','subtle'));
 for(const payment of data.payments||[]){
  const isStripe=payment.source==='stripe_checkout';
  const destination=isStripe?payments:confirmations;
  const row=node('article','','card');const heading=node('div','','row between');
  const title=payment.ticket_number?`Ticket ${payment.ticket_number}`:payment.client_name||'Payment awaiting case match';
  const status=payment.source==='operator_confirmation'?'Staff confirmed':payment.source==='verified_receipt'?'Receipt reviewed':payment.payment_status.replaceAll('_',' ');
  heading.append(node('h3',title),node('span',status,'badge '+(payment.payment_status==='paid'?'success':'warning')));
  row.append(heading,node('p',payment.detail));
  if(payment.client_name&&payment.ticket_number)row.append(node('p',payment.client_name,'subtle'));
  const amount=payment.amount_cents==null?'Amount not recorded':new Intl.NumberFormat('en-CA',{style:'currency',currency:payment.currency||'CAD'}).format(payment.amount_cents/100);
  const time=payment.paid_at?`Paid ${when(payment.paid_at)}`:`Recorded ${when(payment.recorded_at)}; actual payment date not recorded`;
  row.append(node('p',`${String(payment.product||'Service').replaceAll('_',' ')} · ${amount} · ${time}`,'subtle'));
  if(isStripe&&payment.stripe_reference)row.append(node('p','Stripe checkout: '+payment.stripe_reference,'subtle reference'));
  if(isStripe&&payment.stripe_payment_intent_id)row.append(node('p','Payment intent: '+payment.stripe_payment_intent_id,'subtle reference'));
  const bases:Record<string,string>={exact_ticket:'Ticket number supplied at checkout',verified_correspondent:'Verified email thread identifying this ticket',operator_confirmation:'Brett confirmed this payment and ticket',existing_case_link:'Existing case link'};
  if(payment.match_basis)row.append(node('p','Case match: '+(bases[payment.match_basis]||payment.match_basis),'subtle'));
  if(payment.match_review)row.append(node('p',payment.match_review,'warning'));
  if(payment.case_stage)row.append(node('p','Case stage: '+payment.case_stage.replaceAll('_',' ')));
  const link=node('a',payment.ticket_submission_id?'Open case':'Review payment','button') as HTMLAnchorElement;
  link.href=payment.ticket_submission_id?'/admin/submissions/'+payment.ticket_submission_id:'/admin/checkout-links';row.append(link);destination.append(row);
 }
 const reconciliation=data.reconciliation;
 el('reconciliation-health').textContent=reconciliation?`Last email scan: ${when(reconciliation.state.last_scan_at)}. ${reconciliation.state.phase==='backfill'?'Historical email reconciliation is in progress.':'New mailbox activity is checked by the cloud worker.'}${reconciliation.state.last_error?' Scanner needs attention: '+reconciliation.state.last_error:''}`:'Email reconciliation status is unavailable.';
 const reviews=el('reconciliation-reviews');reviews.replaceChildren();
 for(const item of reconciliation?.reviews||[]){
  const row=node('article','','card');row.append(node('h3',item.ticket_number?`Ticket ${item.ticket_number}`:item.name||'Payment needs a ticket'),node('p',item.reason),node('p',`${item.name||''} · ${item.email||''} · ${item.payment_status}`,'subtle'));
  const link=node('a',item.ticket_submission_id?'Open case':'Review payment','button') as HTMLAnchorElement;link.href=item.ticket_submission_id?'/admin/submissions/'+item.ticket_submission_id:'/admin/checkout-links';row.append(link);reviews.append(row);
 }
 for(const item of reconciliation?.thread_reviews||[]){
  const row=node('article','','card');row.append(node('h3',item.ticket_numbers.length?'Email thread — '+item.ticket_numbers.join(', '):'Email thread needs identification'),node('p',item.reason));reviews.append(row);
 }
 if(reconciliation&&!reconciliation.reviews.length&&!reconciliation.thread_reviews.length)reviews.append(node('p','No payment or email matching conflicts are waiting for review.','subtle'));
 const jobs=data.jobs;
 updateQueueTiles();
 const fresh=data.state.last_seen_at&&Date.now()-Date.parse(data.state.last_seen_at)<12*60*1000;
 el('runner-badge').textContent=!data.state.enabled?'Paused':data.state.last_error?'Needs attention':fresh?'Connected':'Waiting for heartbeat';
 el('runner-badge').className='badge '+(fresh&&!data.state.last_error?'success':'warning');
 el('health').textContent=`Last cloud check: ${when(data.state.last_seen_at)}. ${data.state.last_error||'Your Mac can be asleep.'}`;
 el('mail').textContent=`Last offer scan: ${when(data.mail.last_scan_at)}. Last Crown notice scan: ${when(data.crown.last_scan_at)}. Client drafts: ${data.mail.drafts_enabled?'mobile approval required':'paused'}.`;
 if(data.mail.last_error||data.crown.last_error)message(data.mail.last_error||data.crown.last_error);
 const container=el('jobs');container.replaceChildren();
 if(!jobs.length)container.append(node('div','No portal jobs are waiting. New verified prosecutor offers enter this queue automatically.','card'));
 for(const job of jobs){
  const card=node('article','','card');card.id='job-'+job.id;const heading=node('div','','row between');
  heading.append(node('h2',`Ticket ${job.ticket_number}`),node('span',job.status.replaceAll('_',' '),'badge '+(['needs_review','uncertain'].includes(job.status)?'warning':'')));
  card.append(heading,node('p',job.action==='submit_review_request'?'Submit approved prosecutor-review request':job.action==='prepare_offer_acceptance'?'Client requests offer acceptance — portal review':job.action==='inspect_offer'?'Read prosecutor offer':job.action==='inspect_disclosure'?'Retrieve disclosure':'Prepare disclosure request','subtle'));
  if(job.action==='prepare_offer_acceptance')card.append(node('p','This job opens the offer for review. Acceptance has not been submitted. Confirm the client’s authority and unchanged terms in the portal, then save the receipt and payment/attendance details before replying.','warning'));
  if(job.case_stage){
   const basis=(data.payments||[]).find((payment:any)=>payment.ticket_submission_id===job.submission_id);
   const source=basis?.source==='stripe_checkout'?' · Stripe payment':basis?.source==='operator_confirmation'?' · operator confirmation':basis?.source==='verified_receipt'?' · external receipt':'';
   card.append(node('p','Case stage: '+job.case_stage.replaceAll('_',' ')+source,'subtle'));
  }
  const offer=data.offers.find((o:any)=>o.id===job.offer_event_id);
  if(offer)card.append(node('p','Client communication: '+offer.status.replaceAll('_',' '),'subtle'));
  if(job.review_reason)card.append(node('p',job.review_reason));
  card.append(node('p',`Updated ${when(job.updated_at)}`,'subtle'));
  if(job.source_url){const link=node('a','Open government portal','button') as HTMLAnchorElement;const target=new URL(job.source_url);if(target.origin==='https://traffictickets.alberta.ca'){link.href=target.href;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}}
  if(job.result?.disclosure_package_id){const link=node('a','View disclosure review','button') as HTMLAnchorElement;link.href='#disclosure-'+job.result.disclosure_package_id;card.append(link);}
  if((job.action==='submit_review_request'&&['needs_review','uncertain'].includes(job.status))||(job.status==='needs_review'&&!job.result?.disclosure_package_id&&['inspect_offer','inspect_disclosure','prepare_offer_acceptance'].includes(job.action))){
   const active=job.result?.session_id&&Date.parse(job.result.session_expires_at)>Date.now();
   if(active&&job.result.live_url){
    const live=new URL(job.result.live_url);
    if(live.origin==='https://live.browser.run'){
     const link=node('a','Open cloud browser','button') as HTMLAnchorElement;link.href=live.href;link.target='_blank';link.rel='noopener noreferrer';card.append(link);card.append(node('p','Close the cloud browser tab before continuing so the runner can reconnect.','subtle'));
     const read=node('button',job.action==='submit_review_request'?(job.result?.phase==='committing'?'Check submission receipt':'Continue approved submission'):'Read verified page') as HTMLButtonElement;read.onclick=()=>act(read,async()=>{await api('handoff',{id:job.id,resume:true});message(job.action==='submit_review_request'?'Continuing the approved job. An uncertain submission is checked for its receipt without submitting again.':'Reading the page you verified in the cloud browser.');});card.append(read);
    }
   }else if(job.action!=='submit_review_request'||job.result?.phase!=='committing'){
    const open=node('button',job.action==='submit_review_request'?'Continue approved request':'Start cloud verification') as HTMLButtonElement;open.onclick=()=>act(open,async()=>{await api('handoff',{id:job.id});message('Starting a cloud browser. Refresh shortly for the Open cloud browser button.');});card.append(open);
   }
  }
  if(job.result?.page_text){const details=node('details','');details.append(node('summary','View captured page'),node('pre',job.result.page_text));card.append(details);}
  if(offer?.status==='needs_review'){
   const details=node('details','');details.className='offer-form';details.append(node('summary','Verify offer terms and queue a client draft'));
   const form=document.createElement('form');
   const candidate=job.result?.portal_verified?job.result?.schedule_candidate:null;
   if(candidate)form.append(node('p',`Current portal ${candidate.label}: ${candidate.date}. Confirm whether this is the scheduled trial date before using it. Source: ${candidate.source}`,'subtle'));
   if(job.result?.schedule_conflict)form.append(node('p','Conflicting schedule pages were captured. Recheck the current schedule before preparing the notice.','warning'));
   const fields=[['original_total','Original total (CAD)','number'],['offered_total','Offered total (CAD)','number'],['charge','Offered charge','text'],['demerits','Offered demerit points','number'],['due_date','Verified response due date','date'],['trial_date','Currently scheduled trial date (verify in portal)','date'],['schedule_source','Current schedule source: official page or court notice and verification time','text'],['deadline_source','Where you verified the current deadline','text']];
   for(const [name,label,type] of fields){const input=document.createElement('input');input.name=name;input.id=offer.id+'-'+name;input.type=type;input.required=name!=='trial_date';const extracted=job.result?.portal_verified?job.result?.offer_fields?.[name]:undefined;if(extracted!==undefined)input.value=String(extracted);if(candidate&&name==='trial_date'&&candidate.label==='Trial date')input.value=candidate.date;if(candidate&&name==='schedule_source')input.value=candidate.source;if(type==='number'){input.min='0';input.step=name==='demerits'?'1':'0.01';}const caption=node('label',label) as HTMLLabelElement;caption.htmlFor=input.id;form.append(caption,input);}
   const schedule=document.createElement('select');schedule.id=offer.id+'-schedule-status';schedule.name='schedule_status';schedule.required=true;schedule.append(new Option('Select verified current schedule',''),new Option('Trial currently scheduled','scheduled'),new Option('Portal confirms no trial scheduled','not_scheduled'));const scheduleLabel=node('label','Current trial schedule') as HTMLLabelElement;scheduleLabel.htmlFor=schedule.id;form.append(scheduleLabel,schedule);
   schedule.onchange=()=>{const trial=form.querySelector<HTMLInputElement>('[name=trial_date]')!;trial.required=schedule.value==='scheduled';if(schedule.value==='not_scheduled')trial.value='';};
   form.append(node('p','Extracted fields are suggestions from the captured offer. Verify the current trial schedule separately; a Court/Due date is not automatically a trial date. Verify these details against the current Crown offer and court date. This uses the versioned client notice template. A new template revision must be approved before delivery. It does not accept or reject the offer.','subtle'));
   const button=node('button','Queue verified client draft') as HTMLButtonElement;button.type='submit';form.append(button);
   form.onsubmit=event=>{event.preventDefault();const values=new FormData(form);act(button,async()=>{await api('prepare-draft',{id:offer.id,terms:{original_total:Number(values.get('original_total')),offered_total:Number(values.get('offered_total')),charge:String(values.get('charge')),demerits:Number(values.get('demerits')),due_date:String(values.get('due_date')),trial_date:values.get('trial_date')||null,schedule_status:String(values.get('schedule_status')),schedule_source:String(values.get('schedule_source')),deadline_source:String(values.get('deadline_source'))}});message(data.mail.drafts_enabled?'Client notice queued under the template approval policy.':'Verified terms saved. Draft generation is paused.');});};
   details.append(form);card.append(details);
  }
  if(['needs_review','uncertain'].includes(job.status)&&!job.result?.disclosure_package_id&&['inspect_offer','inspect_disclosure'].includes(job.action)){
   const retry=node('button','Retry read-only check') as HTMLButtonElement;retry.onclick=()=>act(retry,async()=>{await api('retry',{id:job.id});await api('run');message('Read-only check queued.');});card.append(retry);
  }
  if(job.action==='submit_review_request'&&job.result?.phase==='committing'&&job.status==='uncertain')card.append(node('p','The request may have been submitted. Check the government receipt or notice before any retry. This job cannot automatically submit again.','warning'));
  container.append(card);
 }
 const notices=el('notices');notices.replaceChildren();
 if(data.decisionState){
  notices.append(node('h2','Client offer replies'),node('p',`Reply scanner: ${data.decisionState.enabled?'enabled':'paused'}. Last completed scan: ${when(data.decisionState.last_scan_at)}. ${data.decisionState.last_error||''}`,'subtle'));
  for(const decision of data.clientDecisions||[]){
   const card=node('article','','card');
   card.append(node('h3',decision.ticket_number?`Ticket ${decision.ticket_number}`:'Client reply needs a ticket'),node('p',decision.review_reason),node('p',`${decision.sender} · ${when(decision.received_at)} · ${decision.status.replaceAll('_',' ')}`,'subtle'));
   const evidence=node('details','');evidence.append(node('summary','Read client reply'),node('pre',decision.reply_text));card.append(evidence);
   if(decision.portal_job_id){const link=node('a','Open acceptance review job','button') as HTMLAnchorElement;link.href='/admin/portal?job='+encodeURIComponent(decision.portal_job_id);card.append(link);}
   notices.append(card);
  }
  if(!data.clientDecisions?.length)notices.append(node('p','No client offer decisions have been recorded yet.','subtle'));
 }
 if(data.notices.length){notices.append(node('h2','Recent Crown notices'));for(const notice of data.notices){const card=node('article','','card');card.append(node('h3',`${notice.ticket_number||'Ticket needs review'} — ${notice.subject}`),node('p',notice.review_reason||`${notice.status.replaceAll('_',' ')}. ${notice.kind.includes('acknowledged')||notice.kind==='trial_pending'?'Acknowledgement recorded; no duplicate request submitted.':'Open its portal job for next steps.'}`));notices.append(card);}}
 const params=new URL(location.href).searchParams;
 const disclosure=params.get('disclosure');
 if(disclosure&&!focusedJob){const target=document.getElementById('disclosure-'+disclosure);if(target){focusQueueTarget(target);focusedJob=true;}}
 const requested=params.get('job');
 if(requested&&!focusedJob){const target=document.getElementById('job-'+requested);if(target){target.scrollIntoView({block:'start'});focusedJob=true;}else message('That job is no longer in the recent queue. Open All admin tools to check the case.');}
}
let openedDraft:string|null=null;
let draftPoll:ReturnType<typeof setTimeout>|undefined;
let draftFiles:string[]=[];
function clearDraftFiles(){clearTimeout(draftPoll);for(const url of draftFiles)URL.revokeObjectURL(url);draftFiles=[];}
async function loadEmailDrafts(){
 const data=await api('email-drafts');
 queueDrafts=data.drafts;
 updateQueueTiles();
 el('email-count').textContent=String(data.drafts.filter((d:any)=>d.status==='pending_approval').length)+' to review';
 el('email-device-status').textContent=data.devices?'Push alerts are enabled on '+data.devices+' device(s).':'No device is enrolled. Enable notifications below in the installed Home Screen app.';
 const list=el('email-drafts');list.replaceChildren();
 if(!data.drafts.length)list.append(node('p','No outbound client drafts are waiting for approval.','subtle'));
 for(const draft of data.drafts){
  const row=node('div','','card');
  row.append(node('h3','Ticket '+draft.ticket_number),node('p',draft.status.replaceAll('_',' ')+' · '+when(draft.sent_at||draft.created_at),'subtle'));
  if(draft.last_error)row.append(node('p',draft.last_error,'warning'));
  const open=node('button',draft.status==='pending_approval'?'Review draft':'View message') as HTMLButtonElement;
  open.onclick=()=>act(open,async()=>{history.replaceState(null,'','/admin/portal?draft='+draft.id);await openEmailDraft(draft.id);});
  row.append(open);list.append(row);
 }
 const requested=new URL(location.href).searchParams.get('draft');
 if(requested&&openedDraft!==requested)await openEmailDraft(requested);
}
async function openEmailDraft(id:string, supplied?:any){
 const draft=supplied||(await api('email-draft',{id})).draft;
 openedDraft=id;clearDraftFiles();
 const container=el('email-draft-detail');container.replaceChildren();
 const card=node('article','','card email-review');
 const payload=draft.payload;
 card.append(node('h3',payload.subject),node('p','From: '+payload.from),node('p','To: '+payload.to.join(', ')),node('p','Reply to: '+(payload.reply_to||payload.from),'subtle'));
 card.append(node('p',draft.status.replaceAll('_',' '),'badge '+(draft.status==='sent'?'success':'warning')));
 if(draft.last_error)card.append(node('p',draft.last_error,'warning'));
 if(draft.approval_basis==='template'){
  card.append(node('p','Template: '+(payload.headers?.['X-Fabsy-Template']||'Registered version')+' · This email uses verified source facts.','subtle'));
  if(draft.status==='pending_template')card.append(node('p','Waiting for one-time template approval. Open Automatic email templates to review the version.','warning'));
 }
 const preview=document.createElement('iframe');preview.className='email-preview';preview.title='Exact email body';preview.setAttribute('sandbox','');preview.referrerPolicy='no-referrer';
 preview.srcdoc=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1">`+payload.html;
 card.append(preview);
 if(payload.text){const plain=node('details','');plain.append(node('summary','Plain-text version'),node('pre',payload.text,'email-body'));card.append(plain);}
 for(const attachment of payload.attachments||[]){
  const bytes=Uint8Array.from(atob(attachment.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
  const url=URL.createObjectURL(new Blob([bytes],{type:attachment.contentType||'application/octet-stream'}));draftFiles.push(url);
  const link=node('a','Download attachment: '+attachment.filename,'button') as HTMLAnchorElement;link.href=url;link.download=attachment.filename;card.append(link);
 }
 if(draft.status==='pending_approval'){
  card.append(node('p','Check the recipient, full message and any attachments. Approved to send will send this exact email. It does not submit anything to the government portal.','subtle'));
  const controls=node('div','','row');
  const approve=node('button','Approved to send','primary') as HTMLButtonElement;
  const reject=node('button','Do not send') as HTMLButtonElement;
  const review=async(action:string)=>{
   approve.disabled=true;reject.disabled=true;
   try{const result=await api(action,{id:draft.id,hash:draft.payload_hash});await openEmailDraft(draft.id,result.draft);message(result.draft.status==='sent'?'Email sent. The Gmail receipt has been saved.':result.draft.status==='approved'?'Approved. The cloud worker will finish delivery.':'Email status: '+result.draft.status.replaceAll('_',' '));await loadEmailDrafts();}
   catch(error){const reason=error instanceof Error?error.message:'Request failed.';message(reason);try{await openEmailDraft(draft.id);el('email-draft-detail').prepend(node('p',reason,'error'));}catch{approve.disabled=false;reject.disabled=false;card.append(node('p',reason,'error'));}}
  };
  approve.onclick=()=>review('approve-email');reject.onclick=()=>review('reject-email');controls.append(approve,reject);card.append(controls);
 }
 if(draft.sent_at)card.append(node('p','Sent '+when(draft.sent_at)+' · Gmail receipt '+draft.provider_email_id,'subtle reference'));
 const close=node('button','Close message') as HTMLButtonElement;close.onclick=()=>{container.replaceChildren();clearDraftFiles();openedDraft=null;history.replaceState(null,'','/admin/portal');void refresh();};card.append(close);
 container.append(card);card.scrollIntoView({block:'start'});
 if(['approved','sending'].includes(draft.status))draftPoll=setTimeout(()=>{if(openedDraft===id)void openEmailDraft(id).catch(error=>message(error.message));},5000);
}
let focusedJob=false;
async function act(button:HTMLButtonElement,fn:()=>Promise<void>){button.disabled=true;try{await fn();await refresh();}catch(error){message(error instanceof Error?error.message:'Request failed.');}finally{button.disabled=false;}}
(el('login-form') as HTMLFormElement).onsubmit=async(event)=>{event.preventDefault();const button=el('login-form').querySelector('button')!;await act(button,async()=>{const {error}=await db.auth.signInWithPassword({email:(el('email') as HTMLInputElement).value,password:(el('password') as HTMLInputElement).value});(el('password') as HTMLInputElement).value='';if(error)throw error;message('');});};
(el('run') as HTMLButtonElement).onclick=()=>act(el('run') as HTMLButtonElement,async()=>{await api('run');message('Cloud check queued. Refresh shortly to see the result.');});
(el('scan') as HTMLButtonElement).onclick=()=>act(el('scan') as HTMLButtonElement,async()=>{await api('scan');message('Crown mailbox check completed.');});
(el('refresh') as HTMLButtonElement).onclick=()=>act(el('refresh') as HTMLButtonElement,async()=>{message('');});
(el('logout') as HTMLButtonElement).onclick=async()=>{await db.auth.signOut();el('jobs').replaceChildren();el('email-drafts').replaceChildren();el('email-draft-detail').replaceChildren();clearDraftFiles();queueStatus=null;queueDrafts=[];selectedQueue=null;el('queue-items').replaceChildren();el('queue-items').hidden=true;message('Signed out.');await refresh();};
for(const group of ['pending','attention','done'] as const){const button=el('tile-'+group) as HTMLButtonElement;button.onclick=()=>navigateQueue(button,()=>openQueue(group));}
(el('email-count') as HTMLButtonElement).onclick=()=>navigateQueue(el('email-count') as HTMLButtonElement,()=>openQueue('emails'));
mountEmailTemplates(el('email-templates'),api,refresh,message);
refresh().catch(error=>message(error.message));
setInterval(()=>{if(!document.hidden&&!document.querySelector('.offer-form[open], .email-review, .disclosure-approval[data-edited=true]'))refresh().catch(error=>message(error.message));},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueLiveRefresh();});
window.addEventListener('online',queueLiveRefresh);

let deviceId=localStorage.getItem('fabsy-portal-push-device');
const pushReady=()=>{el('push-test').hidden=!deviceId;el('push-disable').hidden=!deviceId;el('push-enable').textContent=deviceId?'Reconnect notifications on this device':'Enable notifications on this device';};
pushReady();
async function enablePush(){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('On iPhone, add Fabsy Admin to your Home Screen, open that app, then enable notifications.');
 // Permission is requested only from the user's explicit button tap.
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw new Error('Notifications are not allowed. Enable them in this device’s notification settings.');
 const config=await api('push-config');if(!config.publicKey)throw new Error('Notification delivery is not configured yet.');
 const registration=await navigator.serviceWorker.register('/admin/portal/sw.js',{scope:'/admin/portal'});
 if(!registration.active)await new Promise<void>((resolve,reject)=>{
  const worker=registration.installing||registration.waiting;
  if(!worker){reject(new Error('Notification setup did not start. Refresh and try again.'));return;}
  const timer=setTimeout(()=>reject(new Error('Notification setup timed out. Refresh and try again.')),15000);
  const check=()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(new Error('Notification setup failed. Refresh and try again.'));}};
  worker.addEventListener('statechange',check);check();
 });
 const binary=atob(config.publicKey.replaceAll('-','+').replaceAll('_','/'));
 const key=Uint8Array.from(binary,c=>c.charCodeAt(0));
 const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 const saved=await api('push-subscribe',{subscription:subscription.toJSON()});
 deviceId=saved.id;localStorage.setItem('fabsy-portal-push-device',saved.id);pushReady();
 el('push-status').textContent='This device is enrolled. Send a test notification to confirm delivery.';
}
(el('push-enable') as HTMLButtonElement).onclick=()=>act(el('push-enable') as HTMLButtonElement,enablePush);
(el('push-test') as HTMLButtonElement).onclick=()=>act(el('push-test') as HTMLButtonElement,async()=>{const result=await api('push-test',{id:deviceId});message(result.delivery?.status==='sent'?'Your device’s notification service accepted the test ping. Check your notifications.':result.delivery?.status==='failed'?'The test could not be delivered. Reconnect notifications on this device and try again.':'Test notification queued. Check your notifications shortly.');});
(el('push-disable') as HTMLButtonElement).onclick=()=>act(el('push-disable') as HTMLButtonElement,async()=>{await api('push-unsubscribe',{id:deviceId});const registration=await navigator.serviceWorker.getRegistration('/admin/portal');await(await registration?.pushManager.getSubscription())?.unsubscribe();localStorage.removeItem('fabsy-portal-push-device');deviceId=null;pushReady();el('push-status').textContent='Notifications are off on this device.';});
