interface Session {id:string;browser_session_id:string;terms_url:string;terms_text:string;terms_sha256:string;status:string;expires_at:string;accepted_at:string|null;scope:{job_id:string;ticket_number:string;action:string}[]}
const text=(tag:string,value:string,className='')=>{const element=document.createElement(tag);element.textContent=value;element.className=className;return element;};
export function renderSessionTerms(card:HTMLElement,job:any,data:any,api:(action:string,values:Record<string,unknown>)=>Promise<any>,act:(button:HTMLButtonElement,work:()=>Promise<void>)=>void,message:(value:string)=>void):boolean{
 if(job.result?.phase!=='awaiting_terms'||job.status!=='needs_review')return false;
 const session=(data.portalSessions||[]).find((row:Session)=>row.id===job.result.session_record_id) as Session|undefined;
 if(!session){card.append(text('p',data.sessionStatusError||'The session terms are unavailable. Refresh to load the exact terms before continuing.','warning'));return true;}
 const active=session.status==='pending'&&Date.parse(session.expires_at)>Date.now()+30000;
 card.append(text('h3','Government session terms'),text('p','Accepting these terms authorizes the listed case actions in this cloud session. The runner checks payment, signed consent, identity and existing requests before filing.'));
 const actions:Record<string,string>={submit_initial_disclosure:'Request disclosure',submit_review_request:'Submit the frozen prosecutor review',inspect_offer:'Read the prosecutor offer',inspect_disclosure:'Retrieve disclosure',prepare_offer_acceptance:'Inspect the recorded acceptance request'};
 const scope=text('ul','');for(const item of session.scope)scope.append(text('li',`Ticket ${item.ticket_number} — ${actions[item.action]||item.action}`));card.append(scope);
 card.append(text('p',`Session ${session.browser_session_id}. Expires ${new Date(session.expires_at).toLocaleString()}.`,'subtle reference'),text('p','Terms SHA-256: '+session.terms_sha256,'subtle reference'));
 const details=document.createElement('details');details.open=active;details.append(text('summary','Read the government terms for this session'),text('pre',session.terms_text));card.append(details);
 if(!active){
  card.append(text('p','This session expired. Start a new session to review its current terms.','warning'));
  const start=text('button','Start a new session') as HTMLButtonElement;start.type='button';start.onclick=()=>act(start,async()=>{await api('handoff',{id:job.id});message('A new cloud session is queued. Its terms will appear here when it is ready.');});card.append(start);return true;
 }
 if(!data.sessionAdministrator){card.append(text('p','An authenticated administrator must accept these session terms.','warning'));return true;}
 const accept=text('button','Accept these terms and continue') as HTMLButtonElement;accept.type='button';
 accept.onclick=()=>act(accept,async()=>{await api('session-accept',{id:session.id,hash:session.terms_sha256});message('Your acceptance is saved for this session. The cloud runner will continue the eligible case actions automatically.');});card.append(accept);return true;
}
