export type TaskGroup='pending'|'attention'|'done';
export type QueueTask={id:string;kind:'job'|'draft'|'disclosure';ticket:string;label:string;status:string;group:TaskGroup;updated?:string;priority:number};
export type QueueCase={key:string;ticket:string;group:TaskGroup;primary:QueueTask;tasks:QueueTask[]};
export const queueTicket=(value:unknown)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const groups:Record<string,TaskGroup>={queued:'pending',running:'pending',analyzing:'pending',approved:'pending',sending:'pending',pending_template:'attention',pending_approval:'attention',needs_review:'attention',uncertain:'attention',completed:'done',submitted:'done',sent:'done'};
const groupOrder={attention:0,pending:1,done:2};
const date=(value?:string)=>Date.parse(value||'')||0;
export function groupQueueTasks(tasks:QueueTask[]):QueueCase[]{
 const cases=new Map<string,QueueTask[]>();
 for(const task of tasks){
  const ticket=queueTicket(task.ticket);
  // Missing ticket identifiers are distinct review items, never one merged case.
  const key=ticket||task.kind+'/'+task.id;
  const rows=cases.get(key)||[];
  if(!rows.some(row=>row.kind===task.kind&&row.id===task.id))rows.push({...task,ticket});
  cases.set(key,rows);
 }
 return [...cases].map(([key,rows])=>{
  const tasks=rows.sort((a,b)=>groupOrder[a.group]-groupOrder[b.group]||b.priority-a.priority||date(b.updated)-date(a.updated)||a.id.localeCompare(b.id));
  return {key,ticket:tasks[0].ticket,group:tasks[0].group,primary:tasks[0],tasks};
 });
}
export function caseQueue(data:any,drafts:any[]):QueueCase[]{
 const tasks:QueueTask[]=[];
 const packages:any[]=data?.disclosureReviews||[];
 const latest=new Map<string,any>();
 for(const p of packages){const ticket=queueTicket(p.ticket_number);const prior=latest.get(ticket);if(ticket&&(!prior||date(p.complete_at||p.updated_at)>date(prior.complete_at||prior.updated_at)))latest.set(ticket,p);}
 for(const row of data?.jobs||[]){
  let group=groups[row.status];if(!group)continue;
  const evidence=packages.find(p=>p.job_id===row.id&&queueTicket(p.ticket_number)===queueTicket(row.ticket_number));
  // A saved package proves retrieval finished; its review/submission carries the next step.
  const retrieved=row.action==='inspect_disclosure'&&row.status==='needs_review'&&!!evidence;
  if(retrieved)group='done';
  const labels:Record<string,string>={submit_review_request:'Submit prosecutor review',prepare_offer_acceptance:'Offer acceptance review',inspect_offer:'Prosecutor offer',inspect_disclosure:retrieved?'Disclosure retrieved':'Disclosure retrieval'};
  tasks.push({id:row.id,kind:'job',ticket:row.ticket_number,label:labels[row.action]||'Disclosure request',status:retrieved?'completed':row.status,group,updated:row.updated_at,priority:row.status==='uncertain'?100:row.action==='submit_review_request'?70:row.action==='prepare_offer_acceptance'?60:40});
 }
 for(const row of drafts){const group=groups[row.status];if(group)tasks.push({id:row.id,kind:'draft',ticket:row.ticket_number,label:'Client email',status:row.status,group,updated:row.updated_at||row.created_at,priority:row.status==='uncertain'?100:80});}
 for(const row of packages){
  let group=groups[row.status];if(!group)continue;
  const superseded=latest.get(queueTicket(row.ticket_number))!==row&&!!queueTicket(row.ticket_number);
  // Linked submission jobs supply progress after approval. Uncertain filings always remain visible.
  if((row.status==='approved'&&row.review_submission_job_id)||(superseded&&row.status!=='uncertain'))group='done';
  tasks.push({id:row.id,kind:'disclosure',ticket:row.ticket_number,label:superseded?'Earlier disclosure review':row.status==='approved'?'Review request approved':row.status==='submitted'?'Review request submitted':'Disclosure review request',status:row.status,group,updated:row.updated_at,priority:row.status==='uncertain'?100:50});
 }
 return groupQueueTasks(tasks);
}
